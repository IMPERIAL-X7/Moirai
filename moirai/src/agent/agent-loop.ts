/**
 * Agent Decision Loop
 *
 * Orchestrates the full observe → evaluate → decide → execute → update cycle.
 *
 * Connects:
 *   - Market data layer  (getMarketSnapshot)
 *   - Strategy engine     (StrategyEngine.evaluate)
 *   - Execution layer     (pluggable executor callback)
 *   - Portfolio manager   (applyTrade, markToMarket, save)
 *
 * Designed so each piece can be swapped independently.
 */

import { getMarketSnapshot, type SnapshotOptions } from '../data/market-data.js';
import type { MarketSnapshot } from '../data/types.js';
import type { StrategyEngine } from '../strategy/engine.js';
import { DefaultStrategy } from '../strategy/engine.js';
import type { DecisionPlan, StrategyCandidate } from '../strategy/types.js';
import { PortfolioManager } from '../portfolio/portfolio-manager.js';
import type { TradeRecord } from '../portfolio/types.js';
import {
  type AgentConfig,
  type AgentStatus,
  type EpochLog,
  type PhaseLog,
  type EpochPhase,
  DEFAULT_AGENT_CONFIG,
} from './types.js';

// ── Executor callback type ──────────────────────────────────────────

/**
 * The agent loop does not call LI.FI directly — it delegates to an
 * executor function you provide.  This keeps the loop testable and
 * allows swapping between real execution and paper trading.
 *
 * Return null to signal "skip this trade" (e.g. hold action).
 */
export interface ExecutionResult {
  txHash: string;
  fromAmount: number;
  toAmount: number;
  fromPriceUSD: number;
  toPriceUSD: number;
  feesUSD: number;
  status: 'confirmed' | 'pending' | 'failed';
}

export type Executor = (
  candidate: StrategyCandidate,
  snapshot: MarketSnapshot,
) => Promise<ExecutionResult | null>;

// ── Paper-trade executor (default) ──────────────────────────────────

/**
 * Simulates execution using current market prices.
 * No on-chain calls — returns a synthetic result with simulated slippage.
 */
export const paperExecutor: Executor = async (candidate, _snapshot) => {
  if (candidate.actionType === 'hold') return null;

  const fromPrice = candidate.fromToken.priceUSD;
  const toPrice = candidate.toToken?.priceUSD ?? fromPrice;
  const fromAmount = candidate.amount;
  // Simulate 0.3 % slippage + 0.1 % fees
  const slippage = 0.003;
  const feeRate = 0.001;
  const toAmount = (fromAmount * fromPrice * (1 - slippage)) / toPrice;
  const feesUSD = fromAmount * fromPrice * feeRate;

  return {
    txHash: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fromAmount,
    toAmount,
    fromPriceUSD: fromPrice,
    toPriceUSD: toPrice,
    feesUSD,
    status: 'confirmed' as const,
  };
};

// ── Phase timer helper ──────────────────────────────────────────────

function phaseTimer(phase: EpochPhase): { finish: (ok: boolean, msg: string) => PhaseLog } {
  const start = Date.now();
  const startedAt = new Date(start).toISOString();
  return {
    finish: (success, message) => ({
      phase,
      startedAt,
      durationMs: Date.now() - start,
      success,
      message,
    }),
  };
}

/**
 * Snapshot fetcher — injectable so tests can provide mock data.
 */
export type SnapshotFetcher = (opts: SnapshotOptions) => Promise<MarketSnapshot>;

// ── Agent Loop class ────────────────────────────────────────────────

export class AgentLoop {
  private config: AgentConfig;
  private portfolio: PortfolioManager;
  private strategy: StrategyEngine;
  private executor: Executor;
  private snapshotOpts: SnapshotOptions;
  private fetchSnapshot: SnapshotFetcher;

  private status: AgentStatus = 'idle';
  private timer: ReturnType<typeof setInterval> | null = null;
  private epochCounter = 0;
  private consecutiveDataFailures = 0;
  private consecutiveExecFailures = 0;
  private epochLogs: EpochLog[] = [];

  constructor(opts?: {
    config?: Partial<AgentConfig>;
    portfolio?: PortfolioManager;
    strategy?: StrategyEngine;
    executor?: Executor;
    snapshotOpts?: SnapshotOptions;
    fetchSnapshot?: SnapshotFetcher;
  }) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...opts?.config };
    this.portfolio = opts?.portfolio ?? new PortfolioManager();
    this.strategy = opts?.strategy ?? DefaultStrategy;
    this.executor = opts?.executor ?? paperExecutor;
    this.snapshotOpts = opts?.snapshotOpts ?? {};
    this.fetchSnapshot = opts?.fetchSnapshot ?? getMarketSnapshot;
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  /** Start the loop.  Runs one epoch immediately, then on interval. */
  start(): void {
    if (this.status === 'running') return;
    this.status = 'running';
    this.log(`Agent started (interval=${this.config.epochIntervalMs}ms, dryRun=${this.config.dryRun})`);

    // Load persisted state
    this.portfolio.load();

    // Run first epoch immediately
    this.runEpoch();

    // Schedule subsequent epochs
    this.timer = setInterval(() => {
      if (this.status === 'running') this.runEpoch();
    }, this.config.epochIntervalMs);
  }

  /** Stop the loop gracefully.  Persists portfolio. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = 'stopped';
    this.portfolio.save();
    this.log('Agent stopped');
  }

  /** Pause — keeps timer alive but skips epochs. */
  pause(): void {
    this.status = 'paused';
    this.log('Agent paused');
  }

  /** Resume after pause. */
  resume(): void {
    if (this.status === 'paused') {
      this.status = 'running';
      this.log('Agent resumed');
    }
  }

  getStatus(): AgentStatus { return this.status; }
  getEpochLogs(): EpochLog[] { return [...this.epochLogs]; }
  getPortfolio(): PortfolioManager { return this.portfolio; }

  // ── Run a single epoch (public so tests can call it directly) ──

  async runEpoch(): Promise<EpochLog> {
    const epochStart = Date.now();
    this.epochCounter++;
    const epochId = `epoch-${this.epochCounter.toString().padStart(5, '0')}`;
    const phases: PhaseLog[] = [];
    let snapshot: MarketSnapshot | null = null;
    let plan: DecisionPlan | null = null;
    let trade: TradeRecord | null = null;
    let outcome: EpochLog['outcome'] = 'hold';
    let error: string | null = null;

    this.log(`\n════════ ${epochId} ════════`);

    try {
      // ── Phase 1: Fetch market data ─────────────────────────────
      const p1 = phaseTimer('data_fetch');
      try {
        snapshot = await this.fetchSnapshot(this.snapshotOpts);
        this.consecutiveDataFailures = 0;
        phases.push(p1.finish(true, `${snapshot.tokens.length} tokens, ${snapshot.yields.length} yields`));
        this.log(`  [data]      ${snapshot.tokens.length} tokens, ${snapshot.yields.length} yields`);
      } catch (err) {
        this.consecutiveDataFailures++;
        const msg = err instanceof Error ? err.message : String(err);
        phases.push(p1.finish(false, msg));
        this.log(`  [data]      FAILED (${this.consecutiveDataFailures}/${this.config.maxDataFailures}): ${msg}`);

        if (this.consecutiveDataFailures >= this.config.maxDataFailures) {
          this.pause();
          this.log('  ⚠ Auto-paused: too many consecutive data failures');
        }
        throw new Error(`Data fetch failed: ${msg}`);
      }

      // ── Phase 2: Strategy evaluation ───────────────────────────
      const p2 = phaseTimer('strategy_eval');
      try {
        const portfolioState = this.portfolio.getState();
        plan = this.strategy.evaluate(snapshot, portfolioState, epochId);
        phases.push(p2.finish(true, `selected=${plan.selected.actionType} score=${plan.selected.score.toFixed(3)}`));
        this.log(`  [strategy]  ${plan.selected.actionType} (score=${plan.selected.score.toFixed(3)}): ${plan.selected.rationale}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        phases.push(p2.finish(false, msg));
        throw new Error(`Strategy eval failed: ${msg}`);
      }

      // ── Phase 3: Execution ─────────────────────────────────────
      const p3 = phaseTimer('execution');
      const selected = plan.selected;

      if (selected.actionType === 'hold') {
        phases.push(p3.finish(true, 'hold — no trade'));
        outcome = 'hold';
        this.log('  [exec]      hold — nothing to execute');
      } else {
        try {
          const result = await this.executor(selected, snapshot);

          if (!result) {
            phases.push(p3.finish(true, 'executor returned null — skipped'));
            outcome = 'skipped';
            this.log('  [exec]      skipped by executor');
          } else {
            this.consecutiveExecFailures = 0;

            // Build TradeRecord from execution result
            trade = this.portfolio.applyTrade({
              timestamp: new Date().toISOString(),
              epochId,
              actionType: selected.actionType === 'rebalance' ? 'rebalance'
                : selected.actionType === 'bridge' ? 'bridge' : 'swap',
              fromChainId: selected.fromChainId,
              toChainId: selected.toChainId ?? selected.fromChainId,
              fromToken: selected.fromToken.symbol,
              toToken: selected.toToken?.symbol ?? selected.fromToken.symbol,
              fromAmount: result.fromAmount,
              toAmount: result.toAmount,
              fromPriceUSD: result.fromPriceUSD,
              toPriceUSD: result.toPriceUSD,
              feesUSD: result.feesUSD,
              txHash: result.txHash,
              status: result.status,
            });

            outcome = 'executed';
            phases.push(p3.finish(true, `${trade.actionType} ${trade.fromToken}→${trade.toToken} tx=${trade.txHash.slice(0, 14)}…`));
            this.log(`  [exec]      ${trade.actionType} ${trade.fromAmount} ${trade.fromToken} → ${trade.toAmount.toFixed(4)} ${trade.toToken}`);
            this.log(`              tx=${trade.txHash}`);
          }
        } catch (err) {
          this.consecutiveExecFailures++;
          const msg = err instanceof Error ? err.message : String(err);
          phases.push(p3.finish(false, msg));
          this.log(`  [exec]      FAILED (${this.consecutiveExecFailures}/${this.config.maxExecFailures}): ${msg}`);

          if (this.consecutiveExecFailures >= this.config.maxExecFailures) {
            this.pause();
            this.log('  ⚠ Auto-paused: too many consecutive execution failures');
          }
          throw new Error(`Execution failed: ${msg}`);
        }
      }

      // ── Phase 4: Portfolio update (mark-to-market) ─────────────
      const p4 = phaseTimer('portfolio_update');
      try {
        this.portfolio.markToMarket(snapshot);
        const state = this.portfolio.getState();
        phases.push(p4.finish(true, `totalValue=$${state.totalValueUSD.toFixed(2)}`));
        this.log(`  [portfolio] value=$${state.totalValueUSD.toFixed(2)}  positions=${state.positions.length}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        phases.push(p4.finish(false, msg));
        // Non-fatal — continue to persist
      }

      // ── Phase 5: Persist ───────────────────────────────────────
      const p5 = phaseTimer('persist');
      try {
        this.portfolio.save();
        phases.push(p5.finish(true, 'saved'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        phases.push(p5.finish(false, msg));
        // Non-fatal
      }

    } catch (err) {
      outcome = 'error';
      error = err instanceof Error ? err.message : String(err);
    }

    const epochLog: EpochLog = {
      epochId,
      startedAt: new Date(epochStart).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - epochStart,
      outcome,
      phases,
      snapshot,
      plan,
      trade,
      error,
    };

    this.epochLogs.push(epochLog);
    this.log(`  [result]    ${outcome} (${epochLog.durationMs}ms)\n`);
    return epochLog;
  }

  // ── Internal ───────────────────────────────────────────────────

  private log(msg: string): void {
    if (this.config.verbose) console.log(`[agent] ${msg}`);
  }
}
