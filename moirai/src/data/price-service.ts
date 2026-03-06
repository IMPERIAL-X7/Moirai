/**
 * Price Service
 *
 * Fetches token prices, 24 h volume, and liquidity from DexScreener (primary)
 * with CoinGecko as a fallback for price data.
 *
 * Both APIs are free and require no API key.
 */

import axios from 'axios';
import type { TokenState } from './types.js';
import { DataCache } from './cache.js';

// ── DexScreener helpers ─────────────────────────────────────────────

const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex';

/** Map our chain IDs to DexScreener chain slugs. */
const CHAIN_SLUG: Record<number, string> = {
  1: 'ethereum',
  42161: 'arbitrum',
  8453: 'base',
  137: 'polygon',
};

interface DexScreenerPair {
  chainId: string;
  baseToken: { address: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd: string;
  volume: { h24: number };
  liquidity: { usd: number };
  priceChange: { h24: number };
}

/**
 * Fetch token data from DexScreener by contract addresses.
 * DexScreener allows up to 30 addresses per call.
 */
async function fetchDexScreener(
  addresses: string[],
  chainId: number,
): Promise<TokenState[]> {
  const slug = CHAIN_SLUG[chainId];
  if (!slug) return [];

  // DexScreener endpoint: /tokens/{addresses} (comma-separated, max 30)
  const batches: string[][] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    batches.push(addresses.slice(i, i + 30));
  }

  const results: TokenState[] = [];

  for (const batch of batches) {
    try {
      const url = `${DEXSCREENER_BASE}/tokens/${batch.join(',')}`;
      const resp = await axios.get(url, { timeout: 10_000 });
      const pairs: DexScreenerPair[] = resp.data?.pairs ?? [];

      // DexScreener returns many pairs per token; pick the highest-liquidity
      // pair per base token address.
      const bestByAddress = new Map<string, DexScreenerPair>();

      for (const pair of pairs) {
        // Only keep pairs on our target chain
        if (pair.chainId !== slug) continue;

        const addr = pair.baseToken.address.toLowerCase();
        const existing = bestByAddress.get(addr);
        if (!existing || pair.liquidity.usd > existing.liquidity.usd) {
          bestByAddress.set(addr, pair);
        }
      }

      for (const [, pair] of bestByAddress) {
        results.push({
          symbol: pair.baseToken.symbol,
          address: pair.baseToken.address,
          chainId,
          priceUSD: parseFloat(pair.priceUsd) || 0,
          volume24hUSD: pair.volume?.h24 ?? 0,
          liquidityUSD: pair.liquidity?.usd ?? 0,
          priceChange24h: (pair.priceChange?.h24 ?? 0) / 100,
          source: 'dexscreener',
        });
      }
    } catch (err) {
      console.warn(
        `[PriceService] DexScreener request failed for chain ${chainId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return results;
}

// ── CoinGecko fallback ──────────────────────────────────────────────

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

/** Map chain IDs to CoinGecko asset platform IDs. */
const CG_PLATFORM: Record<number, string> = {
  1: 'ethereum',
  42161: 'arbitrum-one',
  8453: 'base',
  137: 'polygon-pos',
};

/**
 * Fetch prices from CoinGecko by contract addresses.
 * Free tier: ~10-30 req/min. We request in batches of 100.
 */
async function fetchCoinGeckoPrices(
  addresses: string[],
  chainId: number,
): Promise<Map<string, number>> {
  const platform = CG_PLATFORM[chainId];
  if (!platform) return new Map();

  const result = new Map<string, number>();
  const batches: string[][] = [];
  for (let i = 0; i < addresses.length; i += 100) {
    batches.push(addresses.slice(i, i + 100));
  }

  for (const batch of batches) {
    try {
      const resp = await axios.get(
        `${COINGECKO_BASE}/simple/token_price/${platform}`,
        {
          params: {
            contract_addresses: batch.join(','),
            vs_currencies: 'usd',
            include_24hr_change: 'true',
          },
          timeout: 10_000,
        },
      );
      for (const [addr, data] of Object.entries(resp.data ?? {})) {
        const d = data as any;
        if (d.usd) result.set(addr.toLowerCase(), d.usd);
      }
    } catch (err) {
      console.warn(
        `[PriceService] CoinGecko request failed for chain ${chainId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return result;
}

// ── Public API ──────────────────────────────────────────────────────

const cache = new DataCache();

export interface TokenQuery {
  address: string;
  symbol: string;
  chainId: number;
}

/**
 * Fetch token prices, volume, and liquidity for a set of tokens.
 *
 * Strategy:
 *  1. Try DexScreener (gives price + volume + liquidity).
 *  2. For any tokens missing from DexScreener, fall back to CoinGecko
 *     (price only; volume/liquidity remain 0).
 */
export async function fetchTokenStates(
  tokens: TokenQuery[],
): Promise<TokenState[]> {
  // Group by chain
  const byChain = new Map<number, TokenQuery[]>();
  for (const t of tokens) {
    const list = byChain.get(t.chainId) ?? [];
    list.push(t);
    byChain.set(t.chainId, list);
  }

  const allResults: TokenState[] = [];

  for (const [chainId, chainTokens] of byChain) {
    const addresses = chainTokens.map((t) => t.address);
    const cacheKey = `prices:${chainId}:${addresses.sort().join(',')}`;

    const cached = cache.get<TokenState[]>(cacheKey);
    if (cached) {
      allResults.push(...cached);
      continue;
    }

    // 1. DexScreener
    const dexResults = await fetchDexScreener(addresses, chainId);
    const foundAddrs = new Set(dexResults.map((r) => r.address.toLowerCase()));

    // 2. CoinGecko fallback for missing tokens
    const missing = addresses.filter((a) => !foundAddrs.has(a.toLowerCase()));
    if (missing.length > 0) {
      const cgPrices = await fetchCoinGeckoPrices(missing, chainId);
      for (const addr of missing) {
        const price = cgPrices.get(addr.toLowerCase());
        const token = chainTokens.find(
          (t) => t.address.toLowerCase() === addr.toLowerCase(),
        );
        dexResults.push({
          symbol: token?.symbol ?? 'UNKNOWN',
          address: addr,
          chainId,
          priceUSD: price ?? 0,
          volume24hUSD: 0,
          liquidityUSD: 0,
          priceChange24h: 0,
          source: price ? 'coingecko' : 'manual',
        });
      }
    }

    cache.set(cacheKey, dexResults);
    allResults.push(...dexResults);
  }

  return allResults;
}
