# LI.FI API Quickstart Example

This example project demonstrates how to integrate the LI.FI REST API into your application for cross-chain token transfers.

## Overview

This example covers the complete workflow of using the LI.FI API:

- ✅ Fetch supported chains
- ✅ Get available tokens on specific chains
- ✅ Request quotes for cross-chain transfers
- ✅ Check transaction status
- ✅ Error handling and retry logic
- ✅ Rate limit management

## Features

The example demonstrates:

1. **API Configuration**: Set up axios client with optional API key authentication
2. **Chain Discovery**: Fetch all supported chains and their details
3. **Token Information**: Get tokens for specific chains with filtering options
4. **Quote Requests**: Request quotes for cross-chain transfers with various parameters
5. **Status Checking**: Monitor extensive transactions using txHash or transactionId
6. **Error Handling**: Implement retry logic with exponential backoff
7. **Utilities**: Helper functions for formatting, parsing, and managing API calls

## Prerequisites

- **Node.js** 18 or higher
- Basic understanding of HTTP REST APIs
- Familiarity with TypeScript/JavaScript

> **Note**: No wallet or blockchain knowledge required! This example uses the read-only API to demonstrate fetching quotes and checking status. The main example (`src/index.ts`) shows how to fetch quotes and check status, but does not execute transactions. To execute transactions, you'll need to integrate with the SDK or use the advanced API endpoints with wallet integration.

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

### Environment Variables

Copy `env.example` to `.env`:

```bash
cp env.example .env
```

Edit `.env` and add your LI.FI API key (optional):

```env
LI.FI_API_KEY=your_api_key_here
```

> **Note**: API key is optional. Without an API key, you can use the public rate limits. Get an API key at [LI.FI Portal](https://portal.li.fi/) for higher rate limits.

## Available Scripts

This project includes several scripts to help you explore and test the LI.FI API:

| Script | Description |
|--------|-------------|
| `npm run build` | Compiles TypeScript to JavaScript in the `dist/` directory |
| `npm start` | Runs the compiled JavaScript from `dist/index.js` |
| `npm run dev` | Runs the main example (`src/index.ts`) directly with TypeScript - demonstrates the complete API workflow (read-only) |
| `npm run get-chains` | Fetches and displays all supported chains from the LI.FI API |
| `npm run get-tokens` | Fetches tokens for specific chains. Usage: `npm run get-tokens <chainIds> [minPrice]` |
| `npm run check-status` | Checks the status of a transaction. Usage: `npm run check-status <txHash>` |
| `npm run execute-real-transaction` | **Executes a real transaction** matching the documented pattern - full workflow from routes to execution (requires `PRIVATE_KEY` and `WALLET_ADDRESS` in `.env`) |

### Script Details

#### Build Scripts
- **`build`**: Compiles the TypeScript source files to JavaScript. Run this before using `npm start`.
- **`start`**: Executes the compiled JavaScript. Requires running `npm run build` first.

#### Development Scripts
- **`dev`**: Runs the main example directly with TypeScript (no build required). This is the quickstart example that demonstrates fetching quotes and checking status (read-only).

#### Utility Scripts
- **`get-chains`**: Fetches all chains supported by LI.FI and displays their details.
- **`get-tokens`**: Fetches tokens for specified chains.
  - First argument: Comma-separated chain IDs (e.g., `1,42161`)
  - Second argument (optional): Minimum USD price filter (e.g., `0.1`)
  - Example: `npm run get-tokens 1,42161 0.1`
- **`check-status`**: Checks the status of a cross-chain transaction.
  - Argument: Transaction hash (e.g., `0x...`)
  - Example: `npm run check-status 0x1234...`

#### Execution Script
- **`execute-real-transaction`**: Executes a real transaction matching the documented pattern in the API quickstart guide.
  - ⚠️ **WARNING**: This executes real transactions!
  - Requires: `PRIVATE_KEY` and `WALLET_ADDRESS` (or `FROM_ADDRESS`) in `.env`
  - Demonstrates the full workflow: routes → transaction data → approval → execution → status polling
  - Uses `/advanced/routes` endpoint like the documentation
  - Transfers: 10 USDC from Ethereum to Arbitrum (matching the documented example)
  - Includes: Detailed logging, balance checks, cancellation window, and status monitoring

## Usage

### Run the Read-Only Example

The main example (`src/index.ts`) demonstrates the complete API workflow. Run it with:

```bash
# Run directly with TypeScript (recommended for development)
npm run dev

# Or build and run
npm run build
npm start
```

This will:
1. Fetch all supported chains
2. Get tokens for Ethereum and Arbitrum
3. Request a quote for transferring 10 USDC from Ethereum to Arbitrum
4. Display the quote details and steps

> **Note**: This example uses the read-only API endpoints. It fetches quotes and checks status but does not execute transactions.

### Execute a Real Transaction

To execute an actual transaction using the API, use the `execute-real-transaction` script:

```bash
npm run execute-real-transaction
```

**⚠️  WARNING**: This will execute a **real transaction** on mainnet! Make sure you have:

- At least 10 USDC on Ethereum
- Some ETH on Ethereum for gas fees
- A valid `.env` file with `PRIVATE_KEY` and `WALLET_ADDRESS` (or `FROM_ADDRESS`)

The script includes:
- ✅ Detailed logging at every step
- ✅ Balance checks before execution
- ✅ Token approval handling
- ✅ Transaction status monitoring
- ✅ 5-second cancellation window
- ✅ Clear warnings and guardrails

**What it does:**
1. Validates your wallet and environment variables
2. Checks your USDC and ETH balances
3. Requests routes from LI.FI API
4. Gets transaction data for the route
5. Handles token approval if needed
6. Sends the transaction with a 5-second warning
7. Monitors transaction status until completion

### Individual Utility Scripts

Use these scripts to explore the LI.FI API:

```bash
# Get all supported chains
npm run get-chains

# Get tokens for specific chains
npm run get-tokens 1,42161
# First argument: comma-separated chain IDs

# Get tokens with minimum price filter
npm run get-tokens 1,42161 0.1
# Second argument: minimum USD price

# Check transaction status
npm run check-status 0xYourTransactionHash
```

See the [Available Scripts](#available-scripts) section above for detailed information about each script.

## Project Structure

```
api-example/
├── src/
│   ├── api-config.ts      # API client configuration
│   ├── index.ts           # Main example workflow
│   ├── get-chains.ts      # Fetch supported chains
│   ├── get-tokens.ts      # Fetch tokens for chains
│   ├── check-status.ts    # Check transaction status
│   └── utils.ts           # Helper functions
├── dist/                  # Compiled JavaScript
├── package.json
├── tsconfig.json
├── env.example
└── README.md
```

## API Examples

### Get Supported Chains

```typescript
import { apiClient } from './api-config.js';

const response = await apiClient.get('/chains');
// Response structure: { chains: [...] }
const chains = response.data.chains;
console.log(`Found ${chains.length} chains`);

// Each chain object contains: { id, key, name, coin, decimals, etc. }
```

### Get Tokens

```typescript
// Get tokens for specific chains
const response = await apiClient.get('/tokens', {
  params: { chains: '1,42161' }
});

// Response structure: { tokens: { "1": [...], "42161": [...] } }
const tokensData = response.data.tokens;

// Flatten tokens from all chains
let allTokens = [];
Object.values(tokensData).forEach(chainTokens => {
  if (Array.isArray(chainTokens)) {
    allTokens.push(...chainTokens);
  }
});

console.log(`Found ${allTokens.length} tokens`);

// Get tokens with price filter
const response = await apiClient.get('/tokens', {
  params: { 
    chains: '1',
    minPriceUSD: 0.01 
  }
});
```

### Request a Quote

```typescript
const response = await apiClient.get('/quote', {
  params: {
    fromChain: 1,      // Ethereum
    toChain: 42161,    // Arbitrum
    fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    toToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',    // USDC
    fromAmount: '10000000',    // 10 USDC (6 decimals)
    fromAddress: '0x...',     // Your address
    toAddress: '0x...',       // Recipient address
    slippage: 0.005,          // 0.5% slippage
  }
});

const quote = response.data;

// Response structure includes:
// {
//   id: "...",
//   tool: "across",
//   toolDetails: { name: "AcrossV4", logoURI: "..." },
//   estimate: {
//     fromAmount: "10000000",
//     toAmount: "1987990",
//     toAmountMin: "1987990"
//   },
//   transactionRequest: { ... } // Ready to execute
// }

console.log(`From: ${quote.estimate.fromAmount}`);
console.log(`To: ${quote.estimate.toAmount}`);
console.log(`Tool: ${quote.toolDetails.name}`);
console.log(`Ready to execute: ${quote.transactionRequest ? 'Yes' : 'No'}`);
```

### Check Transaction Status

```typescript
// By transaction hash
const response = await apiClient.get('/status', {
  params: { txHash: '0xYourTransactionHash' }
});

// By transaction ID
const response = await apiClient.get('/status', {
  params: { transactionId: 'your-transaction-id' }
});

const status = response.data;
console.log(`Status: ${status.status}`);
```

## Response Structures

Understanding the API response structures is crucial for working with the LI.FI API. Here's what to expect from each endpoint:

### Chains Endpoint Response

```typescript
{
  chains: [
    {
      id: 1,
      key: "eth",
      name: "Ethereum",
      coin: "ETH",
      decimals: 18,
      // ... more chain information
    }
  ]
}
```

### Tokens Endpoint Response

```typescript
{
  tokens: {
    "1": [  // Chain ID as string key
      {
        chainId: 1,
        address: "0xA0b...",
        symbol: "USDC",
        decimals: 6,
        name: "USD Coin",
        priceUSD: "1.0",
        // ... more token information
      }
    ],
    "42161": [ /* tokens on Arbitrum */ ]
  }
}
```

### Quote Endpoint Response

```typescript
{
  id: "quote-id",
  tool: "across",
  toolDetails: {
    key: "across",
    name: "AcrossV4",
    logoURI: "https://...",
  },
  estimate: {
    fromAmount: "10000000",
    toAmount: "1987990",
    toAmountMin: "1987990",
    approvalAddress: "0x123...",
    feeCosts: [ /* fee breakdown */ ]
  },
  transactionRequest: {
    to: "0x123...",
    data: "0x...",
    value: "0x0",
    from: "0x...",
    chainId: 1,
    gasPrice: "0x...",
    gasLimit: "0x..."
  }
}
```

### Status Endpoint Response

```typescript
{
  status: "DONE" | "PENDING" | "FAILED",
  substatus: "COMPLETED" | "DESTINATION_CHAIN_CONFIRMED" | ...,
  sending: {
    chainId: 1,
    token: { /* token info */ },
    amount: "10000000"
  },
  receiving: {
    chainId: 42161,
    token: { /* token info */ },
    amount: "1987990"
  }
}
```

## Advanced Usage

### Error Handling with Retry

```typescript
import { retryWithBackoff } from './utils.js';

const result = await retryWithBackoff(async () => {
  return await apiClient.get('/quote', { params: {...} });
});
```

### Rate Limit Handling

The LI.FI API returns rate limit information in response headers:

- `x-ratelimit-limit`: Request limit per period
- `x-ratelimit-remaining`: Remaining requests in current period
- `ratelimit-reset`: Time when rate limit resets (in seconds)

To handle rate limits, check response headers and implement backoff:

```typescript
const response = await apiClient.get('/chains');

const remaining = response.headers['x-ratelimit-remaining'];
const resetTime = response.headers['ratelimit-reset'];

console.log(`Remaining requests: ${remaining}`);
console.log(`Resets at: ${new Date(Number(resetTime) * 1000)}`);
```

### Custom Configuration

Modify `src/api-config.ts` to customize the API client:

```typescript
export function createApiClient(): AxiosInstance {
  return axios.create({
    baseURL: 'https://li.quest/v1',
    headers: {
      'Content-Type': 'application/json',
      'x-lifi-api-key': process.env.LIFI_API_KEY,
    },
    timeout: 30000, // 30 seconds
  });
}
```

## Common Parameters

### Quote Parameters

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `fromChain` | Yes | Source chain ID or key | `1` or `"ETH"` |
| `toChain` | Yes | Destination chain ID or key | `42161` or `"ARB"` |
| `fromToken` | Yes | Source token address or symbol | `"USDC"` or `"0xA0b8..."` |
| `toToken` | Yes | Destination token address or symbol | `"USDC"` or `"0xFF97..."` |
| `fromAmount` | Yes | Amount in smallest unit (string) | `"10000000"` |
| `fromAddress` | No | Sender address | `"0x..."` |
| `toAddress` | No | Recipient address (defaults to fromAddress) | `"0x..."` |
| `slippage` | No | Slippage tolerance (default: 0.03) | `0.005` for 0.5% |
| `order` | No | Route ordering preference | `"CHEAPEST"`, `"FASTEST"`, `"SAFEST"` |

### Token Parameters

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `chains` | No | Comma-separated chain IDs | `"1,42161"` |
| `chainTypes` | No | Comma-separated chain types | `"EVM,SVM"` |
| `minPriceUSD` | No | Minimum token price in USD | `0.01` |

## Best Practices

### 1. Use Token Addresses

Always use contract addresses instead of symbols for production:

```typescript
fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // ✅ USDC on Ethereum
// Instead of
fromToken: 'USDC', // ❌ May be ambiguous
```

### 2. Handle Amount Formatting

Amounts should be in the token's smallest unit as strings:

```typescript
// For 10 USDC (6 decimals)
fromAmount: '10000000'

// For 1 ETH (18 decimals)
fromAmount: '1000000000000000000'
```

Use the utility functions for conversion:

```typescript
import { parseTokenAmount, formatTokenAmount } from './utils.js';

const amount = parseTokenAmount('10', 6); // '10000000'
const formatted = formatTokenAmount('10000000', 6); // '10'
```

### 3. Implement Retry Logic

Handle transient failures with exponential backoff:

```typescript
import { retryWithBackoff } from './utils.js';

const quote = await retryWithBackoff(async () => {
  return await apiClient.get('/quote', { params });
});
```

### 4. Set Reasonable Slippage

Choose slippage based on token volatility:

```typescript
slippage: 0.005,  // 0.5% for stablecoins (USDC, USDT)
slippage: 0.01,   // 1% for stable pairs
slippage: 0.05,   // 5% for volatile tokens
```

### 5. Use API Keys for Production

For production applications, obtain an API key for:
- Higher rate limits
- Priority support
- Better reliability

Get your API key at [LI.FI Portal](https://portal.li.fi/).

## Error Handling

### Common Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| `INVALID_PARAMETER` | Invalid request parameter | Check parameter format and values |
| `NO_ROUTE` | No route found for transfer | Try different chains or tokens |
| `UNKNOWN_ERROR` | Unexpected error | Check logs, retry, contact support |
| `429` | Rate limit exceeded | Implement backoff, consider API key |

### Error Response Format

```json
{
  "message": "Error description",
  "code": "ERROR_CODE",
  "httpStatusCode": 400
}
```

### Handling Errors

```typescript
try {
  const response = await apiClient.get('/quote', { params });
} catch (error) {
  if (error.response) {
    console.error(`Error: ${error.response.data.message}`);
    console.error(`Code: ${error.response.data.code}`);
  } else {
    console.error('Network error:', error.message);
  }
}
```

## Integration Guide

### Frontend Integration

For frontend applications, use the API from a backend server to avoid exposing API keys:

```typescript
// ✅ Good: API calls from backend
// Backend: api/quote
app.get('/api/quote', async (req, res) => {
  const response = await apiClient.get('/quote', { params: req.query });
  res.json(response.data);
});

// Frontend
const quote = await fetch('/api/quote?' + new URLSearchParams(params));
```

```typescript
// ❌ Bad: API calls directly from frontend (exposes API key)
const response = await axios.get('https://li.quest/v1/quote', {
  params,
  headers: { 'x-lifi-api-key': 'your-key' } // ⚠️ Exposed in browser!
});
```

### Backend Integration

For Node.js backends, use this example directly:

```typescript
import { apiClient } from '@your-package/api-config';

export async function getQuote(params: QuoteParams) {
  return await apiClient.get('/quote', { params });
}
```

## Documentation

For more information about the LI.FI API:

- [API Overview](https://docs.li.fi/integration-options/lifi-api)
- [API Reference](https://docs.li.fi/api-reference)
- [Get Token Information](https://docs.li.fi/integration-options/lifi-api/getting-token-information)
- [Rate Limits](https://docs.li.fi/integration-options/lifi-api/rate-limits)
- [Error Codes](https://docs.li.fi/integration-options/lifi-api/error-codes)

---

## Moirai Agent Modules

Everything below documents the custom agent layers built on top of the LI.FI execution scaffold.

---

### Market Data Layer (`src/data/`)

#### What's implemented

| File | Purpose |
|------|---------|
| `types.ts` | Canonical types: `TokenState`, `YieldOpportunity`, `ChainState`, `MarketSnapshot` |
| `cache.ts` | Generic in-memory cache with configurable TTL (default 5 min) |
| `price-service.ts` | Fetches token prices, 24h volume, liquidity, and price change from DexScreener → CoinGecko fallback |
| `liquidity-service.ts` | Pool-level liquidity/volume breakdown per token via DexScreener |
| `yield-service.ts` | Fetches DeFi yield/APY data from DeFi Llama (`/pools` endpoint) |
| `market-data.ts` | Orchestrator — calls all services in parallel, assembles a single `MarketSnapshot`, caches it |

**Key functions:**

- **`fetchTokenStates(queries)`** — Takes an array of `{ symbol, address, chainId }`, returns `TokenState[]` with live prices. Tries DexScreener first, falls back to CoinGecko.
- **`fetchPoolsForToken(address, chainId)`** — Returns individual DEX pool data (pair, volume, liquidity) for a token.
- **`fetchYields(filter)`** — Fetches yield opportunities filtered by chain IDs, token symbols, and minimum TVL.
- **`getMarketSnapshot(opts?)`** — Single entry point for the agent loop. Fetches tokens + yields in parallel, returns a cached `MarketSnapshot`.
- **`startPeriodicUpdates(intervalMs)`** / **`stopPeriodicUpdates()`** — Background refresh on a timer so the agent always has fresh data.

#### What will need to change for real trading

- **Gas price tracking** — `ChainState.gasPriceGwei` is currently `null`. Wire it to an RPC `eth_gasPrice` call per chain so the strategy engine can factor gas costs into decisions.
- **Memecoin discovery** — Currently uses a hardcoded token universe (WETH + USDC on 4 chains). Add dynamic discovery from trending token APIs or social signals.
- **Rate limit management** — DexScreener and CoinGecko have rate limits. The cache helps, but production use should add per-source rate tracking and backoff.
- **Data validation** — Currently trusts API responses. Add sanity checks (e.g. reject prices that are 0 or orders of magnitude off from previous snapshot).

---

### Strategy Engine (`src/strategy/`)

#### What's implemented

| File | Purpose |
|------|---------|
| `types.ts` | Core types: `PortfolioState`, `Position`, `StrategyCandidate`, `DecisionPlan`, `ActionType` |
| `engine.ts` | Pluggable strategy engine with default "Momentum + Yield" logic and a registry |

**Key types:**

- **`PortfolioState`** — `{ balances: Record<string, number>, positions: Position[], totalValueUSD: number }` — read-only view consumed by strategies.
- **`Position`** — Per-token/per-chain: amount, entry price, cost basis, realized/unrealized PnL.
- **`StrategyCandidate`** — A proposed action: `{ actionType, fromChainId, toChainId, fromToken, toToken, amount, score, rationale }`.
- **`DecisionPlan`** — Output of a strategy evaluation: all candidates, the selected one, and a reasoning string.

**Key functions:**

- **`DefaultStrategy.evaluate(market, portfolio, epochId)`** — The built-in strategy logic:
  1. Scans `MarketSnapshot.yields` for USDC APY above 5% → generates a `bridge` candidate.
  2. Scans WETH tokens for 24h price change > +3% → generates a `rebalance` to WETH candidate.
  3. Scans WETH tokens for 24h price change < −3% → generates a `rebalance` to USDC candidate.
  4. If no signal fires → generates a `hold` candidate.
  5. Selects the highest-scoring candidate.
- **`StrategyRegistry`** — Array of `StrategyEngine` implementations. Add new strategies by pushing to this array.

**`StrategyEngine` interface:**

```typescript
interface StrategyEngine {
  name: string;
  description: string;
  evaluate(market: MarketSnapshot, portfolio: PortfolioState, epochId: string): DecisionPlan;
}
```

**Default parameters (easy to change):**

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `USDC_YIELD_THRESHOLD` | 5% APY | Minimum yield to trigger a bridge |
| `WETH_UP_THRESHOLD` | +3% 24h | Minimum uptrend to rebalance into WETH |
| `WETH_DOWN_THRESHOLD` | −3% 24h | Minimum downtrend to rebalance out of WETH |
| `MIN_TRADE_SIZE_USD` | $100 | Floor for any trade; otherwise uses 20% of portfolio |

#### What will need to change for real trading

- **Position-aware sizing** — Currently uses a flat 20% of portfolio or $100 minimum. Real trading should factor in existing position sizes, available balance on the source chain, and gas costs.
- **Multi-strategy evaluation** — The registry is wired but only one strategy runs. The agent loop should evaluate all registered strategies and pick the best `DecisionPlan` across them.
- **Slippage estimation** — Candidates don't yet estimate expected slippage. Integrate with LI.FI `/quote` to get actual slippage before scoring.
- **Cooldown / rate limiting** — No protection against flipping back and forth every epoch. Add a cooldown timer per action type.

---

### Portfolio Management (`src/portfolio/`)

#### What's implemented

| File | Purpose |
|------|---------|
| `types.ts` | `TradeRecord`, `AllocationTarget`, `DriftEntry`, `PersistedPortfolio`, `PositionRecord` |
| `portfolio-manager.ts` | The `PortfolioManager` class — full position tracker with persistence |
| `index.ts` | Barrel re-export |
| `portfolio-test.ts` | Smoke test: deposits → trades → mark-to-market → drift → save/load |

**Key types:**

- **`TradeRecord`** — Immutable ledger entry for every trade: action type, chains, tokens, amounts, prices, fees, tx hash, status.
- **`AllocationTarget`** — Per-symbol target weight and max drift tolerance (e.g. USDC 50% ± 10%).
- **`DriftEntry`** — Result of comparing one asset's actual weight vs its target: `{ symbol, targetWeight, actualWeight, driftPct, needsRebalance }`.
- **`PersistedPortfolio`** — The on-disk format: version, balances, positions, trade history, allocation targets, metadata (deposits, withdrawals, high water mark).

**Key functions on `PortfolioManager`:**

| Method | What it does |
|--------|-------------|
| `getState()` | Returns a read-only `PortfolioState` snapshot for the strategy engine |
| `getBalance(chainId, address)` | Look up balance for a specific token on a specific chain |
| `recordDeposit(chainId, token, amount)` | Records an external deposit, updates balances and positions |
| `applyTrade(trade)` | Applies a confirmed trade: deducts source balance, credits destination, updates cost basis via weighted average, calculates realized PnL on the closed portion, appends to trade history |
| `markToMarket(snapshot)` | Refreshes all positions with live prices from a `MarketSnapshot`, recalculates unrealized PnL, updates the high water mark |
| `getTotalValueUSD()` | Sum of `amount × priceUSD` across all positions |
| `getTotalRealizedPnL()` | Sum of realized PnL across all positions |
| `getTotalUnrealizedPnL()` | Sum of unrealized PnL across all positions |
| `checkDrift()` | Compares current portfolio weights vs allocation targets, returns `DriftEntry[]` — flags any asset exceeding its `maxDriftPct` |
| `setAllocationTargets(targets)` | Override the default allocation targets |
| `getTradeHistory()` / `getRecentTrades(n)` | Access the full or last-N trade ledger |
| `save()` | Serializes full state to a local JSON file (`data/portfolio.json`) |
| `load()` | Restores state from disk; returns `false` if no file exists. Positions are reconstructed with stub `TokenState` — call `markToMarket()` after loading to refresh live prices |
| `printSummary()` | Logs a formatted overview: total value, PnL, positions with weights, and allocation drift |

**Default allocation targets:**

| Symbol | Target weight | Max drift |
|--------|--------------|-----------|
| USDC | 50% | ±10% |
| ETH | 30% | ±10% |
| WETH | 15% | ±10% |
| Other (memecoins) | 5% | — |

**How cost basis works:**

- On deposit or buy: weighted-average cost basis = `(existingCostBasis + newAmount × newPrice) / totalAmount`
- On sell or close: realized PnL = `(exitPrice − avgCostPerUnit) × soldAmount`
- Partial closes reduce the position proportionally, keeping the per-unit cost the same

**How drift detection works:**

1. Aggregate position values by symbol across all chains
2. Compute each symbol's weight as `symbolValueUSD / totalPortfolioValueUSD`
3. Compare against `AllocationTarget.targetWeight`
4. If `|actualWeight − targetWeight| × 100 > maxDriftPct` → `needsRebalance = true`

#### What will need to change for real trading

- **On-chain balance verification** — Currently trusts its own bookkeeping. For real trades, query actual on-chain balances via RPC (`eth_call` on ERC-20 `balanceOf`) and reconcile with internal state. Flag discrepancies.
- **Pending transaction handling** — `applyTrade` assumes trades are confirmed. For real execution, track pending transactions separately and only commit to balances after confirmation (the `status: 'pending'` field is defined but not yet used for gating).
- **Multi-wallet support** — Currently assumes a single wallet. If the agent manages multiple wallets or uses smart contract wallets, the balance key scheme needs a wallet address dimension.
- **Persistence backend** — Local JSON file works for development. In production, swap to SQLite or a database for atomic writes, concurrent access, and crash recovery.
- **Fee accounting** — `TradeRecord.feesUSD` is recorded but not deducted from portfolio value calculations. For real P&L tracking, subtract cumulative fees from total returns.
- **Withdrawal tracking** — `totalWithdrawalsUSD` is defined but never incremented. Add a `recordWithdrawal()` method when the agent supports withdrawals.

---

## Support

- **Documentation**: https://docs.li.fi
- **Discord**: https://discord.gg/lifi
- **Portal**: https://portal.li.fi

## License

This example is provided as-is for educational purposes.

