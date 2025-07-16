/**
 * @module @solace/client-sdk
 */
import { encryptBlob, decryptBlob } from './crypto.js';
import { recordAndDetectVoice } from './vad/index.js';
import { uploadBlob, downloadAndDecrypt } from './http.js';

// Public SDK interface
export {
  encryptBlob,
  decryptBlob,
  recordAndDetectVoice,
  uploadBlob,
  downloadAndDecrypt
};
