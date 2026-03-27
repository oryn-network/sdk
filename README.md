# @oryn/sdk

`@oryn/sdk` is an AI agent payment SDK for Base. It lets agents hold wallets, register onchain identities, send and receive USDC, and pay other agents or services automatically through the `OrynPayment` contract.

## Install

```bash
npm install @oryn/sdk ethers
```

## What You Need

To use the SDK you need:

- a deployed `OrynPayment` contract address
- a wallet private key with Base ETH for gas
- USDC on Base or Base Sepolia
- an RPC URL for the target network

## Important v1 Rules

- each wallet can register exactly one permanent `agentId`
- the sending wallet must register its own `agentId` before calling `pay`
- the receiving wallet must already be registered under the destination `agentId`
- v1 payments are capped at `100` USDC per transaction

## Quick Start

```ts
import { OrynSDK } from "@oryn/sdk";

const sdk = new OrynSDK({
  contractAddress: process.env.ORYN_PAYMENT_CONTRACT_ADDRESS!,
  usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  chainId: 84532
});

await sdk.connect(process.env.PRIVATE_KEY!, process.env.BASE_SEPOLIA_RPC_URL!);
await sdk.registerAgent("claude-agent-001");
// The receiving wallet must already be registered separately as "compute-agent-001"
const fee = await sdk.estimateFee(0.5);
const receipt = await sdk.pay("claude-agent-001", "compute-agent-001", 0.5);

console.log("Estimated fee:", fee);
console.log("Payment tx:", receipt.hash);
```

## Environment

Typical environment variables:

```env
PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ORYN_PAYMENT_CONTRACT_ADDRESS=0x1111111111111111111111111111111111111111
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

## SDK API

- `connect(privateKey, rpcUrl)` connects a signer-backed SDK instance to Base
- `registerAgent(agentId)` registers the connected wallet as a permanent agent identity; each wallet can only do this once in v1
- `pay(fromAgentId, toAgentId, amountUSDC)` approves USDC if needed and sends a payment to another registered agent
- `getAgentAddress(agentId)` resolves a registered agent ID to its wallet address
- `getBalance(agentId)` returns the agent wallet's USDC balance
- `estimateFee(amountUSDC)` reads the live protocol fee from chain for a given amount

## Common Gotchas

- if `registerAgent()` says the agent already exists, that `agentId` has already been claimed onchain
- if `pay()` fails for the recipient, the destination `agentId` is usually not registered yet
- if `pay()` fails for the sender, make sure the connected wallet matches `fromAgentId`
- if a payment amount is above `100` USDC, the contract will reject it in v1

## Local Development

This repository also contains the contract, tests, scripts, and examples used to develop the SDK.

```bash
npm install
npm run compile
npm test
npm run build
```

## Network Notes

- Base mainnet chain ID: `8453`
- Base Sepolia chain ID: `84532`
- Base mainnet USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Base Sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Base mainnet OrynPayment: `0xB399e525C2761e109552D8BFBf6735cBAdE516C3`
- Base Sepolia OrynPayment: `0xB399e525C2761e109552D8BFBf6735cBAdE516C3`

## Beta Caveats

- v1 beta is intended to be owned by a single deployer wallet only temporarily; move ownership to a multisig before meaningful volume.
- v1 has no agent deregistration or key recovery flow, so a lost agent wallet means the associated `agentId` is lost as well.
- The current deployment script defaults to `30` bps, while the contract enforces a hard maximum fee of `500` bps.

## Security Notes

- `estimateFee()` reads the live fee from chain through `quoteFee`, so SDK estimates stay aligned with onchain configuration.
- Very small payments can round down to a zero protocol fee because Solidity integer division truncates fractional remainders in USDC base units.
- `payAgent` now pulls the full payment into the contract once and then distributes recipient and treasury proceeds internally, reducing the split-settlement risk noted in earlier reviews.

## Operational Guidance

- Treat the owner key as critical infrastructure until ownership is moved to a multisig.
- Treat agent wallets as permanent identities in v1. Losing the key means losing control of that `agentId`.
- Verify the deployed `owner`, `treasury`, and `feeBps` values after each deployment before sharing contract addresses with integrators.
