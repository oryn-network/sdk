import "dotenv/config";
import Anthropic, { type MessageParam } from "@anthropic-ai/sdk";
import { OrynSDK } from "../sdk/src";

const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const CLAUDE_AGENT_ID = "claude-agent-001";
const COMPUTE_AGENT_ID = "compute-agent-001";
const COMPUTE_PAYMENT_USDC = 0.5;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function extractTextBlocks(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

async function registerIfNeeded(sdk: OrynSDK, agentId: string): Promise<void> {
  try {
    console.log(`[oryn] Registering agent "${agentId}"...`);
    const receipt = await sdk.registerAgent(agentId);
    console.log(`[oryn] Agent "${agentId}" registered in tx ${receipt.hash}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("already registered")) {
      console.log(`[oryn] Agent "${agentId}" is already registered, continuing.`);
      return;
    }

    throw error;
  }
}

async function main(): Promise<void> {
  console.log("=== Oryn Claude Agent Example ===");
  console.log("Network: Base Sepolia");
  console.log(`RPC URL: ${BASE_SEPOLIA_RPC_URL}`);
  console.log(`USDC: ${BASE_SEPOLIA_USDC}`);

  const anthropicApiKey = requireEnv("ANTHROPIC_API_KEY");
  const privateKey = requireEnv("PRIVATE_KEY");
  const contractAddress = requireEnv("ORYN_PAYMENT_CONTRACT_ADDRESS");
  const prompt = process.argv.slice(2).join(" ") || "Summarize the task and explain why it should be delegated to a compute agent.";

  console.log(`[setup] Claude agent ID: ${CLAUDE_AGENT_ID}`);
  console.log(`[setup] Compute agent ID: ${COMPUTE_AGENT_ID}`);
  console.log(`[setup] Prompt: ${prompt}`);

  // Create the Anthropic client using the real SDK.
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  // Create and connect the Oryn SDK instance for Base Sepolia.
  const oryn = new OrynSDK({
    contractAddress,
    usdcAddress: BASE_SEPOLIA_USDC,
    chainId: BASE_SEPOLIA_CHAIN_ID
  });

  console.log("[oryn] Connecting wallet to Base Sepolia...");
  await oryn.connect(privateKey, BASE_SEPOLIA_RPC_URL);
  console.log("[oryn] Wallet connected.");

  // Register this Claude-powered wallet as an agent.
  // The compute agent must already be registered by its own wallet.
  await registerIfNeeded(oryn, CLAUDE_AGENT_ID);

  // Build a real Anthropic messages payload with typed SDK input.
  const messages: MessageParam[] = [
    {
      role: "user",
      content: prompt
    }
  ];

  console.log("[anthropic] Sending task to Claude...");
  const response = await anthropic.messages.create({
    model: "claude-3-5-haiku-latest",
    max_tokens: 300,
    messages
  });

  const claudeOutput = extractTextBlocks(response);
  console.log("[anthropic] Claude response:");
  console.log(claudeOutput || "(No text content returned)");

  // Ask the compute agent to process the task by sending a small USDC payment.
  const estimatedFee = await oryn.estimateFee(COMPUTE_PAYMENT_USDC);
  console.log(`[oryn] Estimated protocol fee for ${COMPUTE_PAYMENT_USDC} USDC: ${estimatedFee} USDC`);
  console.log(`[oryn] Paying ${COMPUTE_AGENT_ID} ${COMPUTE_PAYMENT_USDC} USDC for compute work...`);
  const receipt = await oryn.pay(CLAUDE_AGENT_ID, COMPUTE_AGENT_ID, COMPUTE_PAYMENT_USDC);

  console.log(`[oryn] Payment confirmed in tx: ${receipt.hash}`);

  // Fetch the updated balance for the Claude agent after payment completes.
  const newBalance = await oryn.getBalance(CLAUDE_AGENT_ID);
  console.log(`[oryn] New balance for ${CLAUDE_AGENT_ID}: ${newBalance} USDC`);

  console.log("=== Claude agent workflow complete ===");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Claude agent example failed.");
  console.error(message);
  console.error("Checklist:");
  console.error("- Confirm BASE_SEPOLIA_RPC_URL points to Base Sepolia.");
  console.error("- Confirm ORYN_PAYMENT_CONTRACT_ADDRESS is a deployed OrynPayment contract.");
  console.error(`- Confirm both "${CLAUDE_AGENT_ID}" and "${COMPUTE_AGENT_ID}" are registered, or let this script register the Claude agent.`);
  console.error("- Confirm the wallet has Base Sepolia ETH for gas and USDC for payment.");
  console.error("- Confirm ANTHROPIC_API_KEY is set.");
  process.exitCode = 1;
});
