/**
 * Simulation Smoke Test
 *
 * Verifies the full simulation pipeline (logger + executor + agent loop)
 * using mock market data — no network calls required.
 *
 * Run:  npx tsx src/simulation/sim-test.ts
 */

import { AgentLoop } from '../agent/agent-loop.js';
import { PortfolioManager } from '../portfolio/portfolio-manager.js';
import { SimulationLogger } from './sim-logger.js';
import { createSimulationExecutor } from './sim-executor.js';
import type { MarketSnapshot, TokenState } from '../data/types.js';
import type { StrategyEngine } from '../strategy/engine.js';
import type { DecisionPlan, StrategyCandidate, PortfolioState } from '../strategy/types.js';
import path from 'path';
import fs from 'fs';

// ── Mock tokens with realistic data ────────────────────────────────

const WETH: TokenState = {
  symbol: 'WETH',
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  chainId: 1,
  priceUSD: 3500,
  volume24hUSD: 800_000_000,
  liquidityUSD: 300_000_000,
  priceChange24h: 0.04,
  source: 'dexscreener',
};

const USDC: TokenState = {
  symbol: 'USDC',
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  chainId: 1,
  priceUSD: 1.0,
  volume24hUSD: 2_000_000_000,
  liquidityUSD: 1_000_000_000,
  priceChange24h: 0,
  source: 'dexscreener',
};

const USDC_ARB: TokenState = {
  symbol: 'USDC',
  address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  chainId: 42161,
  priceUSD: 1.0,
  volume24hUSD: 500_000_000,
  liquidityUSD: 400_000_000,
  priceChange24h: 0,
  source: 'dexscreener',
};

const mockSnapshot: MarketSnapshot = {
  timestamp: new Date().toISOString(),
  tokens: [WETH, USDC, USDC_ARB],
  yields: [
    { protocol: 'Aave', poolId: 'aave-usdc-arb', chainId: 42161, symbol: 'USDC', apyPct: 6.2, tvlUSD: 50_000_000 },
    { protocol: 'Compound', poolId: 'comp-usdc-eth', chainId: 1, symbol: 'USDC', apyPct: 3.1, tvlUSD: 80_000_000 },
  ],
  chains: [
    { chainId: 1, chainName: 'Ethereum', gasPriceGwei: 25 },
    { chainId: 42161, chainName: 'Arbitrum', gasPriceGwei: 0.1 },
  ],
};

// ── Test strategy: alternates swap / bridge / hold ──────────────────

let epochNum = 0;

const testStrategy: StrategyEngine = {
  name: 'Sim Test Strategy',
  description: 'Cycles through swap, bridge, hold for simulation testing',
  evaluate: (_market: MarketSnapshot, _portfolio: PortfolioState, epochId: string): DecisionPlan => {
    epochNum++;
    const candidates: StrategyCandidate[] = [];

    if (epochNum % 3 === 1) {
      // Swap: USDC → WETH
      candidates.push({
        actionType: 'swap',
        fromChainId: 1,
        fromToken: USDC,
        toToken: WETH,
        amount: 500,
        score: 0.8,
        rationale: 'Test swap: USDC → WETH (momentum signal)',
      });
    } else if (epochNum % 3 === 2) {
      // Bridge: USDC ETH → USDC ARB
      candidates.push({
        actionType: 'bridge',
        fromChainId: 1,
        toChainId: 42161,
        fromToken: USDC,
        toToken: USDC_ARB,
        amount: 1000,
        score: 0.6,
        rationale: 'Test bridge: USDC Ethereum → Arbitrum (yield opportunity)',
      });
    } else {
      // Hold
      candidates.push({
        actionType: 'hold',
        fromChainId: 1,
        fromToken: USDC,
        amount: 0,
        score: 0,
        rationale: 'Test hold: no signal',
      });
    }

    return {
      epochId,
      candidates,
      selected: candidates[0],
      reasoning: candidates[0].rationale,
    };
  },
};

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const testDir = path.resolve(process.cwd(), 'data', 'sim-test');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }

  const portfolioPath = path.join(testDir, 'portfolio.json');
  const pm = new PortfolioManager({ persistPath: portfolioPath });
  pm.recordDeposit(1, WETH, 1);
  pm.recordDeposit(1, USDC, 5000);

  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  Simulation Smoke Test (mock data, no LI.FI calls)   ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  const logger = new SimulationLogger({
    logDir: path.join('data', 'sim-test'),
    fetchRealQuotes: false, // not used by executor config, but documents intent
  });

  const { executor, setEpochContext } = createSimulationExecutor({
    logger,
    config: {
      fetchRealQuotes: false, // Use fallback simulation, no API calls
      fallbackSlippagePct: 0.3,
      fallbackFeeRatePct: 0.1,
    },
  });

  const startingValue = pm.getTotalValueUSD();

  const agent = new AgentLoop({
    config: { dryRun: true, verbose: true },
    portfolio: pm,
    strategy: testStrategy,
    executor,
    fetchSnapshot: async () => mockSnapshot,
    onPlanReady: setEpochContext,
  });

  // Run 3 epochs: swap, bridge, hold
  for (let i = 0; i < 3; i++) {
    console.log(`\n━━━━ Epoch ${i + 1}/3 ━━━━`);
    const log = await agent.runEpoch();
    console.log(`  outcome: ${log.outcome}`);
    if (log.trade) {
      console.log(`  trade:   ${log.trade.fromAmount} ${log.trade.fromToken} → ${log.trade.toAmount.toFixed(4)} ${log.trade.toToken}`);
    }
  }

  // Print results
  console.log('\n════ Portfolio ════');
  pm.printSummary();

  const endingValue = pm.getTotalValueUSD();
  const stats = logger.writeSummary(
    startingValue,
    endingValue,
    pm.getTotalRealizedPnL(),
    pm.getTotalUnrealizedPnL(),
  );

  // Verify log files exist
  const logExists = fs.existsSync(logger.getLogFilePath());
  const summaryExists = fs.existsSync(logger.getSummaryFilePath());
  const trades = logger.getTrades();

  console.log('\n════ Verification ════');
  console.log(`  Trade log file exists:   ${logExists ? '✓' : '✗'}`);
  console.log(`  Summary file exists:     ${summaryExists ? '✓' : '✗'}`);
  console.log(`  Trades logged:           ${trades.length}`);
  console.log(`  Trades w/ execution:     ${trades.filter(t => t.outcome === 'simulated_execution').length}`);
  console.log(`  Trades w/ hold:          ${trades.filter(t => t.outcome === 'hold').length}`);
  console.log(`  All have priceEvidence:  ${trades.every(t => t.priceEvidence.length > 0) ? '✓' : '✗'}`);
  console.log(`  All have candidates:     ${trades.every(t => t.allCandidates.length > 0) ? '✓' : '✗'}`);
  console.log(`  Stats — epochs:          ${stats.totalEpochs}`);
  console.log(`  Stats — fees tracked:    $${stats.totalFeesUSD.toFixed(2)}`);
  console.log(`  Stats — volume:          $${stats.totalVolumeUSD.toFixed(2)}`);

  // Peek at first trade log
  if (trades.length > 0) {
    console.log('\n════ Sample Trade Log (first entry) ════');
    const first = trades[0];
    console.log(`  epoch:          ${first.epochId}`);
    console.log(`  action:         ${first.actionType}`);
    console.log(`  summary:        ${first.summary}`);
    console.log(`  price sources:  ${first.priceEvidence.map(p => `${p.symbol}@${p.source}`).join(', ')}`);
    console.log(`  candidates:     ${first.allCandidates.length}`);
    console.log(`  fees:           gas=$${first.gasCostUSD.toFixed(2)} bridge=$${first.bridgeFeesUSD.toFixed(2)}`);
  }

  // Cleanup test data
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }

  console.log('\n✓ Simulation smoke test complete');
}

main().catch(console.error);
