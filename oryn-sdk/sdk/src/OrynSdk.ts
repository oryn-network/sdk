import {
  Contract,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  encodeBytes32String,
  formatUnits,
  getAddress,
  isAddress,
  isHexString,
  parseUnits,
  toUtf8Bytes,
  type TransactionReceipt
} from "ethers";
import OrynPaymentArtifact from "../../artifacts/contracts/OrynPayment.sol/OrynPayment.json";

const BASE_MAINNET_CHAIN_ID = 8453;
const USDC_DECIMALS = 6;
const MAX_PAYMENT_USDC = 100;
const ERC20_ABI = [
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)"
] as const;

type Address = `0x${string}`;

export interface OrynSDKOptions {
  contractAddress: Address | string;
  usdcAddress?: Address | string;
  chainId?: number;
}

interface OrynPaymentContract {
  registerAgent(agentId: string): Promise<{ wait(): Promise<TransactionReceipt | null> }>;
  payAgent(agentId: string, amount: bigint): Promise<{ wait(): Promise<TransactionReceipt | null> }>;
  getAgentWallet(agentId: string): Promise<string>;
  getAgentId(wallet: string): Promise<string>;
  quoteFee(amount: bigint): Promise<bigint>;
}

interface ERC20Contract {
  approve(spender: string, amount: bigint): Promise<{ wait(): Promise<TransactionReceipt | null> }>;
  allowance(owner: string, spender: string): Promise<bigint>;
  balanceOf(owner: string): Promise<bigint>;
}

/**
 * TypeScript SDK wrapper for the Oryn `OrynPayment` contract on Base.
 */
export class OrynSDK {
  private readonly contractAddress: Address;
  private readonly usdcAddress: Address;
  private readonly chainId: number;

  private provider?: JsonRpcProvider;
  private wallet?: Wallet;
  private contract?: OrynPaymentContract;
  private usdc?: ERC20Contract;

  constructor(options: OrynSDKOptions) {
    this.contractAddress = this.normalizeAddress(options.contractAddress, "contract address");
    this.usdcAddress = this.normalizeAddress(
      options.usdcAddress ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "USDC address"
    );
    this.chainId = options.chainId ?? BASE_MAINNET_CHAIN_ID;
  }

  /**
   * Initialises the SDK with a wallet and connects it to a Base RPC endpoint.
   */
  public async connect(privateKey: string, rpcUrl: string): Promise<void> {
    try {
      const normalizedPrivateKey = this.normalizePrivateKey(privateKey);

      if (normalizedPrivateKey.length !== 66) {
        throw new Error("Expected a 32-byte hex private key");
      }

      if (!rpcUrl) {
        throw new Error("RPC URL is required");
      }

      const provider = new JsonRpcProvider(rpcUrl, this.chainId);
      const network = await provider.getNetwork();

      if (Number(network.chainId) !== this.chainId) {
        throw new Error(`Connected chain ID ${network.chainId.toString()} does not match expected Base chain ID ${this.chainId}`);
      }

      const wallet = new Wallet(normalizedPrivateKey, provider);
      this.provider = provider;
      this.wallet = wallet;
      this.contract = new Contract(this.contractAddress, OrynPaymentArtifact.abi, wallet) as unknown as OrynPaymentContract;
      this.usdc = new Contract(this.usdcAddress, ERC20_ABI, wallet) as unknown as ERC20Contract;
    } catch (error) {
      throw this.createError("Failed to connect SDK", error);
    }
  }

  /**
   * Registers the connected wallet as an agent with the given agent ID.
   */
  public async registerAgent(agentId: string): Promise<TransactionReceipt> {
    try {
      const contract = this.requireContract();
      const encodedAgentId = this.toAgentIdBytes32(agentId);
      const tx = await contract.registerAgent(encodedAgentId);

      return await this.waitForReceipt(tx.wait(), "register agent transaction");
    } catch (error) {
      throw this.createError(`Failed to register agent "${agentId}"`, error);
    }
  }

  /**
   * Sends a USDC payment between two registered agents and automatically approves USDC if needed.
   */
  public async pay(fromAgentId: string, toAgentId: string, amountUSDC: number): Promise<TransactionReceipt> {
    try {
      const wallet = this.requireWallet();
      const contract = this.requireContract();
      const usdc = this.requireUsdc();

      const fromAgentBytes = this.toAgentIdBytes32(fromAgentId);
      const toAgentBytes = this.toAgentIdBytes32(toAgentId);
      const amount = this.parseUsdcAmount(amountUSDC);

      const signerAddress = await wallet.getAddress();
      const registeredAgentId = await contract.getAgentId(signerAddress);

      if (registeredAgentId === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        throw new Error("Connected wallet is not registered as an agent");
      }

      if (registeredAgentId.toLowerCase() !== fromAgentBytes.toLowerCase()) {
        throw new Error("Connected wallet does not match the provided fromAgentId");
      }

      const allowance = await usdc.allowance(signerAddress, this.contractAddress);
      if (allowance < amount) {
        const approvalTx = await usdc.approve(this.contractAddress, amount);
        await this.waitForReceipt(approvalTx.wait(), "USDC approval transaction");
      }

      const paymentTx = await contract.payAgent(toAgentBytes, amount);
      return await this.waitForReceipt(paymentTx.wait(), "payment transaction");
    } catch (error) {
      throw this.createError(
        `Failed to pay ${amountUSDC} USDC from "${fromAgentId}" to "${toAgentId}"`,
        error
      );
    }
  }

  /**
   * Returns the wallet address registered for the provided agent ID.
   */
  public async getAgentAddress(agentId: string): Promise<string> {
    try {
      const contract = this.requireContract();
      const encodedAgentId = this.toAgentIdBytes32(agentId);
      const walletAddress = await contract.getAgentWallet(encodedAgentId);

      if (!isAddress(walletAddress) || walletAddress === ZeroAddress) {
        throw new Error("Agent is not registered");
      }

      return getAddress(walletAddress);
    } catch (error) {
      throw this.createError(`Failed to fetch address for agent "${agentId}"`, error);
    }
  }

  /**
   * Returns the USDC balance of the given agent in human-readable units.
   */
  public async getBalance(agentId: string): Promise<number> {
    try {
      const usdc = this.requireUsdc();
      const walletAddress = await this.getAgentAddress(agentId);
      const rawBalance = await usdc.balanceOf(walletAddress);

      return Number(formatUnits(rawBalance, USDC_DECIMALS));
    } catch (error) {
      throw this.createError(`Failed to fetch USDC balance for agent "${agentId}"`, error);
    }
  }

  /**
   * Returns the live protocol fee in USDC for a payment amount by reading the contract.
   */
  public async estimateFee(amountUSDC: number): Promise<number> {
    try {
      const contract = this.requireContract();
      this.validateAmount(amountUSDC);
      const fee = await contract.quoteFee(this.parseUsdcAmount(amountUSDC));

      return Number(formatUnits(fee, USDC_DECIMALS));
    } catch (error) {
      throw this.createError(`Failed to estimate fee for ${amountUSDC} USDC`, error);
    }
  }

  private requireWallet(): Wallet {
    if (!this.wallet) {
      throw new Error("SDK is not connected. Call connect(privateKey, rpcUrl) first");
    }

    return this.wallet;
  }

  private requireContract(): OrynPaymentContract {
    if (!this.contract) {
      throw new Error("SDK is not connected. Call connect(privateKey, rpcUrl) first");
    }

    return this.contract;
  }

  private requireUsdc(): ERC20Contract {
    if (!this.usdc) {
      throw new Error("SDK is not connected. Call connect(privateKey, rpcUrl) first");
    }

    return this.usdc;
  }

  private normalizeAddress(value: string, label: string): Address {
    if (!isAddress(value)) {
      throw new Error(`Invalid ${label}: ${value}`);
    }

    return getAddress(value) as Address;
  }

  private normalizePrivateKey(privateKey: string): string {
    if (!privateKey) {
      throw new Error("Private key is required");
    }

    return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  }

  private toAgentIdBytes32(agentId: string): string {
    if (!agentId) {
      throw new Error("agentId is required");
    }

    if (isHexString(agentId, 32)) {
      return agentId;
    }

    if (toUtf8Bytes(agentId).length > 31) {
      throw new Error("agentId must be a 32-byte hex string or a UTF-8 string up to 31 bytes");
    }

    return encodeBytes32String(agentId);
  }

  private parseUsdcAmount(amountUSDC: number): bigint {
    this.validateAmount(amountUSDC);
    return parseUnits(amountUSDC.toFixed(6), USDC_DECIMALS);
  }

  private validateAmount(amountUSDC: number): void {
    if (!Number.isFinite(amountUSDC)) {
      throw new Error("amountUSDC must be a finite number");
    }

    if (amountUSDC <= 0) {
      throw new Error("amountUSDC must be greater than 0");
    }

    if (amountUSDC > MAX_PAYMENT_USDC) {
      throw new Error(`amountUSDC exceeds the v1 safety limit of ${MAX_PAYMENT_USDC} USDC`);
    }
  }

  private async waitForReceipt(
    receiptPromise: Promise<TransactionReceipt | null>,
    actionLabel: string
  ): Promise<TransactionReceipt> {
    const receipt = await receiptPromise;

    if (!receipt) {
      throw new Error(`No receipt returned for ${actionLabel}`);
    }

    return receipt;
  }

  private createError(prefix: string, error: unknown): Error {
    if (error instanceof Error) {
      return new Error(`${prefix}: ${error.message}`);
    }

    return new Error(`${prefix}: Unknown error`);
  }
}

export type { Address };
