/**
 * Liquidity & Volume Service
 *
 * Provides pool-level liquidity and volume detail via the DexScreener
 * search API. The price-service already returns aggregate liquidity per
 * token; this service adds granular pool breakdowns when the strategy
 * engine needs to assess execution quality (depth, spread, etc.).
 *
 * Free – no API key required.
 */

import axios from 'axios';
import { DataCache } from './cache.js';

const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex';

const CHAIN_SLUG: Record<number, string> = {
  1: 'ethereum',
  42161: 'arbitrum',
  8453: 'base',
  137: 'polygon',
};

export interface PoolInfo {
  pairAddress: string;
  dexId: string;
  chainId: number;
  baseToken: { address: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUSD: number;
  volume24hUSD: number;
  liquidityUSD: number;
  priceChange24h: number;
  txns24h: { buys: number; sells: number };
}

const cache = new DataCache();

/**
 * Fetch top pools for a token on a given chain, sorted by liquidity descending.
 * Returns at most `limit` pools.
 */
export async function fetchPoolsForToken(
  tokenAddress: string,
  chainId: number,
  limit = 5,
): Promise<PoolInfo[]> {
  const slug = CHAIN_SLUG[chainId];
  if (!slug) return [];

  const cacheKey = `pools:${chainId}:${tokenAddress.toLowerCase()}`;
  const cached = cache.get<PoolInfo[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${DEXSCREENER_BASE}/tokens/${tokenAddress}`;
    const resp = await axios.get(url, { timeout: 10_000 });
    const pairs: any[] = resp.data?.pairs ?? [];

    const pools: PoolInfo[] = pairs
      .filter((p: any) => p.chainId === slug)
      .map((p: any) => ({
        pairAddress: p.pairAddress,
        dexId: p.dexId,
        chainId,
        baseToken: {
          address: p.baseToken.address,
          symbol: p.baseToken.symbol,
        },
        quoteToken: {
          address: p.quoteToken.address,
          symbol: p.quoteToken.symbol,
        },
        priceUSD: parseFloat(p.priceUsd) || 0,
        volume24hUSD: p.volume?.h24 ?? 0,
        liquidityUSD: p.liquidity?.usd ?? 0,
        priceChange24h: (p.priceChange?.h24 ?? 0) / 100,
        txns24h: {
          buys: p.txns?.h24?.buys ?? 0,
          sells: p.txns?.h24?.sells ?? 0,
        },
      }))
      .sort((a: PoolInfo, b: PoolInfo) => b.liquidityUSD - a.liquidityUSD)
      .slice(0, limit);

    cache.set(cacheKey, pools);
    return pools;
  } catch (err) {
    console.warn(
      `[LiquidityService] Failed to fetch pools for ${tokenAddress} on chain ${chainId}:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * Aggregate liquidity and volume across all pools for a token.
 */
export async function fetchAggregatedLiquidity(
  tokenAddress: string,
  chainId: number,
): Promise<{ totalLiquidityUSD: number; totalVolume24hUSD: number; poolCount: number }> {
  const pools = await fetchPoolsForToken(tokenAddress, chainId, 20);
  return {
    totalLiquidityUSD: pools.reduce((s, p) => s + p.liquidityUSD, 0),
    totalVolume24hUSD: pools.reduce((s, p) => s + p.volume24hUSD, 0),
    poolCount: pools.length,
  };
}
