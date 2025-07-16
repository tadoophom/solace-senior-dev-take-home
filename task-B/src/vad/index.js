import { recordAndDetectVoiceBrowser as browserRecordAndDetectVoice } from '../vadBrowser.js';

/**
 * Public VAD facade: selects browser or Node implementation.
 */
export const recordAndDetectVoice = async function* (...args) {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
    // Browser environment - use browser implementation
    yield* browserRecordAndDetectVoice(...args);
  } else {
    // Node.js environment - dynamically import Node implementation
    const { recordAndDetectVoice: nodeRecordAndDetectVoice } = await import('../vad.js');
    yield* nodeRecordAndDetectVoice(...args);
  }
}; 