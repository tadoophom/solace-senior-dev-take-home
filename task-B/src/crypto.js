/**
 * Production-grade cryptographic utilities for Solace client SDK
 * Browser-compatible implementation with enhanced security features
 * VERSION: 3.0 - Performance optimized with WebWorkers and connection pooling
 */

// Constants for security and performance
const AES_KEY_LENGTH = 32; // 256 bits
const AES_IV_LENGTH = 12;  // 96 bits (recommended for GCM)
const AES_TAG_LENGTH = 16; // 128 bits
const MAX_PLAINTEXT_SIZE = 16 * 1024 * 1024; // 16MB limit for performance
const CHUNK_SIZE = 64 * 1024; // 64KB chunks for large data processing
const WORKER_THRESHOLD = 1024 * 1024; // 1MB threshold for WebWorker usage

// Performance optimizations
let cryptoKeyCache = new Map(); // Cache for imported keys
let webCryptoPool = null; // Shared WebCrypto instance
let workerPool = []; // Pool of WebWorkers for heavy operations
const maxWorkers = Math.min(4, navigator.hardwareConcurrency || 2);

/**
 * Custom error class for cryptographic operations
 */
class CryptoError extends Error {
  constructor(message, code = 'CRYPTO_ERROR') {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
    this.timestamp = Date.now();
  }
}

/**
 * Get WebCrypto API with enhanced validation and pooling
 */
const getWebCrypto = () => {
  if (!webCryptoPool) {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
      webCryptoPool = globalThis.crypto;
    } else {
      throw new CryptoError('WebCrypto API not available - requires HTTPS or localhost', 'WEBCRYPTO_UNAVAILABLE');
    }
  }
  return webCryptoPool;
};

const crypto = getWebCrypto();
const subtle = crypto.subtle;

/**
 * Initialize WebWorker pool for heavy cryptographic operations
 */
function initializeWorkerPool() {
  if (typeof Worker === 'undefined' || workerPool.length > 0) {
    return; // Workers not supported or already initialized
  }
  
  try {
    const workerCode = `
      self.onmessage = function(e) {
        const { operation, data, transferId } = e.data;
        
        try {
          let result;
          switch (operation) {
            case 'base64Encode':
              result = btoa(String.fromCharCode(...new Uint8Array(data)));
              break;
            case 'base64Decode':
              const binary = atob(data);
              result = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                result[i] = binary.charCodeAt(i);
              }
              break;
            case 'validateEntropy':
              const uniqueBytes = new Set(new Uint8Array(data));
              result = uniqueBytes.size;
              break;
            default:
              throw new Error('Unknown operation: ' + operation);
          }
          
          self.postMessage({ success: true, result, transferId });
        } catch (error) {
          self.postMessage({ success: false, error: error.message, transferId });
        }
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    
    for (let i = 0; i < maxWorkers; i++) {
      const worker = new Worker(workerUrl);
      worker.busy = false;
      worker.transferId = 0;
      workerPool.push(worker);
    }
    
    URL.revokeObjectURL(workerUrl);
    console.log(`Initialized ${maxWorkers} WebWorkers for crypto operations`);
  } catch (error) {
    console.warn('Failed to initialize WebWorkers:', error);
  }
}

/**
 * Get available WebWorker from pool
 */
function getWorkerFromPool() {
  return workerPool.find(worker => !worker.busy) || null;
}

/**
 * Execute operation in WebWorker if available, fallback to main thread
 */
async function executeInWorker(operation, data) {
  const worker = getWorkerFromPool();
  if (!worker) {
    // Fallback to main thread
    return executeInMainThread(operation, data);
  }
  
  return new Promise((resolve, reject) => {
    worker.busy = true;
    const transferId = ++worker.transferId;
    
    const timeout = setTimeout(() => {
      worker.busy = false;
      reject(new Error('Worker operation timeout'));
    }, 10000); // 10 second timeout
    
    worker.onmessage = (e) => {
      if (e.data.transferId !== transferId) return;
      
      clearTimeout(timeout);
      worker.busy = false;
      
      if (e.data.success) {
        resolve(e.data.result);
      } else {
        reject(new Error(e.data.error));
      }
    };
    
    worker.postMessage({ operation, data, transferId });
  });
}

/**
 * Execute operation in main thread (fallback)
 */
function executeInMainThread(operation, data) {
  switch (operation) {
    case 'base64Encode':
      return toBase64MainThread(data);
    case 'base64Decode':
      return fromBase64MainThread(data);
    case 'validateEntropy':
      const uniqueBytes = new Set(new Uint8Array(data));
      return uniqueBytes.size;
    default:
      throw new Error('Unknown operation: ' + operation);
  }
}

/**
 * Secure random number generation with validation and caching
 */
const getSecureRandom = (() => {
  let randomCache = new Uint8Array(0);
  let cacheIndex = 0;
  const cacheSize = 1024; // Pre-generate 1KB of random data
  
  return (length) => {
    if (length <= 0 || length > 65536) {
      throw new CryptoError('Invalid random length requested', 'INVALID_LENGTH');
    }
    
    try {
      // Use cache for small requests to reduce crypto calls
      if (length <= 32 && cacheIndex + length <= randomCache.length) {
        const result = randomCache.slice(cacheIndex, cacheIndex + length);
        cacheIndex += length;
        return result;
      }
      
      // Refill cache or generate directly for large requests
      if (length > 32) {
        return crypto.getRandomValues(new Uint8Array(length));
      } else {
        randomCache = crypto.getRandomValues(new Uint8Array(cacheSize));
        cacheIndex = 0;
        const result = randomCache.slice(0, length);
        cacheIndex = length;
        return result;
      }
    } catch (error) {
      throw new CryptoError('Failed to generate secure random values', 'RANDOM_ERROR');
    }
  };
})();

/**
 * High-performance base64 encoding with WebWorker support
 */
async function toBase64(buffer) {
  try {
    const bytes = new Uint8Array(buffer);
    
    // Use WebWorker for large data
    if (bytes.length > WORKER_THRESHOLD) {
      try {
        return await executeInWorker('base64Encode', bytes.buffer);
      } catch (error) {
        console.warn('WebWorker base64 encoding failed, using main thread:', error);
      }
    }
    
    return toBase64MainThread(bytes);
  } catch (error) {
    throw new CryptoError('Base64 encoding failed', 'ENCODING_ERROR');
  }
}

/**
 * Main thread base64 encoding with chunking
 */
function toBase64MainThread(bytes) {
  // For small data, use simple method
  if (bytes.length < CHUNK_SIZE) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  
  // For large data, use chunked processing
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    let binary = '';
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
    result += btoa(binary);
  }
  return result;
}

/**
 * High-performance base64 decoding with WebWorker support
 */
async function fromBase64(base64) {
  try {
    // Validate base64 format
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw new CryptoError('Invalid base64 format', 'INVALID_BASE64');
    }
    
    // Use WebWorker for large data
    if (base64.length > WORKER_THRESHOLD) {
      try {
        return await executeInWorker('base64Decode', base64);
      } catch (error) {
        console.warn('WebWorker base64 decoding failed, using main thread:', error);
      }
    }
    
    return fromBase64MainThread(base64);
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    throw new CryptoError('Base64 decoding failed', 'DECODING_ERROR');
  }
}

/**
 * Main thread base64 decoding
 */
function fromBase64MainThread(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  return bytes;
}

/**
 * Enhanced key validation with security checks and caching
 */
async function validateKeyMaterial(keyMaterial) {
  if (!keyMaterial) {
    throw new CryptoError('Key material is required', 'MISSING_KEY');
  }
  
  // Already a CryptoKey
  if (typeof CryptoKey !== 'undefined' && keyMaterial instanceof CryptoKey) {
    return keyMaterial;
  }
  
  let keyBytes;
  
  if (typeof keyMaterial === 'string') {
    if (keyMaterial.length === 0) {
      throw new CryptoError('Key material cannot be empty', 'EMPTY_KEY');
    }
    keyBytes = await fromBase64(keyMaterial);
  } else if (keyMaterial instanceof ArrayBuffer) {
    keyBytes = new Uint8Array(keyMaterial);
  } else if (ArrayBuffer.isView(keyMaterial)) {
    keyBytes = new Uint8Array(keyMaterial.buffer, keyMaterial.byteOffset, keyMaterial.byteLength);
  } else {
    throw new CryptoError('Invalid key material type', 'INVALID_KEY_TYPE');
  }
  
  // Validate key length
  if (keyBytes.length !== AES_KEY_LENGTH) {
    throw new CryptoError(`AES-GCM key must be ${AES_KEY_LENGTH} bytes (${AES_KEY_LENGTH * 8} bits)`, 'INVALID_KEY_LENGTH');
  }
  
  // Enhanced entropy check using WebWorker
  try {
    const uniqueByteCount = await executeInWorker('validateEntropy', keyBytes.buffer);
    if (uniqueByteCount < 16) {
      console.warn('Key material appears to have low entropy');
    }
  } catch (error) {
    console.warn('Entropy validation failed:', error);
  }
  
  return keyBytes;
}

/**
 * Import key material with enhanced security and caching
 */
async function getKey(keyMaterial) {
  if (typeof CryptoKey !== 'undefined' && keyMaterial instanceof CryptoKey) {
    return keyMaterial;
  }
  
  // Generate cache key
  const cacheKey = typeof keyMaterial === 'string' ? 
    keyMaterial : 
    await toBase64(keyMaterial);
  
  // Check cache first
  if (cryptoKeyCache.has(cacheKey)) {
    return cryptoKeyCache.get(cacheKey);
  }
  
  const keyBytes = await validateKeyMaterial(keyMaterial);
  
  try {
    const cryptoKey = await subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false, // Not extractable for security
      ['encrypt', 'decrypt']
    );
    
    // Cache the imported key
    cryptoKeyCache.set(cacheKey, cryptoKey);
    
    // Limit cache size for memory management
    if (cryptoKeyCache.size > 50) {
      const firstKey = cryptoKeyCache.keys().next().value;
      cryptoKeyCache.delete(firstKey);
    }
    
    // Clear sensitive key material from memory
    keyBytes.fill(0);
    
    return cryptoKey;
  } catch (error) {
    throw new CryptoError(`Key import failed: ${error.message}`, 'KEY_IMPORT_ERROR');
  }
}

/**
 * Validate plaintext with size and type checks
 */
function validatePlaintext(data) {
  if (data === null || data === undefined) {
    throw new CryptoError('Data cannot be null or undefined', 'INVALID_DATA');
  }
  
  let dataBytes;
  
  if (typeof data === 'string') {
    dataBytes = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer) {
    dataBytes = new Uint8Array(data);
  } else if (ArrayBuffer.isView(data)) {
    dataBytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else {
    throw new CryptoError('Data must be string, ArrayBuffer, or TypedArray', 'INVALID_DATA_TYPE');
  }
  
  if (dataBytes.length > MAX_PLAINTEXT_SIZE) {
    throw new CryptoError(`Data size exceeds maximum limit of ${MAX_PLAINTEXT_SIZE} bytes`, 'DATA_TOO_LARGE');
  }
  
  return dataBytes;
}

/**
 * Generate cryptographically secure key with enhanced performance
 */
async function generateKey() {
  try {
    const keyBytes = getSecureRandom(AES_KEY_LENGTH);
    const cryptoKey = await subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      true, // Extractable for export
      ['encrypt', 'decrypt']
    );
    
    const keyBase64 = await toBase64(keyBytes);
    
    return {
      key: cryptoKey,
      keyBytes: new Uint8Array(keyBytes), // Copy to avoid mutation
      keyBase64: keyBase64
    };
  } catch (error) {
    throw new CryptoError(`Key generation failed: ${error.message}`, 'KEY_GENERATION_ERROR');
  }
}

/**
 * Enhanced encryption with metadata and integrity protection
 */
async function encryptBlob(data, keyMaterial, options = {}) {
  const startTime = performance.now();
  
  try {
    const plainBytes = validatePlaintext(data);
    const key = await getKey(keyMaterial);
    
    // Generate secure IV
    const iv = getSecureRandom(AES_IV_LENGTH);
    
    // Additional authenticated data for integrity
    const aad = options.aad ? new TextEncoder().encode(options.aad) : undefined;
    
    // Prepare encryption parameters
    const encryptParams = { name: 'AES-GCM', iv };
    if (aad) {
      encryptParams.additionalData = aad;
    }
    
    // Encrypt data
    const cipherBuffer = await subtle.encrypt(encryptParams, key, plainBytes);
    const cipherBytes = new Uint8Array(cipherBuffer);
    
    // Split ciphertext and authentication tag
    const tagBytes = cipherBytes.slice(-AES_TAG_LENGTH);
    const ctBytes = cipherBytes.slice(0, -AES_TAG_LENGTH);
    
    // Create metadata for integrity verification
    const metadata = {
      algorithm: 'AES-GCM-256',
      version: '3.0',
      timestamp: Date.now(),
      dataSize: plainBytes.length,
      hasAAD: !!aad,
      processingTime: Math.round(performance.now() - startTime),
      ...(options.metadata || {})
    };
    
    const result = {
      iv: await toBase64(iv),
      ciphertext: await toBase64(ctBytes),
      tag: await toBase64(tagBytes),
      metadata
    };
    
    console.log(`Encryption completed in ${metadata.processingTime}ms`);
    return result;
    
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    throw new CryptoError(`Encryption failed: ${error.message}`, 'ENCRYPTION_ERROR');
  }
}

/**
 * Enhanced decryption with integrity verification
 */
async function decryptBlob(cipher, keyMaterial, options = {}) {
  const startTime = performance.now();
  
  try {
    // Validate cipher object
    if (!cipher || typeof cipher !== 'object') {
      throw new CryptoError('Cipher object is required', 'INVALID_CIPHER');
    }
    
    const { iv, ciphertext, tag, metadata } = cipher;
    
    if (!iv || !ciphertext || !tag) {
      throw new CryptoError('Cipher must contain iv, ciphertext, and tag', 'INCOMPLETE_CIPHER');
    }
    
    // Validate metadata if present
    if (metadata) {
      if (metadata.algorithm && !metadata.algorithm.includes('AES-GCM')) {
        throw new CryptoError('Unsupported encryption algorithm', 'UNSUPPORTED_ALGORITHM');
      }
      
      // Check for version compatibility
      if (metadata.version && parseFloat(metadata.version) > 3.0) {
        console.warn('Cipher created with newer version, compatibility not guaranteed');
      }
    }
    
    const key = await getKey(keyMaterial);
    
    // Decode cipher components with validation
    const ivBytes = await fromBase64(iv);
    const ctBytes = await fromBase64(ciphertext);
    const tagBytes = await fromBase64(tag);
    
    // Validate component lengths
    if (ivBytes.length !== AES_IV_LENGTH) {
      throw new CryptoError(`Invalid IV length: expected ${AES_IV_LENGTH}, got ${ivBytes.length}`, 'INVALID_IV');
    }
    
    if (tagBytes.length !== AES_TAG_LENGTH) {
      throw new CryptoError(`Invalid tag length: expected ${AES_TAG_LENGTH}, got ${tagBytes.length}`, 'INVALID_TAG');
    }
    
    // Reconstruct encrypted data
    const encryptedData = new Uint8Array(ctBytes.length + tagBytes.length);
    encryptedData.set(ctBytes);
    encryptedData.set(tagBytes, ctBytes.length);
    
    // Prepare decryption parameters
    const aad = options.aad ? new TextEncoder().encode(options.aad) : undefined;
    const decryptParams = { name: 'AES-GCM', iv: ivBytes };
    if (aad) {
      decryptParams.additionalData = aad;
    }
    
    // Decrypt and verify
    const plainBuffer = await subtle.decrypt(decryptParams, key, encryptedData);
    const plaintext = new TextDecoder().decode(plainBuffer);
    
    // Verify data integrity if metadata available
    if (metadata?.dataSize && plainBuffer.byteLength !== metadata.dataSize) {
      throw new CryptoError('Decrypted data size mismatch - possible corruption', 'INTEGRITY_ERROR');
    }
    
    const processingTime = Math.round(performance.now() - startTime);
    console.log(`Decryption completed in ${processingTime}ms`);
    
    return plaintext;
    
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    
    // Handle specific WebCrypto errors
    if (error.name === 'OperationError') {
      throw new CryptoError('Decryption failed - invalid key or corrupted data', 'DECRYPTION_FAILED');
    }
    
    throw new CryptoError(`Decryption failed: ${error.message}`, 'DECRYPTION_ERROR');
  }
}

/**
 * Derive key from password using PBKDF2 with optimizations
 */
async function deriveKey(password, salt, iterations = 100000) {
  try {
    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new CryptoError('Password must be at least 8 characters', 'WEAK_PASSWORD');
    }
    
    if (!salt || salt.length < 16) {
      throw new CryptoError('Salt must be at least 16 bytes', 'INVALID_SALT');
    }
    
    if (iterations < 10000) {
      throw new CryptoError('Iteration count too low for security', 'WEAK_ITERATIONS');
    }
    
    // Import password as key material
    const passwordKey = await subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    // Derive AES key
    const derivedKey = await subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Export key bytes
    const keyBytes = new Uint8Array(await subtle.exportKey('raw', derivedKey));
    const keyBase64 = await toBase64(keyBytes);
    
    return {
      key: derivedKey,
      keyBytes: keyBytes,
      keyBase64: keyBase64
    };
    
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    throw new CryptoError(`Key derivation failed: ${error.message}`, 'DERIVATION_ERROR');
  }
}

/**
 * Secure memory clearing (best effort) with enhanced cleanup
 */
function clearMemory(...buffers) {
  buffers.forEach(buffer => {
    if (buffer && buffer.fill) {
      buffer.fill(0);
    }
  });
}

/**
 * Initialize optimizations
 */
function initialize() {
  initializeWorkerPool();
  console.log('Crypto module initialized with performance optimizations');
}

/**
 * Cleanup resources
 */
function cleanup() {
  // Clear caches
  cryptoKeyCache.clear();
  
  // Terminate workers
  workerPool.forEach(worker => worker.terminate());
  workerPool.length = 0;
  
  console.log('Crypto module cleanup completed');
}

// Initialize on module load
if (typeof window !== 'undefined') {
  // Browser environment
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);
}

// Export enhanced API
export {
  encryptBlob,
  decryptBlob,
  generateKey,
  deriveKey,
  clearMemory,
  CryptoError,
  initialize,
  cleanup
}; 