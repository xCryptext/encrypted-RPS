// FHE Utility functions using Zama Relayer SDK
import { ethers } from 'ethers';

// SDK CDN URL
// Use proxy path in development to avoid CORS issues
const SDK_URL = import.meta.env.DEV 
  ? '/cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.js'
  : 'https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.js';
let sdkLoaded = false;
let sdkLoadPromise = null;

let fheInstance = null;

/**
 * Load the FHE SDK from CDN
 * Uses Vite proxy in development to avoid CORS issues
 * Falls back to script tag method if dynamic import fails
 */
async function loadSDK() {
  // If already loaded, return immediately
  if (sdkLoaded && window.RelayerSDK) {
    return window.RelayerSDK;
  }

  // If currently loading, wait for that promise
  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  // Method 1: Try dynamic import (works with Vite proxy in dev, or if CDN has CORS headers in prod)
  const tryDynamicImport = async () => {
    try {
      // Use @vite-ignore to allow external URL imports
      const module = await import(/* @vite-ignore */ SDK_URL);
      window.RelayerSDK = module;
      sdkLoaded = true;
      return module;
    } catch (err) {
      console.warn('Dynamic import failed, trying script tag method:', err.message);
      throw err;
    }
  };

  // Method 2: Use script tag as fallback (for production if CORS is still an issue)
  const tryScriptTag = () => {
    return new Promise((resolve, reject) => {
      // Check if script already exists
      const existingScript = document.querySelector(`script[src="${SDK_URL}"]`);
      if (existingScript) {
        // Wait for SDK to be available
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          const sdk = window.RelayerSDK || (window.fhevm && window.fhevm.initSDK ? window.fhevm : null);
          if (sdk) {
            clearInterval(checkInterval);
            window.RelayerSDK = sdk;
            sdkLoaded = true;
            resolve(sdk);
          } else if (attempts >= 100) {
            clearInterval(checkInterval);
            reject(new Error('SDK did not load within timeout'));
          }
        }, 100);
        return;
      }

      // Create script element
      const script = document.createElement('script');
      script.type = 'module';
      script.src = SDK_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';

      // Handle successful load
      script.onload = () => {
        // Give the module time to execute
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        const checkSDK = setInterval(() => {
          attempts++;
          
          // Check various possible SDK locations
          const sdk = window.RelayerSDK || window.fhevm || window.FHE || null;
          
          if (sdk) {
            clearInterval(checkSDK);
            window.RelayerSDK = sdk;
            sdkLoaded = true;
            resolve(sdk);
          } else if (attempts >= maxAttempts) {
            clearInterval(checkSDK);
            reject(new Error('SDK loaded but exports not found'));
          }
        }, 100);
      };

      // Handle load errors
      script.onerror = (error) => {
        script.remove();
        reject(new Error(`Failed to load FHE SDK script: ${error.message || 'Unknown error'}`));
      };

      // Append to document head
      document.head.appendChild(script);
    });
  };

  // Try dynamic import first (should work with Vite proxy)
  // Fall back to script tag if that fails
  sdkLoadPromise = tryDynamicImport().catch((err) => {
    console.warn('Falling back to script tag method:', err.message);
    return tryScriptTag();
  });

  return sdkLoadPromise;
}

export async function initializeFheInstance() {
  // Check if ethereum is available (prevents mobile crashes)
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('Ethereum provider not found. Please install MetaMask or connect a wallet.');
  }

  // Patch fetch to proxy ALL Zama CDN requests in development (WASM, JS, etc.)
  const originalFetch = window.fetch;
  const proxyEnabled = import.meta.env.DEV;
  
  if (proxyEnabled) {
    window.fetch = function(input, init) {
      // Handle both string URLs and Request objects
      let url;
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof Request) {
        url = input.url;
      } else {
        url = input?.url || input?.href || '';
      }
      
      // Intercept ALL requests to Zama CDN and proxy them (WASM, JS, and other resources)
      // Only proxy absolute HTTPS URLs, not already-proxied relative URLs
      if (url && url.includes('cdn.zama.ai') && url.startsWith('https://')) {
        const proxiedUrl = url.replace('https://cdn.zama.ai', '/cdn.zama.ai');
        console.log(`Proxying CDN request: ${url} -> ${proxiedUrl}`);
        
        // If input is a Request object, create a new one with the proxied URL
        if (input instanceof Request) {
          return originalFetch(new Request(proxiedUrl, {
            method: input.method,
            headers: input.headers,
            body: input.body,
            mode: input.mode,
            credentials: input.credentials,
            cache: input.cache,
            redirect: input.redirect,
            referrer: input.referrer,
            integrity: input.integrity,
            ...init
          }), init);
        }
        
        return originalFetch(proxiedUrl, init);
      }
      
      return originalFetch(input, init);
    };
  }

  try {
    // Load SDK from CDN using script tag (avoids CORS issues)
    const sdk = await loadSDK();

    // The SDK should export initSDK, createInstance, and SepoliaConfig
    // If it's a module, these will be on the default export or named exports
    let initSDK, createInstance, SepoliaConfig;

    if (sdk.default) {
      // ES module with default export
      ({ initSDK, createInstance, SepoliaConfig } = sdk.default);
    } else if (sdk.initSDK) {
      // Direct named exports
      ({ initSDK, createInstance, SepoliaConfig } = sdk);
    } else {
      // Try accessing as global
      const globalSDK = window.RelayerSDK || window.fhevm || window;
      if (globalSDK.initSDK) {
        ({ initSDK, createInstance, SepoliaConfig } = globalSDK);
      } else {
        throw new Error('SDK structure not recognized. Expected initSDK, createInstance, and SepoliaConfig exports.');
      }
    }

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
    
    // Keep fetch patched for the entire session - SDK may need more files later
    // Only restore in production or if explicitly needed
    // Don't restore fetch - SDK may load additional resources asynchronously
    
    return fheInstance;
  } catch (err) {
    // Keep fetch patched even on error - might be needed for retries
    // Only restore if we're sure initialization has completely failed
    
    console.error('FHEVM instance creation failed:', err);
    
    // More specific error messages
    if (err.message?.includes('Failed to fetch') || err.message?.includes('Failed to load')) {
      throw new Error('Failed to load FHE SDK. Please check your internet connection and try refreshing the page.');
    } else if (err.message?.includes('NetworkError')) {
      throw new Error('Network error while loading FHE SDK. Please try again.');
    } else if (err.message?.includes('WASM')) {
      throw new Error('Failed to load FHE WASM module. Please refresh the page.');
    } else if (err.message?.includes('CORS')) {
      throw new Error('CORS error loading SDK. This should be resolved by using script tag loading.');
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