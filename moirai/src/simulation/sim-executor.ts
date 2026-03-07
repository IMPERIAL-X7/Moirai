/**
 * Simulation Executor
 *
 * Plugs into the AgentLoop as an Executor. Uses REAL market data and
 * REAL LI.FI quotes to estimate what a trade would cost and produce,
 * but never submits an on-chain transaction.
 *
 * All details are written to the SimulationLogger for manual verification.
 */

import axios from 'axios';
import type { MarketSnapshot } from '../data/types.js';
import type { StrategyCandidate, DecisionPlan } from '../strategy/types.js';
import type { Executor, ExecutionResult } from '../agent/agent-loop.js';
import { SimulationLogger } from './sim-logger.js';
import type {
  PriceEvidence,
  QuoteSnapshot,
  SimulatedTradeLog,
  SimulationConfig,
} from './types.js';
import { DEFAULT_SIMULATION_CONFIG } from './types.js';

// ── LI.FI quote fetcher ────────────────────────────────────────────

const LIFI_BASE = 'https://li.quest/v1';

interface LifiQuoteParams {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  slippage: number;
}

/**
 * Fetch a real quote from LI.FI. Returns structured data or null on
 * failure (with error message).
 */
async function fetchLifiQuote(
  params: LifiQuoteParams,
): Promise<{ quote: QuoteSnapshot; raw: unknown } | { error: string }> {
  try {
    const apiKey = process.env.LIFI_API_KEY || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['x-lifi-api-key'] = apiKey;

    const resp = await axios.get(`${LIFI_BASE}/quote`, {
      params: {
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromAmount: params.fromAmount,
        fromAddress: params.fromAddress,
        slippage: params.slippage,
      },
      headers,
      timeout: 15_000,
    });

    const data = resp.data;

    // Extract fees from the estimate
    let gasCostUSD = 0;
    let feeCostUSD = 0;
    let estimatedBridgeDuration: number | null = null;

    // Step-level costs
    const steps = data.includedSteps ?? data.steps ?? [];
    for (const step of steps) {
      for (const gc of step.estimate?.gasCosts ?? []) {
        gasCostUSD += parseFloat(gc.amountUSD ?? '0');
      }
      for (const fc of step.estimate?.feeCosts ?? []) {
        feeCostUSD += parseFloat(fc.amountUSD ?? '0');
      }
      // Bridge duration
      if (step.estimate?.executionDuration) {
        estimatedBridgeDuration = (estimatedBridgeDuration ?? 0) + step.estimate.executionDuration;
      }
    }

    // Route-level fallback
    if (gasCostUSD === 0 && data.estimate?.gasCosts) {
      for (const gc of data.estimate.gasCosts) {
        gasCostUSD += parseFloat(gc.amountUSD ?? '0');
      }
    }
    if (feeCostUSD === 0 && data.estimate?.feeCosts) {
      for (const fc of data.estimate.feeCosts) {
        feeCostUSD += parseFloat(fc.amountUSD ?? '0');
      }
    }
    if (estimatedBridgeDuration === null && data.estimate?.executionDuration) {
      estimatedBridgeDuration = data.estimate.executionDuration;
    }

    const estimatedOutput = data.estimate?.toAmount ?? '0';
    const estimatedOutputMin = data.estimate?.toAmountMin ?? estimatedOutput;
    const toDecimals = data.action?.toToken?.decimals ?? 18;

    const quote: QuoteSnapshot = {
      requestParams: {
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromAmount: params.fromAmount,
        slippage: params.slippage,
      },
      tool: data.tool ?? data.toolDetails?.key ?? 'unknown',
      toolName: data.toolDetails?.name ?? data.tool ?? 'unknown',
      estimatedOutputRaw: estimatedOutput,
      estimatedOutputFormatted: parseFloat(estimatedOutput) / Math.pow(10, toDecimals),
      minOutputFormatted: parseFloat(estimatedOutputMin) / Math.pow(10, toDecimals),
      gasCostUSD,
      feeCostUSD,
      totalCostUSD: gasCostUSD + feeCostUSD,
      estimatedBridgeDurationSec: estimatedBridgeDuration,
      stepCount: steps.length || 1,
      rawQuote: data,
    };

    return { quote, raw: data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (axios.isAxiosError(err) && err.response) {
      return { error: `LI.FI ${err.response.status}: ${JSON.stringify(err.response.data)}` };
    }
    return { error: msg };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildPriceEvidence(snapshot: MarketSnapshot): PriceEvidence[] {
  return snapshot.tokens.map((t) => ({
    symbol: t.symbol,
    chainId: t.chainId,
    priceUSD: t.priceUSD,
    source: t.source,
    fetchedAt: snapshot.timestamp,
    volume24hUSD: t.volume24hUSD,
    liquidityUSD: t.liquidityUSD,
    priceChange24h: t.priceChange24h,
  }));
}

// Token decimals lookup (common tokens)
const DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  DAI: 18,
  WETH: 18,
  ETH: 18,
};

function getDecimals(symbol: string): number {
  return DECIMALS[symbol.toUpperCase()] ?? 18;
}

function toSmallestUnit(amount: number, symbol: string): string {
  const decimals = getDecimals(symbol);
  return BigInt(Math.round(amount * Math.pow(10, decimals))).toString();
}

// ── Create the simulating executor ──────────────────────────────────

/**
 * Creates an Executor that:
 * 1. Fetches a real LI.FI quote (gas, bridge fees, estimated output)
 * 2. Logs everything to the SimulationLogger
 * 3. Returns a simulated ExecutionResult (no on-chain tx)
 *
 * The logger and snapshot+plan must be set before each epoch via
 * the returned control object.
 */
export function createSimulationExecutor(opts: {
  logger: SimulationLogger;
  config?: Partial<SimulationConfig>;
}): {
  executor: Executor;
  /** Call before each epoch to set the current snapshot & plan. */
  setEpochContext: (snapshot: MarketSnapshot, plan: DecisionPlan, epochId: string) => void;
} {
  const config = { ...DEFAULT_SIMULATION_CONFIG, ...opts.config };
  const logger = opts.logger;

  let currentSnapshot: MarketSnapshot | null = null;
  let currentPlan: DecisionPlan | null = null;
  let currentEpochId = '';

  const setEpochContext = (snapshot: MarketSnapshot, plan: DecisionPlan, epochId: string) => {
    currentSnapshot = snapshot;
    currentPlan = plan;
    currentEpochId = epochId;

    // Log hold decisions here because the agent loop skips the
    // executor entirely for holds — we still want them in the audit log.
    if (plan.selected.actionType === 'hold') {
      const candidate = plan.selected;
      logger.logTrade({
        epochId,
        allCandidates: plan.candidates,
        selectedCandidate: candidate,
        strategyReasoning: plan.reasoning,
        priceEvidence: buildPriceEvidence(snapshot),
        yieldSnapshot: snapshot.yields,
        chainSnapshot: snapshot.chains,
        actionType: 'hold',
        fromChainId: candidate.fromChainId,
        toChainId: candidate.toChainId ?? candidate.fromChainId,
        fromToken: candidate.fromToken.symbol,
        fromTokenAddress: candidate.fromToken.address,
        toToken: candidate.toToken?.symbol ?? candidate.fromToken.symbol,
        toTokenAddress: candidate.toToken?.address ?? candidate.fromToken.address,
        fromAmount: 0,
        fromAmountUSD: 0,
        quote: null,
        quoteError: null,
        simulatedToAmount: 0,
        simulatedToAmountUSD: 0,
        simulatedSlippagePct: 0,
        gasCostUSD: 0,
        bridgeFeesUSD: 0,
        totalFeesUSD: 0,
        estimatedBridgeDelaySec: null,
        outcome: 'hold',
        summary: `HOLD — ${candidate.rationale}`,
      });
      console.log(`[sim] HOLD — ${candidate.rationale}`);
    }
  };

  const executor: Executor = async (candidate, snapshot) => {
    // Use the snapshot passed to the executor (from agent loop)
    const snap = snapshot ?? currentSnapshot!;
    const plan = currentPlan;

    // Holds are logged in setEpochContext — the agent loop never calls
    // the executor for holds, but guard just in case.
    if (candidate.actionType === 'hold') return null;

    // ── Real trade simulation ───────────────────────────────────
    const fromPrice = candidate.fromToken.priceUSD;
    const toPrice = candidate.toToken?.priceUSD ?? fromPrice;
    const fromAmountUSD = candidate.amount * fromPrice;
    const fromChainId = candidate.fromChainId;
    const toChainId = candidate.toChainId ?? fromChainId;

    let quote: QuoteSnapshot | null = null;
    let quoteError: string | null = null;
    let simulatedToAmount: number;
    let gasCostUSD = 0;
    let bridgeFeesUSD = 0;
    let slippagePct = config.fallbackSlippagePct;
    let bridgeDelay: number | null = null;

    // ── Attempt real LI.FI quote ────────────────────────────────
    if (config.fetchRealQuotes) {
      const fromAmountRaw = toSmallestUnit(candidate.amount, candidate.fromToken.symbol);

      const quoteResult = await fetchLifiQuote({
        fromChain: fromChainId,
        toChain: toChainId,
        fromToken: candidate.fromToken.address,
        toToken: candidate.toToken?.address ?? candidate.fromToken.address,
        fromAmount: fromAmountRaw,
        fromAddress: config.walletAddress,
        slippage: 0.005, // 0.5%
      });

      if ('quote' in quoteResult) {
        quote = quoteResult.quote;
        gasCostUSD = quote.gasCostUSD;
        bridgeFeesUSD = quote.feeCostUSD;
        bridgeDelay = quote.estimatedBridgeDurationSec;
        // Use the quote's estimated output as our simulation result
        simulatedToAmount = quote.estimatedOutputFormatted;
        // Derive actual slippage from quote vs ideal
        const idealOutput = (candidate.amount * fromPrice) / toPrice;
        slippagePct = idealOutput > 0
          ? ((idealOutput - simulatedToAmount) / idealOutput) * 100
          : config.fallbackSlippagePct;
      } else {
        quoteError = quoteResult.error;
        console.warn(`[sim] Quote failed: ${quoteError} — using fallback`);
        // Fallback: simulate with configured slippage/fees
        simulatedToAmount = (candidate.amount * fromPrice * (1 - config.fallbackSlippagePct / 100)) / toPrice;
        gasCostUSD = fromAmountUSD * (config.fallbackFeeRatePct / 100);
        bridgeFeesUSD = fromChainId !== toChainId ? fromAmountUSD * 0.0005 : 0;
      }
    } else {
      // No real quotes — pure simulation
      simulatedToAmount = (candidate.amount * fromPrice * (1 - config.fallbackSlippagePct / 100)) / toPrice;
      gasCostUSD = fromAmountUSD * (config.fallbackFeeRatePct / 100);
      bridgeFeesUSD = fromChainId !== toChainId ? fromAmountUSD * 0.0005 : 0;
    }

    const totalFees = gasCostUSD + bridgeFeesUSD;
    const simulatedToAmountUSD = simulatedToAmount * toPrice;

    // ── Log everything ──────────────────────────────────────────
    const outcome = quote !== null ? 'simulated_execution' as const
      : quoteError !== null ? 'quote_failed' as const
      : 'simulated_execution' as const;

    const summary =
      `${candidate.actionType.toUpperCase()} ${candidate.amount.toFixed(4)} ${candidate.fromToken.symbol}` +
      ` (chain ${fromChainId}) → ${simulatedToAmount.toFixed(4)} ${candidate.toToken?.symbol ?? '?'}` +
      ` (chain ${toChainId})` +
      ` | value=$${fromAmountUSD.toFixed(2)} → $${simulatedToAmountUSD.toFixed(2)}` +
      ` | gas=$${gasCostUSD.toFixed(2)} bridge=$${bridgeFeesUSD.toFixed(2)}` +
      ` | slippage=${slippagePct.toFixed(3)}%` +
      (bridgeDelay !== null ? ` | est.delay=${bridgeDelay}s` : '') +
      (quote ? ` | tool=${quote.toolName}` : '') +
      (quoteError ? ` | QUOTE_FAILED: ${quoteError.slice(0, 80)}` : '');

    logger.logTrade({
      epochId: currentEpochId,
      allCandidates: plan?.candidates ?? [candidate],
      selectedCandidate: candidate,
      strategyReasoning: plan?.reasoning ?? candidate.rationale,
      priceEvidence: buildPriceEvidence(snap),
      yieldSnapshot: snap.yields,
      chainSnapshot: snap.chains,
      actionType: candidate.actionType,
      fromChainId,
      toChainId,
      fromToken: candidate.fromToken.symbol,
      fromTokenAddress: candidate.fromToken.address,
      toToken: candidate.toToken?.symbol ?? candidate.fromToken.symbol,
      toTokenAddress: candidate.toToken?.address ?? candidate.fromToken.address,
      fromAmount: candidate.amount,
      fromAmountUSD,
      quote,
      quoteError,
      simulatedToAmount,
      simulatedToAmountUSD,
      simulatedSlippagePct: slippagePct,
      gasCostUSD,
      bridgeFeesUSD,
      totalFeesUSD: totalFees,
      estimatedBridgeDelaySec: bridgeDelay,
      outcome,
      summary,
    });

    console.log(`[sim] ${summary}`);

    // ── Return ExecutionResult for the agent loop ───────────────
    return {
      txHash: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fromAmount: candidate.amount,
      toAmount: simulatedToAmount,
      fromPriceUSD: fromPrice,
      toPriceUSD: toPrice,
      feesUSD: totalFees,
      status: 'confirmed' as const,
    };
  };

  return { executor, setEpochContext };
}
