/**
 * Smoke test for the Market Data Layer.
 *
 * Run with:  npm run market-data
 *
 * Fetches a snapshot using the default token universe and prints a summary.
 */

import { getMarketSnapshot } from './data/market-data.js';

async function main() {
  console.log('📊 Market Data Layer – Smoke Test\n');

  const snapshot = await getMarketSnapshot();

  console.log(`⏱  Snapshot timestamp: ${snapshot.timestamp}\n`);

  // Token prices
  console.log('🪙 Token States:');
  for (const t of snapshot.tokens) {
    console.log(
      `   ${t.symbol.padEnd(6)} chain=${t.chainId}  ` +
      `price=$${t.priceUSD.toFixed(4)}  ` +
      `vol24h=$${(t.volume24hUSD / 1e6).toFixed(2)}M  ` +
      `liq=$${(t.liquidityUSD / 1e6).toFixed(2)}M  ` +
      `Δ24h=${(t.priceChange24h * 100).toFixed(2)}%  ` +
      `[${t.source}]`,
    );
  }

  // Yield opportunities (top 10)
  console.log(`\n🌾 Top Yield Opportunities (${snapshot.yields.length} total):`);
  for (const y of snapshot.yields.slice(0, 10)) {
    console.log(
      `   ${y.protocol.padEnd(16)} ${y.symbol.padEnd(12)} ` +
      `chain=${y.chainId}  APY=${y.apyPct.toFixed(2)}%  ` +
      `TVL=$${(y.tvlUSD / 1e6).toFixed(2)}M`,
    );
  }

  // Chains
  console.log('\n🔗 Chains:');
  for (const c of snapshot.chains) {
    console.log(`   ${c.chainName} (${c.chainId})`);
  }

  console.log('\n✅ Market data layer is working.');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
