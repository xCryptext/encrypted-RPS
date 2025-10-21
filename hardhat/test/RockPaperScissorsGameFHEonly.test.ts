import { expect } from "chai";
import { ethers } from "hardhat";

describe("RockPaperScissorsGame_FHE_ResultOnly", function () {
  let contract: any;
  let owner: any;
  let player1: any;
  let player2: any;
  let feeRecipient: any;

  // Test parameters
  const MAX_ORACLE_RESPONSE_DELAY = 600; // 10 minutes
  const PLATFORM_FEE_PERCENT = 250; // 2.5%
  const MIN_BET = ethers.parseEther("0.001");
  const MAX_BET = ethers.parseEther("0.1");

  beforeEach(async function () {
    [owner, player1, player2, feeRecipient] = await ethers.getSigners();

    const RockPaperScissorsGameFHE = await ethers.getContractFactory("RockPaperScissorsGame_FHE_ResultOnly");
    contract = await RockPaperScissorsGameFHE.deploy(
      MAX_ORACLE_RESPONSE_DELAY,
      PLATFORM_FEE_PERCENT,
      feeRecipient.address,
      MIN_BET,
      MAX_BET
    );
    await contract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct initial values", async function () {
      expect(await contract.maxOracleResponseDelay()).to.equal(MAX_ORACLE_RESPONSE_DELAY);
      expect(await contract.platformFeePercent()).to.equal(PLATFORM_FEE_PERCENT);
      expect(await contract.feeRecipient()).to.equal(feeRecipient.address);
      expect(await contract.minBet()).to.equal(MIN_BET);
      expect(await contract.maxBet()).to.equal(MAX_BET);
      expect(await contract.gameIdCounter()).to.equal(0);
      expect(await contract.paused()).to.be.false;
    });

    it("Should set the correct owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });
  });

  describe("Game Creation", function () {
    it("Should create a game successfully", async function () {
      const betAmount = ethers.parseEther("0.01");
      const moveDeadline = Math.floor(Date.now() / 1000) + 300;
      
      // Mock encrypted move and proof
      const encryptedMove = '0x' + '0'.repeat(64);
      const proof = '0x' + '0'.repeat(130);
      
      await expect(contract.connect(player1).createGame(
        encryptedMove,
        proof,
        moveDeadline,
        betAmount,
        { value: betAmount }
      )).to.emit(contract, 'GameCreated')
        .withArgs(1, player1.address, betAmount);
      
      expect(await contract.gameIdCounter()).to.equal(1);
    });

    it("Should reject game creation with invalid bet amount", async function () {
      const betAmount = ethers.parseEther("0.0001"); // Below minimum
      const moveDeadline = Math.floor(Date.now() / 1000) + 300;
      const encryptedMove = '0x' + '0'.repeat(64);
      const proof = '0x' + '0'.repeat(130);
      
      await expect(contract.connect(player1).createGame(
        encryptedMove,
        proof,
        moveDeadline,
        betAmount,
        { value: betAmount }
      )).to.be.revertedWith('Bet amount below minimum');
    });

    it("Should reject game creation with excessive bet amount", async function () {
      const betAmount = ethers.parseEther("0.2"); // Above maximum
      const moveDeadline = Math.floor(Date.now() / 1000) + 300;
      const encryptedMove = '0x' + '0'.repeat(64);
      const proof = '0x' + '0'.repeat(130);
      
      await expect(contract.connect(player1).createGame(
        encryptedMove,
        proof,
        moveDeadline,
        betAmount,
        { value: betAmount }
      )).to.be.revertedWith('Bet amount above maximum');
    });
  });

  describe("Game Joining", function () {
    let gameId: number;
    let betAmount: bigint;

    beforeEach(async function () {
      betAmount = ethers.parseEther("0.01");
      const moveDeadline = Math.floor(Date.now() / 1000) + 300;
      const encryptedMove = '0x' + '0'.repeat(64);
      const proof = '0x' + '0'.repeat(130);
      
      await contract.connect(player1).createGame(
        encryptedMove,
        proof,
        moveDeadline,
        betAmount,
        { value: betAmount }
      );
      
      gameId = 1;
    });

    it("Should join a game successfully", async function () {
      const encryptedMove = '0x' + '1'.repeat(64);
      const proof = '0x' + '0'.repeat(130);
      
      await expect(contract.connect(player2).joinGame(
        gameId,
        encryptedMove,
        proof,
        { value: betAmount }
      )).to.emit(contract, 'GameJoined')
        .withArgs(gameId, player2.address);
    });

    it("Should reject joining non-existent game", async function () {
      const encryptedMove = '0x' + '1'.repeat(64);
      const proof = '0x' + '0'.repeat(130);
      
      await expect(contract.connect(player2).joinGame(
        999, // Non-existent game
        encryptedMove,
        proof,
        { value: betAmount }
      )).to.be.revertedWith('Invalid game ID');
    });
  });

  describe("Move Submission", function () {
    let gameId: number;
    let betAmount: bigint;

    beforeEach(async function () {
      betAmount = ethers.parseEther("0.01");
      const moveDeadline = Math.floor(Date.now() / 1000) + 300;
      const encryptedMove = '0x' + '0'.repeat(64);
      const proof = '0x' + '0'.repeat(130);
      
      // Create and join game
      await contract.connect(player1).createGame(
        encryptedMove,
        proof,
        moveDeadline,
        betAmount,
        { value: betAmount }
      );
      
      await contract.connect(player2).joinGame(
        1,
        encryptedMove,
        proof,
        { value: betAmount }
      );
      
      gameId = 1;
    });

    it("Should submit move successfully", async function () {
      const encryptedMove = '0x' + '0'.repeat(64);
      const proof = '0x' + '0'.repeat(130);
      
      await expect(contract.connect(player1).submitMove(
        gameId,
        encryptedMove,
        proof
      )).to.emit(contract, 'MoveSubmitted')
        .withArgs(gameId, player1.address, true);
    });

    it("Should reject move submission by non-player", async function () {
      const encryptedMove = '0x' + '0'.repeat(64);
      const proof = '0x' + '0'.repeat(130);
      
      await expect(contract.connect(owner).submitMove(
        gameId,
        encryptedMove,
        proof
      )).to.be.revertedWith('Not a game player');
    });
  });

  describe("Admin Functions", function () {
    it("Should pause contract", async function () {
      await expect(contract.pause())
        .to.emit(contract, 'Paused');
      
      expect(await contract.paused()).to.be.true;
    });

    it("Should unpause contract", async function () {
      await contract.pause();
      await expect(contract.unpause())
        .to.emit(contract, 'Unpaused');
      
      expect(await contract.paused()).to.be.false;
    });

    it("Should update platform fee percent", async function () {
      await contract.setPlatformFeePercent(500); // 5%
      expect(await contract.platformFeePercent()).to.equal(500);
    });

    it("Should reject pause by non-owner", async function () {
      await expect(contract.connect(player1).pause())
        .to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe("Game Expiry", function () {
    it("Should expire game when no second player joins", async function () {
      const betAmount = ethers.parseEther("0.01");
      const moveDeadline = Math.floor(Date.now() / 1000) + 1; // Very short deadline
      const encryptedMove = '0x' + '0'.repeat(64);
      const proof = '0x' + '0'.repeat(130);
      
      await contract.connect(player1).createGame(
        encryptedMove,
        proof,
        moveDeadline,
        betAmount,
        { value: betAmount }
      );
      
      // Wait for deadline to pass
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await expect(contract.checkAndExpireGame(1))
        .to.emit(contract, 'GameExpired')
        .withArgs(1);
      
      const game = await contract.games(1);
      expect(game.isExpired).to.be.true;
    });
  });

  describe("Batch Operations", function () {
    it("Should batch expire multiple games", async function () {
      const betAmount = ethers.parseEther("0.01");
      const moveDeadline = Math.floor(Date.now() / 1000) + 1; // Short deadline
      const encryptedMove = '0x' + '0'.repeat(64);
      const proof = '0x' + '0'.repeat(130);
      
      // Create multiple games
      for (let i = 0; i < 3; i++) {
        await contract.connect(player1).createGame(
          encryptedMove,
          proof,
          moveDeadline,
          betAmount,
          { value: betAmount }
        );
      }
      
      // Wait for deadline to pass
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Batch expire games
      await contract.batchExpireGames([1, 2, 3]);
      
      // Verify all games are expired
      for (let i = 1; i <= 3; i++) {
        const game = await contract.games(i);
        expect(game.isExpired).to.be.true;
      }
    });
  });

  describe("Constants", function () {
    it("Should have correct move constants", async function () {
      expect(await contract.ROCK()).to.equal(0);
      expect(await contract.PAPER()).to.equal(1);
      expect(await contract.SCISSORS()).to.equal(2);
    });

    it("Should have correct result constants", async function () {
      expect(await contract.PLAYER1_WINS()).to.equal(0);
      expect(await contract.PLAYER2_WINS()).to.equal(1);
      expect(await contract.DRAW()).to.equal(2);
    });
  });
});
