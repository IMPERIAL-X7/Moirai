# Moirai Agent Architecture (Section 2)

This document defines the architecture for a narrative-trading autonomous agent focused on long-run portfolio growth.

## 1) Architecture Goals

- Keep the system modular so strategy and execution can evolve independently.
- Run continuously in hourly epochs.
- Support cross-chain operation on Ethereum, Arbitrum, Base, and Polygon.
- Trade only ETH, USDC, and selected memecoins.
- Enforce medium-risk constraints by design.
- Keep all decisions and execution events fully traceable.

## 2) High-Level System Design

The agent is composed of independent modules connected through explicit interfaces:

1. Data Layer
2. Decision Engine
3. Risk Manager
4. Execution Layer
5. Portfolio State Store
6. Orchestrator (Agent Loop)
7. Observability Layer (Logging + Metrics)

The orchestrator runs the modules in sequence each epoch, while each module remains replaceable.

## 3) Module Breakdown

### 3.1 Data Layer

**Purpose**
- Ingest and normalize market inputs used for strategy decisions.

**Responsibilities**
- Pull token prices, liquidity, and volume for ETH/USDC/memecoins.
- Pull narrative signals (social momentum, trend tags, attention spikes).
- Pull chain-level execution context (gas, bridge latency, route health).
- Normalize all data into a single canonical schema with timestamps.
- Cache snapshots for current and recent epochs.

**Output Contract**
- `MarketSnapshot` containing:
  - `timestamp`
  - `tokenState[]` (price, volume, liquidity, volatility)
  - `narrativeState[]` (score, trend direction, confidence)
  - `chainState[]` (gas, congestion, route availability)

### 3.2 Decision Engine

**Purpose**
- Convert normalized market state into a ranked action plan.

**Responsibilities**
- Generate candidate actions: hold, swap, bridge+swap, rebalance.
- Score candidates using expected portfolio-growth impact.
- Include narrative conviction and market microstructure quality.
- Produce rationale for every candidate and chosen action.

**Input**
- `MarketSnapshot`
- Current `PortfolioState`
- Agent policy parameters

**Output**
- `DecisionPlan`:
  - `epochId`
  - `candidates[]` with score breakdown
  - `selectedAction`
  - `reasoning`

### 3.3 Risk Manager

**Purpose**
- Enforce medium-risk policy before execution.

**Responsibilities**
- Position sizing caps per trade.
- Exposure caps per asset class (ETH, USDC, memecoin bucket).
- Liquidity-aware sizing to reduce slippage risk.
- Maximum drawdown and loss-guard checks.
- Kill-switch and no-trade conditions under abnormal market states.

**Policy Shape (example)**
- `maxTradeNotionalPct`
- `maxMemecoinExposurePct`
- `maxSingleTokenExposurePct`
- `maxAllowedSlippageBps`
- `maxIntradayDrawdownPct`

**Output**
- `RiskApprovedPlan` or `RiskRejected` with explicit rejection reasons.

### 3.4 Execution Layer

**Purpose**
- Execute approved actions reliably across chains.

**Responsibilities**
- Retrieve and score LI.FI routes for swaps/bridges.
- Select route based on net output, fee/gas, and reliability.
- Submit transactions and track status to completion.
- Handle retries and fallback routes on failure.
- Emit execution receipts and final settlement outcomes.

**Output**
- `ExecutionResult`:
  - transaction identifiers
  - filled amounts
  - fees/gas
  - chain and token deltas
  - completion status

### 3.5 Portfolio State Store

**Purpose**
- Maintain authoritative balances and performance state across chains.

**Responsibilities**
- Track balances of ETH/USDC/memecoins by chain.
- Update state from confirmed execution outcomes only.
- Track cost basis, realized PnL, unrealized PnL.
- Track allocation drift and performance history.
- Provide snapshots to decision engine each epoch.

**Core Entities**
- `PortfolioState`
- `Position`
- `BalanceByChain`
- `TradeLedgerEntry`
- `PerformanceSnapshot`

### 3.6 Orchestrator (Continuous Agent Loop)

**Purpose**
- Coordinate all modules in a deterministic hourly process.

**Epoch Flow**
1. Load latest `PortfolioState`.
2. Fetch fresh `MarketSnapshot` from Data Layer.
3. Generate `DecisionPlan` in Decision Engine.
4. Run Risk Manager approval.
5. Execute approved action in Execution Layer.
6. Confirm settlement and update `PortfolioState`.
7. Record logs/metrics for the epoch.
8. Sleep until next hourly boundary.

**Operational Requirements**
- Idempotent per `epochId` to avoid duplicate execution.
- Timeout and fallback handling for each stage.
- Graceful degradation to `hold` on data or execution uncertainty.

### 3.7 Observability Layer

**Purpose**
- Ensure every decision and execution step is auditable.

**Responsibilities**
- Structured logs for input, decision, risk checks, execution, and state update.
- Correlation IDs per epoch and per action.
- Metrics for latency, fill quality, failure rates, and portfolio growth.
- Event timeline for debugging and post-trade analysis.

## 4) Separation of Strategy and Execution

The architecture enforces strict boundaries:

- Strategy modules define *what* to do (action intent and sizing).
- Execution modules define *how* to do it (route, transaction submission, monitoring).

This allows replacing strategy logic without touching execution reliability logic, and vice versa.


---

## Strategy Engine Implementation (Section 6)

### Modular Design

- The strategy engine is fully pluggable: each strategy is a module implementing the `StrategyEngine` interface.
- Strategies are registered in a central registry for easy swapping and extension.
- All types are defined in `src/strategy/types.ts` for clarity and extensibility.

### Default Strategy: "Momentum + Yield"

- If USDC yield > threshold, bridge to highest APY chain.
- If WETH price up > threshold, rebalance to WETH.
- If WETH price down > threshold, rebalance to USDC.
- Otherwise, hold.

#### Parameters (easy to change):
- USDC yield threshold: 5% APY
- WETH uptrend threshold: +3% 24h
- WETH downtrend threshold: -3% 24h
- Minimum trade size: $100 or 20% of portfolio

#### Logic:
- Candidates are generated for each signal (yield, momentum)
- Each candidate is scored and given a rationale
- The highest-scoring candidate is selected
- All reasoning is logged for traceability

#### Example Decision Plan:
- Candidates: bridge, rebalance, hold
- Selected: bridge to USDC on chain with highest APY
- Reasoning: USDC yield > threshold, WETH momentum signals

#### Extending:
- To add new strategies, implement the `StrategyEngine` interface and add to the registry
- All thresholds, scoring, and rationale logic are easy to change

---

## Agent Decision Loop (Section 8)

### Overview

The agent decision loop is the orchestrator that ties market data, strategy evaluation, trade execution, and portfolio updates into a single continuous process. Each iteration is called an **epoch**.

### Epoch Flow

1. **Data Fetch** — Pull a fresh `MarketSnapshot` (token prices, yields, chain state).
2. **Strategy Eval** — Pass the snapshot + current portfolio state to the active strategy → get a `DecisionPlan` with scored candidates and a selected action.
3. **Execution** — Route the selected action through the executor (paper or live). Swaps/bridges produce an `ExecutionResult`; holds are no-ops.
4. **Portfolio Update** — Apply the trade to the portfolio manager, mark-to-market all positions.
5. **Persist** — Save the updated portfolio to disk.

### Key Design Decisions

- **Injectable executor** — The `Executor` type is a function signature. Swap between `paperExecutor` (simulated fills) and a real LI.FI executor without changing any loop logic.
- **Injectable data fetcher** — `SnapshotFetcher` can be replaced for testing (mock data) or custom data pipelines.
- **Failure tracking** — Consecutive data or execution failures are counted. The loop auto-pauses when thresholds are exceeded and resumes when a healthy epoch completes.
- **Epoch logging** — Every epoch produces an `EpochLog` with phase-by-phase timing, success/failure for each phase, trade details, and outcome classification (`executed`, `hold`, `data_error`, `exec_error`, `skipped`).

### Paper Trading

The built-in `paperExecutor` simulates trades using real market prices with configurable slippage (0.3%) and fee (0.1%) deductions. No wallet or RPC connection required.

### Running the Smoke Test

```bash
cd moirai
npx tsx src/agent/agent-test.ts
```

Runs 3 epochs with mock data, alternating swap and hold actions, and prints a full portfolio summary.

---

## 5) Opportunity Evaluation Framework

Each candidate action is scored with a weighted model:

- Expected growth contribution (primary objective)
- Narrative momentum quality
- Execution quality (fees, slippage, route reliability)
- Risk-adjusted penalty terms (concentration, volatility, liquidity)

The selected action is the highest-scoring risk-compliant candidate; otherwise `hold`.

## 6) Portfolio Model Across Chains

The portfolio is chain-aware and asset-aware:

- Chain dimension: Ethereum, Arbitrum, Base, Polygon.
- Asset dimension: ETH, USDC, approved memecoins.
- Position metadata: entry price, size, cost basis, realized/unrealized PnL.
- Allocation targets and drift bounds for rebalancing decisions.

Only confirmed transactions mutate balances.

## 7) Logging and Traceability Specification

Every epoch records:

- Input snapshot hash and data freshness.
- Candidate actions and scoring details.
- Risk checks with pass/fail outcomes.
- Route selected, transaction hashes, and settlement status.
- Portfolio deltas and resulting NAV.

Minimum log fields:

- `timestamp`
- `epochId`
- `component`
- `eventType`
- `correlationId`
- `payload`
- `severity`

## 8) Failure Handling Strategy

- Data failure: use last valid snapshot within freshness window; else no-trade.
- Risk failure: reject action and log explicit rule breaches.
- Route failure: retry with bounded attempts, then fallback route, then no-trade.
- Confirmation failure: mark pending, recheck next cycle, prevent double execution.

## 9) Security and Operational Controls

- Private keys managed via environment secrets.
- Transaction signing isolated from strategy logic.
- Pre-trade validation and post-trade confirmation mandatory.
- Manual stop control always available.

## 10) Canonical Loop (Reference)

```text
observe_market()
evaluate_strategy()
decide_action()
execute_trade()
update_portfolio()
```

This architecture is the reference design for implementing Section 2 before coding deeper strategy and execution behaviors.
