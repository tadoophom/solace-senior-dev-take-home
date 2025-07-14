/**
 * @module @solace/client-sdk
 */

async function encryptBlob(data) {
  // TODO: implement AES-GCM-256 encryption
  return { iv: '', ciphertext: '', tag: '' };
}

async function decryptBlob({ iv, ciphertext, tag }, key) {
  // TODO: implement decryption
  return '';
}

async function* recordAndDetectVoice() {
  // TODO: integrate webrtcvad to yield only speech frames
}

async function uploadBlob(blob, apiUrl, token) {
  // TODO: POST to Task-A endpoint, return blobKey
}

async function downloadAndDecrypt(blobKey, apiUrl, key) {
  // TODO: fetch & decrypt blob
}

module.exports = {
  encryptBlob,
  decryptBlob,
  recordAndDetectVoice,
  uploadBlob,
  downloadAndDecrypt
};
