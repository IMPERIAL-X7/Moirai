/**
 * Portfolio Manager — Smoke Test
 *
 * Simulates deposits, trades, mark-to-market, drift checks,
 * and save/load to verify everything works end-to-end.
 *
 * Run: npx tsx src/portfolio/portfolio-test.ts
 */

import { PortfolioManager } from './portfolio-manager.js';
import type { TokenState, MarketSnapshot } from '../data/types.js';
import path from 'path';
import fs from 'fs';

// ── Fake tokens ─────────────────────────────────────────────────────

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

const USDC_ETH: TokenState = {
  symbol: 'USDC',
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  chainId: 1,
  priceUSD: 1.0,
  volume24hUSD: 2_000_000_000,
  liquidityUSD: 1_000_000_000,
  priceChange24h: 0,
  source: 'manual',
};

const USDC_ARB: TokenState = {
  symbol: 'USDC',
  address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  chainId: 42161,
  priceUSD: 1.0,
  volume24hUSD: 800_000_000,
  liquidityUSD: 400_000_000,
  priceChange24h: 0,
  source: 'manual',
};

const WETH_ARB: TokenState = {
  symbol: 'WETH',
  address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  chainId: 42161,
  priceUSD: 3500,
  volume24hUSD: 500_000_000,
  liquidityUSD: 200_000_000,
  priceChange24h: 0.03,
  source: 'manual',
};

// ── Test runner ─────────────────────────────────────────────────────

async function main() {
  const testPath = path.resolve(process.cwd(), 'data', 'portfolio-test.json');
  
  // Clean up old test file
  if (fs.existsSync(testPath)) fs.unlinkSync(testPath);

  const pm = new PortfolioManager({ persistPath: testPath });

  console.log('=== 1. Record deposits ===');
  pm.recordDeposit(1, ETH, 2);          // 2 ETH on mainnet
  pm.recordDeposit(1, USDC_ETH, 5000);  // 5000 USDC on mainnet
  pm.printSummary();

  console.log('=== 2. Apply a trade: swap 1 ETH → 3480 USDC on mainnet ===');
  pm.applyTrade({
    timestamp: new Date().toISOString(),
    epochId: 'epoch-001',
    actionType: 'swap',
    fromChainId: 1,
    toChainId: 1,
    fromToken: 'ETH',
    toToken: 'USDC',
    fromAmount: 1,
    toAmount: 3480,
    fromPriceUSD: 3500,
    toPriceUSD: 1.0,
    feesUSD: 20,
    txHash: '0xfake_swap_hash_001',
    status: 'confirmed',
  });
  pm.printSummary();

  console.log('=== 3. Apply a trade: bridge 2000 USDC mainnet → Arbitrum ===');
  pm.applyTrade({
    timestamp: new Date().toISOString(),
    epochId: 'epoch-002',
    actionType: 'bridge',
    fromChainId: 1,
    toChainId: 42161,
    fromToken: 'USDC',
    toToken: 'USDC',
    fromAmount: 2000,
    toAmount: 1995,
    fromPriceUSD: 1.0,
    toPriceUSD: 1.0,
    feesUSD: 5,
    txHash: '0xfake_bridge_hash_001',
    status: 'confirmed',
  });
  pm.printSummary();

  console.log('=== 4. Mark-to-market (ETH dropped to $3200) ===');
  const snapshot: MarketSnapshot = {
    timestamp: new Date().toISOString(),
    tokens: [
      { ...ETH, priceUSD: 3200 },
      { ...USDC_ETH },
      { ...USDC_ARB },
      { ...WETH_ARB },
    ],
    yields: [],
    chains: [],
  };
  pm.markToMarket(snapshot);
  pm.printSummary();

  console.log('=== 5. Allocation drift check ===');
  const drift = pm.checkDrift();
  for (const d of drift) {
    console.log(
      `  ${d.symbol}: target=${(d.targetWeight * 100).toFixed(0)}%  actual=${(d.actualWeight * 100).toFixed(1)}%  drift=${d.driftPct.toFixed(1)}%  rebal=${d.needsRebalance}`,
    );
  }

  console.log('\n=== 6. Save to disk ===');
  pm.save();
  console.log(`  Written to ${testPath}`);

  console.log('\n=== 7. Load from disk into fresh manager ===');
  const pm2 = new PortfolioManager({ persistPath: testPath });
  pm2.load();
  pm2.printSummary();

  console.log('\n=== 8. Trade history ===');
  for (const t of pm2.getTradeHistory()) {
    console.log(`  ${t.id}  ${t.fromAmount} ${t.fromToken} → ${t.toAmount} ${t.toToken}  (${t.actionType})`);
  }

  // Clean up test file
  if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
  console.log('\n✓ Portfolio smoke test complete');
}

main().catch(console.error);
