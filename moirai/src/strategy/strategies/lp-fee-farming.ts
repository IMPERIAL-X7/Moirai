/**
 * Strategy 2: Liquidity Pool Fee Farming
 *
 * Provides liquidity in high-volume AMM pools (Uniswap, Balancer, etc.)
 * to collect trading fees. Periodically rebalances across chains to
 * chase the highest fee-generating pools.
 */

import type { StrategyEngine, StrategyCandidate, DecisionPlan, PortfolioState } from '../types.js';
import type { MarketSnapshot } from '../../data/types.js';

export const LPFeeFarmingStrategy: StrategyEngine = {
  id: 'lp-fee-farming',
  name: 'Liquidity Pool Fee Farming',
  description:
    'Provides liquidity in high-volume DEX pools to earn trading fees, rebalancing across chains.',

  evaluate: (market: MarketSnapshot, portfolio: PortfolioState, epochId: string): DecisionPlan => {
    // TODO: Implement LP fee farming logic
    // 1. Fetch pool volume / fee data (DeFi Llama, on-chain)
    // 2. Rank pools by fee APR relative to IL risk
    // 3. If current pool underperforms, bridge + rebalance to better pool

    const holdCandidate: StrategyCandidate = {
      actionType: 'hold',
      fromChainId: portfolio.positions[0]?.chainId ?? 1,
      fromToken: market.tokens[0],
      amount: 0,
      score: 0,
      rationale: '[lp-fee-farming] Not yet implemented — holding.',
    };

    return {
      epochId,
      candidates: [holdCandidate],
      selected: holdCandidate,
      reasoning: 'LP fee farming strategy not yet implemented.',
    };
  },
};
