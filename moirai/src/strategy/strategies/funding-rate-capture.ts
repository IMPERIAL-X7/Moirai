/**
 * Strategy 4: Funding Rate Capture
 *
 * Captures funding payments from perpetual futures markets (GMX, dYdX).
 * Takes the opposite side of crowded trades to earn funding, hedging
 * exposure with spot assets.
 */

import type { StrategyEngine, StrategyCandidate, DecisionPlan, PortfolioState } from '../types.js';
import type { MarketSnapshot } from '../../data/types.js';

export const FundingRateCaptureStrategy: StrategyEngine = {
  id: 'funding-rate-capture',
  name: 'Funding Rate Capture',
  description:
    'Earns funding payments from perp futures by taking the opposite side of crowded trades, hedged with spot.',

  evaluate: (market: MarketSnapshot, portfolio: PortfolioState, epochId: string): DecisionPlan => {
    // TODO: Implement funding rate capture logic
    // 1. Fetch funding rates from GMX / dYdX APIs
    // 2. Identify positive funding rates worth capturing
    // 3. Open hedged position (long spot + short perp, or vice versa)

    const holdCandidate: StrategyCandidate = {
      actionType: 'hold',
      fromChainId: portfolio.positions[0]?.chainId ?? 1,
      fromToken: market.tokens[0],
      amount: 0,
      score: 0,
      rationale: '[funding-rate-capture] Not yet implemented — holding.',
    };

    return {
      epochId,
      candidates: [holdCandidate],
      selected: holdCandidate,
      reasoning: 'Funding rate capture strategy not yet implemented.',
    };
  },
};
