/**
 * Strategy Engine — Registry & Lookup
 *
 * Provides a registry of all available strategies and helper
 * functions to look them up by id.
 *
 * The StrategyEngine interface lives in ./types.ts to avoid
 * circular imports with ./strategies/*.
 */

import type { StrategyEngine } from './types.js';
export type { StrategyEngine } from './types.js';

// ── Registry ────────────────────────────────────────────────────────

import { CrossChainArbitrageStrategy } from './strategies/cross-chain-arbitrage.js';
import { LPFeeFarmingStrategy } from './strategies/lp-fee-farming.js';
import { YieldRotationStrategy } from './strategies/yield-rotation.js';
import { FundingRateCaptureStrategy } from './strategies/funding-rate-capture.js';
import { MomentumVolumeStrategy } from './strategies/momentum-volume.js';

/** All registered strategies, keyed by their id. */
export const StrategyRegistry: Record<string, StrategyEngine> = {
  [CrossChainArbitrageStrategy.id]: CrossChainArbitrageStrategy,
  [LPFeeFarmingStrategy.id]: LPFeeFarmingStrategy,
  [YieldRotationStrategy.id]: YieldRotationStrategy,
  [FundingRateCaptureStrategy.id]: FundingRateCaptureStrategy,
  [MomentumVolumeStrategy.id]: MomentumVolumeStrategy,
};

/** Convenience default — the first strategy that's actually implemented. */
export const DefaultStrategy: StrategyEngine = CrossChainArbitrageStrategy;

/**
 * Look up a strategy by its id. Throws if not found.
 */
export function getStrategy(id: string): StrategyEngine {
  const strategy = StrategyRegistry[id];
  if (!strategy) {
    const available = Object.keys(StrategyRegistry).join(', ');
    throw new Error(`Unknown strategy "${id}". Available: ${available}`);
  }
  return strategy;
}

/**
 * List all registered strategies (for CLI help, etc.).
 */
export function listStrategies(): { id: string; name: string; description: string }[] {
  return Object.values(StrategyRegistry).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
  }));
}
