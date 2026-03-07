/**
 * Simulation Logger
 *
 * Writes detailed JSON-lines audit logs for every simulated trade.
 * Each epoch appends one entry to the log file. A session summary
 * is written on close().
 *
 * Log files are human-readable JSONL — one JSON object per line,
 * easy to grep, jq, or load into a spreadsheet.
 */

import fs from 'fs';
import path from 'path';
import type { SimulatedTradeLog, SimulationStats, SimulationConfig } from './types.js';
import { DEFAULT_SIMULATION_CONFIG } from './types.js';

export class SimulationLogger {
  private config: SimulationConfig;
  private sessionId: string;
  private logFilePath: string;
  private summaryFilePath: string;
  private sequenceNo = 0;
  private logs: SimulatedTradeLog[] = [];
  private startedAt: string;

  constructor(config?: Partial<SimulationConfig>) {
    this.config = { ...DEFAULT_SIMULATION_CONFIG, ...config };
    this.sessionId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.startedAt = new Date().toISOString();

    // Ensure log directory exists
    const dir = path.resolve(process.cwd(), this.config.logDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.logFilePath = path.join(dir, `trades-${ts}.jsonl`);
    this.summaryFilePath = path.join(dir, `summary-${ts}.json`);

    // Write header comment
    fs.writeFileSync(
      this.logFilePath,
      `// Moirai Simulation Trade Log — Session ${this.sessionId}\n` +
        `// Started: ${this.startedAt}\n` +
        `// One JSON object per line (JSONL). Use jq or any JSON parser.\n`,
      'utf-8',
    );

    console.log(`[sim-logger] Session ${this.sessionId}`);
    console.log(`[sim-logger] Trade log: ${this.logFilePath}`);
  }

  /** Append a trade log entry to the JSONL file. */
  logTrade(entry: Omit<SimulatedTradeLog, 'sequenceNo' | 'loggedAt'>): SimulatedTradeLog {
    this.sequenceNo++;
    const full: SimulatedTradeLog = {
      ...entry,
      sequenceNo: this.sequenceNo,
      loggedAt: new Date().toISOString(),
    };

    this.logs.push(full);

    // Append to file immediately (crash-safe)
    fs.appendFileSync(this.logFilePath, JSON.stringify(full) + '\n', 'utf-8');

    return full;
  }

  /** Get all logged trades for in-memory analysis. */
  getTrades(): SimulatedTradeLog[] {
    return [...this.logs];
  }

  /** Compute and write session summary. */
  writeSummary(startingValueUSD: number, endingValueUSD: number, realizedPnL: number, unrealizedPnL: number): SimulationStats {
    const trades = this.logs.filter(l => l.outcome === 'simulated_execution');
    const holds = this.logs.filter(l => l.outcome === 'hold');
    const failed = this.logs.filter(l => l.outcome === 'quote_failed' || l.outcome === 'error');

    const totalVolume = trades.reduce((s, t) => s + t.fromAmountUSD, 0);
    const totalGas = trades.reduce((s, t) => s + t.gasCostUSD, 0);
    const totalBridge = trades.reduce((s, t) => s + t.bridgeFeesUSD, 0);
    const totalFees = trades.reduce((s, t) => s + t.totalFeesUSD, 0);

    const slippages = trades.map(t => t.simulatedSlippagePct).filter(s => s > 0);
    const avgSlippage = slippages.length > 0
      ? slippages.reduce((a, b) => a + b, 0) / slippages.length
      : 0;

    const delays = trades.map(t => t.estimatedBridgeDelaySec).filter((d): d is number => d !== null && d > 0);
    const avgDelay = delays.length > 0
      ? delays.reduce((a, b) => a + b, 0) / delays.length
      : null;

    // Compute max drawdown from trade sequence
    let peak = startingValueUSD;
    let maxDrawdownPct = 0;
    let runningValue = startingValueUSD;
    for (const t of this.logs) {
      if (t.outcome === 'simulated_execution') {
        // Approximate: value changes by (toAmountUSD - fromAmountUSD - fees)
        runningValue += (t.simulatedToAmountUSD - t.fromAmountUSD - t.totalFeesUSD);
      }
      if (runningValue > peak) peak = runningValue;
      const drawdown = peak > 0 ? ((peak - runningValue) / peak) * 100 : 0;
      if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
    }

    const netReturn = endingValueUSD - startingValueUSD;
    const netReturnPct = startingValueUSD > 0 ? (netReturn / startingValueUSD) * 100 : 0;

    const stats: SimulationStats = {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      totalEpochs: this.logs.length,
      tradesExecuted: trades.length,
      tradesHeld: holds.length,
      tradesFailed: failed.length,
      totalVolumeUSD: Math.round(totalVolume * 100) / 100,
      totalGasCostUSD: Math.round(totalGas * 100) / 100,
      totalBridgeFeesUSD: Math.round(totalBridge * 100) / 100,
      totalFeesUSD: Math.round(totalFees * 100) / 100,
      startingPortfolioValueUSD: Math.round(startingValueUSD * 100) / 100,
      endingPortfolioValueUSD: Math.round(endingValueUSD * 100) / 100,
      netReturnUSD: Math.round(netReturn * 100) / 100,
      netReturnPct: Math.round(netReturnPct * 100) / 100,
      realizedPnLUSD: Math.round(realizedPnL * 100) / 100,
      unrealizedPnLUSD: Math.round(unrealizedPnL * 100) / 100,
      maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
      avgSlippagePct: Math.round(avgSlippage * 1000) / 1000,
      avgBridgeDelaySec: avgDelay !== null ? Math.round(avgDelay) : null,
    };

    fs.writeFileSync(this.summaryFilePath, JSON.stringify(stats, null, 2), 'utf-8');
    console.log(`[sim-logger] Summary written: ${this.summaryFilePath}`);

    return stats;
  }

  getSessionId(): string { return this.sessionId; }
  getLogFilePath(): string { return this.logFilePath; }
  getSummaryFilePath(): string { return this.summaryFilePath; }
}
