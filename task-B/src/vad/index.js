/* VAD public facade – automatically picks browser or Node implementation */
let recordAndDetectVoice;

if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
  // Browser environment
  ({ recordAndDetectVoice } = require('../vadBrowser'));
} else {
  // Node / server environment
  ({ recordAndDetectVoice } = require('../vad'));
}

module.exports = { recordAndDetectVoice }; 