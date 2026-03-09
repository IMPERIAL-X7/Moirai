# Moirai — Strategy Playbook

---

## 1. Cross-Chain Price Arbitrage

> The most reliable strategy for a demo — price discrepancies frequently exist across chains.

### Concept

The agent continuously scans token prices across DEXs on different chains and exploits temporary price differences.

### Typical Execution

1. Detect token price differences across chains.
2. Buy the token on the cheaper chain.
3. Bridge the token using LI.FI.
4. Sell the token on the more expensive chain.

### Why It Works in Demos

Price APIs often show small but consistent price spreads, which makes it easy to simulate profits.

**Example opportunity:**

| Chain    | ETH Price |
| -------- | --------- |
| Arbitrum | $3,010    |
| Base     | $3,025    |

The agent executes the trade and captures the spread.

### Returns

- **Short-term:** Small arbitrage profits accumulate quickly.
- **Long-term:** Continuous arbitrage compounds capital over time.

---

## 2. Liquidity Pool Fee Farming

> Earn trading fees from automated market maker pools.

### Concept

Provide liquidity in high-volume pools to collect trading fees.

**Protocols commonly used:** Uniswap, Balancer

### Typical Execution

1. Detect pools with high trading volume.
2. Provide liquidity in those pools.
3. Collect fees as traders swap tokens.
4. Periodically rebalance liquidity across chains.

### Why It Works in Demos

Fee generation can be simulated deterministically, so the agent can show visible returns during the demo.

### Returns

- **Short-term:** Trading fees accumulate almost immediately.
- **Long-term:** Compounded LP fees grow the position.

---

## 3. Yield Rate Rotation

> Reallocate capital to the highest APY opportunities.

### Concept

The agent continuously compares yields across protocols and moves funds when a better opportunity appears.

**Example yield sources:** Aave, Curve Finance

### Typical Execution

1. Monitor yield rates across protocols.
2. Identify a higher yield opportunity.
3. Bridge assets to the appropriate chain.
4. Deposit into the higher yield pool.

### Why It Works in Demos

Yield data is stable and easy to display as predictable income growth.

### Returns

- **Short-term:** Lending and liquidity rewards accumulate steadily.
- **Long-term:** Compounded yields increase portfolio size.

---

## 4. Funding Rate Capture

> Capture funding payments from perpetual futures markets.

### Concept

Funding rates often pay traders who take the opposite side of crowded trades.

**Example platforms:** GMX, dYdX

### Typical Execution

1. Identify positive funding rates.
2. Open a position that earns funding payments.
3. Hedge exposure using spot assets.
4. Collect funding income over time.

### Why It Works in Demos

Funding payments are predictable and can produce visible short-term gains.

### Returns

- **Short-term:** Funding payments accrue every few hours.
- **Long-term:** Repeated funding income compounds capital.

---

## 5. Momentum Volume Strategy

> Trade tokens experiencing rapid increases in trading activity.

### Concept

Large spikes in volume often indicate short-term momentum.

### Typical Execution

1. Detect tokens with sudden volume growth.
2. Buy tokens during early momentum.
3. Exit once momentum slows.

### Data Sources

- DEX volume changes
- Liquidity inflows
- Trending tokens

### Why It Works in Demos

Volume spikes happen frequently and can easily trigger visible profitable trades.

### Returns

- **Short-term:** Momentum trades can generate quick profits.
- **Long-term:** Capital compounds through repeated cycles.