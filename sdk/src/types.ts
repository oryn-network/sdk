export type Address = `0x${string}`;

export interface OrynSdkConfig {
  rpcUrl: string;
  privateKey?: string;
  contractAddress: Address;
  usdcAddress: Address;
  chainId?: number;
}

export interface AgentRegistration {
  agentId: string;
  wallet: Address;
}

export interface PaymentQuote {
  amount: bigint;
  fee: bigint;
}

export interface TransactionResult {
  txHash: string;
}
