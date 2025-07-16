const getNodeWebcrypto = () => {
  try {
    // Prevent bundlers from statically analysing the require call
    // eslint-disable-next-line no-new-func
    const _require = new Function('m', 'return require(m);');
    return _require('crypto').webcrypto;
  } catch (_) {
    return undefined;
  }
};

const webcrypto = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
  ? globalThis.crypto
  : getNodeWebcrypto();

if (!webcrypto) {
  throw new Error('Web Crypto API not available in this environment');
}

const subtle = webcrypto.subtle;

/**
 * Import raw key material (Uint8Array or ArrayBuffer) into a CryptoKey.
 * If a CryptoKey is passed, returns it unchanged.
 * @param {CryptoKey|Uint8Array|ArrayBuffer|string} keyMaterial – 256-bit key or CryptoKey.
 *        If string, it must be base64-encoded.
 * @returns {Promise<CryptoKey>}
 */
async function getKey(keyMaterial) {
  if (typeof globalThis.CryptoKey !== 'undefined' && keyMaterial instanceof globalThis.CryptoKey) {
    return keyMaterial;
  }
  let raw;
  if (typeof keyMaterial === 'string') {
    raw = fromBase64(keyMaterial);
  } else if (keyMaterial instanceof ArrayBuffer) {
    raw = new Uint8Array(keyMaterial);
  } else if (ArrayBuffer.isView(keyMaterial)) {
    raw = new Uint8Array(keyMaterial.buffer, keyMaterial.byteOffset, keyMaterial.byteLength);
  } else {
    throw new TypeError('Invalid key material');
  }
  if (raw.length !== 32) {
    throw new Error('AES-GCM key must be 256 bits (32 bytes)');
  }
  return subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

function toBase64(ab) {
  const uint8Array = new Uint8Array(ab);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(b64);
  const uint8Array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    uint8Array[i] = binary.charCodeAt(i);
  }
  return uint8Array;
}

/**
 * Encrypt text or binary data with AES-GCM-256.
 * @param {string|ArrayBuffer|Uint8Array} data
 * @param {CryptoKey|Uint8Array|ArrayBuffer|string} keyMaterial – 256-bit key.
 * @returns {Promise<{iv:string,ciphertext:string,tag:string}>}
 */
async function encryptBlob(data, keyMaterial) {
  const key = await getKey(keyMaterial);
  const iv = webcrypto.getRandomValues(new Uint8Array(12)); // 96-bit IV recommended for GCM
  const plainBytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const cipherBuf = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  const cipherBytes = new Uint8Array(cipherBuf);
  // Split ciphertext and tag (last 16 bytes)
  const tagBytes = cipherBytes.slice(-16);
  const ctBytes = cipherBytes.slice(0, -16);
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(ctBytes),
    tag: toBase64(tagBytes)
  };
}

/**
 * Decrypt previously encrypted blob.
 * @param {{iv:string,ciphertext:string,tag:string}} cipher
 * @param {CryptoKey|Uint8Array|ArrayBuffer|string} keyMaterial
 * @returns {Promise<string>} plaintext (UTF-8)
 */
async function decryptBlob(cipher, keyMaterial) {
  const { iv, ciphertext, tag } = cipher;
  const key = await getKey(keyMaterial);
  const ivBytes = fromBase64(iv);
  const ctBytes = fromBase64(ciphertext);
  const tagBytes = fromBase64(tag);
  const combined = new Uint8Array([...ctBytes, ...tagBytes]);
  const plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, combined);
  return new TextDecoder().decode(plainBuf);
}

// Export named functions for ES Module compatibility
export { encryptBlob, decryptBlob }; 