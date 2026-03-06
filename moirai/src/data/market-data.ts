/**
 * Market Data Orchestrator
 *
 * Assembles a complete MarketSnapshot by calling the individual data
 * services, normalizing their output, and caching the result.
 *
 * This is the single entry point the agent loop uses each epoch.
 */

import type { MarketSnapshot, ChainState, TokenState, YieldOpportunity } from './types.js';
import { fetchTokenStates, type TokenQuery } from './price-service.js';
import { fetchYields, type YieldFilter } from './yield-service.js';
import { DataCache } from './cache.js';

// Re-export everything consumers might need
export type { MarketSnapshot, TokenState, YieldOpportunity, ChainState } from './types.js';
export type { TokenQuery } from './price-service.js';
export type { PoolInfo } from './liquidity-service.js';
export { fetchTokenStates } from './price-service.js';
export { fetchPoolsForToken, fetchAggregatedLiquidity } from './liquidity-service.js';
export { fetchYields } from './yield-service.js';
export { DataCache } from './cache.js';

// ── Default token universe (Section 1 spec) ────────────────────────

const DEFAULT_TOKENS: TokenQuery[] = [
  // ETH (native wrapped) on each chain
  { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', chainId: 1 },
  { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', chainId: 42161 },
  { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', chainId: 8453 },
  { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', chainId: 137 },
  // USDC on each chain
  { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', chainId: 1 },
  { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chainId: 42161 },
  { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', chainId: 8453 },
  { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', chainId: 137 },
];

const DEFAULT_CHAINS: ChainState[] = [
  { chainId: 1, chainName: 'Ethereum', gasPriceGwei: null },
  { chainId: 42161, chainName: 'Arbitrum', gasPriceGwei: null },
  { chainId: 8453, chainName: 'Base', gasPriceGwei: null },
  { chainId: 137, chainName: 'Polygon', gasPriceGwei: null },
];

// ── Snapshot cache ──────────────────────────────────────────────────

const snapshotCache = new DataCache(5 * 60 * 1000); // 5 min

// ── Periodic updater ────────────────────────────────────────────────

let updateTimer: ReturnType<typeof setInterval> | null = null;
let latestSnapshot: MarketSnapshot | null = null;

// ── Public API ──────────────────────────────────────────────────────

export interface SnapshotOptions {
  /** Tokens to query. Defaults to the core ETH + USDC universe. */
  tokens?: TokenQuery[];
  /** Extra memecoin addresses to include dynamically. */
  extraTokens?: TokenQuery[];
  /** Override chain list. */
  chains?: ChainState[];
  /** Yield filter (chain IDs + symbols). */
  yieldFilter?: YieldFilter;
}

/**
 * Build a fresh MarketSnapshot. Results are cached for ~5 min so
 * multiple callers within the same epoch share data.
 */
export async function getMarketSnapshot(
  opts: SnapshotOptions = {},
): Promise<MarketSnapshot> {
  const cacheKey = 'snapshot:latest';
  const cached = snapshotCache.get<MarketSnapshot>(cacheKey);
  if (cached) return cached;

  const tokens = [...(opts.tokens ?? DEFAULT_TOKENS), ...(opts.extraTokens ?? [])];
  const chains = opts.chains ?? DEFAULT_CHAINS;

  const yieldFilter: YieldFilter = opts.yieldFilter ?? {
    chainIds: chains.map((c) => c.chainId),
    symbols: ['ETH', 'WETH', 'USDC'],
    minTvlUSD: 100_000,
  };

  // Fetch in parallel
  const [tokenStates, yields] = await Promise.all([
    fetchTokenStates(tokens),
    fetchYields(yieldFilter),
  ]);

  const snapshot: MarketSnapshot = {
    timestamp: new Date().toISOString(),
    tokens: tokenStates,
    yields,
    chains,
  };

  snapshotCache.set(cacheKey, snapshot);
  latestSnapshot = snapshot;
  return snapshot;
}

/**
 * Return the most recently fetched snapshot (may be null if never fetched).
 */
export function getLatestSnapshot(): MarketSnapshot | null {
  return latestSnapshot;
}

/**
 * Start a periodic background refresh. Call once at agent startup.
 * @param intervalMs Refresh interval in milliseconds (default 5 min).
 */
export function startPeriodicUpdates(
  intervalMs = 5 * 60 * 1000,
  opts: SnapshotOptions = {},
): void {
  if (updateTimer) return; // already running

  // Fire immediately, then on interval
  getMarketSnapshot(opts).catch((err) =>
    console.error('[MarketData] Initial snapshot failed:', err),
  );

  updateTimer = setInterval(() => {
    getMarketSnapshot(opts).catch((err) =>
      console.error('[MarketData] Periodic snapshot failed:', err),
    );
  }, intervalMs);

  console.log(`[MarketData] Periodic updates started (every ${intervalMs / 1000}s)`);
}

/**
 * Stop background refresh.
 */
export function stopPeriodicUpdates(): void {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
    console.log('[MarketData] Periodic updates stopped');
  }
}
