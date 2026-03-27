import "dotenv/config";
import hre from "hardhat";
import { OrynSDK } from "../sdk/src";

async function main(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY;
  const treasuryAddress = process.env.TREASURY_ADDRESS;
  const rpcUrl =
    hre.network.name === "baseSepolia"
      ? process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"
      : process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
  const usdcAddress =
    hre.network.name === "baseSepolia"
      ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
      : process.env.USDC_ADDRESS ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required");
  }

  if (!treasuryAddress) {
    throw new Error("TREASURY_ADDRESS is required");
  }

  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  const factory = await hre.ethers.getContractFactory("OrynPayment");
  const contract = await factory.deploy(usdcAddress, treasuryAddress, 30);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  const sdk = new OrynSDK({
    contractAddress,
    usdcAddress,
    chainId: hre.network.name === "baseSepolia" ? 84532 : 8453
  });

  await sdk.connect(privateKey, rpcUrl);
  const registerReceipt = await sdk.registerAgent("demo-agent-001");
  const balance = await sdk.getBalance("demo-agent-001");

  console.log("Deployer:", deployerAddress);
  console.log("Network:", hre.network.name);
  console.log("OrynPayment contract:", contractAddress);
  console.log("Registered agent:", "demo-agent-001");
  console.log("Register tx:", registerReceipt.hash);
  console.log("Current balance:", balance);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
