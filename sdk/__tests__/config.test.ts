import { buildConfigFromEnv, normalizeAddress } from "../src/config";

describe("config helpers", () => {
  afterEach(() => {
    delete process.env.BASE_RPC_URL;
    delete process.env.PRIVATE_KEY;
    delete process.env.USDC_ADDRESS;
  });

  it("normalizes a valid address", () => {
    expect(normalizeAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "usdc")).toBe(
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    );
  });

  it("throws for an invalid address", () => {
    expect(() => normalizeAddress("0x1234", "contract")).toThrow("Invalid contract");
  });

  it("builds a Base config from environment variables", () => {
    process.env.BASE_RPC_URL = "https://mainnet.base.org";
    process.env.PRIVATE_KEY =
      "0x1111111111111111111111111111111111111111111111111111111111111111";
    process.env.USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

    expect(
      buildConfigFromEnv("0x1111111111111111111111111111111111111111")
    ).toStrictEqual({
      rpcUrl: "https://mainnet.base.org",
      privateKey: "0x1111111111111111111111111111111111111111111111111111111111111111",
      contractAddress: "0x1111111111111111111111111111111111111111",
      usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      chainId: 8453
    });
  });
});

