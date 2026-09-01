# Security policy

## Status

This project is unaudited and intentionally limited to local chains and the Sepolia L2 testnet at chain ID `84532`. Do not deploy it with real assets.

## Trust model

- Mock token owners can mint arbitrary supply.
- The scenario oracle owner can set any reference price.
- Traders choose their own transaction deadline and minimum output.
- The pool has no privileged administrator after deployment.
- An external risk engine is responsible for agent budgets and target allowlists.

## Repository safeguards

- The deployer requires HTTPS and refuses an RPC whose chain ID is not `84532`.
- The pool constructor rejects zero addresses, identical tokens and addresses without contract code.
- State-changing pool operations have a reentrancy guard.
- Tracked files are scanned for common private-key and access-token formats.
- Dependency advisories at moderate severity or higher fail CI.
- GitHub Actions are pinned to full commit SHAs with read-only repository permissions.
- Dependency installation in CI disables package lifecycle scripts.

## Known limitations

- The AMM is a testing fixture, not a production exchange.
- Direct token transfers can change balances before stored reserves are updated by `sync()` or another state-changing operation.
- Rebasing and fee-on-transfer tokens are outside the supported asset model.
- There is no TWAP, MEV protection, protocol fee or governance.
- The reference oracle is deliberately manipulable by its owner.
- Solidity multiplication can revert for unrealistically large mock balances.
- An independent smart-contract audit has not been performed.

## Key handling

- Use a dedicated wallet that has never held mainnet assets.
- Store its private key only in a local ignored `.env` file or an encrypted keystore.
- Never paste a private key into an AI prompt, issue, log, screenshot or commit.
- Keep only the minimum amount of testnet ETH required for deployments.
- Treat any wallet created by this repository as permanently test-only.

## Reporting

Open a GitHub issue without including secrets or exploitable private deployment details. For a sensitive report, contact the repository owner privately.
