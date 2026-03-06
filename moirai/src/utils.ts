/**
 * Utility Functions for LI.FI API Examples
 */

import { AxiosError } from 'axios';

/**
 * Format errors for better readability
 */
export function formatError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      // Server responded with error status
      return `HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`;
    } else if (error.request) {
      // Request was made but no response received
      return `No response received: ${error.message}`;
    } else {
      // Error setting up the request
      return `Request setup error: ${error.message}`;
    }
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return String(error);
}

/**
 * Sleep for a specified number of milliseconds
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  initialDelay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      
      const delay = initialDelay * Math.pow(2, attempt - 1);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw new Error('Max attempts reached');
}

/**
 * Format token amounts based on decimals
 */
export function formatTokenAmount(amount: string, decimals: number): string {
  const num = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fractional = num % divisor;
  
  if (fractional === BigInt(0)) {
    return whole.toString();
  }
  
  const fractionalStr = fractional.toString().padStart(decimals, '0');
  const trimmed = fractionalStr.replace(/0+$/, '');
  
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

/**
 * Parse token amount to smallest unit
 */
export function parseTokenAmount(amount: string, decimals: number): string {
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const fractional = parts[1] || '0';
  
  const fractionalPadded = fractional.padEnd(decimals, '0').slice(0, decimals);
  return whole + fractionalPadded;
}

// ---------------------------------------------------------------------------
// Route scoring
// ---------------------------------------------------------------------------

export interface RouteScore {
  index: number;
  route: any;
  outputAmount: bigint;
  gasCostUSD: number;
  feeCostUSD: number;
  totalCostUSD: number;
  stepCount: number;
  score: number; // higher is better
}

/**
 * Score and rank routes returned by /advanced/routes.
 *
 * Scoring formula (all values normalised per-route-set):
 *   score = 0.50 * normalisedOutput
 *         + 0.25 * (1 - normalisedCost)
 *         + 0.15 * (1 - normalisedSteps)
 *         + 0.10 * (1 - normalisedGas)
 *
 * The route with the highest score wins.
 */
export function scoreRoutes(routes: any[]): RouteScore[] {
  if (routes.length === 0) return [];

  const scored: RouteScore[] = routes.map((route, index) => {
    const outputAmount = BigInt(route.toAmount ?? route.estimate?.toAmount ?? '0');

    let gasCostUSD = 0;
    let feeCostUSD = 0;
    for (const step of route.steps ?? []) {
      gasCostUSD += parseFloat(step.estimate?.gasCosts?.[0]?.amountUSD ?? route.gasCostUSD ?? '0');
      for (const fee of step.estimate?.feeCosts ?? []) {
        feeCostUSD += parseFloat(fee.amountUSD ?? '0');
      }
    }
    // Fallback: use route-level fields if steps didn't carry costs
    if (gasCostUSD === 0) gasCostUSD = parseFloat(route.gasCostUSD ?? '0');
    if (feeCostUSD === 0) feeCostUSD = parseFloat(route.feeCostUSD ?? '0');

    return {
      index,
      route,
      outputAmount,
      gasCostUSD,
      feeCostUSD,
      totalCostUSD: gasCostUSD + feeCostUSD,
      stepCount: (route.steps ?? []).length,
      score: 0, // computed below after normalisation
    };
  });

  // --- helpers for min-max normalisation ---
  const outputs = scored.map(s => Number(s.outputAmount));
  const costs   = scored.map(s => s.totalCostUSD);
  const gases   = scored.map(s => s.gasCostUSD);
  const steps   = scored.map(s => s.stepCount);

  const norm = (val: number, min: number, max: number) =>
    max === min ? 1 : (val - min) / (max - min);

  const minOut  = Math.min(...outputs), maxOut  = Math.max(...outputs);
  const minCost = Math.min(...costs),   maxCost = Math.max(...costs);
  const minGas  = Math.min(...gases),   maxGas  = Math.max(...gases);
  const minStep = Math.min(...steps),   maxStep = Math.max(...steps);

  for (const s of scored) {
    const normOutput = norm(Number(s.outputAmount), minOut, maxOut);
    const normCost   = norm(s.totalCostUSD, minCost, maxCost);
    const normGas    = norm(s.gasCostUSD,   minGas,  maxGas);
    const normSteps  = norm(s.stepCount,    minStep, maxStep);

    s.score =
      0.50 * normOutput +
      0.25 * (1 - normCost) +
      0.15 * (1 - normSteps) +
      0.10 * (1 - normGas);
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ---------------------------------------------------------------------------
// Transaction execution with retry & route fallback
// ---------------------------------------------------------------------------

export interface ExecuteWithFallbackOptions {
  /** All scored routes, best-first. */
  scoredRoutes: RouteScore[];
  /** Maximum number of routes to attempt before giving up. */
  maxRouteAttempts?: number;
  /** Maximum retries *per route* for transient errors (e.g. RPC timeouts). */
  maxRetriesPerRoute?: number;
  /** Initial delay (ms) for exponential back-off within a single route retry. */
  initialRetryDelay?: number;
  /** Callback that gets step transaction data from the API. */
  getStepTransaction: (step: any) => Promise<any>;
  /** Callback that sends the transaction on-chain and returns the tx hash. */
  sendTransaction: (txRequest: any, stepData: any) => Promise<string>;
  /** Callback that waits for the tx receipt and returns it. */
  waitForReceipt: (txHash: string) => Promise<any>;
}

/**
 * Try to execute a cross-chain transaction, falling back to the next-best
 * route when a route fails with a non-transient error, and retrying with
 * exponential back-off for transient errors.
 *
 * Returns `{ txHash, receipt, routeUsed }` on success.
 * Throws after exhausting all fallback routes.
 */
export async function executeWithFallback(opts: ExecuteWithFallbackOptions) {
  const {
    scoredRoutes,
    maxRouteAttempts = 3,
    maxRetriesPerRoute = 2,
    initialRetryDelay = 2000,
    getStepTransaction,
    sendTransaction,
    waitForReceipt,
  } = opts;

  const routesToTry = scoredRoutes.slice(0, maxRouteAttempts);
  const errors: { routeIndex: number; error: unknown }[] = [];

  for (const scored of routesToTry) {
    const route = scored.route;
    const routeLabel = `Route #${scored.index + 1} (score ${scored.score.toFixed(3)})`;

    for (let retry = 0; retry <= maxRetriesPerRoute; retry++) {
      try {
        console.log(
          retry === 0
            ? `\n🔄 Attempting ${routeLabel}...`
            : `   ↻ Retry ${retry}/${maxRetriesPerRoute} for ${routeLabel}...`,
        );

        // 1. get step transaction data
        const stepData = await getStepTransaction(route.steps[0]);

        // 2. send on-chain
        const txHash = await sendTransaction(stepData.transactionRequest, stepData);
        console.log(`   ✅ Tx sent: ${txHash}`);

        // 3. wait for confirmation
        const receipt = await waitForReceipt(txHash);

        if (receipt.status === 'reverted') {
          throw new Error(`Transaction reverted (tx ${txHash})`);
        }

        return { txHash, receipt, routeUsed: scored };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`   ⚠️  ${routeLabel} failed: ${msg}`);

        // Decide if the error is transient (worth retrying same route)
        const isTransient =
          /timeout|ETIMEDOUT|ECONNRESET|rate.limit|429|503|nonce/i.test(msg);

        if (isTransient && retry < maxRetriesPerRoute) {
          const delay = initialRetryDelay * Math.pow(2, retry);
          console.log(`   ⏳ Waiting ${delay}ms before retry...`);
          await sleep(delay);
          continue; // retry same route
        }

        errors.push({ routeIndex: scored.index, error: err });
        break; // move to next route
      }
    }
  }

  // All routes exhausted
  const summary = errors
    .map(e => `  Route #${e.routeIndex + 1}: ${e.error instanceof Error ? e.error.message : String(e.error)}`)
    .join('\n');
  throw new Error(
    `All ${routesToTry.length} route(s) failed:\n${summary}`,
  );
}

