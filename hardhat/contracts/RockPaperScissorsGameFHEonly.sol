// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint8, externalEuint8, ebool } from "@fhevm/solidity/lib/FHE.sol";
using FHE for ebool; // ebool üzerinde select() kullanmaya izin verir
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
// import "hardhat/console.sol"; // Konsol çağrısı kaldırıldı

contract RockPaperScissorsGame_FHE_ResultOnly is SepoliaConfig, ReentrancyGuard, Ownable {
    // ============ CONSTANTS ============
    uint8 public constant ROCK = 0;
    uint8 public constant PAPER = 1;
    uint8 public constant SCISSORS = 2;

    uint8 public constant PLAYER1_WINS = 0;
    uint8 public constant PLAYER2_WINS = 1;
    uint8 public constant DRAW = 2;

    // ============ GLOBAL STATE ============
    uint256 public gameIdCounter;
    uint256 public maxOracleResponseDelay;
    uint256 public platformFeePercent; // basis points (10000'de 1)
    address public feeRecipient;
    uint256 public minBet;
    uint256 public maxBet;
    uint256 public totalFeesCollected;
    bool public paused;

    // ============ MAPPINGS ============
    mapping(uint256 => Game) public games;
    mapping(uint256 => uint256) public latestRequestIds;    // gameId -> requestId
    mapping(uint256 => uint256) public reqIdToGameId;       // requestId -> gameId
    mapping(uint256 => bool) public usedRequestIds;         // replay protection
    mapping(address => uint256) public withdrawableBalance;

    // ============ STRUCTS ============
    struct Game {
        uint256 id;
        address player1;
        address player2;
        uint256 betAmount;
        uint256 totalPot;
        uint256 feeAmount;
        uint256 payoutAmount;
        euint8 encryptedMove1;
        euint8 encryptedMove2;
        bool move1Submitted;
        bool move2Submitted;
        uint256 startTime;
        uint256 moveDeadline;
        uint256 decryptRequestTime;
        uint256 decryptDeadline;
        bool decryptionRequested;
        bool decryptionCompleted;
        address winner;
        uint8 resultCode;
        bool isExpired;
        bool refunded;
        bool payoutClaimedP1;
        bool payoutClaimedP2;
        uint256 endTime;
    }

    // ============ EVENTS ============
    event GameCreated(uint256 indexed gameId, address indexed player1, uint256 betAmount);
    event GameJoined(uint256 indexed gameId, address indexed player2);
    event MoveSubmitted(uint256 indexed gameId, address indexed player, bool isPlayer1);
    event DecryptionRequested(uint256 indexed gameId, uint256 requestId, uint256 timestamp, uint256 deadline);
    event DecryptionCompleted(uint256 indexed gameId, uint256 requestId, uint8 resultCode, address winner);
    event GameResolved(uint256 indexed gameId, uint8 resultCode, address winner, uint256 totalPot);
    event GameExpired(uint256 indexed gameId);
    event PayoutClaimed(uint256 indexed gameId, address indexed player, uint256 amount);
    event RefundProcessed(uint256 indexed gameId, address indexed player, uint256 amount);
    event ClaimableBalanceUpdated(address indexed player, uint256 newBalance);
    event PlatformFeeUpdated(uint256 newPercent);
    event Paused();
    event Unpaused();

    // ============ MODIFIERS ============
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier validGameId(uint256 gameId) {
        require(gameId > 0 && gameId <= gameIdCounter, "Invalid game ID");
        _;
    }

    modifier onlyGamePlayer(uint256 gameId) {
        Game storage game = games[gameId];
        require(msg.sender == game.player1 || msg.sender == game.player2, "Not a game player");
        _;
    }

    // ============ CONSTRUCTOR ============
    constructor(
        uint256 _maxOracleResponseDelay,
        uint256 _platformFeePercent,
        address _feeRecipient,
        uint256 _minBet,
        uint256 _maxBet
    ) Ownable(msg.sender) {
        maxOracleResponseDelay = _maxOracleResponseDelay;
        platformFeePercent = _platformFeePercent;
        feeRecipient = _feeRecipient;
        minBet = _minBet;
        maxBet = _maxBet;
        gameIdCounter = 0;
        paused = false;
    }

    // ============ GAME FUNCTIONS ============
    function createGame(
        externalEuint8 encryptedMove,
        bytes calldata proof,
        uint256 moveDeadline,
        uint256 betAmount
    ) external payable whenNotPaused nonReentrant {
        require(moveDeadline > 0, "Move deadline must be positive");
        require(msg.value == betAmount, "Bet must match value");
        require(betAmount >= minBet && betAmount <= maxBet, "Bet out of range");

        gameIdCounter++;
        uint256 gameId = gameIdCounter;

        euint8 eMove1 = FHE.fromExternal(encryptedMove, proof);

        Game storage newGame = games[gameId];
        newGame.id = gameId;
        newGame.player1 = msg.sender;
        newGame.betAmount = betAmount;
        newGame.totalPot = betAmount;
        newGame.encryptedMove1 = eMove1;
        newGame.move1Submitted = true;
        newGame.startTime = block.timestamp;
        newGame.moveDeadline = block.timestamp + moveDeadline;

        FHE.allowThis(newGame.encryptedMove1); // Hamle üzerinde FHE işlemlerine izin ver

        emit GameCreated(gameId, msg.sender, betAmount);
    }

    function joinGame(
        uint256 gameId,
        externalEuint8 encryptedMove,
        bytes calldata proof
    ) external payable nonReentrant validGameId(gameId) {
        Game storage game = games[gameId];
        require(game.player2 == address(0), "Has two players");
        require(msg.sender != game.player1, "Own game");
        require(msg.value == game.betAmount, "Bet mismatch");
        require(block.timestamp <= game.moveDeadline, "Deadline passed");
        require(!game.isExpired, "Expired");
        require(!game.decryptionRequested, "Decrypt requested");

        euint8 eMove2 = FHE.fromExternal(encryptedMove, proof);
        game.player2 = msg.sender;
        game.encryptedMove2 = eMove2;
        game.move2Submitted = true;

        FHE.allowThis(game.encryptedMove2); // Hamle üzerinde FHE işlemlerine izin ver
        
        game.totalPot = game.betAmount * 2;

        emit GameJoined(gameId, msg.sender);

        _computeAndRequestDecryption(gameId);
    }

    function submitMove(
        uint256 gameId,
        externalEuint8 encryptedMove,
        bytes calldata proof
    ) external whenNotPaused nonReentrant validGameId(gameId) onlyGamePlayer(gameId) {
        Game storage game = games[gameId];
        require(block.timestamp <= game.moveDeadline, "Deadline passed");

        euint8 eMove = FHE.fromExternal(encryptedMove, proof);
        if (msg.sender == game.player1) {
            require(!game.move1Submitted, "P1 submitted");
            game.encryptedMove1 = eMove;
            game.move1Submitted = true;
            FHE.allowThis(game.encryptedMove1);
        } else {
            require(!game.move2Submitted, "P2 submitted");
            game.encryptedMove2 = eMove;
            game.move2Submitted = true;
            FHE.allowThis(game.encryptedMove2);
        }

        emit MoveSubmitted(gameId, msg.sender, msg.sender == game.player1);
    }

    // ============ ORACLE / FHE (GÜNCELLENMİŞ) ============
    
    /**
     * @notice Şifreli sonucu hesaplar ve sadece bu şifreli sonucun çözülmesini ister.
     */
    function _computeAndRequestDecryption(uint256 gameId) internal {
        Game storage game = games[gameId];
        require(!game.decryptionRequested, "Decrypt requested");

        // 1. Şifreli sonucu hesapla (euint8)
        euint8 resultCipher = _computeResultFHEInternal(game.encryptedMove1, game.encryptedMove2);
        
        // 2. Sadece ŞİFRELİ SONUCU çözmek için isteğe dahil et
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(resultCipher);
        
        // 3. Şifre çözme isteğini gönder
        uint256 requestId = FHE.requestDecryption(cts, this.fulfillDecryption.selector);
        latestRequestIds[gameId] = requestId;
        reqIdToGameId[requestId] = gameId;

        game.decryptionRequested = true;
        game.decryptRequestTime = block.timestamp;
        game.decryptDeadline = block.timestamp + maxOracleResponseDelay;

        emit DecryptionRequested(gameId, requestId, block.timestamp, game.decryptDeadline);
    }

    /**
     * @notice İki şifreli hamle arasındaki kazanan sonucunu şifreli olarak hesaplar.
     */
    function _computeResultFHEInternal(euint8 m1, euint8 m2) internal returns (euint8) {
        // m1 == m2
        ebool isEq = FHE.eq(m1, m2);
        
        // P1 Kazanır mı? (Taş > Makas, Kağıt > Taş, Makas > Kağıt)
        ebool win1 = FHE.and(FHE.eq(m1, FHE.asEuint8(ROCK)), FHE.eq(m2, FHE.asEuint8(SCISSORS)));
        ebool win2 = FHE.and(FHE.eq(m1, FHE.asEuint8(PAPER)), FHE.eq(m2, FHE.asEuint8(ROCK)));
        ebool win3 = FHE.and(FHE.eq(m1, FHE.asEuint8(SCISSORS)), FHE.eq(m2, FHE.asEuint8(PAPER)));
        ebool p1Wins = FHE.or(FHE.or(win1, win2), win3);
        
        // Eğer P1 kazanırsa PLAYER1_WINS, aksi takdirde (P2 kazanırsa) PLAYER2_WINS
        euint8 resP1orP2 = p1Wins.select(FHE.asEuint8(PLAYER1_WINS), FHE.asEuint8(PLAYER2_WINS));
        
        // Eğer beraberlikse DRAW, aksi takdirde resP1orP2
        euint8 finalResult = isEq.select(FHE.asEuint8(DRAW), resP1orP2);
        
        return finalResult;
    }


    /**
     * @notice Oracle'dan gelen şifre çözme geri çağırması. Sadece SONUÇ KODU'nun şifresini çözer.
     */
    function fulfillDecryption(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) external nonReentrant {
        // GameId bulma mantığı
        uint256 gameId = reqIdToGameId[requestId];
        if (gameId == 0) {
            for (uint256 i = gameIdCounter; i >= 1; i--) {
                if (latestRequestIds[i] == requestId) {
                    gameId = i;
                    break;
                }
                if (i == 1) break;
            }
        }
        require(gameId != 0, "Unknown requestId");
        Game storage game = games[gameId];

        // İmza ve durum kontrolleri
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);
        require(game.decryptionRequested, "No pending decrypt");

        usedRequestIds[requestId] = true;
        game.decryptionCompleted = true;
        game.decryptionRequested = false;

        // SADECE SONUÇ KODUNU (uint8) çöz
        (uint8 resultCode) = abi.decode(cleartexts, (uint8));
        require(resultCode <= DRAW, "Invalid result code");

        // Sonuç koduna göre kazananı belirle
        address winner = address(0);
        if (resultCode == PLAYER1_WINS) {
            winner = game.player1;
        } else if (resultCode == PLAYER2_WINS) {
            winner = game.player2;
        } 
        // resultCode == DRAW (2) ise, winner address(0) kalır.

        game.resultCode = resultCode;
        game.winner = winner;
        game.endTime = block.timestamp;

        // Ödemeyi ve ücretleri hesapla
        if (resultCode == DRAW) { 
            withdrawableBalance[game.player1] += game.betAmount;
            withdrawableBalance[game.player2] += game.betAmount;
            emit ClaimableBalanceUpdated(game.player1, withdrawableBalance[game.player1]);
            emit ClaimableBalanceUpdated(game.player2, withdrawableBalance[game.player2]);
        } else {
            // Güvenlik iyileştirmesi: toplam ücretleri yalnızca başarılı çağrıdan sonra azalt.
            uint256 feeAmount = (game.totalPot * platformFeePercent) / 10000;
            game.feeAmount = feeAmount;
            game.payoutAmount = game.totalPot - feeAmount;
            
            withdrawableBalance[winner] += game.payoutAmount;
            totalFeesCollected += feeAmount; // Toplanan ücretleri ekle
            emit ClaimableBalanceUpdated(winner, withdrawableBalance[winner]);
        }

        emit DecryptionCompleted(gameId, requestId, resultCode, winner);
        emit GameResolved(gameId, resultCode, winner, game.totalPot);
    }

    // ============ WITHDRAWALS / ADMIN ============
    function withdraw() external nonReentrant {
        uint256 amount = withdrawableBalance[msg.sender];
        require(amount > 0, "No balance");
        withdrawableBalance[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Withdraw failed");
        emit ClaimableBalanceUpdated(msg.sender, 0);
    }


    function setPlatformFeePercent(uint256 _platformFeePercent) external onlyOwner {
        require(_platformFeePercent <= 1000, "Fee too high (max 10%)"); // 1000 basis points = 10%
        platformFeePercent = _platformFeePercent;
        emit PlatformFeeUpdated(_platformFeePercent);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid recipient");
        feeRecipient = _feeRecipient;
    }

    function setBetLimits(uint256 _minBet, uint256 _maxBet) external onlyOwner {
        require(_minBet <= _maxBet, "Invalid limits");
        minBet = _minBet;
        maxBet = _maxBet;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }


    // ============ EXPIRY FUNCTIONS ============
    function checkAndExpireGame(uint256 gameId) public validGameId(gameId) {
        Game storage game = games[gameId];
        require(!game.isExpired, "Game already expired");
        
        uint256 currentTime = block.timestamp;
        bool shouldExpire = false;
        string memory reason = "";
        
        // Hamle süresi geçti ve ikinci oyuncu katılmadıysa
        if (game.player2 == address(0) && currentTime > game.moveDeadline) {
            shouldExpire = true;
            reason = "No second player joined within deadline";
        }
        // Şifre çözme süresi geçtiyse
        else if (game.decryptionRequested && !game.decryptionCompleted && 
                 currentTime > game.decryptDeadline) {
            shouldExpire = true;
            reason = "Decryption deadline exceeded";
        }
        
        if (shouldExpire) {
            _expireGame(gameId, reason);
        }
    }
    
    function _expireGame(uint256 gameId, string memory reason) internal {
        Game storage game = games[gameId];
        game.isExpired = true;
        game.endTime = block.timestamp;
        
        // Her iki oyuncuya da (varsa) bet miktarlarını iade et
        if (game.player1 != address(0)) {
            withdrawableBalance[game.player1] += game.betAmount;
            emit RefundProcessed(gameId, game.player1, game.betAmount);
        }
        if (game.player2 != address(0)) {
            withdrawableBalance[game.player2] += game.betAmount;
            emit RefundProcessed(gameId, game.player2, game.betAmount);
        }
        
        emit GameExpired(gameId);
    }
    
    // Birden fazla oyunu toplu olarak zaman aşımına uğratma
    function batchExpireGames(uint256[] calldata gameIds) external {
        for (uint256 i = 0; i < gameIds.length; i++) {
            checkAndExpireGame(gameIds[i]);
        }
    }
    
    // ============ FEE MANAGEMENT ============
    function withdrawFees() external onlyOwner {
        require(totalFeesCollected > 0, "No fees to withdraw");
        uint256 amount = totalFeesCollected;
        
        // Harici çağrıdan sonra sıfırlayarak olası kilitlenmeleri önleme
        (bool success, ) = feeRecipient.call{value: amount}("");
        require(success, "Fee withdrawal failed");
        
        // Sadece başarılı olursa sıfırla
        totalFeesCollected = 0;
    }
    
    // ============ EMERGENCY FUNCTIONS ============
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool success, ) = owner().call{value: balance}("");
        require(success, "Emergency withdrawal failed");
    }
}