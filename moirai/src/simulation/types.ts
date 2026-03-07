/**
 * Simulation & Paper Trading Types
 *
 * Defines the audit log schema for simulated trades. Every field
 * exists so a human reviewer can manually verify each trade.
 */

import type { TokenState, YieldOpportunity, ChainState } from '../data/types.js';
import type { StrategyCandidate, DecisionPlan } from '../strategy/types.js';

// ── Price evidence (manual-verification data) ──────────────────────

/** Captures exactly where the price came from and when. */
export interface PriceEvidence {
  symbol: string;
  chainId: number;
  priceUSD: number;
  source: TokenState['source'];
  /** ISO-8601 time the price was fetched. */
  fetchedAt: string;
  /** Volume & liquidity at fetch time — useful for sanity-checking. */
  volume24hUSD: number;
  liquidityUSD: number;
  priceChange24h: number;
}

// ── LI.FI quote snapshot ────────────────────────────────────────────

/** Data pulled from a real LI.FI /quote response. */
export interface QuoteSnapshot {
  /** Raw /quote request params for reproducibility. */
  requestParams: Record<string, unknown>;
  /** Tool/bridge selected by LI.FI. */
  tool: string;
  toolName: string;
  /** Estimated output in token smallest unit. */
  estimatedOutputRaw: string;
  /** Estimated output as a human-readable number. */
  estimatedOutputFormatted: number;
  /** Minimum output after slippage. */
  minOutputFormatted: number;
  /** Gas cost in USD (from LI.FI estimate). */
  gasCostUSD: number;
  /** Non-gas fees in USD (bridge fees, LP fees, etc.). */
  feeCostUSD: number;
  /** Total cost = gas + fees. */
  totalCostUSD: number;
  /** Bridge-specific estimated duration in seconds (if available). */
  estimatedBridgeDurationSec: number | null;
  /** Number of steps in the route. */
  stepCount: number;
  /** Full raw quote for deep inspection. */
  rawQuote: unknown;
}

// ── Simulated trade log entry ───────────────────────────────────────

export interface SimulatedTradeLog {
  /** Monotonic sequence number for ordering. */
  sequenceNo: number;
  /** ISO-8601 timestamp when this log entry was written. */
  loggedAt: string;
  /** Epoch ID from the agent loop. */
  epochId: string;

  // ── Decision context ──────────────────────────────────────────
  /** All candidates the strategy considered. */
  allCandidates: StrategyCandidate[];
  /** The candidate that won. */
  selectedCandidate: StrategyCandidate;
  /** Strategy-level reasoning string. */
  strategyReasoning: string;

  // ── Price evidence ────────────────────────────────────────────
  /** Price evidence for every token in the snapshot at decision time. */
  priceEvidence: PriceEvidence[];
  /** Yield opportunities seen at decision time. */
  yieldSnapshot: YieldOpportunity[];
  /** Chain states (gas prices) at decision time. */
  chainSnapshot: ChainState[];

  // ── Trade details ─────────────────────────────────────────────
  actionType: string;
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  fromTokenAddress: string;
  toToken: string;
  toTokenAddress: string;
  fromAmount: number;
  fromAmountUSD: number;

  // ── LI.FI quote (real) ────────────────────────────────────────
  /** Real LI.FI quote data. Null if hold or quote fetch failed. */
  quote: QuoteSnapshot | null;
  /** Error message if the quote fetch failed. */
  quoteError: string | null;

  // ── Simulated outcome ─────────────────────────────────────────
  /** What the executor calculated the trade would produce. */
  simulatedToAmount: number;
  simulatedToAmountUSD: number;
  /** Slippage applied in the simulation (%). */
  simulatedSlippagePct: number;
  /** Fees from the LI.FI quote (or simulated fallback). */
  gasCostUSD: number;
  bridgeFeesUSD: number;
  totalFeesUSD: number;
  /** Estimated bridge delay from quote (seconds). */
  estimatedBridgeDelaySec: number | null;

  // ── Outcome classification ────────────────────────────────────
  outcome: 'simulated_execution' | 'hold' | 'quote_failed' | 'error';
  /** Human-readable summary of the trade for quick scanning. */
  summary: string;
}

// ── Session-level aggregate stats ───────────────────────────────────

export interface SimulationStats {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  totalEpochs: number;
  tradesExecuted: number;
  tradesHeld: number;
  tradesFailed: number;
  totalVolumeUSD: number;
  totalGasCostUSD: number;
  totalBridgeFeesUSD: number;
  totalFeesUSD: number;
  startingPortfolioValueUSD: number;
  endingPortfolioValueUSD: number;
  netReturnUSD: number;
  netReturnPct: number;
  realizedPnLUSD: number;
  unrealizedPnLUSD: number;
  maxDrawdownPct: number;
  avgSlippagePct: number;
  avgBridgeDelaySec: number | null;
}

// ── Simulation config ───────────────────────────────────────────────

export interface SimulationConfig {
  /** Directory for log files. Defaults to data/simulation/. */
  logDir: string;
  /** Fetch real LI.FI quotes for fee/delay estimation. */
  fetchRealQuotes: boolean;
  /** Simulated slippage % (used when real quote isn't available). */
  fallbackSlippagePct: number;
  /** Simulated fee rate (used when real quote isn't available). */
  fallbackFeeRatePct: number;
  /** Wallet address to use in quote requests (for accurate gas). */
  walletAddress: string;
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  logDir: 'data/simulation',
  fetchRealQuotes: true,
  fallbackSlippagePct: 0.3,
  fallbackFeeRatePct: 0.1,
  walletAddress: '0x0000000000000000000000000000000000000000',
};
