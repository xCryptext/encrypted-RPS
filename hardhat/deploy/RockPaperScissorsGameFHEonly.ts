import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying Rock Paper Scissors FHE Game Contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Contract parameters
  const MAX_ORACLE_RESPONSE_DELAY = 600; // 10 minutes
  const PLATFORM_FEE_PERCENT = 250; // 2.5%
  const FEE_RECIPIENT = deployer.address;
  const MIN_BET = ethers.parseEther("0.001"); // 0.001 ETH minimum bet
  const MAX_BET = ethers.parseEther("0.1"); // 0.1 ETH maximum bet

  console.log("Contract parameters:");
  console.log("- Max Oracle Response Delay:", MAX_ORACLE_RESPONSE_DELAY, "seconds");
  console.log("- Platform Fee Percent:", PLATFORM_FEE_PERCENT, "basis points (2.5%)");
  console.log("- Fee Recipient:", FEE_RECIPIENT);
  console.log("- Min Bet:", ethers.formatEther(MIN_BET), "ETH");
  console.log("- Max Bet:", ethers.formatEther(MAX_BET), "ETH");

  // Get the contract factory
  const RockPaperScissorsGameFHE = await ethers.getContractFactory("RockPaperScissorsGame_FHE_ResultOnly");

  // Deploy the contract
  console.log("Deploying contract...");
  const contract = await RockPaperScissorsGameFHE.deploy(
    MAX_ORACLE_RESPONSE_DELAY,
    PLATFORM_FEE_PERCENT,
    FEE_RECIPIENT,
    MIN_BET,
    MAX_BET
  );

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("✅ Contract deployed successfully!");
  console.log("Contract Address:", contractAddress);

  // Verify deployment
  console.log("\n🔍 Verifying deployment...");
  const gameIdCounter = await contract.gameIdCounter();
  const platformFeePercent = await contract.platformFeePercent();
  const minBet = await contract.minBet();
  const maxBet = await contract.maxBet();
  const paused = await contract.paused();

  console.log("Contract state:");
  console.log("- Game ID Counter:", gameIdCounter.toString());
  console.log("- Platform Fee Percent:", platformFeePercent.toString(), "basis points");
  console.log("- Min Bet:", ethers.formatEther(minBet), "ETH");
  console.log("- Max Bet:", ethers.formatEther(maxBet), "ETH");
  console.log("- Paused:", paused);

  // Save deployment info
  const deploymentInfo = {
    contractAddress,
    network: await ethers.provider.getNetwork(),
    deploymentTime: new Date().toISOString(),
    parameters: {
      maxOracleResponseDelay: MAX_ORACLE_RESPONSE_DELAY,
      platformFeePercent: PLATFORM_FEE_PERCENT,
      feeRecipient: FEE_RECIPIENT,
      minBet: ethers.formatEther(MIN_BET),
      maxBet: ethers.formatEther(MAX_BET)
    }
  };

  console.log("\n📋 Deployment Summary:");
  console.log("Contract Address:", contractAddress);
  console.log("Network:", deploymentInfo.network.name, "(", deploymentInfo.network.chainId, ")");
  console.log("Deployment Time:", deploymentInfo.deploymentTime);

  return deploymentInfo;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
