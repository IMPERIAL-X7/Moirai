/**
 * Market Data Layer – Canonical Types
 *
 * These types define the normalized output contract consumed by the
 * Decision Engine. They match the MarketSnapshot spec from the README.
 */

// ── Token-level market state ────────────────────────────────────────

export interface TokenState {
  /** Token symbol (e.g. "ETH", "USDC"). */
  symbol: string;
  /** On-chain contract address (checksummed). */
  address: string;
  /** Chain ID the token lives on. */
  chainId: number;
  /** Current USD price. */
  priceUSD: number;
  /** 24 h trading volume in USD. */
  volume24hUSD: number;
  /** Total liquidity in USD across tracked DEX pools. */
  liquidityUSD: number;
  /** 24 h price change as a ratio (e.g. 0.05 = +5 %). */
  priceChange24h: number;
  /** Source that provided this data point. */
  source: 'dexscreener' | 'coingecko' | 'lifi' | 'manual';
}

// ── Yield / DeFi protocol state ─────────────────────────────────────

export interface YieldOpportunity {
  /** Human-readable protocol name. */
  protocol: string;
  /** Pool or vault identifier from the data source. */
  poolId: string;
  /** Chain the opportunity is on. */
  chainId: number;
  /** Underlying token symbol (e.g. "USDC"). */
  symbol: string;
  /** Current APY as a percentage (e.g. 4.5 = 4.5 %). */
  apyPct: number;
  /** Total value locked in USD. */
  tvlUSD: number;
}

// ── Chain execution context ─────────────────────────────────────────

export interface ChainState {
  chainId: number;
  chainName: string;
  /** Current average gas price in Gwei (if available). */
  gasPriceGwei: number | null;
}

// ── Aggregated snapshot ─────────────────────────────────────────────

export interface MarketSnapshot {
  /** ISO-8601 timestamp when the snapshot was assembled. */
  timestamp: string;
  tokens: TokenState[];
  yields: YieldOpportunity[];
  chains: ChainState[];
}
