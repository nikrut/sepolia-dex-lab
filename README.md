# Sepolia DEX Lab

A deterministic constant-product DEX sandbox for developing and testing bounded autonomous trading agents on a Sepolia L2 test network.

This repository is the execution laboratory for a larger agentic trading system. It intentionally uses mock assets and controllable prices: testnet liquidity is not market data, and profitable testnet trades do not demonstrate a profitable real-money strategy.

## What is included

- `ConstantProductPool`: a two-token AMM with a configurable fee, liquidity shares, deadline protection and minimum-output checks.
- `MockERC20`: owner-mintable development assets with configurable decimals.
- `ScenarioOracle`: an owner-controlled reference price for deterministic market scenarios.
- Local in-memory-chain integration tests using Ganache and Viem.
- A Sepolia L2 deployment script with optional seed liquidity and an RPC chain-ID guard.

## Quick start

Requirements: Node.js 22+ and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm security:audit
```

`pnpm check` compiles every Solidity source, runs the integration suite against an isolated chain configured with chain ID `84532`, and scans tracked files for common secret formats.

## Deploy to the Sepolia L2 testnet

1. Create a development-only wallet with `pnpm wallet:create`. The command refuses to overwrite an existing `.env`.
2. Fund its public address with test ETH from a faucet for chain `84532`.
3. Set `SEPOLIA_RPC_URL` in `.env` to an HTTPS endpoint for chain `84532`. If creating the file manually, copy `.env.example`, set the private key locally and restrict the file permissions.
4. Leave `SEED_LIQUIDITY=false` for a contracts-only deployment, or enable it to mint mock assets and initialize the pool.
5. Run `pnpm deploy:sepolia`.

The deployer verifies that the RPC reports chain ID `84532` before signing any transaction. Public contract addresses are written to `deployments/sepolia-l2.json`; the private key is never written to deployment artifacts, and `.env` is ignored by Git.

The development wallet address is safe to share for faucet funding. Its private key is not: never print or paste `.env` into a prompt, issue or screenshot. Never fund this wallet with mainnet assets.

## Intended agent workflow

```text
Scenario/data feed -> Strategy -> TradeIntent -> Risk engine -> Pool transaction
                                         |              |
                                         +-- audit log --+
```

The strategy must never receive an unrestricted signer. A separate executor should validate token allowlists, trade size, slippage, deadline, daily turnover and loss limits before signing a transaction.

## Non-goals

- Production liquidity or price discovery.
- Claims about strategy profitability.
- MEV protection.
- A production-ready AMM.
- Custody of real funds.

## Security status

Unaudited educational software. Use only mock assets and test networks. Dependency advisories at moderate severity or higher fail CI. See [SECURITY.md](SECURITY.md) for the trust model and limitations.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for component boundaries and the planned budget-vault integration.

## Roadmap

- Deterministic scenario runner and recorded price replays.
- Multi-pool routing and triangular-arbitrage fixtures.
- Adversarial tokens and reentrancy test fixtures.
- Integration with `agent-budget-vault`.
- Agent performance metrics and trace export.

## License

MIT
