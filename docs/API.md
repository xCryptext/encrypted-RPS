# 📚 API Documentation

This document provides comprehensive API documentation for the Rock Paper Scissors FHE Game smart contract and frontend interfaces.

## 📋 Table of Contents

- [Smart Contract API](#smart-contract-api)
- [Frontend API](#frontend-api)
- [FHE API](#fhe-api)
- [Event API](#event-api)
- [Error Handling](#error-handling)
- [Usage Examples](#usage-examples)

## 🔗 Smart Contract API

### Contract Information

**Contract Address:** `0xa83Fc9AF608EfE0D871ee8FBedE702220220C651`  
**Network:** Sepolia Testnet  
**ABI Version:** v1.0.0  
**Solidity Version:** ^0.8.24

### Core Functions

#### Game Creation

```solidity
function createGame(
    externalEuint8 encryptedMove,
    bytes memory proof,
    uint256 moveDeadline,
    uint256 betAmount
) external payable nonReentrant whenNotPaused
```

**Description:** Creates a new Rock Paper Scissors game with an encrypted move.

**Parameters:**
- `encryptedMove` (externalEuint8): Encrypted player move (0=Rock, 1=Paper, 2=Scissors)
- `proof` (bytes): Cryptographic proof of encrypted input validity
- `moveDeadline` (uint256): Timestamp when move submission deadline expires
- `betAmount` (uint256): Amount of ETH to bet (in wei)

**Requirements:**
- Must send `betAmount` as ETH
- `betAmount` must be between `minBet` and `maxBet`
- `moveDeadline` must be in the future
- Valid encrypted move and proof

**Events Emitted:**
- `GameCreated(uint256 indexed gameId, address indexed player1, uint256 betAmount)`

**Example:**
```javascript
const tx = await contract.createGame(
    encryptedMove,
    proof,
    Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
    ethers.parseEther("0.01"), // 0.01 ETH
    { value: ethers.parseEther("0.01") }
);
```

#### Game Joining

```solidity
function joinGame(
    uint256 gameId,
    externalEuint8 encryptedMove,
    bytes memory proof
) external payable nonReentrant whenNotPaused
```

**Description:** Joins an existing game with an encrypted move.

**Parameters:**
- `gameId` (uint256): ID of the game to join
- `encryptedMove` (externalEuint8): Encrypted player move
- `proof` (bytes): Cryptographic proof of encrypted input validity

**Requirements:**
- Game must exist and not be expired
- Game must not already have a second player
- Must send exact `betAmount` as ETH
- Valid encrypted move and proof

**Events Emitted:**
- `GameJoined(uint256 indexed gameId, address indexed player2)`

**Example:**
```javascript
const tx = await contract.joinGame(
    gameId,
    encryptedMove,
    proof,
    { value: ethers.parseEther("0.01") }
);
```

#### Move Submission

```solidity
function submitMove(
    uint256 gameId,
    externalEuint8 encryptedMove,
    bytes memory proof
) external nonReentrant whenNotPaused
```

**Description:** Submits an encrypted move for an existing game.

**Parameters:**
- `gameId` (uint256): ID of the game
- `encryptedMove` (externalEuint8): Encrypted player move
- `proof` (bytes): Cryptographic proof of encrypted input validity

**Requirements:**
- Must be a player in the game
- Move not already submitted
- Game not expired
- Valid encrypted move and proof

**Events Emitted:**
- `MoveSubmitted(uint256 indexed gameId, address indexed player, bool isPlayer1)`

**Example:**
```javascript
const tx = await contract.submitMove(gameId, encryptedMove, proof);
```

### View Functions

#### Game Information

```solidity
function games(uint256 gameId) external view returns (
    uint256 id,
    address player1,
    address player2,
    uint256 betAmount,
    uint256 totalPot,
    uint256 feeAmount,
    uint256 payoutAmount,
    euint8 encryptedMove1,
    euint8 encryptedMove2,
    bool move1Submitted,
    bool move2Submitted,
    uint256 startTime,
    uint256 moveDeadline,
    uint256 decryptRequestTime,
    uint256 decryptDeadline,
    bool decryptionRequested,
    bool decryptionCompleted,
    address winner,
    uint8 resultCode,
    bool isExpired,
    bool refunded,
    bool payoutClaimedP1,
    bool payoutClaimedP2,
    uint256 endTime
)
```

**Description:** Returns complete information about a specific game.

**Parameters:**
- `gameId` (uint256): ID of the game to query

**Returns:** Game struct with all game information

**Example:**
```javascript
const game = await contract.games(gameId);
console.log(`Game ${game.id}: Player1=${game.player1}, Player2=${game.player2}`);
```

#### Game Constants

```solidity
function ROCK() external pure returns (uint8)
function PAPER() external pure returns (uint8)
function SCISSORS() external pure returns (uint8)
function PLAYER1_WINS() external pure returns (uint8)
function PLAYER2_WINS() external pure returns (uint8)
function DRAW() external pure returns (uint8)
```

**Description:** Returns game constants for move types and result codes.

**Returns:**
- `ROCK`: 0
- `PAPER`: 1
- `SCISSORS`: 2
- `PLAYER1_WINS`: 0
- `PLAYER2_WINS`: 1
- `DRAW`: 2

**Example:**
```javascript
const ROCK = await contract.ROCK(); // 0
const PAPER = await contract.PAPER(); // 1
const SCISSORS = await contract.SCISSORS(); // 2
```

#### Platform Information

```solidity
function gameIdCounter() external view returns (uint256)
function minBet() external view returns (uint256)
function maxBet() external view returns (uint256)
function platformFeePercent() external view returns (uint256)
function feeRecipient() external view returns (address)
function totalFeesCollected() external view returns (uint256)
function paused() external view returns (bool)
```

**Description:** Returns platform configuration and statistics.

**Example:**
```javascript
const minBet = await contract.minBet();
const maxBet = await contract.maxBet();
const platformFee = await contract.platformFeePercent();
```

### Admin Functions

#### Pause/Unpause

```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
```

**Description:** Pauses or unpauses the contract for emergency situations.

**Requirements:**
- Must be contract owner
- `pause()`: Contract must not be paused
- `unpause()`: Contract must be paused

**Events Emitted:**
- `Paused()` or `Unpaused()`

#### Fee Management

```solidity
function setPlatformFeePercent(uint256 _platformFeePercent) external onlyOwner
function setFeeRecipient(address _feeRecipient) external onlyOwner
function withdrawFees() external onlyOwner
```

**Description:** Manages platform fees and fee collection.

**Parameters:**
- `_platformFeePercent`: New platform fee percentage (in basis points)
- `_feeRecipient`: New fee recipient address

**Requirements:**
- Must be contract owner
- Fee percentage must be reasonable (0-1000 basis points)
- Fee recipient must not be zero address

#### Emergency Functions

```solidity
function emergencyWithdraw() external onlyOwner
```

**Description:** Emergency withdrawal of all contract funds.

**Requirements:**
- Must be contract owner
- Contract must have funds to withdraw

## 🎨 Frontend API

### Wallet Connection

#### Connect Wallet

```javascript
async function connectWallet() {
    if (window.ethereum) {
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });
        return accounts[0];
    }
    throw new Error('MetaMask not detected');
}
```

**Description:** Connects to MetaMask wallet and returns the connected account.

**Returns:** `Promise<string>` - Connected wallet address

**Throws:** Error if MetaMask not detected or connection rejected

#### Disconnect Wallet

```javascript
function disconnectWallet() {
    setAccount(null);
    setProvider(null);
    setContract(null);
    setBalance('0');
}
```

**Description:** Disconnects the current wallet and clears state.

### FHE Operations

#### Initialize FHE Instance

```javascript
async function initializeFheInstance() {
    const sdk = await import('https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.js');
    const { initSDK, createInstance, SepoliaConfig } = sdk;
    
    await initSDK();
    const config = { ...SepoliaConfig, network: window.ethereum };
    const fheInstance = await createInstance(config);
    
    return fheInstance;
}
```

**Description:** Initializes the FHE instance for encrypted operations.

**Returns:** `Promise<FHEInstance>` - Initialized FHE instance

**Throws:** Error if initialization fails

#### Encrypt Move

```javascript
async function encryptMove(move, contractAddress, userAddress) {
    const fhe = getFheInstance();
    const buffer = fhe.createEncryptedInput(contractAddress, userAddress);
    buffer.add8(Number(move));
    const ciphertexts = await buffer.encrypt();
    
    return {
        handle: '0x' + ciphertexts.handles[0].slice(2),
        proof: ciphertexts.inputProof,
        hash: ethers.keccak256('0x' + ciphertexts.handles[0].slice(2))
    };
}
```

**Description:** Encrypts a player move for submission to the smart contract.

**Parameters:**
- `move` (number): Player move (0=Rock, 1=Paper, 2=Scissors)
- `contractAddress` (string): Smart contract address
- `userAddress` (string): Player wallet address

**Returns:** `Promise<Object>` - Encrypted move data
- `handle` (string): Encrypted move handle
- `proof` (bytes): Cryptographic proof
- `hash` (string): Move hash for verification

**Throws:** Error if encryption fails

#### Decrypt Value

```javascript
async function decryptValue(encryptedBytes) {
    const fhe = getFheInstance();
    const values = await fhe.publicDecrypt([encryptedBytes]);
    return Number(values[encryptedBytes]);
}
```

**Description:** Decrypts an encrypted value using the FHE relayer.

**Parameters:**
- `encryptedBytes` (string): Encrypted value to decrypt

**Returns:** `Promise<number>` - Decrypted value

**Throws:** Error if decryption fails

### Game Operations

#### Create Game

```javascript
async function createGame(move, betAmount) {
    const encryptedData = await encryptMove(move, contractAddress, account);
    
    const tx = await contract.createGame(
        encryptedData.handle,
        encryptedData.proof,
        Math.floor(Date.now() / 1000) + 300, // 5 minutes
        ethers.parseEther(betAmount.toString()),
        { value: ethers.parseEther(betAmount.toString()) }
    );
    
    const receipt = await tx.wait();
    return receipt;
}
```

**Description:** Creates a new game with encrypted move and bet amount.

**Parameters:**
- `move` (number): Player move (0=Rock, 1=Paper, 2=Scissors)
- `betAmount` (string): Bet amount in ETH

**Returns:** `Promise<TransactionReceipt>` - Transaction receipt

#### Join Game

```javascript
async function joinGame(gameId, move) {
    const encryptedData = await encryptMove(move, contractAddress, account);
    
    const tx = await contract.joinGame(
        gameId,
        encryptedData.handle,
        encryptedData.proof,
        { value: ethers.parseEther(betAmount.toString()) }
    );
    
    const receipt = await tx.wait();
    return receipt;
}
```

**Description:** Joins an existing game with encrypted move.

**Parameters:**
- `gameId` (number): ID of the game to join
- `move` (number): Player move (0=Rock, 1=Paper, 2=Scissors)

**Returns:** `Promise<TransactionReceipt>` - Transaction receipt

#### Submit Move

```javascript
async function submitMove(gameId, move) {
    const encryptedData = await encryptMove(move, contractAddress, account);
    
    const tx = await contract.submitMove(
        gameId,
        encryptedData.handle,
        encryptedData.proof
    );
    
    const receipt = await tx.wait();
    return receipt;
}
```

**Description:** Submits an encrypted move for an existing game.

**Parameters:**
- `gameId` (number): ID of the game
- `move` (number): Player move (0=Rock, 1=Paper, 2=Scissors)

**Returns:** `Promise<TransactionReceipt>` - Transaction receipt

### Event Handling

#### Listen for Events

```javascript
// Game created event
contract.on('GameCreated', (gameId, player1, betAmount) => {
    console.log(`Game ${gameId} created by ${player1} with bet ${betAmount}`);
    updateGameList();
});

// Game joined event
contract.on('GameJoined', (gameId, player2) => {
    console.log(`Game ${gameId} joined by ${player2}`);
    updateGameList();
});

// Game resolved event
contract.on('GameResolved', (gameId, resultCode, winner, totalPot) => {
    console.log(`Game ${gameId} resolved: Winner=${winner}, Pot=${totalPot}`);
    updateGameStatus(gameId);
});
```

**Description:** Sets up event listeners for smart contract events.

**Events:**
- `GameCreated`: New game created
- `GameJoined`: Player joined game
- `MoveSubmitted`: Move submitted
- `DecryptionRequested`: Decryption requested
- `DecryptionCompleted`: Decryption completed
- `GameResolved`: Game resolved with winner
- `GameExpired`: Game expired
- `PayoutClaimed`: Payout claimed
- `RefundProcessed`: Refund processed

## 🔐 FHE API

### SDK Initialization

```javascript
// Load FHE SDK
const sdk = await import('https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.js');

// Initialize SDK
await sdk.initSDK();

// Create FHE instance
const fheInstance = await sdk.createInstance({
    ...sdk.SepoliaConfig,
    network: window.ethereum
});
```

### Encrypted Input Creation

```javascript
// Create encrypted input buffer
const buffer = fheInstance.createEncryptedInput(contractAddress, userAddress);

// Add encrypted data
buffer.add8(value); // Add uint8 value
buffer.add16(value); // Add uint16 value
buffer.add32(value); // Add uint32 value

// Encrypt and get handles
const ciphertexts = await buffer.encrypt();
```

### FHE Operations

```javascript
// Equality comparison
const isEqual = FHE.eq(encryptedValue1, encryptedValue2);

// Logical AND
const result = FHE.and(encryptedBool1, encryptedBool2);

// Logical OR
const result = FHE.or(encryptedBool1, encryptedBool2);

// Conditional selection
const result = condition.select(valueIfTrue, valueIfFalse);

// Convert to bytes32
const bytes32Value = FHE.toBytes32(encryptedValue);
```

### Oracle Integration

```javascript
// Request decryption
const requestId = FHE.requestDecryption(
    [encryptedValue1, encryptedValue2],
    contract.fulfillDecryption.selector
);

// Check signatures
FHE.checkSignatures(requestId, cleartexts, decryptionProof);
```

## 📡 Event API

### Game Events

#### GameCreated

```solidity
event GameCreated(
    uint256 indexed gameId,
    address indexed player1,
    uint256 betAmount
);
```

**Description:** Emitted when a new game is created.

**Parameters:**
- `gameId`: Unique game identifier
- `player1`: Address of the game creator
- `betAmount`: Amount of ETH bet

#### GameJoined

```solidity
event GameJoined(
    uint256 indexed gameId,
    address indexed player2
);
```

**Description:** Emitted when a player joins an existing game.

**Parameters:**
- `gameId`: Unique game identifier
- `player2`: Address of the joining player

#### GameResolved

```solidity
event GameResolved(
    uint256 indexed gameId,
    uint8 resultCode,
    address winner,
    uint256 totalPot
);
```

**Description:** Emitted when a game is resolved with a winner.

**Parameters:**
- `gameId`: Unique game identifier
- `resultCode`: Result code (0=Player1 wins, 1=Player2 wins, 2=Draw)
- `winner`: Address of the winner (address(0) for draw)
- `totalPot`: Total pot amount

### System Events

#### Paused/Unpaused

```solidity
event Paused();
event Unpaused();
```

**Description:** Emitted when the contract is paused or unpaused.

#### PlatformFeeUpdated

```solidity
event PlatformFeeUpdated(uint256 newPercent);
```

**Description:** Emitted when the platform fee percentage is updated.

**Parameters:**
- `newPercent`: New platform fee percentage

## ⚠️ Error Handling

### Smart Contract Errors

#### Custom Errors

```solidity
error HandlesAlreadySavedForRequestID();
error InvalidKMSSignatures();
error NoHandleFoundForRequestID();
error OwnableInvalidOwner(address owner);
error OwnableUnauthorizedAccount(address account);
error ReentrancyGuardReentrantCall();
```

#### Common Revert Messages

- `"Contract is paused"`: Contract is paused
- `"Invalid game ID"`: Game ID does not exist
- `"Not a game player"`: Caller is not a player in the game
- `"Decrypt requested"`: Decryption already requested
- `"No pending decrypt"`: No pending decryption request
- `"Game already expired"`: Game has already expired
- `"Invalid result code"`: Invalid game result code

### Frontend Error Handling

#### Connection Errors

```javascript
try {
    await connectWallet();
} catch (error) {
    if (error.code === 4001) {
        // User rejected connection
        setError('Connection rejected. Please try again.');
    } else if (error.code === -32002) {
        // Connection request already pending
        setError('Connection request already pending. Please check MetaMask.');
    } else {
        // Other connection error
        setError('Failed to connect wallet. Please refresh the page.');
    }
}
```

#### FHE Errors

```javascript
try {
    await initializeFheInstance();
} catch (error) {
    if (error.message?.includes('Failed to fetch')) {
        setError('Failed to load FHE SDK. Please check your internet connection.');
    } else if (error.message?.includes('WASM')) {
        setError('Failed to load FHE WASM module. Please refresh the page.');
    } else {
        setError(`FHE initialization failed: ${error.message}`);
    }
}
```

#### Transaction Errors

```javascript
try {
    const tx = await contract.createGame(...);
    await tx.wait();
} catch (error) {
    if (error.code === 'INSUFFICIENT_FUNDS') {
        setError('Insufficient funds for transaction.');
    } else if (error.code === 'USER_REJECTED') {
        setError('Transaction rejected by user.');
    } else {
        setError(`Transaction failed: ${error.message}`);
    }
}
```

## 📝 Usage Examples

### Complete Game Flow

```javascript
// 1. Connect wallet
const account = await connectWallet();

// 2. Initialize FHE
await initializeFheInstance();

// 3. Create game
const gameId = await createGame(0, "0.01"); // Rock, 0.01 ETH

// 4. Join game (as second player)
await joinGame(gameId, 1); // Paper

// 5. Wait for game resolution
contract.on('GameResolved', (resolvedGameId, resultCode, winner, totalPot) => {
    if (resolvedGameId === gameId) {
        console.log(`Game resolved! Winner: ${winner}, Pot: ${totalPot}`);
    }
});
```

### Error Handling Example

```javascript
async function safeCreateGame(move, betAmount) {
    try {
        // Validate inputs
        if (move < 0 || move > 2) {
            throw new Error('Invalid move: must be 0, 1, or 2');
        }
        
        if (betAmount < 0.001 || betAmount > 0.1) {
            throw new Error('Invalid bet amount: must be between 0.001 and 0.1 ETH');
        }
        
        // Create game
        const result = await createGame(move, betAmount);
        return result;
        
    } catch (error) {
        console.error('Game creation failed:', error);
        
        // Handle specific errors
        if (error.message.includes('insufficient funds')) {
            setError('Insufficient funds. Please add ETH to your wallet.');
        } else if (error.message.includes('user rejected')) {
            setError('Transaction rejected. Please try again.');
        } else {
            setError(`Game creation failed: ${error.message}`);
        }
        
        throw error;
    }
}
```

### Event Monitoring

```javascript
// Set up comprehensive event monitoring
function setupEventMonitoring() {
    // Game lifecycle events
    contract.on('GameCreated', (gameId, player1, betAmount) => {
        console.log(`New game created: ${gameId} by ${player1} with ${betAmount} ETH`);
        updateGameList();
    });
    
    contract.on('GameJoined', (gameId, player2) => {
        console.log(`Game ${gameId} joined by ${player2}`);
        updateGameList();
    });
    
    contract.on('GameResolved', (gameId, resultCode, winner, totalPot) => {
        console.log(`Game ${gameId} resolved: Winner=${winner}, Pot=${totalPot}`);
        updateGameStatus(gameId);
        updatePlayerBalance();
    });
    
    // Error events
    contract.on('GameExpired', (gameId) => {
        console.log(`Game ${gameId} expired`);
        updateGameStatus(gameId);
    });
    
    // System events
    contract.on('Paused', () => {
        console.log('Contract paused');
        setContractPaused(true);
    });
    
    contract.on('Unpaused', () => {
        console.log('Contract unpaused');
        setContractPaused(false);
    });
}
```

---

This API documentation provides comprehensive coverage of all interfaces, functions, and usage patterns for the Rock Paper Scissors FHE Game. Regular updates ensure accuracy as the project evolves.
