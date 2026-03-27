import { expect } from "chai";
import { ethers } from "hardhat";

describe("OrynPayment", () => {
  const INITIAL_FEE_BPS = 30n;
  const MAX_FEE_BPS = 500n;
  const MAX_PAYMENT = 100_000_000n;
  const TREASURY_FEE_ON_MAX = 300_000n;
  const AGENT_ONE_ID = ethers.encodeBytes32String("agent-one");
  const AGENT_TWO_ID = ethers.encodeBytes32String("agent-two");
  const AGENT_THREE_ID = ethers.encodeBytes32String("agent-three");

  async function deployFixture() {
    const [owner, treasury, agentOne, agentTwo, outsider] = await ethers.getSigners();

    const mockUsdcFactory = await ethers.getContractFactory("MockUSDC");
    const usdc = await mockUsdcFactory.deploy();
    await usdc.waitForDeployment();

    const paymentFactory = await ethers.getContractFactory("OrynPayment");
    const payment = await paymentFactory.deploy(await usdc.getAddress(), treasury.address, INITIAL_FEE_BPS);
    await payment.waitForDeployment();

    await usdc.mint(agentOne.address, 500_000_000n);
    await usdc.mint(agentTwo.address, 500_000_000n);

    return { owner, treasury, agentOne, agentTwo, outsider, usdc, payment };
  }

  describe("constructor", () => {
    it("emits an initialization event", async () => {
      const [owner, treasury] = await ethers.getSigners();
      const mockUsdcFactory = await ethers.getContractFactory("MockUSDC");
      const usdc = await mockUsdcFactory.deploy();
      await usdc.waitForDeployment();

      const paymentFactory = await ethers.getContractFactory("OrynPayment");
      const payment = await paymentFactory.deploy(await usdc.getAddress(), treasury.address, INITIAL_FEE_BPS);

      await expect(payment.deploymentTransaction())
        .to.emit(payment, "Initialized")
        .withArgs(owner.address, await usdc.getAddress(), treasury.address, INITIAL_FEE_BPS);
    });

    it("sets the immutable token, treasury, fee, and owner", async () => {
      const { owner, treasury, usdc, payment } = await deployFixture();

      expect(await payment.owner()).to.equal(owner.address);
      expect(await payment.usdc()).to.equal(await usdc.getAddress());
      expect(await payment.treasury()).to.equal(treasury.address);
      expect(await payment.feeBps()).to.equal(INITIAL_FEE_BPS);
    });

    it("reverts for a zero USDC address", async () => {
      const [, treasury] = await ethers.getSigners();
      const paymentFactory = await ethers.getContractFactory("OrynPayment");

      await expect(
        paymentFactory.deploy(ethers.ZeroAddress, treasury.address, INITIAL_FEE_BPS)
      ).to.be.revertedWithCustomError(paymentFactory, "InvalidWallet");
    });

    it("reverts for a zero treasury address", async () => {
      const mockUsdcFactory = await ethers.getContractFactory("MockUSDC");
      const usdc = await mockUsdcFactory.deploy();
      await usdc.waitForDeployment();

      const paymentFactory = await ethers.getContractFactory("OrynPayment");
      await expect(
        paymentFactory.deploy(await usdc.getAddress(), ethers.ZeroAddress, INITIAL_FEE_BPS)
      ).to.be.revertedWithCustomError(paymentFactory, "InvalidTreasury");
    });

    it("reverts when fee bps exceeds the max fee cap", async () => {
      const [owner] = await ethers.getSigners();
      const mockUsdcFactory = await ethers.getContractFactory("MockUSDC");
      const usdc = await mockUsdcFactory.deploy();
      await usdc.waitForDeployment();

      const paymentFactory = await ethers.getContractFactory("OrynPayment");
      await expect(
        paymentFactory.deploy(await usdc.getAddress(), owner.address, MAX_FEE_BPS + 1n)
      ).to.be.revertedWithCustomError(paymentFactory, "InvalidFeeBps");
    });

    it("accepts the exact max fee cap", async () => {
      const [owner] = await ethers.getSigners();
      const mockUsdcFactory = await ethers.getContractFactory("MockUSDC");
      const usdc = await mockUsdcFactory.deploy();
      await usdc.waitForDeployment();

      const paymentFactory = await ethers.getContractFactory("OrynPayment");
      const payment = await paymentFactory.deploy(await usdc.getAddress(), owner.address, MAX_FEE_BPS);
      await payment.waitForDeployment();

      expect(await payment.feeBps()).to.equal(MAX_FEE_BPS);
    });
  });

  describe("registerAgent", () => {
    it("registers a unique agent id for the caller wallet", async () => {
      const { payment, agentOne } = await deployFixture();

      await expect(payment.connect(agentOne).registerAgent(AGENT_ONE_ID))
        .to.emit(payment, "AgentRegistered")
        .withArgs(AGENT_ONE_ID, agentOne.address);

      expect(await payment.getAgentWallet(AGENT_ONE_ID)).to.equal(agentOne.address);
      expect(await payment.getAgentId(agentOne.address)).to.equal(AGENT_ONE_ID);
    });

    it("reverts for a zero agent id", async () => {
      const { payment, agentOne } = await deployFixture();

      await expect(payment.connect(agentOne).registerAgent(ethers.ZeroHash))
        .to.be.revertedWithCustomError(payment, "InvalidAgentId");
    });

    it("reverts when the agent id is already registered", async () => {
      const { payment, agentOne, agentTwo } = await deployFixture();

      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);

      await expect(payment.connect(agentTwo).registerAgent(AGENT_ONE_ID))
        .to.be.revertedWithCustomError(payment, "AgentIdAlreadyRegistered")
        .withArgs(AGENT_ONE_ID);
    });

    it("reverts when the wallet is already registered to another agent id", async () => {
      const { payment, agentOne } = await deployFixture();

      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);

      await expect(payment.connect(agentOne).registerAgent(AGENT_TWO_ID))
        .to.be.revertedWithCustomError(payment, "WalletAlreadyRegistered")
        .withArgs(agentOne.address);
    });

    it("reverts while paused", async () => {
      const { payment, owner, agentOne } = await deployFixture();

      await payment.connect(owner).pause();

      await expect(payment.connect(agentOne).registerAgent(AGENT_ONE_ID)).to.be.revertedWithCustomError(
        payment,
        "EnforcedPause"
      );
    });
  });

  describe("payAgent", () => {
    it("transfers net USDC to the recipient and the fee to treasury", async () => {
      const { payment, treasury, agentOne, agentTwo, usdc } = await deployFixture();
      const amount = 25_000_000n;
      const expectedFee = 75_000n;
      const expectedRecipientAmount = amount - expectedFee;

      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);
      await payment.connect(agentTwo).registerAgent(AGENT_TWO_ID);
      await usdc.connect(agentOne).approve(await payment.getAddress(), amount);

      await expect(payment.connect(agentOne).payAgent(AGENT_TWO_ID, amount))
        .to.emit(payment, "PaymentSent")
        .withArgs(AGENT_ONE_ID, AGENT_TWO_ID, amount, expectedFee);

      expect(await usdc.balanceOf(agentOne.address)).to.equal(500_000_000n - amount);
      expect(await usdc.balanceOf(agentTwo.address)).to.equal(500_000_000n + expectedRecipientAmount);
      expect(await usdc.balanceOf(treasury.address)).to.equal(expectedFee);
      expect(await usdc.balanceOf(await payment.getAddress())).to.equal(0);
    });

    it("supports the exact 100 USDC max payment", async () => {
      const { payment, treasury, agentOne, agentTwo, usdc } = await deployFixture();

      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);
      await payment.connect(agentTwo).registerAgent(AGENT_TWO_ID);
      await usdc.connect(agentOne).approve(await payment.getAddress(), MAX_PAYMENT);

      await payment.connect(agentOne).payAgent(AGENT_TWO_ID, MAX_PAYMENT);

      expect(await usdc.balanceOf(treasury.address)).to.equal(TREASURY_FEE_ON_MAX);
    });

    it("supports a zero-fee payment path", async () => {
      const { payment, owner, treasury, agentOne, agentTwo, usdc } = await deployFixture();
      const amount = 25_000_000n;

      await payment.connect(owner).updateFeeBps(0);
      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);
      await payment.connect(agentTwo).registerAgent(AGENT_TWO_ID);
      await usdc.connect(agentOne).approve(await payment.getAddress(), amount);

      await expect(payment.connect(agentOne).payAgent(AGENT_TWO_ID, amount))
        .to.emit(payment, "PaymentSent")
        .withArgs(AGENT_ONE_ID, AGENT_TWO_ID, amount, 0);

      expect(await usdc.balanceOf(agentOne.address)).to.equal(500_000_000n - amount);
      expect(await usdc.balanceOf(agentTwo.address)).to.equal(500_000_000n + amount);
      expect(await usdc.balanceOf(treasury.address)).to.equal(0);
      expect(await usdc.balanceOf(await payment.getAddress())).to.equal(0);
    });

    it("reverts when the sender is not a registered agent", async () => {
      const { payment, agentTwo, outsider } = await deployFixture();

      await payment.connect(agentTwo).registerAgent(AGENT_TWO_ID);

      await expect(payment.connect(outsider).payAgent(AGENT_TWO_ID, 1_000_000n))
        .to.be.revertedWithCustomError(payment, "AgentNotRegistered")
        .withArgs(ethers.ZeroHash);
    });

    it("reverts when the recipient agent id is zero", async () => {
      const { payment, agentOne } = await deployFixture();

      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);

      await expect(payment.connect(agentOne).payAgent(ethers.ZeroHash, 1_000_000n))
        .to.be.revertedWithCustomError(payment, "InvalidAgentId");
    });

    it("reverts when the recipient is not registered", async () => {
      const { payment, agentOne, usdc } = await deployFixture();

      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);
      await usdc.connect(agentOne).approve(await payment.getAddress(), 1_000_000n);

      await expect(payment.connect(agentOne).payAgent(AGENT_THREE_ID, 1_000_000n))
        .to.be.revertedWithCustomError(payment, "AgentNotRegistered")
        .withArgs(AGENT_THREE_ID);
    });

    it("reverts on self-payment", async () => {
      const { payment, agentOne, usdc } = await deployFixture();

      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);
      await usdc.connect(agentOne).approve(await payment.getAddress(), 1_000_000n);

      await expect(payment.connect(agentOne).payAgent(AGENT_ONE_ID, 1_000_000n))
        .to.be.revertedWithCustomError(payment, "SelfPaymentNotAllowed");
    });

    it("reverts for zero amount", async () => {
      const { payment, agentOne, agentTwo } = await deployFixture();

      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);
      await payment.connect(agentTwo).registerAgent(AGENT_TWO_ID);

      await expect(payment.connect(agentOne).payAgent(AGENT_TWO_ID, 0))
        .to.be.revertedWithCustomError(payment, "InvalidAmount")
        .withArgs(0);
    });

    it("reverts above the v1 safety cap", async () => {
      const { payment, agentOne, agentTwo, usdc } = await deployFixture();
      const aboveMax = MAX_PAYMENT + 1n;

      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);
      await payment.connect(agentTwo).registerAgent(AGENT_TWO_ID);
      await usdc.connect(agentOne).approve(await payment.getAddress(), aboveMax);

      await expect(payment.connect(agentOne).payAgent(AGENT_TWO_ID, aboveMax))
        .to.be.revertedWithCustomError(payment, "InvalidAmount")
        .withArgs(aboveMax);
    });

    it("reverts while paused", async () => {
      const { payment, owner, agentOne, agentTwo, usdc } = await deployFixture();

      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);
      await payment.connect(agentTwo).registerAgent(AGENT_TWO_ID);
      await usdc.connect(agentOne).approve(await payment.getAddress(), 1_000_000n);
      await payment.connect(owner).pause();

      await expect(payment.connect(agentOne).payAgent(AGENT_TWO_ID, 1_000_000n)).to.be.revertedWithCustomError(
        payment,
        "EnforcedPause"
      );
    });

    it("reverts when allowance is insufficient", async () => {
      const { payment, agentOne, agentTwo } = await deployFixture();

      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);
      await payment.connect(agentTwo).registerAgent(AGENT_TWO_ID);

      await expect(payment.connect(agentOne).payAgent(AGENT_TWO_ID, 1_000_000n)).to.be.reverted;
    });
  });

  describe("owner controls", () => {
    it("updates the treasury", async () => {
      const { payment, owner, outsider } = await deployFixture();

      await expect(payment.connect(owner).updateTreasury(outsider.address))
        .to.emit(payment, "TreasuryUpdated")
        .withArgs(outsider.address);

      expect(await payment.treasury()).to.equal(outsider.address);
    });

    it("rejects a zero treasury update", async () => {
      const { payment, owner } = await deployFixture();

      await expect(payment.connect(owner).updateTreasury(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(payment, "InvalidTreasury");
    });

    it("prevents non-owners from updating the treasury", async () => {
      const { payment, outsider } = await deployFixture();

      await expect(payment.connect(outsider).updateTreasury(outsider.address))
        .to.be.revertedWithCustomError(payment, "OwnableUnauthorizedAccount")
        .withArgs(outsider.address);
    });

    it("updates the fee bps", async () => {
      const { payment, owner } = await deployFixture();

      await expect(payment.connect(owner).updateFeeBps(45))
        .to.emit(payment, "FeeUpdated")
        .withArgs(45);

      expect(await payment.feeBps()).to.equal(45);
    });

    it("applies an updated fee to future quotes", async () => {
      const { payment, owner } = await deployFixture();

      await payment.connect(owner).updateFeeBps(50);

      expect(await payment.quoteFee(10_000_000n)).to.equal(50_000n);
    });

    it("rejects a fee bps update above the max fee cap", async () => {
      const { payment, owner } = await deployFixture();

      await expect(payment.connect(owner).updateFeeBps(MAX_FEE_BPS + 1n))
        .to.be.revertedWithCustomError(payment, "InvalidFeeBps")
        .withArgs(MAX_FEE_BPS + 1n);
    });

    it("prevents non-owners from updating the fee", async () => {
      const { payment, outsider } = await deployFixture();

      await expect(payment.connect(outsider).updateFeeBps(45))
        .to.be.revertedWithCustomError(payment, "OwnableUnauthorizedAccount")
        .withArgs(outsider.address);
    });

    it("allows the owner to pause and unpause", async () => {
      const { payment, owner } = await deployFixture();

      await payment.connect(owner).pause();
      expect(await payment.paused()).to.equal(true);

      await payment.connect(owner).unpause();
      expect(await payment.paused()).to.equal(false);
    });

    it("allows normal usage after unpausing", async () => {
      const { payment, owner, treasury, agentOne, agentTwo, usdc } = await deployFixture();
      const amount = 1_000_000n;
      const fee = 3_000n;

      await payment.connect(owner).pause();
      await payment.connect(owner).unpause();

      await payment.connect(agentOne).registerAgent(AGENT_ONE_ID);
      await payment.connect(agentTwo).registerAgent(AGENT_TWO_ID);
      await usdc.connect(agentOne).approve(await payment.getAddress(), amount);

      await expect(payment.connect(agentOne).payAgent(AGENT_TWO_ID, amount))
        .to.emit(payment, "PaymentSent")
        .withArgs(AGENT_ONE_ID, AGENT_TWO_ID, amount, fee);

      expect(await usdc.balanceOf(treasury.address)).to.equal(fee);
    });

    it("prevents non-owners from pausing and unpausing", async () => {
      const { payment, outsider } = await deployFixture();

      await expect(payment.connect(outsider).pause())
        .to.be.revertedWithCustomError(payment, "OwnableUnauthorizedAccount")
        .withArgs(outsider.address);
      await expect(payment.connect(outsider).unpause())
        .to.be.revertedWithCustomError(payment, "OwnableUnauthorizedAccount")
        .withArgs(outsider.address);
    });
  });

  describe("view helpers", () => {
    it("quotes fees for a valid amount", async () => {
      const { payment } = await deployFixture();

      expect(await payment.quoteFee(10_000_000n)).to.equal(30_000n);
    });

    it("can return a zero fee for tiny payments due to integer rounding", async () => {
      const { payment } = await deployFixture();

      expect(await payment.quoteFee(333n)).to.equal(0);
    });

    it("rejects quoteFee for invalid amounts", async () => {
      const { payment } = await deployFixture();

      await expect(payment.quoteFee(0)).to.be.revertedWithCustomError(payment, "InvalidAmount").withArgs(0);
      await expect(payment.quoteFee(MAX_PAYMENT + 1n))
        .to.be.revertedWithCustomError(payment, "InvalidAmount")
        .withArgs(MAX_PAYMENT + 1n);
    });

    it("returns zero values for unknown agent mappings", async () => {
      const { payment, outsider } = await deployFixture();

      expect(await payment.getAgentWallet(AGENT_THREE_ID)).to.equal(ethers.ZeroAddress);
      expect(await payment.getAgentId(outsider.address)).to.equal(ethers.ZeroHash);
    });
  });
});
