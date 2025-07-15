const { webcrypto } = require('crypto');
const subtle = webcrypto.subtle;

/**
 * Import raw key material (Uint8Array or ArrayBuffer) into a CryptoKey.
 * If a CryptoKey is passed, returns it unchanged.
 * @param {CryptoKey|Uint8Array|ArrayBuffer|string} keyMaterial – 256-bit key or CryptoKey.
 *        If string, it must be base64-encoded.
 * @returns {Promise<CryptoKey>}
 */
async function getKey(keyMaterial) {
  if (keyMaterial instanceof webcrypto.CryptoKey) {
    return keyMaterial;
  }
  let raw;
  if (typeof keyMaterial === 'string') {
    raw = Buffer.from(keyMaterial, 'base64');
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
  return Buffer.from(ab).toString('base64');
}

function fromBase64(b64) {
  return Buffer.from(b64, 'base64');
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
  const plainBytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : new Uint8Array(data);
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
  const combined = Buffer.concat([ctBytes, tagBytes]);
  const plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, combined);
  return Buffer.from(plainBuf).toString('utf8');
}

module.exports = { encryptBlob, decryptBlob }; 