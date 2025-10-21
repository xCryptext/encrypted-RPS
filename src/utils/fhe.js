// FHE Utility functions using Zama Relayer SDK
import { ethers } from 'ethers';

// NOTE: Vite supports HTTP(S) imports and dynamic imports
// We can use dynamic import directly as Vite handles this properly

let fheInstance = null;

export async function initializeFheInstance() {
  // Check if ethereum is available (prevents mobile crashes)
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('Ethereum provider not found. Please install MetaMask or connect a wallet.');
  }

  try {
    // Load SDK from CDN (0.2.0) - Vite supports this
    const sdk = await import('https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.js');

    const { initSDK, createInstance, SepoliaConfig } = sdk;

    // Initialize SDK (loads WASM)
    await initSDK();

    // Use SepoliaConfig with custom network provider
    // SepoliaConfig includes all the necessary contract addresses and chain IDs
    const config = { 
      ...SepoliaConfig, 
      network: window.ethereum 
    };

    fheInstance = await createInstance(config);

    console.log('FHE Instance initialized successfully with SepoliaConfig');
    return fheInstance;
  } catch (err) {
    console.error('FHEVM instance creation failed:', err);
    
    // More specific error messages
    if (err.message?.includes('Failed to fetch')) {
      throw new Error('Failed to load FHE SDK. Please check your internet connection.');
    } else if (err.message?.includes('NetworkError')) {
      throw new Error('Network error while loading FHE SDK. Please try again.');
    } else if (err.message?.includes('WASM')) {
      throw new Error('Failed to load FHE WASM module. Please refresh the page.');
    }
    
    throw new Error(`FHE initialization failed: ${err.message || 'Unknown error'}`);
  }
}

export function getFheInstance() {
  return fheInstance;
}

// Encrypt a move (0=Rock, 1=Paper, 2=Scissors)
export async function encryptMove(move, contractAddress, userAddress) {
  // Input validation
  if (typeof move !== 'number' || move < 0 || move > 2) {
    throw new Error('Invalid move: must be 0 (Rock), 1 (Paper), or 2 (Scissors)');
  }
  
  if (!contractAddress || !userAddress) {
    throw new Error('Contract address and user address are required');
  }

  try {
    const fhe = getFheInstance();
    if (!fhe) throw new Error('FHE instance not initialized. Call initializeFheInstance() first.');
    
    // Create encrypted input buffer
    const buffer = fhe.createEncryptedInput(
      contractAddress,
      userAddress
    );

    // Add the move as uint8 (0-2)
    buffer.add8(Number(move));

    // Encrypt and get ciphertext handles
    const ciphertexts = await buffer.encrypt();
    
    // Debug: Log raw ciphertext data (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('Raw ciphertexts:', {
        handles: ciphertexts.handles,
        handlesType: typeof ciphertexts.handles[0],
        handlesLength: ciphertexts.handles[0]?.length,
        inputProof: ciphertexts.inputProof
      });
    }
    
    // Ensure handle is exactly 32 bytes (bytes32)
    let handle = ciphertexts.handles[0];
    
    // Convert to proper hex string if it's not already
    if (typeof handle === 'string') {
      // Already a hex string
      if (handle.length !== 66) { // 0x + 64 hex chars = 66 total
        console.warn('Handle length:', handle.length, 'Expected: 66');
        // Pad with zeros if too short
        if (handle.length < 66) {
          handle = handle + '0'.repeat(66 - handle.length);
        }
      }
    } else {
      // Convert Uint8Array to hex string, ensuring exactly 32 bytes
      if (handle.length > 32) {
        // Truncate to exactly 32 bytes
        handle = handle.slice(0, 32);
        console.warn('Handle truncated to 32 bytes from:', handle.length);
      } else if (handle.length < 32) {
        // Pad with zeros to exactly 32 bytes
        const padded = new Uint8Array(32);
        padded.set(handle);
        handle = padded;
        console.warn('Handle padded to 32 bytes from:', handle.length);
      }
      
      // Convert to hex string
      handle = ethers.hexlify(handle);
    }
    
    // Remove "0x" prefix for Oracle (Oracle expects raw 32 bytes)
    const handleWithoutPrefix = handle.startsWith('0x') ? handle.slice(2) : handle;
    
    // Final validation - Oracle expects exactly 64 hex chars (32 bytes)
    if (handleWithoutPrefix.length !== 64) {
      throw new Error(`Invalid handle length: ${handleWithoutPrefix.length}, expected 64 (32 bytes without 0x)`);
    }
    
    return {
      handle: '0x' + handleWithoutPrefix, // Contract expects 0x prefix for externalEuint8
      proof: ciphertexts.inputProof,
      hash: ethers.keccak256('0x' + handleWithoutPrefix) // For verification
    };
  } catch (error) {
    console.error('Failed to encrypt move:', error);
    
    // More specific error messages
    if (error.message?.includes('createEncryptedInput')) {
      throw new Error('Failed to create encrypted input. Please check contract address and user address.');
    } else if (error.message?.includes('encrypt')) {
      throw new Error('Failed to encrypt move. Please try again.');
    }
    
    throw error;
  }
}

// Decrypt a single encrypted value using the relayer
export async function decryptValue(encryptedBytes) {
  const fhe = getFheInstance();
  if (!fhe) throw new Error('FHE instance not initialized. Call initializeFheInstance() first.');

  try {
    // Always pass an array of hex strings
    let handle = encryptedBytes;
    if (typeof handle === "string" && handle.startsWith("0x") && handle.length === 66) {
      const values = await fhe.publicDecrypt([handle]);
      // values is an object: { [handle]: value }
      return Number(values[handle]);
    } else {
      throw new Error('Invalid ciphertext handle for decryption');
    }
  } catch (error) {
    // Check for relayer/network error
    if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
      throw new Error('Decryption service is temporarily unavailable. Please try again later.');
    }
    throw error;
  }
}

// Public decrypt (for revealing game results)
export async function publicDecrypt(handles) {
  try {
    const fhe = getFheInstance();
    if (!fhe) throw new Error('FHE instance not initialized. Call initializeFheInstance() first.');
    
    // Ensure handles is an array
    const handleArray = Array.isArray(handles) ? handles : [handles];
    
    // Filter valid handles (should be 66 characters starting with 0x)
    const validHandles = handleArray.filter(handle => 
      typeof handle === "string" && 
      handle.startsWith("0x") && 
      handle.length === 66
    );
    
    if (validHandles.length === 0) {
      throw new Error('No valid ciphertext handles for decryption');
    }
    
    const values = await fhe.publicDecrypt(validHandles);
    
    // If single handle requested, return single value
    if (!Array.isArray(handles)) {
      return values[validHandles[0]];
    }
    
    return values;
  } catch (error) {
    console.error('Failed to public decrypt:', error);
    
    // Check for relayer/network error
    if (error?.message?.includes('Failed to fetch') || 
        error?.message?.includes('NetworkError')) {
      throw new Error('Decryption service is temporarily unavailable. Please try again later.');
    }
    
    throw error;
  }
}

// Check if FHE is available
export function isFheAvailable() {
  return typeof window !== 'undefined' && window.ethereum;
}