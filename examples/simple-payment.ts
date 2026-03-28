import "dotenv/config";
import { encodeBytes32String, isAddress, ZeroAddress } from "ethers";
import hre from "hardhat";
import { OrynSDK } from "../sdk/src";

const BASE_MAINNET_CHAIN_ID = 8453;
const BASE_MAINNET_RPC_URL = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
const BASE_MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PAYER_AGENT_ID = "simple-agent-001";
const RECIPIENT_AGENT_ID = "simple-agent-20260327-b";
const MAINNET_PAYMENT_AMOUNT_USDC = 1.0;
const SEPOLIA_PAYMENT_AMOUNT_USDC = 0.25;

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

async function getBalanceSafely(sdk: OrynSDK, agentId: string): Promise<number | null> {
  try {
    return await sdk.getBalance(agentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] Could not read balance for ${agentId}: ${message}`);
    return null;
  }
}

async function main(): Promise<void> {
  const networkName = hre.network.name;
  const isMainnet = networkName === "base";
  const isSepolia = networkName === "baseSepolia";

  if (!isMainnet && !isSepolia) {
    throw new Error(`Unsupported network "${networkName}". Use --network base or --network baseSepolia.`);
  }

  const selectedChainId = isMainnet ? BASE_MAINNET_CHAIN_ID : BASE_SEPOLIA_CHAIN_ID;
  const selectedRpcUrl = isMainnet ? BASE_MAINNET_RPC_URL : BASE_SEPOLIA_RPC_URL;
  const selectedUsdc = isMainnet ? BASE_MAINNET_USDC : BASE_SEPOLIA_USDC;
  const paymentAmount = isMainnet ? MAINNET_PAYMENT_AMOUNT_USDC : SEPOLIA_PAYMENT_AMOUNT_USDC;
  const networkLabel = isMainnet ? "Base mainnet" : "Base Sepolia";

  console.log("=== Oryn Simple Payment Quick Start ===");
  console.log(`Network: ${networkLabel}`);
  console.log(`RPC URL: ${selectedRpcUrl}`);
  console.log(`USDC: ${selectedUsdc}`);

  const contractAddress = requireEnv("ORYN_PAYMENT_CONTRACT_ADDRESS");
  const payerPrivateKey = requireEnv("PRIVATE_KEY");
  const recipientPrivateKey = requireEnv("RECIPIENT_PRIVATE_KEY");

  // Create separate SDK clients for the payer and recipient wallets.
  const payerSdk = new OrynSDK({
    contractAddress,
    usdcAddress: selectedUsdc,
    chainId: selectedChainId
  });
  const recipientSdk = new OrynSDK({
    contractAddress,
    usdcAddress: selectedUsdc,
    chainId: selectedChainId
  });

  console.log("[setup] Connecting payer wallet...");
  await payerSdk.connect(payerPrivateKey, selectedRpcUrl);

  console.log("[setup] Connecting recipient wallet...");
  await recipientSdk.connect(recipientPrivateKey, selectedRpcUrl);

  // Ensure both wallets are registered before the transfer.
  // In v1, each wallet can only register one permanent agent ID.
  await registerIfNeeded(payerSdk, PAYER_AGENT_ID);
  await registerIfNeeded(recipientSdk, RECIPIENT_AGENT_ID);

  // Read balances before sending the payment so developers can see the delta clearly.
  const payerBefore = await getBalanceSafely(payerSdk, PAYER_AGENT_ID);
  const recipientBefore = await getBalanceSafely(payerSdk, RECIPIENT_AGENT_ID);
  const estimatedFee = await payerSdk.estimateFee(paymentAmount);

  console.log(`[balances] ${PAYER_AGENT_ID} before: ${payerBefore ?? "unavailable"} USDC`);
  console.log(`[balances] ${RECIPIENT_AGENT_ID} before: ${recipientBefore ?? "unavailable"} USDC`);
  console.log(`[payment] Estimated fee for ${paymentAmount} USDC: ${estimatedFee} USDC`);

  // Send a small USDC payment from the payer agent to the recipient agent.
  console.log(`[payment] Sending ${paymentAmount} USDC from ${PAYER_AGENT_ID} to ${RECIPIENT_AGENT_ID}...`);
  const receipt = await payerSdk.pay(PAYER_AGENT_ID, RECIPIENT_AGENT_ID, paymentAmount);
  console.log(`[payment] Transaction confirmed: ${receipt.hash}`);

  // Read balances again so the developer can confirm the transfer happened.
  const payerAfter = await getBalanceSafely(payerSdk, PAYER_AGENT_ID);
  const recipientAfter = await getBalanceSafely(payerSdk, RECIPIENT_AGENT_ID);

  console.log(`[balances] ${PAYER_AGENT_ID} after: ${payerAfter ?? "unavailable"} USDC`);
  console.log(`[balances] ${RECIPIENT_AGENT_ID} after: ${recipientAfter ?? "unavailable"} USDC`);

  if (payerBefore !== null && payerAfter !== null) {
    console.log(`[balances] ${PAYER_AGENT_ID} delta: ${(payerAfter - payerBefore).toFixed(6)} USDC`);
  }

  if (recipientBefore !== null && recipientAfter !== null) {
    console.log(`[balances] ${RECIPIENT_AGENT_ID} delta: ${(recipientAfter - recipientBefore).toFixed(6)} USDC`);
  }

  console.log("=== Quick start complete ===");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Simple payment example failed.");
  console.error(message);
  console.error("Checklist:");
  console.error("- Confirm ORYN_PAYMENT_CONTRACT_ADDRESS points to a deployed OrynPayment contract on the selected network.");
  console.error("- Confirm PRIVATE_KEY and RECIPIENT_PRIVATE_KEY both have Base ETH for gas on that network.");
  console.error("- Confirm the payer wallet has USDC on the selected network.");
  console.error("- Confirm BASE_RPC_URL or BASE_SEPOLIA_RPC_URL is reachable for the chosen network.");
  process.exitCode = 1;
});
