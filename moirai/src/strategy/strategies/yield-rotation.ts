/**
 * Strategy 3: Yield Rate Rotation
 *
 * Continuously compares lending / staking yields across protocols
 * (Aave, Curve, etc.) and moves capital to the highest APY opportunity,
 * bridging cross-chain when needed.
 */

import type { StrategyEngine, StrategyCandidate, DecisionPlan, PortfolioState } from '../types.js';
import type { MarketSnapshot } from '../../data/types.js';

export const YieldRotationStrategy: StrategyEngine = {
  id: 'yield-rotation',
  name: 'Yield Rate Rotation',
  description:
    'Rotates capital across lending/staking protocols and chains to chase the highest credible APY.',

  evaluate: (market: MarketSnapshot, portfolio: PortfolioState, epochId: string): DecisionPlan => {
    // TODO: Implement yield rotation logic
    // 1. Filter yields to credible range (e.g. < 20% for stables)
    // 2. Compare current position's yield to best available
    // 3. If delta > threshold (covering bridge/gas), bridge + deposit

    const holdCandidate: StrategyCandidate = {
      actionType: 'hold',
      fromChainId: portfolio.positions[0]?.chainId ?? 1,
      fromToken: market.tokens[0],
      amount: 0,
      score: 0,
      rationale: '[yield-rotation] Not yet implemented — holding.',
    };

    return {
      epochId,
      candidates: [holdCandidate],
      selected: holdCandidate,
      reasoning: 'Yield rotation strategy not yet implemented.',
    };
  },
};
