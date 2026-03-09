/**
 * Smoke test for the Strategy Engine.
 *
 * Run with:  npm run strategy-test [strategyId]
 *
 * Fetches market data, mocks a portfolio, and prints the decision plan.
 * Pass --list to see available strategies.
 */

import { getMarketSnapshot } from '../data/market-data.js';
import { DefaultStrategy, getStrategy, listStrategies } from './engine.js';
import type { PortfolioState } from './types.js';

async function main() {
  const strategyArg = process.argv[2] ?? '';

  if (strategyArg === '--list') {
    console.log('\nAvailable strategies:\n');
    for (const s of listStrategies()) {
      console.log(`  ${s.id.padEnd(26)} ${s.name}`);
    }
    process.exit(0);
  }

  const strategy = strategyArg ? getStrategy(strategyArg) : DefaultStrategy;

  console.log(`🧠 Strategy Engine – Smoke Test  [${strategy.id}]\n`);

  const market = await getMarketSnapshot();

  // Mock portfolio: all USDC on Ethereum
  const portfolio: PortfolioState = {
    balances: {},
    positions: [
      {
        chainId: 1,
        token: market.tokens.find((t) => t.symbol === 'USDC' && t.chainId === 1)!,
        amount: 1000,
        entryPriceUSD: 1,
        costBasisUSD: 1000,
        realizedPnLUSD: 0,
        unrealizedPnLUSD: 0,
      },
    ],
    totalValueUSD: 1000,
  };

  const epochId = new Date().toISOString();

  const plan = strategy.evaluate(market, portfolio, epochId);

  console.log(`Epoch: ${plan.epochId}`);
  console.log(`\nCandidates:`);
  for (const c of plan.candidates) {
    console.log(
      `  ${c.actionType.toUpperCase()} score=${c.score.toFixed(2)} ` +
      `from=${c.fromToken.symbol}(${c.fromChainId})` +
      (c.toToken ? ` to=${c.toToken.symbol}(${c.toToken.chainId})` : '') +
      ` amt=$${c.amount.toFixed(2)} | ${c.rationale}`,
    );
  }
  console.log(`\nSelected: ${plan.selected.actionType.toUpperCase()} | ${plan.selected.rationale}`);
  console.log(`\nReasoning: ${plan.reasoning}`);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
