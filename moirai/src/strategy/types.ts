/**
 * Strategy Engine Types
 *
 * These types define the interface between the market data layer,
 * portfolio state, and the strategy engine. Designed for easy extension.
 */

import type { MarketSnapshot, TokenState, YieldOpportunity, ChainState } from '../data/types.js';

// ── Portfolio state (minimal, extendable) ──────────────────────────

export interface PortfolioState {
  balances: Record<string, number>; // key: chainId-tokenAddress, value: amount
  positions: Position[];
  totalValueUSD: number;
}

export interface Position {
  chainId: number;
  token: TokenState;
  amount: number;
  entryPriceUSD: number;
  costBasisUSD: number;
  realizedPnLUSD: number;
  unrealizedPnLUSD: number;
}

// ── Strategy candidate actions ─────────────────────────────────────

export type ActionType = 'hold' | 'swap' | 'bridge' | 'rebalance';

export interface StrategyCandidate {
  actionType: ActionType;
  fromChainId: number;
  toChainId?: number;
  fromToken: TokenState;
  toToken?: TokenState;
  amount: number;
  score: number;
  rationale: string;
}

export interface DecisionPlan {
  epochId: string;
  candidates: StrategyCandidate[];
  selected: StrategyCandidate;
  reasoning: string;
}

// ── Strategy engine interface ──────────────────────────────────────

export interface StrategyEngine {
  /** Short identifier used for CLI selection (kebab-case, e.g. "cross-chain-arbitrage"). */
  id: string;
  name: string;
  description: string;
  evaluate: (
    market: MarketSnapshot,
    portfolio: PortfolioState,
    epochId: string,
  ) => DecisionPlan;
}
