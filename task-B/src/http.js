const fetch = require('cross-fetch');
const { encryptBlob, decryptBlob } = require('./crypto');

/**
 * Uploads an encrypted blob to the Task-A endpoint.
 * The endpoint expects a POST body with the raw encrypted bytes.
 * Returns the blobKey string returned by the server.
 *
 * @param {Blob|ArrayBuffer|Uint8Array} blob – Ciphertext to send.
 * @param {string} apiUrl – Full Task-A Lambda URL (no trailing slash).
 * @param {string} [token] – Optional Bearer token for auth.
 * @returns {Promise<string>} blobKey
 */
async function uploadBlob(blob, apiUrl, token) {
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(token && { Authorization: `Bearer ${token}` })
    },
    body: blob
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Upload failed: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  if (!data.blobKey) {
    throw new Error('Malformed response: missing blobKey');
  }
  return data.blobKey;
}

/**
 * Downloads an encrypted blob via GET and decrypts it.
 * Assumes Task-A exposes a GET {apiUrl}/{blobKey} endpoint.
 * @param {string} blobKey
 * @param {string} apiUrl – Base URL (no trailing slash)
 * @param {CryptoKey|Uint8Array|ArrayBuffer|string} key
 * @returns {Promise<string>} plaintext
 */
async function downloadAndDecrypt(blobKey, apiUrl, key) {
  const resp = await fetch(`${apiUrl}/${encodeURIComponent(blobKey)}`);
  if (!resp.ok) {
    throw new Error(`Download failed: ${resp.status}`);
  }
  const cipher = await resp.json();
  return decryptBlob(cipher, key);
}

module.exports = { uploadBlob, downloadAndDecrypt }; 