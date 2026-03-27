# Oryn SDK Overview

## Goal

`oryn-sdk` provides a compact payment rail for AI agent workflows on Base. Agents register an onchain identity, pay each other in USDC, and settle through the `OrynPayment` contract.

## Flow

1. Deploy `OrynPayment` with the Base USDC address, treasury address, and fee settings.
2. Initialize `OrynSDK` with the contract address, Base RPC URL, private key, and USDC address.
3. Register each wallet with a unique agent identifier.
4. Call `pay` to approve USDC when needed and transfer value from one agent to another.
5. Read balances and agent addresses through the SDK for operational visibility.

## Contract Model

- `registerAgent` binds a wallet to a unique `agentId`.
- `payAgent` checks registration, computes the fee, routes funds to the recipient, and sends the protocol fee to the treasury.
- `pause` and `unpause` give the owner an emergency stop for v1 operations.

## SDK Model

- `connect` initializes a signer-backed client against Base.
- `registerAgent` registers the active wallet onchain.
- `pay` auto-approves USDC and transfers value between registered agents.
- `getAgentAddress` resolves an agent ID to its wallet.
- `getBalance` reads the wallet balance in human-readable USDC units.

## Audit Caveats

- v1 ownership is still centralized in a single owner account. This is acceptable for beta, but production usage should move ownership to a multisig.
- Agent IDs are permanently bound to wallets in v1. There is no deregistration or wallet rotation flow yet.
- Fee changes are constrained by an onchain `MAX_FEE_BPS` cap of `500`, and the SDK now reads fee estimates from chain rather than relying on a hardcoded client constant.
- Small payments can produce a zero fee because USDC uses integer base units and fee math truncates fractional remainders.
- Beta operators should verify deployment outputs carefully because treasury routing and owner privileges are still centrally managed in v1.
