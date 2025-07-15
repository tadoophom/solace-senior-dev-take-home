/**
 * @module @solace/client-sdk
 */
const { encryptBlob, decryptBlob } = require('./crypto');
const { recordAndDetectVoice } = require('./vad');

module.exports = {
  encryptBlob,
  decryptBlob,
  recordAndDetectVoice
};
