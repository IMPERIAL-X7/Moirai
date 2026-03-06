/**
 * Yield Service
 *
 * Fetches DeFi yield / APY data from DeFi Llama's free API.
 * No API key required.
 *
 * Endpoint: https://yields.llama.fi/pools
 * Returns ~10 k+ pools; we filter to our target chains and tokens.
 */

import axios from 'axios';
import type { YieldOpportunity } from './types.js';
import { DataCache } from './cache.js';

const YIELDS_URL = 'https://yields.llama.fi/pools';

/** Map our chain IDs to DeFi Llama chain names. */
const LLAMA_CHAIN: Record<number, string> = {
  1: 'Ethereum',
  42161: 'Arbitrum',
  8453: 'Base',
  137: 'Polygon',
};

const cache = new DataCache(10 * 60 * 1000); // 10-min TTL for yield data

export interface YieldFilter {
  /** Chain IDs to include. */
  chainIds: number[];
  /** Token symbols to match (case-insensitive substring match on the pool symbol). */
  symbols?: string[];
  /** Minimum TVL in USD to be considered relevant. */
  minTvlUSD?: number;
}

/**
 * Fetch yield opportunities matching the filter criteria.
 * Results are sorted by APY descending.
 */
export async function fetchYields(
  filter: YieldFilter,
): Promise<YieldOpportunity[]> {
  const cacheKey = `yields:${filter.chainIds.join(',')}:${(filter.symbols ?? []).join(',')}`;
  const cached = cache.get<YieldOpportunity[]>(cacheKey);
  if (cached) return cached;

  try {
    const resp = await axios.get(YIELDS_URL, { timeout: 15_000 });
    const pools: any[] = resp.data?.data ?? [];

    const allowedChains = new Set(
      filter.chainIds.map((id) => LLAMA_CHAIN[id]?.toLowerCase()).filter(Boolean),
    );
    const symbolSet = filter.symbols
      ? new Set(filter.symbols.map((s) => s.toLowerCase()))
      : null;
    const minTvl = filter.minTvlUSD ?? 0;

    const results: YieldOpportunity[] = [];

    for (const pool of pools) {
      const poolChain = (pool.chain ?? '').toLowerCase();
      if (!allowedChains.has(poolChain)) continue;
      if (pool.tvlUsd < minTvl) continue;

      // Symbol match: pool.symbol can be "USDC", "WETH-USDC", etc.
      const poolSymbol = (pool.symbol ?? '').toLowerCase();
      if (symbolSet && ![...symbolSet].some((s) => poolSymbol.includes(s))) {
        continue;
      }

      const chainId =
        Object.entries(LLAMA_CHAIN).find(
          ([, name]) => name.toLowerCase() === poolChain,
        )?.[0];

      results.push({
        protocol: pool.project ?? 'unknown',
        poolId: pool.pool ?? '',
        chainId: chainId ? Number(chainId) : 0,
        symbol: pool.symbol ?? '',
        apyPct: pool.apy ?? 0,
        tvlUSD: pool.tvlUsd ?? 0,
      });
    }

    // Sort by APY descending
    results.sort((a, b) => b.apyPct - a.apyPct);

    cache.set(cacheKey, results);
    return results;
  } catch (err) {
    console.warn(
      '[YieldService] Failed to fetch yields from DeFi Llama:',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
