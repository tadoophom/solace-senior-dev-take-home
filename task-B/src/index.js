const { webcrypto } = require('crypto');
const { subtle, getRandomValues } = webcrypto;
const { TextEncoder, TextDecoder } = require('util');

async function encryptBlob(data, keyMaterial) {
  const enc = new TextEncoder();
  const iv = getRandomValues(new Uint8Array(12));
  const key = await subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt']);
  const encrypted = new Uint8Array(await subtle.encrypt(
    { name: 'AES-GCM', iv },
    enc.encode(data),
    key
  ));
  const tag = encrypted.slice(encrypted.length - 16);
  const ciphertext = encrypted.slice(0, encrypted.length - 16);
  return {
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(ciphertext).toString('base64'),
    tag: Buffer.from(tag).toString('base64'),
  };
}

async function decryptBlob({ iv, ciphertext, tag }, keyMaterial) {
  const ivBuf = Buffer.from(iv, 'base64');
  const ctBuf = Buffer.from(ciphertext, 'base64');
  const tagBuf = Buffer.from(tag, 'base64');
  const data = new Uint8Array([...ctBuf, ...tagBuf]);
  const key = await subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, key, data);
  return new TextDecoder().decode(decrypted);
}

// stubs for VAD and upload/download
async function* recordAndDetectVoice() { /* ... */ }
async function uploadBlob(blob, apiUrl, token) { /* ... */ }
async function downloadAndDecrypt(blobKey, apiUrl, key) { /* ... */ }

module.exports = {
  encryptBlob,
  decryptBlob,
  recordAndDetectVoice,
  uploadBlob,
  downloadAndDecrypt
};
