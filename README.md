# @oryn/sdk

`@oryn/sdk` is a payment SDK for AI agents on Base. It lets an agent wallet register an onchain identity, send and receive USDC, and pay other registered agents or services automatically through the `OrynPayment` contract.

Full docs: [oryn.network](https://oryn.network)  
SDK repo: [github.com/oryn-network/sdk](https://github.com/oryn-network/sdk)

## Start Here

If you are new to Oryn, this is the mental model:

1. One wallet connects to Base.
2. That wallet registers one permanent `agentId`.
3. Another wallet registers a different `agentId`.
4. The sender calls `pay(fromAgentId, toAgentId, amountUSDC)`.
5. Oryn settles the payment in USDC on Base.

If you only read one section, read the quick start below.

## 1-Minute Quick Start

Install:

```bash
npm install @oryn/sdk ethers
```

Minimal usage:

```ts
import { OrynSDK } from "@oryn/sdk";

const sdk = new OrynSDK({
  contractAddress: process.env.ORYN_PAYMENT_CONTRACT_ADDRESS!,
  usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  chainId: 84532
});

await sdk.connect(process.env.PRIVATE_KEY!, process.env.BASE_SEPOLIA_RPC_URL!);
await sdk.registerAgent("claude-agent-001");

// "compute-agent-001" must already be registered by the receiving wallet
const fee = await sdk.estimateFee(0.5);
const receipt = await sdk.pay("claude-agent-001", "compute-agent-001", 0.5);

console.log("Estimated fee:", fee);
console.log("Payment tx:", receipt.hash);
```

## What Oryn Solves

AI agents can call tools and complete tasks, but they still need a payment layer when one agent needs to buy work from another agent, or pay for a tool, API, or infrastructure service. Oryn provides that payment rail with a small Base-native contract and a TypeScript SDK on top.

Typical v1 use cases:

- a Claude-based agent pays a compute agent for a task
- a planner agent pays a retrieval or verification agent
- an agent pays a premium API or infrastructure service per task
- an internal multi-agent workflow uses wallet-based budgets instead of shared API keys

## Core Concepts

### `agentId`

A human-readable identifier for a wallet, such as `claude-agent-001` or `compute-agent-001`.

### Agent wallet

The Base wallet that owns an `agentId` and signs transactions.

### `OrynPayment`

The onchain contract that stores registrations and settles USDC payments.

### USDC settlement

All payments settle in USDC on Base or Base Sepolia.

## What You Need

To use the SDK you need:

- an `OrynPayment` contract address
- a wallet private key with Base ETH for gas
- USDC on Base or Base Sepolia for the paying wallet
- an RPC URL for the target network

In practice, you have two options:

- use the live deployed Oryn contract address for Base mainnet or Base Sepolia
- deploy your own `OrynPayment` contract if you want a separate treasury/owner setup

## Important v1 Rules

- each wallet can register exactly one permanent `agentId`
- the sending wallet must register its own `agentId` before calling `pay`
- the receiving wallet must already be registered under the destination `agentId`
- v1 payments are capped at `100` USDC per transaction

## End-to-End Flow

The cleanest happy path uses two wallets:

### Sender wallet

```ts
import { OrynSDK } from "@oryn/sdk";

const sender = new OrynSDK({
  contractAddress: process.env.ORYN_PAYMENT_CONTRACT_ADDRESS!,
  usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  chainId: 84532
});

await sender.connect(process.env.PRIVATE_KEY!, process.env.BASE_SEPOLIA_RPC_URL!);
await sender.registerAgent("simple-agent-001");
```

### Recipient wallet

```ts
import { OrynSDK } from "@oryn/sdk";

const recipient = new OrynSDK({
  contractAddress: process.env.ORYN_PAYMENT_CONTRACT_ADDRESS!,
  usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  chainId: 84532
});

await recipient.connect(process.env.RECIPIENT_PRIVATE_KEY!, process.env.BASE_SEPOLIA_RPC_URL!);
await recipient.registerAgent("simple-agent-002");
```

### Send payment

```ts
const before = await sender.getBalance("simple-agent-001");
const recipientBefore = await sender.getBalance("simple-agent-002");
const fee = await sender.estimateFee(0.25);

console.log("Sender before:", before);
console.log("Recipient before:", recipientBefore);
console.log("Fee:", fee);

const receipt = await sender.pay("simple-agent-001", "simple-agent-002", 0.25);

console.log("Payment tx:", receipt.hash);
console.log("Sender after:", await sender.getBalance("simple-agent-001"));
console.log("Recipient after:", await sender.getBalance("simple-agent-002"));
```

## Using Oryn With Existing Agents

The integration pattern is the same no matter which model stack you use:

1. your agent does its normal reasoning
2. your app decides another agent or service should be paid
3. you call `oryn.pay(...)`
4. the workflow continues after the payment confirms

### Claude / Anthropic

```ts
import Anthropic from "@anthropic-ai/sdk";
import { OrynSDK } from "@oryn/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const oryn = new OrynSDK({
  contractAddress: process.env.ORYN_PAYMENT_CONTRACT_ADDRESS!,
  usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  chainId: 84532
});

await oryn.connect(process.env.PRIVATE_KEY!, process.env.BASE_SEPOLIA_RPC_URL!);

const response = await anthropic.messages.create({
  model: "claude-3-5-haiku-latest",
  max_tokens: 300,
  messages: [{ role: "user", content: "Review this task and decide if compute is needed." }]
});

console.log(response.content[0].text);

const receipt = await oryn.pay("claude-agent-001", "compute-agent-001", 0.5);
console.log("Compute agent paid:", receipt.hash);
```

Use this when a Claude-based agent needs to pay a compute, retrieval, or verification agent after deciding a task should be delegated.

### OpenAI

```ts
import OpenAI from "openai";
import { OrynSDK } from "@oryn/sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const oryn = new OrynSDK({
  contractAddress: process.env.ORYN_PAYMENT_CONTRACT_ADDRESS!,
  usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  chainId: 84532
});

await oryn.connect(process.env.PRIVATE_KEY!, process.env.BASE_SEPOLIA_RPC_URL!);

const result = await openai.responses.create({
  model: "gpt-4.1-mini",
  input: "Plan how to enrich this task with premium search."
});

console.log(result.output_text);

const receipt = await oryn.pay("planner-agent-001", "search-agent-001", 0.1);
console.log("Search agent paid:", receipt.hash);
```

Use this when an OpenAI-powered planner or assistant needs to pay another registered agent or tool step inside a larger workflow.

### Generic agent pattern

If you already have your own agent runtime, the payment hook usually looks like this:

```ts
async function maybePayForWork(task: string) {
  const decision = await agent.decide(task);

  if (decision.shouldDelegate) {
    await oryn.pay("planner-agent-001", decision.targetAgentId, decision.amountUSDC);
  }

  return decision;
}
```

The important part is that Oryn does not replace your model or orchestration logic. It plugs into the moment where your existing agent decides money should move.

## API

### `connect(privateKey, rpcUrl)`

Connects a signer-backed SDK instance to Base.

### `registerAgent(agentId)`

Registers the connected wallet as a permanent agent identity. Each wallet can only do this once in v1.

### `pay(fromAgentId, toAgentId, amountUSDC)`

Approves USDC if needed and sends a payment to another registered agent.

### `getAgentAddress(agentId)`

Resolves a registered `agentId` to its wallet address.

### `getBalance(agentId)`

Returns the USDC balance of the wallet registered to the given `agentId`.

### `estimateFee(amountUSDC)`

Reads the live protocol fee from chain for a given amount.

## Common Errors

### `AgentIdAlreadyRegistered`

That `agentId` is already taken onchain. Choose a different one.

### `WalletAlreadyRegistered`

That wallet already claimed a different `agentId`. In v1, one wallet cannot register twice.

### Recipient not registered

If `pay()` fails for the recipient, the destination `agentId` usually has not been registered yet.

### Sender does not match `fromAgentId`

If `pay()` fails for the sender, make sure the connected wallet is the wallet that registered `fromAgentId`.

### `ERC20: transfer amount exceeds balance`

The paying wallet does not have enough USDC.

### Amount above cap

If a payment amount is above `100` USDC, the contract rejects it in v1.

### Wrong network

If `connect()` fails, make sure your RPC URL matches the chain ID you configured.

## Environment

Typical environment variables:

```env
PRIVATE_KEY=0x1111111111111111111111111111111111111111111111111111111111111111
RECIPIENT_PRIVATE_KEY=0x2222222222222222222222222222222222222222222222222222222222222222
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ORYN_PAYMENT_CONTRACT_ADDRESS=0x1111111111111111111111111111111111111111
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

## Live Addresses

- Base mainnet chain ID: `8453`
- Base Sepolia chain ID: `84532`
- Base mainnet USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Base Sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Base mainnet OrynPayment: `0xB399e525C2761e109552D8BFBf6735cBAdE516C3`
- Base Sepolia OrynPayment: `0xB399e525C2761e109552D8BFBf6735cBAdE516C3`

## Examples

Runnable examples live in:

- [`examples/simple-payment.ts`](/Users/ned/Documents/GitHub/Oryn/examples/simple-payment.ts)
- [`examples/claude-agent.ts`](/Users/ned/Documents/GitHub/Oryn/examples/claude-agent.ts)

The simplest smoke test is:

```bash
npx hardhat run examples/simple-payment.ts --network baseSepolia
```

## Local Development

This repo also contains the contract, tests, scripts, and examples used to develop the SDK.

```bash
npm install
npm run compile
npm test
npm run build
```

## Beta Caveats

- v1 beta is intended to be owned by a single deployer wallet only temporarily; move ownership to a multisig before meaningful volume
- v1 has no agent deregistration or key recovery flow, so a lost agent wallet means the associated `agentId` is lost as well
- the deployment script defaults to `30` bps, while the contract enforces a hard maximum fee of `500` bps
- very small payments can round down to a zero protocol fee because Solidity integer division truncates fractional remainders in USDC base units

## Security Notes

- `estimateFee()` reads the live fee from chain through `quoteFee`, so SDK estimates stay aligned with onchain configuration
- `payAgent` pulls the full payment into the contract once and then distributes recipient and treasury proceeds internally
- treat the owner key as critical infrastructure until ownership is moved to a multisig
