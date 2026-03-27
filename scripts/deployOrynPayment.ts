import "dotenv/config";
import hre from "hardhat";
import { getAddress, isAddress } from "ethers";

const BASE_MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const DEFAULT_FEE_BPS = 30;

function requireAddress(value: string | undefined, label: string): string {
  if (!value || !isAddress(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return getAddress(value);
}

function resolveUsdcAddress(networkName: string): string {
  if (networkName === "base") {
    return BASE_MAINNET_USDC;
  }

  if (networkName === "baseSepolia") {
    return BASE_SEPOLIA_USDC;
  }

  throw new Error(`Unsupported network: ${networkName}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const networkName = hre.network.name;

  if (networkName !== "base" && networkName !== "baseSepolia") {
    throw new Error("Deployment is only supported on base or baseSepolia");
  }

  const treasury = requireAddress(process.env.TREASURY_ADDRESS, "TREASURY_ADDRESS");
  const usdc = resolveUsdcAddress(networkName);

  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const deployerBalance = await hre.ethers.provider.getBalance(deployerAddress);

  console.log(`Network: ${networkName}`);
  console.log(`Deployer: ${deployerAddress}`);
  console.log(`Deployer balance: ${hre.ethers.formatEther(deployerBalance)} ETH`);
  console.log(`USDC: ${usdc}`);
  console.log(`Treasury: ${treasury}`);
  console.log(`Fee (bps): ${DEFAULT_FEE_BPS}`);

  const factory = await hre.ethers.getContractFactory("OrynPayment");
  const contract = await factory.deploy(usdc, treasury, DEFAULT_FEE_BPS);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();

  console.log(`OrynPayment deployed to: ${contractAddress}`);

  const deployedCode = await hre.ethers.provider.getCode(contractAddress);
  if (deployedCode === "0x") {
    throw new Error(`Deployment returned address ${contractAddress}, but no code was found at that address`);
  }

  let verified = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      console.log(`Owner: ${await contract.owner()}`);
      console.log(`Treasury: ${await contract.treasury()}`);
      console.log(`Fee (bps): ${(await contract.feeBps()).toString()}`);
      verified = true;
      break;
    } catch (error) {
      if (attempt === 3) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: deployed contract readback failed after deployment: ${message}`);
        console.warn("The contract address above is still valid if code exists at that address.");
      } else {
        console.log(`Readback not ready yet, retrying (${attempt}/3)...`);
        await sleep(2_000);
      }
    }
  }

  if (!verified) {
    console.log(`Use this contract address in .env: ${contractAddress}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
