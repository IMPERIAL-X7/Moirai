/**
 * Agent Loop Types
 *
 * Configuration, epoch log, and lifecycle types for the decision loop.
 * Keep this file thin — add new fields as needed.
 */

import type { MarketSnapshot } from '../data/types.js';
import type { DecisionPlan } from '../strategy/types.js';
import type { TradeRecord } from '../portfolio/types.js';

// ── Agent configuration ─────────────────────────────────────────────

export interface AgentConfig {
  /** How often the loop runs (ms). Default: 1 hour. */
  epochIntervalMs: number;
  /** Maximum consecutive data-fetch failures before the agent pauses. */
  maxDataFailures: number;
  /** Maximum consecutive execution failures before the agent pauses. */
  maxExecFailures: number;
  /** If true, log to console; otherwise silent (for testing). */
  verbose: boolean;
  /** If true, skip actual on-chain execution (paper trading). */
  dryRun: boolean;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  epochIntervalMs: 60 * 60 * 1000, // 1 hour
  maxDataFailures: 3,
  maxExecFailures: 3,
  verbose: true,
  dryRun: true, // safe default — no real transactions
};

// ── Epoch log (one per loop iteration) ──────────────────────────────

export type EpochPhase =
  | 'data_fetch'
  | 'strategy_eval'
  | 'execution'
  | 'portfolio_update'
  | 'persist';

export type EpochOutcome =
  | 'hold'       // strategy chose to hold
  | 'executed'   // trade was submitted (dry or real)
  | 'skipped'    // skipped due to risk / validation
  | 'error';     // unrecoverable error in this epoch

export interface EpochLog {
  epochId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcome: EpochOutcome;
  phases: PhaseLog[];
  snapshot: MarketSnapshot | null;
  plan: DecisionPlan | null;
  trade: TradeRecord | null;
  error: string | null;
}

export interface PhaseLog {
  phase: EpochPhase;
  startedAt: string;
  durationMs: number;
  success: boolean;
  message: string;
}

// ── Agent lifecycle ─────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'running' | 'paused' | 'stopped';
