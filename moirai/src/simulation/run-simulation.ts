/**
 * Simulation Runner
 *
 * Runs the full Moirai agent loop with REAL market data and REAL
 * LI.FI quotes, but executes no on-chain transactions. Every trade
 * decision is logged to a JSONL audit file with all details needed
 * for manual verification.
 *
 * Usage:
 *   npx tsx src/simulation/run-simulation.ts [epochs] [intervalSec]
 *
 * Examples:
 *   npx tsx src/simulation/run-simulation.ts          # 5 epochs, no delay
 *   npx tsx src/simulation/run-simulation.ts 10       # 10 epochs
 *   npx tsx src/simulation/run-simulation.ts 10 60    # 10 epochs, 60s between
 */

import { config } from 'dotenv';
config();

import { AgentLoop } from '../agent/agent-loop.js';
import { PortfolioManager } from '../portfolio/portfolio-manager.js';
import { DefaultStrategy } from '../strategy/engine.js';
import { getMarketSnapshot } from '../data/market-data.js';
import { SimulationLogger } from './sim-logger.js';
import { createSimulationExecutor } from './sim-executor.js';
import type { TokenState } from '../data/types.js';
import path from 'path';
import fs from 'fs';

// ── Parse CLI args ──────────────────────────────────────────────────

const totalEpochs = parseInt(process.argv[2] ?? '5', 10);
const intervalSec = parseInt(process.argv[3] ?? '0', 10);

// ── Helpers ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Moirai — Simulation Mode (Real Market Data, No Execution)   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log(`  Epochs:   ${totalEpochs}`);
  console.log(`  Interval: ${intervalSec > 0 ? intervalSec + 's' : 'none (back-to-back)'}`);
  console.log(`  Strategy: ${DefaultStrategy.name}`);
  console.log('');

  // ── 1. Set up portfolio with virtual balances ─────────────────
  const portfolioPath = path.resolve(process.cwd(), 'data', 'simulation', 'portfolio.json');
  const pm = new PortfolioManager({ persistPath: portfolioPath });

  // Seed with virtual balances if no save file exists
  if (!fs.existsSync(portfolioPath)) {
    console.log('[sim] Seeding virtual portfolio: 1 ETH + 5000 USDC on Ethereum\n');

    // We need real prices for the seed — fetch a snapshot first
    console.log('[sim] Fetching initial market data for price seeding...');
    const seedSnapshot = await getMarketSnapshot();

    const ethPrice = seedSnapshot.tokens.find(t => t.symbol === 'WETH' && t.chainId === 1)?.priceUSD ?? 3500;
    const usdcPrice = seedSnapshot.tokens.find(t => t.symbol === 'USDC' && t.chainId === 1)?.priceUSD ?? 1;

    const seedETH: TokenState = {
      symbol: 'WETH',
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      chainId: 1,
      priceUSD: ethPrice,
      volume24hUSD: 0,
      liquidityUSD: 0,
      priceChange24h: 0,
      source: 'manual',
    };
    const seedUSDC: TokenState = {
      symbol: 'USDC',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      chainId: 1,
      priceUSD: usdcPrice,
      volume24hUSD: 0,
      liquidityUSD: 0,
      priceChange24h: 0,
      source: 'manual',
    };

    pm.recordDeposit(1, seedETH, 1);
    pm.recordDeposit(1, seedUSDC, 5000);
  } else {
    pm.load();
    console.log('[sim] Loaded existing simulation portfolio\n');
  }

  const startingValue = pm.getTotalValueUSD();
  console.log(`[sim] Starting portfolio value: $${startingValue.toFixed(2)}\n`);

  // ── 2. Set up simulation logger ───────────────────────────────
  const logger = new SimulationLogger({
    logDir: 'data/simulation',
    fetchRealQuotes: true,
    walletAddress: process.env.WALLET_ADDRESS ?? '0x0000000000000000000000000000000000000000',
  });

  // ── 3. Set up simulation executor ─────────────────────────────
  const { executor: simExecutor, setEpochContext } = createSimulationExecutor({
    logger,
    config: {
      fetchRealQuotes: true,
      walletAddress: process.env.WALLET_ADDRESS ?? '0x0000000000000000000000000000000000000000',
    },
  });

  // ── 4. Wire up AgentLoop ──────────────────────────────────────
  const agent = new AgentLoop({
    config: {
      dryRun: true,
      verbose: true,
      epochIntervalMs: intervalSec * 1000,
    },
    portfolio: pm,
    strategy: DefaultStrategy,
    executor: simExecutor,
    // Pipe snapshot+plan to the simulation executor before execution
    onPlanReady: setEpochContext,
  });

  // ── 5. Run epochs ─────────────────────────────────────────────
  for (let i = 0; i < totalEpochs; i++) {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`  Epoch ${i + 1}/${totalEpochs}`);
    console.log('━'.repeat(60));

    const epochLog = await agent.runEpoch();

    console.log(`  outcome: ${epochLog.outcome}  duration: ${epochLog.durationMs}ms`);
    if (epochLog.trade) {
      console.log(`  trade:   ${epochLog.trade.fromAmount} ${epochLog.trade.fromToken} → ${epochLog.trade.toAmount.toFixed(4)} ${epochLog.trade.toToken}`);
    }
    if (epochLog.error) {
      console.log(`  error:   ${epochLog.error}`);
    }

    // Wait between epochs (if configured)
    if (intervalSec > 0 && i < totalEpochs - 1) {
      console.log(`  waiting ${intervalSec}s before next epoch...`);
      await sleep(intervalSec * 1000);
    }
  }

  // ── 6. Final summary ──────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  SIMULATION COMPLETE');
  console.log('═'.repeat(60));

  pm.printSummary();

  const endingValue = pm.getTotalValueUSD();
  const stats = logger.writeSummary(
    startingValue,
    endingValue,
    pm.getTotalRealizedPnL(),
    pm.getTotalUnrealizedPnL(),
  );

  console.log('\n── Session Stats ──');
  console.log(`  Session:          ${stats.sessionId}`);
  console.log(`  Epochs:           ${stats.totalEpochs}`);
  console.log(`  Trades executed:  ${stats.tradesExecuted}`);
  console.log(`  Trades held:      ${stats.tradesHeld}`);
  console.log(`  Trades failed:    ${stats.tradesFailed}`);
  console.log(`  Total volume:     $${stats.totalVolumeUSD.toFixed(2)}`);
  console.log(`  Total gas costs:  $${stats.totalGasCostUSD.toFixed(2)}`);
  console.log(`  Total bridge fees:$${stats.totalBridgeFeesUSD.toFixed(2)}`);
  console.log(`  Total fees:       $${stats.totalFeesUSD.toFixed(2)}`);
  console.log(`  Starting value:   $${stats.startingPortfolioValueUSD.toFixed(2)}`);
  console.log(`  Ending value:     $${stats.endingPortfolioValueUSD.toFixed(2)}`);
  console.log(`  Net return:       $${stats.netReturnUSD.toFixed(2)} (${stats.netReturnPct.toFixed(2)}%)`);
  console.log(`  Max drawdown:     ${stats.maxDrawdownPct.toFixed(2)}%`);
  console.log(`  Avg slippage:     ${stats.avgSlippagePct.toFixed(3)}%`);
  if (stats.avgBridgeDelaySec !== null) {
    console.log(`  Avg bridge delay: ${stats.avgBridgeDelaySec}s`);
  }
  console.log(`\n  Trade log:  ${logger.getLogFilePath()}`);
  console.log(`  Summary:    ${logger.getSummaryFilePath()}`);

  // Save portfolio at end
  pm.save();
  console.log('\n✓ Simulation complete');
}

main().catch((err) => {
  console.error('\n✗ Simulation failed:', err);
  process.exit(1);
});
