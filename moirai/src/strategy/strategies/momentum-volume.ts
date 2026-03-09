/**
 * Strategy 5: Momentum Volume
 *
 * Trades tokens experiencing rapid increases in trading volume.
 * Large volume spikes often indicate short-term momentum that can
 * be captured with quick entries and exits.
 */

import type { StrategyEngine, StrategyCandidate, DecisionPlan, PortfolioState } from '../types.js';
import type { MarketSnapshot } from '../../data/types.js';

export const MomentumVolumeStrategy: StrategyEngine = {
  id: 'momentum-volume',
  name: 'Momentum Volume',
  description:
    'Detects tokens with sudden volume growth, buys during early momentum, exits once momentum slows.',

  evaluate: (market: MarketSnapshot, portfolio: PortfolioState, epochId: string): DecisionPlan => {
    // TODO: Implement momentum volume logic
    // 1. Compare current 24h volume to historical average
    // 2. Identify tokens with volume spikes > threshold
    // 3. Buy into momentum, set exit criteria (volume decline / time)

    const holdCandidate: StrategyCandidate = {
      actionType: 'hold',
      fromChainId: portfolio.positions[0]?.chainId ?? 1,
      fromToken: market.tokens[0],
      amount: 0,
      score: 0,
      rationale: '[momentum-volume] Not yet implemented — holding.',
    };

    return {
      epochId,
      candidates: [holdCandidate],
      selected: holdCandidate,
      reasoning: 'Momentum volume strategy not yet implemented.',
    };
  },
};
