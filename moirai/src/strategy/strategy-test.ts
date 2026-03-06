/**
 * Smoke test for the Strategy Engine.
 *
 * Run with:  npm run strategy-test
 *
 * Fetches market data, mocks a portfolio, and prints the decision plan.
 */

import { getMarketSnapshot } from '../data/market-data.js';
import { DefaultStrategy } from './engine.js';
import type { PortfolioState } from './types.js';

async function main() {
  console.log('🧠 Strategy Engine – Smoke Test\n');

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

  const plan = DefaultStrategy.evaluate(market, portfolio, epochId);

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
