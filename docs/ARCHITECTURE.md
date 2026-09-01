# Architecture

## Purpose

Sepolia DEX Lab provides deterministic execution fixtures for autonomous-agent experiments. It is deliberately separated from strategy generation and wallet policy so each layer can be tested independently.

## Components

```text
                 reference price
Scenario runner --------------------> ScenarioOracle
       |                                    |
       | market state                       | observation only
       v                                    v
ConstantProductPool <---- bounded executor <---- strategy/risk engine
       |
       +---- MockERC20 assets
```

### MockERC20

Creates assets with predictable decimals and balances. Only the deployer/owner can mint. These assets must never be presented as real tokens.

### ConstantProductPool

Maintains the `x * y = k` market-making curve. The input fee remains in the pool, so `k` should not decrease after a successful swap. Users protect themselves with a minimum output and deadline.

### ScenarioOracle

Stores a separate 18-decimal reference price. It does not control the AMM price. A scenario runner or test harness changes the oracle, while an arbitrage or strategy agent decides whether to trade the pool toward that reference.

## Security boundary

The DEX contracts do not decide whether an agent may trade. That belongs to the next system layer, `agent-budget-vault`:

1. A strategy emits a data-only `TradeIntent`.
2. A deterministic risk engine validates budgets, allowlists, slippage and expiry.
3. A bounded executor encodes a known pool call.
4. The budget vault enforces onchain policy.
5. Every decision and receipt is recorded in an append-only audit log.

An LLM may produce an intent or explanation, but it must not receive a raw private key or an unrestricted transaction-signing tool.

## Supported assumptions

- Standard ERC-20 behavior.
- Two assets per pool.
- Fixed fee selected at deployment.
- Deterministic development environments.
- Sepolia L2 testnet chain ID `84532`.

## Explicit limitations

- Imbalanced liquidity deposits may donate value to existing liquidity providers.
- Direct token transfers require `sync()` before the stored reserves reflect balances.
- The oracle is centralized and intentionally manipulable for scenario tests.
- No TWAP, routing, governance, MEV protection or production upgrade path is provided.
