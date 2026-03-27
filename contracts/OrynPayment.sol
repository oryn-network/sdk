// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract OrynPayment is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MAX_FEE_BPS = 500;
    uint256 public constant MAX_PAYMENT = 100e6;

    IERC20 public immutable usdc;
    address public treasury;
    uint256 public feeBps;

    mapping(bytes32 agentId => address wallet) private agentWallets;
    mapping(address wallet => bytes32 agentId) private walletAgentIds;

    event AgentRegistered(bytes32 agentId, address wallet);
    event PaymentSent(bytes32 fromAgent, bytes32 toAgent, uint256 amount, uint256 fee);
    event TreasuryUpdated(address newTreasury);
    event FeeUpdated(uint256 newFeeBps);
    event Initialized(address indexed owner, address indexed usdc, address indexed treasury, uint256 feeBps);

    error AgentIdAlreadyRegistered(bytes32 agentId);
    error WalletAlreadyRegistered(address wallet);
    error AgentNotRegistered(bytes32 agentId);
    error InvalidAgentId();
    error InvalidWallet();
    error InvalidTreasury();
    error InvalidFeeBps(uint256 feeBps);
    error InvalidAmount(uint256 amount);
    error SelfPaymentNotAllowed();

    constructor(address usdcAddress, address treasuryAddress, uint256 initialFeeBps) Ownable(msg.sender) {
        if (usdcAddress == address(0)) revert InvalidWallet();
        if (treasuryAddress == address(0)) revert InvalidTreasury();
        if (initialFeeBps > MAX_FEE_BPS) revert InvalidFeeBps(initialFeeBps);

        usdc = IERC20(usdcAddress);
        treasury = treasuryAddress;
        feeBps = initialFeeBps;

        emit Initialized(msg.sender, usdcAddress, treasuryAddress, initialFeeBps);
    }

    // v1 intentionally has no deregistration or key rotation flow. A wallet keeps its
    // agentId permanently once registered, so integrators should manage keys carefully.
    function registerAgent(bytes32 agentId) external whenNotPaused {
        if (agentId == bytes32(0)) revert InvalidAgentId();
        if (agentWallets[agentId] != address(0)) revert AgentIdAlreadyRegistered(agentId);
        if (walletAgentIds[msg.sender] != bytes32(0)) revert WalletAlreadyRegistered(msg.sender);

        agentWallets[agentId] = msg.sender;
        walletAgentIds[msg.sender] = agentId;

        emit AgentRegistered(agentId, msg.sender);
    }

    function payAgent(bytes32 toAgentId, uint256 amount) external whenNotPaused nonReentrant {
        bytes32 fromAgentId = walletAgentIds[msg.sender];
        if (fromAgentId == bytes32(0)) revert AgentNotRegistered(bytes32(0));
        if (toAgentId == bytes32(0)) revert InvalidAgentId();

        address recipient = agentWallets[toAgentId];
        if (recipient == address(0)) revert AgentNotRegistered(toAgentId);
        if (fromAgentId == toAgentId) revert SelfPaymentNotAllowed();
        if (amount == 0 || amount > MAX_PAYMENT) revert InvalidAmount(amount);

        uint256 fee = (amount * feeBps) / BASIS_POINTS;
        uint256 recipientAmount = amount - fee;

        // Pull the full payment into the contract first so settlement is atomic
        // from the protocol's perspective before funds are distributed onward.
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        usdc.safeTransfer(recipient, recipientAmount);

        if (fee > 0) {
            usdc.safeTransfer(treasury, fee);
        }

        emit PaymentSent(fromAgentId, toAgentId, amount, fee);
    }

    function updateTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidTreasury();

        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function updateFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFeeBps(newFeeBps);

        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getAgentWallet(bytes32 agentId) external view returns (address) {
        return agentWallets[agentId];
    }

    function getAgentId(address wallet) external view returns (bytes32) {
        return walletAgentIds[wallet];
    }

    function quoteFee(uint256 amount) external view returns (uint256) {
        if (amount == 0 || amount > MAX_PAYMENT) revert InvalidAmount(amount);
        return (amount * feeBps) / BASIS_POINTS;
    }
}
