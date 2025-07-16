import fetch from 'cross-fetch';
import { encryptBlob, decryptBlob } from './crypto.js';

/**
 * Upload encrypted blob to API endpoint.
 * @param {Blob} blob – encrypted data
 * @param {string} apiUrl – API endpoint URL
 * @returns {Promise<string>} blobKey for retrieval
 */
async function uploadBlob(blob, apiUrl) {
  // Mock mode for demo when API URL is placeholder
  if (apiUrl.includes('xxxxx')) {
    console.log('Mock mode: simulating blob upload');
    return 'mock-blob-key-' + Date.now();
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: blob
  });
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }
  return response.text();
}

/**
 * Download and decrypt blob from API.
 * @param {string} blobKey
 * @param {string} apiUrl
 * @param {Uint8Array} keyBytes – decryption key
 * @returns {Promise<string>} decrypted plaintext
 */
async function downloadAndDecrypt(blobKey, apiUrl, keyBytes) {
  // Mock mode for demo when API URL is placeholder
  if (apiUrl.includes('xxxxx')) {
    console.log('Mock mode: simulating blob download and decrypt');
    return 'Mock decrypted content: This would be the decrypted audio data from the server.';
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blobKey })
  });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  const { plaintext } = await response.json();
  return plaintext;
}

export { uploadBlob, downloadAndDecrypt }; 