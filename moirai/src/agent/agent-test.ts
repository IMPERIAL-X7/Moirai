/**
 * Agent Loop — Smoke Test
 *
 * Runs 3 epochs with the paper executor and a simple test strategy
 * to verify the full observe → evaluate → execute → update pipeline.
 *
 * Uses mock market data — no real API calls.
 *
 * Run:  npx tsx src/agent/agent-test.ts
 */

import { AgentLoop, paperExecutor } from './agent-loop.js';
import { PortfolioManager } from '../portfolio/portfolio-manager.js';
import type { MarketSnapshot, TokenState } from '../data/types.js';
import type { StrategyEngine } from '../strategy/engine.js';
import type { DecisionPlan, StrategyCandidate, PortfolioState } from '../strategy/types.js';
import path from 'path';
import fs from 'fs';

// ── Mock tokens ─────────────────────────────────────────────────────

const ETH: TokenState = {
  symbol: 'ETH',
  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  chainId: 1,
  priceUSD: 3500,
  volume24hUSD: 1_000_000_000,
  liquidityUSD: 500_000_000,
  priceChange24h: 0.02,
  source: 'manual',
};

const USDC: TokenState = {
  symbol: 'USDC',
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  chainId: 1,
  priceUSD: 1.0,
  volume24hUSD: 2_000_000_000,
  liquidityUSD: 1_000_000_000,
  priceChange24h: 0,
  source: 'manual',
};

const WETH: TokenState = {
  symbol: 'WETH',
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  chainId: 1,
  priceUSD: 3500,
  volume24hUSD: 800_000_000,
  liquidityUSD: 300_000_000,
  priceChange24h: 0.04, // +4 % → will trigger rebalance to WETH
  source: 'manual',
};

const mockSnapshot: MarketSnapshot = {
  timestamp: new Date().toISOString(),
  tokens: [ETH, USDC, WETH],
  yields: [
    { protocol: 'Aave', poolId: 'aave-usdc-arb', chainId: 42161, symbol: 'USDC', apyPct: 6.2, tvlUSD: 50_000_000 },
    { protocol: 'Compound', poolId: 'comp-usdc-eth', chainId: 1, symbol: 'USDC', apyPct: 3.1, tvlUSD: 80_000_000 },
  ],
  chains: [
    { chainId: 1, chainName: 'Ethereum', gasPriceGwei: null },
    { chainId: 42161, chainName: 'Arbitrum', gasPriceGwei: null },
  ],
};

// ── Test strategy: alternates swap / hold ───────────────────────────

let epochNum = 0;

const testStrategy: StrategyEngine = {
  id: 'agent-test',
  name: 'Test Strategy',
  description: 'Alternates between swap and hold for testing',
  evaluate: (_market: MarketSnapshot, _portfolio: PortfolioState, epochId: string): DecisionPlan => {
    epochNum++;
    const candidates: StrategyCandidate[] = [];

    if (epochNum % 2 === 1) {
      candidates.push({
        actionType: 'swap',
        fromChainId: 1,
        fromToken: USDC,
        toToken: ETH,
        amount: 500,
        score: 0.8,
        rationale: 'Test swap: USDC → ETH',
      });
    } else {
      candidates.push({
        actionType: 'hold',
        fromChainId: 1,
        fromToken: USDC,
        amount: 0,
        score: 0,
        rationale: 'Test hold: no action',
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

// ── Mock snapshot fetcher (injected into AgentLoop) ─────────────────

const mockFetchSnapshot = async () => mockSnapshot;

// ── Test runner ─────────────────────────────────────────────────────

async function main() {
  const testPath = path.resolve(process.cwd(), 'data', 'agent-test-portfolio.json');
  if (fs.existsSync(testPath)) fs.unlinkSync(testPath);

  // Seed portfolio with balances
  const pm = new PortfolioManager({ persistPath: testPath });
  pm.recordDeposit(1, ETH, 1);
  pm.recordDeposit(1, USDC, 5000);

  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  Agent Loop Smoke Test (paper trading, mock data)    ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  const agent = new AgentLoop({
    config: { dryRun: true, verbose: true },
    portfolio: pm,
    strategy: testStrategy,
    executor: paperExecutor,
    fetchSnapshot: mockFetchSnapshot,
  });

  // Run 3 epochs manually
  for (let i = 0; i < 3; i++) {
    console.log(`\n━━━━ Running epoch ${i + 1}/3 ━━━━`);
    const log = await agent.runEpoch();
    console.log(`  outcome: ${log.outcome}`);
    console.log(`  phases:  ${log.phases.map(p => `${p.phase}=${p.success ? 'ok' : 'FAIL'}`).join(', ')}`);
    if (log.trade) {
      console.log(`  trade:   ${log.trade.fromAmount} ${log.trade.fromToken} → ${log.trade.toAmount.toFixed(4)} ${log.trade.toToken}`);
    }
  }

  // Final state
  console.log('\n════ Final Portfolio ════');
  pm.printSummary();

  // Epoch summary
  const logs = agent.getEpochLogs();
  console.log(`\n════ Epoch Summary (${logs.length} epochs) ════`);
  for (const l of logs) {
    console.log(`  ${l.epochId}: ${l.outcome.padEnd(10)} ${l.durationMs}ms  ${l.trade ? l.trade.fromToken + '→' + l.trade.toToken : '—'}`);
  }

  // Cleanup
  if (fs.existsSync(testPath)) fs.unlinkSync(testPath);

  console.log('\n✓ Agent loop smoke test complete');
}

main().catch(console.error);
