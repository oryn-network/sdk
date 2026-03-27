import { getAddress, isAddress } from "ethers";
import type { Address, OrynSdkConfig } from "./types";

function requireEnv(name: "BASE_RPC_URL" | "PRIVATE_KEY" | "USDC_ADDRESS"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function normalizeAddress(value: string, label: string): Address {
  if (!isAddress(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return getAddress(value) as Address;
}

export function buildConfigFromEnv(contractAddress: string): OrynSdkConfig {
  return {
    rpcUrl: requireEnv("BASE_RPC_URL"),
    privateKey: requireEnv("PRIVATE_KEY"),
    contractAddress: normalizeAddress(contractAddress, "contract address"),
    usdcAddress: normalizeAddress(requireEnv("USDC_ADDRESS"), "USDC address"),
    chainId: 8453
  };
}

