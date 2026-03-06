/**
 * Strategy Engine (Modular)
 *
 * This module implements a pluggable strategy engine. The default strategy
 * is simple and readable, designed for easy later extension.
 */

import type { MarketSnapshot, TokenState } from '../data/types.js';
import type { PortfolioState, DecisionPlan, StrategyCandidate, ActionType } from './types.js';

export interface StrategyEngine {
  name: string;
  description: string;
  evaluate: (
    market: MarketSnapshot,
    portfolio: PortfolioState,
    epochId: string,
  ) => DecisionPlan;
}

// ── Default strategy logic ─────────────────────────────────────────

/**
 * Default strategy: "Momentum + Yield"
 *
 * - If USDC yield > threshold, bridge to highest APY chain.
 * - If WETH price up > threshold, hold or rebalance to WETH.
 * - If WETH price down > threshold, rebalance to USDC.
 * - Otherwise, hold.
 *
 * Thresholds and logic are easy to change.
 */
export const DefaultStrategy: StrategyEngine = {
  name: 'Momentum + Yield (Default)',
  description:
    'Simple momentum and yield-based strategy. Bridges to highest-yield USDC, rebalances to WETH on uptrend, to USDC on downtrend.',
  evaluate: (market, portfolio, epochId) => {
    const candidates: StrategyCandidate[] = [];
    const reasoning: string[] = [];

    // --- Parameters ---
    const USDC_YIELD_THRESHOLD = 0.05; // 5% APY
    const WETH_UP_THRESHOLD = 0.03; // +3% 24h
    const WETH_DOWN_THRESHOLD = -0.03; // -3% 24h
    const MIN_TRADE_SIZE_USD = 100;

    // --- Find tokens ---
    const usdcTokens = market.tokens.filter((t) => t.symbol === 'USDC');
    const wethTokens = market.tokens.filter((t) => t.symbol === 'WETH');

    // --- Yield opportunity ---
    const bestUsdcYield = market.yields
      .filter((y) => y.symbol === 'USDC')
      .sort((a, b) => b.apyPct - a.apyPct)[0];

    if (bestUsdcYield && bestUsdcYield.apyPct / 100 > USDC_YIELD_THRESHOLD) {
      candidates.push({
        actionType: 'bridge',
        fromChainId: portfolio.positions[0]?.chainId ?? 1,
        toChainId: bestUsdcYield.chainId,
        fromToken: usdcTokens.find((t) => t.chainId === (portfolio.positions[0]?.chainId ?? 1)) ?? usdcTokens[0],
        toToken: usdcTokens.find((t) => t.chainId === bestUsdcYield.chainId) ?? usdcTokens[0],
        amount: Math.max(MIN_TRADE_SIZE_USD, portfolio.totalValueUSD * 0.2),
        score: bestUsdcYield.apyPct,
        rationale: `Bridge to USDC on chain ${bestUsdcYield.chainId} for APY ${bestUsdcYield.apyPct.toFixed(2)}%`,
      });
      reasoning.push(`USDC yield ${bestUsdcYield.apyPct.toFixed(2)}% > threshold (${USDC_YIELD_THRESHOLD * 100}%)`);
    }

    // --- WETH momentum ---
    for (const weth of wethTokens) {
      if (weth.priceChange24h > WETH_UP_THRESHOLD) {
        candidates.push({
          actionType: 'rebalance',
          fromChainId: portfolio.positions[0]?.chainId ?? 1,
          fromToken: usdcTokens.find((t) => t.chainId === (portfolio.positions[0]?.chainId ?? 1)) ?? usdcTokens[0],
          toToken: weth,
          amount: Math.max(MIN_TRADE_SIZE_USD, portfolio.totalValueUSD * 0.2),
          score: weth.priceChange24h,
          rationale: `Rebalance to WETH on chain ${weth.chainId} (up ${weth.priceChange24h * 100}% 24h)`,
        });
        reasoning.push(`WETH price up ${weth.priceChange24h * 100}% > threshold (${WETH_UP_THRESHOLD * 100}%)`);
      } else if (weth.priceChange24h < WETH_DOWN_THRESHOLD) {
        candidates.push({
          actionType: 'rebalance',
          fromChainId: portfolio.positions[0]?.chainId ?? 1,
          fromToken: weth,
          toToken: usdcTokens.find((t) => t.chainId === (portfolio.positions[0]?.chainId ?? 1)) ?? usdcTokens[0],
          amount: Math.max(MIN_TRADE_SIZE_USD, portfolio.totalValueUSD * 0.2),
          score: -weth.priceChange24h,
          rationale: `Rebalance to USDC on chain ${weth.chainId} (down ${weth.priceChange24h * 100}% 24h)`,
        });
        reasoning.push(`WETH price down ${weth.priceChange24h * 100}% < threshold (${WETH_DOWN_THRESHOLD * 100}%)`);
      }
    }

    // --- Hold fallback ---
    if (candidates.length === 0) {
      candidates.push({
        actionType: 'hold',
        fromChainId: portfolio.positions[0]?.chainId ?? 1,
        fromToken: usdcTokens[0],
        amount: 0,
        score: 0,
        rationale: 'No strong signal; hold.',
      });
      reasoning.push('No strong momentum or yield signal; hold.');
    }

    // --- Select best candidate ---
    const selected = candidates.sort((a, b) => b.score - a.score)[0];

    return {
      epochId,
      candidates,
      selected,
      reasoning: reasoning.join(' | '),
    };
  },
};

// ── Engine registry for easy extension ─────────────────────────────

export const StrategyRegistry: StrategyEngine[] = [DefaultStrategy];
