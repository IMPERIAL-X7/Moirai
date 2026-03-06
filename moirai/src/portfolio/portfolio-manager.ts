/**
 * Portfolio Manager
 *
 * Maintains the canonical portfolio state across chains.
 * Handles balance tracking, PnL, cost basis, allocation drift,
 * and persists everything to a local JSON file.
 *
 * Designed for easy modification — all logic is in small, named methods.
 */

import fs from 'fs';
import path from 'path';
import type { TokenState, MarketSnapshot } from '../data/types.js';
import type { PortfolioState, Position } from '../strategy/types.js';
import type {
  TradeRecord,
  AllocationTarget,
  DriftEntry,
  PersistedPortfolio,
  PositionRecord,
} from './types.js';

// ── Helpers ─────────────────────────────────────────────────────────

/** Canonical key for a token on a specific chain. */
export function balanceKey(chainId: number, address: string): string {
  return `${chainId}-${address.toLowerCase()}`;
}

function generateTradeId(): string {
  return `trade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Default allocation targets (easy to change) ────────────────────

const DEFAULT_TARGETS: AllocationTarget[] = [
  { symbol: 'USDC', targetWeight: 0.5, maxDriftPct: 10 },
  { symbol: 'ETH', targetWeight: 0.3, maxDriftPct: 10 },
  { symbol: 'WETH', targetWeight: 0.15, maxDriftPct: 10 },
  // Remaining 5 % is for memecoins / other
];

// ── Portfolio Manager class ─────────────────────────────────────────

export class PortfolioManager {
  // ── State ──────────────────────────────────────────────────────

  private balances: Record<string, number> = {};
  private positions: Position[] = [];
  private tradeHistory: TradeRecord[] = [];
  private allocationTargets: AllocationTarget[];
  private totalDepositsUSD = 0;
  private totalWithdrawalsUSD = 0;
  private highWaterMarkUSD = 0;
  private persistPath: string;

  constructor(opts?: {
    persistPath?: string;
    allocationTargets?: AllocationTarget[];
  }) {
    this.persistPath =
      opts?.persistPath ??
      path.resolve(process.cwd(), 'data', 'portfolio.json');
    this.allocationTargets = opts?.allocationTargets ?? [...DEFAULT_TARGETS];
  }

  // ── Snapshot (read-only view for strategy engine) ──────────────

  getState(): PortfolioState {
    return {
      balances: { ...this.balances },
      positions: this.positions.map((p) => ({ ...p })),
      totalValueUSD: this.getTotalValueUSD(),
    };
  }

  // ── Balance helpers ────────────────────────────────────────────

  getBalance(chainId: number, address: string): number {
    return this.balances[balanceKey(chainId, address)] ?? 0;
  }

  setBalance(chainId: number, address: string, amount: number): void {
    const key = balanceKey(chainId, address);
    if (amount <= 0) {
      delete this.balances[key];
    } else {
      this.balances[key] = amount;
    }
  }

  /** Record an external deposit (e.g. initial funding). */
  recordDeposit(
    chainId: number,
    token: TokenState,
    amount: number,
  ): void {
    const key = balanceKey(chainId, token.address);
    this.balances[key] = (this.balances[key] ?? 0) + amount;
    this.totalDepositsUSD += amount * token.priceUSD;

    // Upsert position
    this.upsertPosition(chainId, token, amount, token.priceUSD);
    console.log(
      `[portfolio] deposit  ${amount} ${token.symbol} on chain ${chainId}`,
    );
  }

  // ── Trade application ──────────────────────────────────────────

  /**
   * Apply a confirmed trade to the portfolio.
   * Deducts the source balance, credits the destination, updates
   * positions & cost basis, and appends the trade to history.
   */
  applyTrade(trade: Omit<TradeRecord, 'id'>): TradeRecord {
    const record: TradeRecord = { ...trade, id: generateTradeId() };

    // ── Deduct source ────────────────────────────────────────────
    const fromKey = balanceKey(
      trade.fromChainId,
      this.findAddressForSymbol(trade.fromToken) ?? trade.fromToken,
    );
    const prevFrom = this.balances[fromKey] ?? 0;
    const newFrom = prevFrom - trade.fromAmount;
    if (newFrom <= 0) {
      delete this.balances[fromKey];
    } else {
      this.balances[fromKey] = newFrom;
    }

    // ── Credit destination ───────────────────────────────────────
    const toKey = balanceKey(
      trade.toChainId,
      this.findAddressForSymbol(trade.toToken) ?? trade.toToken,
    );
    this.balances[toKey] = (this.balances[toKey] ?? 0) + trade.toAmount;

    // ── Update positions ─────────────────────────────────────────
    this.closeOrReducePosition(
      trade.fromChainId,
      trade.fromToken,
      trade.fromAmount,
      trade.fromPriceUSD,
    );
    this.upsertPosition(
      trade.toChainId,
      this.tokenStub(trade.toToken, trade.toChainId, trade.toPriceUSD),
      trade.toAmount,
      trade.toPriceUSD,
    );

    // ── Ledger ───────────────────────────────────────────────────
    this.tradeHistory.push(record);
    console.log(
      `[portfolio] trade    ${trade.fromAmount} ${trade.fromToken} → ${trade.toAmount} ${trade.toToken}  (${record.id})`,
    );

    return record;
  }

  // ── Position management ────────────────────────────────────────

  private upsertPosition(
    chainId: number,
    token: TokenState,
    addAmount: number,
    priceUSD: number,
  ): void {
    const existing = this.positions.find(
      (p) =>
        p.chainId === chainId &&
        p.token.symbol === token.symbol,
    );

    if (existing) {
      // Weighted-average cost basis
      const totalCost =
        existing.costBasisUSD + addAmount * priceUSD;
      existing.amount += addAmount;
      existing.costBasisUSD = totalCost;
      existing.entryPriceUSD = totalCost / existing.amount;
    } else {
      this.positions.push({
        chainId,
        token,
        amount: addAmount,
        entryPriceUSD: priceUSD,
        costBasisUSD: addAmount * priceUSD,
        realizedPnLUSD: 0,
        unrealizedPnLUSD: 0,
      });
    }
  }

  private closeOrReducePosition(
    chainId: number,
    symbol: string,
    reduceAmount: number,
    exitPriceUSD: number,
  ): void {
    const idx = this.positions.findIndex(
      (p) => p.chainId === chainId && p.token.symbol === symbol,
    );
    if (idx === -1) return;

    const pos = this.positions[idx];
    const avgCost = pos.costBasisUSD / pos.amount;
    const realized = (exitPriceUSD - avgCost) * reduceAmount;
    pos.realizedPnLUSD += realized;
    pos.amount -= reduceAmount;
    pos.costBasisUSD = pos.amount * avgCost;

    if (pos.amount <= 1e-12) {
      this.positions.splice(idx, 1);
    }
  }

  // ── Mark-to-market ─────────────────────────────────────────────

  /** Refresh unrealized PnL from current market prices. */
  markToMarket(snapshot: MarketSnapshot): void {
    for (const pos of this.positions) {
      const live = snapshot.tokens.find(
        (t) =>
          t.symbol === pos.token.symbol && t.chainId === pos.chainId,
      );
      if (!live) continue;

      pos.token = live; // refresh live data on the position
      const avgCost = pos.costBasisUSD / pos.amount;
      pos.unrealizedPnLUSD = (live.priceUSD - avgCost) * pos.amount;
    }

    const totalValue = this.getTotalValueUSD();
    if (totalValue > this.highWaterMarkUSD) {
      this.highWaterMarkUSD = totalValue;
    }
  }

  getTotalValueUSD(): number {
    return this.positions.reduce(
      (sum, p) => sum + p.amount * p.token.priceUSD,
      0,
    );
  }

  getTotalRealizedPnL(): number {
    return this.positions.reduce((s, p) => s + p.realizedPnLUSD, 0);
  }

  getTotalUnrealizedPnL(): number {
    return this.positions.reduce((s, p) => s + p.unrealizedPnLUSD, 0);
  }

  // ── Allocation drift detection ─────────────────────────────────

  /**
   * Compare current portfolio weights against allocation targets.
   * Returns one DriftEntry per target — easy to iterate for rebalance decisions.
   */
  checkDrift(): DriftEntry[] {
    const total = this.getTotalValueUSD();
    if (total === 0) return [];

    // Aggregate value by symbol across all chains
    const valueBySymbol: Record<string, number> = {};
    for (const pos of this.positions) {
      const sym = pos.token.symbol;
      valueBySymbol[sym] = (valueBySymbol[sym] ?? 0) + pos.amount * pos.token.priceUSD;
    }

    return this.allocationTargets.map((target) => {
      const value = valueBySymbol[target.symbol] ?? 0;
      const actualWeight = value / total;
      const driftPct =
        Math.abs(actualWeight - target.targetWeight) * 100;
      return {
        symbol: target.symbol,
        targetWeight: target.targetWeight,
        actualWeight: Math.round(actualWeight * 10000) / 10000,
        driftPct: Math.round(driftPct * 100) / 100,
        needsRebalance: driftPct > target.maxDriftPct,
      };
    });
  }

  setAllocationTargets(targets: AllocationTarget[]): void {
    this.allocationTargets = targets;
  }

  getAllocationTargets(): AllocationTarget[] {
    return [...this.allocationTargets];
  }

  // ── Trade history access ───────────────────────────────────────

  getTradeHistory(): TradeRecord[] {
    return [...this.tradeHistory];
  }

  getRecentTrades(n: number): TradeRecord[] {
    return this.tradeHistory.slice(-n);
  }

  // ── Persistence (local JSON file) ──────────────────────────────

  /** Save current state to disk. */
  save(): void {
    const data: PersistedPortfolio = {
      version: 1,
      savedAt: new Date().toISOString(),
      balances: { ...this.balances },
      positions: this.positions.map((p) => ({
        chainId: p.chainId,
        tokenSymbol: p.token.symbol,
        tokenAddress: p.token.address,
        amount: p.amount,
        entryPriceUSD: p.entryPriceUSD,
        costBasisUSD: p.costBasisUSD,
        realizedPnLUSD: p.realizedPnLUSD,
      })),
      tradeHistory: this.tradeHistory,
      allocationTargets: this.allocationTargets,
      metadata: {
        totalDepositsUSD: this.totalDepositsUSD,
        totalWithdrawalsUSD: this.totalWithdrawalsUSD,
        highWaterMarkUSD: this.highWaterMarkUSD,
      },
    };

    const dir = path.dirname(this.persistPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[portfolio] saved to ${this.persistPath}`);
  }

  /** Load state from disk. Returns false if file doesn't exist. */
  load(): boolean {
    if (!fs.existsSync(this.persistPath)) {
      console.log('[portfolio] no saved state found — starting fresh');
      return false;
    }

    const raw = fs.readFileSync(this.persistPath, 'utf-8');
    const data: PersistedPortfolio = JSON.parse(raw);

    this.balances = data.balances;
    this.tradeHistory = data.tradeHistory;
    this.allocationTargets = data.allocationTargets ?? [...DEFAULT_TARGETS];
    this.totalDepositsUSD = data.metadata.totalDepositsUSD;
    this.totalWithdrawalsUSD = data.metadata.totalWithdrawalsUSD;
    this.highWaterMarkUSD = data.metadata.highWaterMarkUSD;

    // Reconstruct positions with stub TokenState (will be refreshed on next markToMarket)
    this.positions = data.positions.map((pr) => ({
      chainId: pr.chainId,
      token: this.tokenStub(pr.tokenSymbol, pr.chainId, pr.entryPriceUSD, pr.tokenAddress),
      amount: pr.amount,
      entryPriceUSD: pr.entryPriceUSD,
      costBasisUSD: pr.costBasisUSD,
      realizedPnLUSD: pr.realizedPnLUSD,
      unrealizedPnLUSD: 0, // will be set by markToMarket
    }));

    console.log(
      `[portfolio] loaded ${this.positions.length} positions, ${this.tradeHistory.length} trades`,
    );
    return true;
  }

  // ── Internal helpers ───────────────────────────────────────────

  /** Build a minimal TokenState for bookkeeping when we only have a symbol. */
  private tokenStub(
    symbol: string,
    chainId: number,
    priceUSD: number,
    address?: string,
  ): TokenState {
    return {
      symbol,
      address: address ?? symbol.toLowerCase(),
      chainId,
      priceUSD,
      volume24hUSD: 0,
      liquidityUSD: 0,
      priceChange24h: 0,
      source: 'manual',
    };
  }

  /** Find an address for a symbol from existing positions. */
  private findAddressForSymbol(symbol: string): string | undefined {
    const pos = this.positions.find((p) => p.token.symbol === symbol);
    return pos?.token.address;
  }

  // ── Summary (for logging / debugging) ──────────────────────────

  printSummary(): void {
    const total = this.getTotalValueUSD();
    console.log('\n═══════════════════════════════════════════');
    console.log('  Portfolio Summary');
    console.log('═══════════════════════════════════════════');
    console.log(`  Total value:       $${total.toFixed(2)}`);
    console.log(`  Realized PnL:      $${this.getTotalRealizedPnL().toFixed(2)}`);
    console.log(`  Unrealized PnL:    $${this.getTotalUnrealizedPnL().toFixed(2)}`);
    console.log(`  High water mark:   $${this.highWaterMarkUSD.toFixed(2)}`);
    console.log(`  Total deposits:    $${this.totalDepositsUSD.toFixed(2)}`);
    console.log(`  Trades executed:   ${this.tradeHistory.length}`);
    console.log('───────────────────────────────────────────');

    if (this.positions.length === 0) {
      console.log('  (no positions)');
    }
    for (const p of this.positions) {
      const value = p.amount * p.token.priceUSD;
      const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
      console.log(
        `  ${p.token.symbol.padEnd(8)} chain=${p.chainId}  amt=${p.amount.toFixed(4)}  val=$${value.toFixed(2)} (${pct}%)  uPnL=$${p.unrealizedPnLUSD.toFixed(2)}`,
      );
    }

    const drift = this.checkDrift();
    if (drift.length > 0) {
      console.log('───────────────────────────────────────────');
      console.log('  Allocation Drift');
      for (const d of drift) {
        const flag = d.needsRebalance ? ' ⚠ REBALANCE' : '';
        console.log(
          `  ${d.symbol.padEnd(8)} target=${(d.targetWeight * 100).toFixed(0)}%  actual=${(d.actualWeight * 100).toFixed(1)}%  drift=${d.driftPct.toFixed(1)}%${flag}`,
        );
      }
    }
    console.log('═══════════════════════════════════════════\n');
  }
}
