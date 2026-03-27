import "dotenv/config";
import { encodeBytes32String, isAddress, ZeroAddress } from "ethers";
import { OrynSDK } from "../sdk/src";

const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PAYER_AGENT_ID = "simple-agent-001";
const RECIPIENT_AGENT_ID = "simple-agent-20260327-b";
const PAYMENT_AMOUNT_USDC = 0.25;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function registerIfNeeded(sdk: OrynSDK, agentId: string): Promise<void> {
  const encodedAgentId = encodeBytes32String(agentId);
  const registeredWallet = await sdk.contract.getAgentWallet(encodedAgentId);

  if (isAddress(registeredWallet) && registeredWallet !== ZeroAddress) {
    console.log(`[oryn] ${agentId} is already registered to ${registeredWallet}, continuing.`);
    return;
  }

  console.log(`[oryn] Registering ${agentId}...`);
  const receipt = await sdk.registerAgent(agentId);
  console.log(`[oryn] ${agentId} registered in tx ${receipt.hash}`);
}

async function main(): Promise<void> {
  console.log("=== Oryn Simple Payment Quick Start ===");
  console.log("This example uses Base Sepolia by default.");
  console.log(`RPC URL: ${BASE_SEPOLIA_RPC_URL}`);
  console.log(`USDC: ${BASE_SEPOLIA_USDC}`);

  const contractAddress = requireEnv("ORYN_PAYMENT_CONTRACT_ADDRESS");
  const payerPrivateKey = requireEnv("PRIVATE_KEY");
  const recipientPrivateKey = requireEnv("RECIPIENT_PRIVATE_KEY");

  // Create separate SDK clients for the payer and recipient wallets.
  const payerSdk = new OrynSDK({
    contractAddress,
    usdcAddress: BASE_SEPOLIA_USDC,
    chainId: BASE_SEPOLIA_CHAIN_ID
  });
  const recipientSdk = new OrynSDK({
    contractAddress,
    usdcAddress: BASE_SEPOLIA_USDC,
    chainId: BASE_SEPOLIA_CHAIN_ID
  });

  console.log("[setup] Connecting payer wallet...");
  await payerSdk.connect(payerPrivateKey, BASE_SEPOLIA_RPC_URL);

  console.log("[setup] Connecting recipient wallet...");
  await recipientSdk.connect(recipientPrivateKey, BASE_SEPOLIA_RPC_URL);

  // Ensure both wallets are registered before the transfer.
  // In v1, each wallet can only register one permanent agent ID.
  await registerIfNeeded(payerSdk, PAYER_AGENT_ID);
  await registerIfNeeded(recipientSdk, RECIPIENT_AGENT_ID);

  // Read balances before sending the payment so developers can see the delta clearly.
  const payerBefore = await payerSdk.getBalance(PAYER_AGENT_ID);
  const recipientBefore = await recipientSdk.getBalance(RECIPIENT_AGENT_ID);
  const estimatedFee = await payerSdk.estimateFee(PAYMENT_AMOUNT_USDC);

  console.log(`[balances] ${PAYER_AGENT_ID} before: ${payerBefore} USDC`);
  console.log(`[balances] ${RECIPIENT_AGENT_ID} before: ${recipientBefore} USDC`);
  console.log(`[payment] Estimated fee for ${PAYMENT_AMOUNT_USDC} USDC: ${estimatedFee} USDC`);

  // Send a small USDC payment from the payer agent to the recipient agent.
  console.log(`[payment] Sending ${PAYMENT_AMOUNT_USDC} USDC from ${PAYER_AGENT_ID} to ${RECIPIENT_AGENT_ID}...`);
  const receipt = await payerSdk.pay(PAYER_AGENT_ID, RECIPIENT_AGENT_ID, PAYMENT_AMOUNT_USDC);
  console.log(`[payment] Transaction confirmed: ${receipt.hash}`);

  // Read balances again so the developer can confirm the transfer happened.
  const payerAfter = await payerSdk.getBalance(PAYER_AGENT_ID);
  const recipientAfter = await recipientSdk.getBalance(RECIPIENT_AGENT_ID);

  console.log(`[balances] ${PAYER_AGENT_ID} after: ${payerAfter} USDC`);
  console.log(`[balances] ${RECIPIENT_AGENT_ID} after: ${recipientAfter} USDC`);
  console.log(`[balances] ${PAYER_AGENT_ID} delta: ${(payerAfter - payerBefore).toFixed(6)} USDC`);
  console.log(`[balances] ${RECIPIENT_AGENT_ID} delta: ${(recipientAfter - recipientBefore).toFixed(6)} USDC`);
  console.log("=== Quick start complete ===");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Simple payment example failed.");
  console.error(message);
  console.error("Checklist:");
  console.error("- Confirm ORYN_PAYMENT_CONTRACT_ADDRESS points to a deployed OrynPayment contract on Base Sepolia.");
  console.error("- Confirm PRIVATE_KEY and RECIPIENT_PRIVATE_KEY both have Base Sepolia ETH for gas.");
  console.error("- Confirm the payer wallet has Base Sepolia USDC.");
  console.error("- Confirm BASE_SEPOLIA_RPC_URL is reachable.");
  process.exitCode = 1;
});
