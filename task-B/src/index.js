/**
 * @module @solace/client-sdk
 */
const { encryptBlob, decryptBlob } = require('./crypto');
const { recordAndDetectVoice } = require('./vad/index');
const { uploadBlob, downloadAndDecrypt } = require('./http');

module.exports = {
  encryptBlob,
  decryptBlob,
  recordAndDetectVoice,
  uploadBlob,
  downloadAndDecrypt
};
