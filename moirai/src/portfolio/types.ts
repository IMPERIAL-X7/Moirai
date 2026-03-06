/**
 * Portfolio Management Types
 *
 * Extends the core PortfolioState/Position from strategy/types with
 * trade history, allocation targets, and persistence metadata.
 * Designed for easy extension — add fields here without breaking existing code.
 */

import type { TokenState } from '../data/types.js';

// ── Trade record (immutable ledger entry) ───────────────────────────

export interface TradeRecord {
  id: string;
  timestamp: string;
  epochId: string;
  actionType: 'swap' | 'bridge' | 'rebalance';
  fromChainId: number;
  toChainId: number;
  fromToken: string;   // symbol
  toToken: string;     // symbol
  fromAmount: number;
  toAmount: number;
  fromPriceUSD: number;
  toPriceUSD: number;
  feesUSD: number;
  txHash: string;
  status: 'confirmed' | 'pending' | 'failed';
}

// ── Allocation target for drift/rebalance checks ───────────────────

export interface AllocationTarget {
  /** Key: token symbol (e.g. "ETH", "USDC"). */
  symbol: string;
  /** Target weight as a fraction [0–1]. */
  targetWeight: number;
  /** Maximum allowed drift from target before rebalance triggers. */
  maxDriftPct: number;
}

// ── Drift result for a single asset ────────────────────────────────

export interface DriftEntry {
  symbol: string;
  targetWeight: number;
  actualWeight: number;
  driftPct: number;
  needsRebalance: boolean;
}

// ── Persisted portfolio snapshot ────────────────────────────────────

export interface PersistedPortfolio {
  version: number;
  savedAt: string;
  balances: Record<string, number>;
  positions: PositionRecord[];
  tradeHistory: TradeRecord[];
  allocationTargets: AllocationTarget[];
  metadata: {
    totalDepositsUSD: number;
    totalWithdrawalsUSD: number;
    highWaterMarkUSD: number;
  };
}

/** Position as stored on disk — serialisable, no live TokenState ref. */
export interface PositionRecord {
  chainId: number;
  tokenSymbol: string;
  tokenAddress: string;
  amount: number;
  entryPriceUSD: number;
  costBasisUSD: number;
  realizedPnLUSD: number;
}
