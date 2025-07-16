/*
 * Browser Voice Activity Detection (VAD) helper.
 *
 * Uses Web Audio API to capture microphone input and yields frames that
 * exceed a simple RMS energy threshold.  While not as sophisticated as
 * WebRTC-VAD, this requires no native/WASM dependencies and works in any
 * modern browser.
 *
 * Returned objects: { frame: ArrayBuffer, timestamp: number }
 */

/**
 * @typedef {Object} VADFrame
 * @property {ArrayBuffer} frame – Raw Float32 PCM frame (mono)
 * @property {number} timestamp – Epoch ms when captured
 */

const DEFAULT_OPTS = {
  sampleRate: 16_000,
  frameMs: 30,
  rmsThreshold: 0.015  // tweak for sensitivity (0.01 – 0.03 typical)
};

/**
 * Records microphone audio and yields speech frames (based on RMS energy).
 * Consumer controls loop termination (e.g., via AbortController signal).
 *
 * @param {Partial<typeof DEFAULT_OPTS>} opts
 * @returns {AsyncGenerator<VADFrame>}
 */
async function* recordAndDetectVoiceBrowser(opts = {}) {
  const { sampleRate, frameMs, rmsThreshold } = { ...DEFAULT_OPTS, ...opts };
  const frameLength = Math.round(sampleRate * (frameMs / 1000));

  const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate, channelCount: 1 } });
  const ctx = new AudioContext({ sampleRate });
  const source = ctx.createMediaStreamSource(stream);

  // Load AudioWorklet processor
  try {
    await ctx.audioWorklet.addModule(new URL('./vad-processor.js', import.meta.url));
  } catch (error) {
    console.error('Failed to load AudioWorklet processor:', error);
    throw error;
  }

  // Create AudioWorkletNode instead of deprecated ScriptProcessorNode
  const processor = new AudioWorkletNode(ctx, 'vad-processor');
  
  // Initialize processor with parameters
  processor.port.postMessage({
    type: 'init',
    data: { frameLength, rmsThreshold }
  });

  // Queue for yielded frames
  const queue = [];
  
  // Handle messages from AudioWorklet
  processor.port.onmessage = (event) => {
    const { type, data } = event.data;
    if (type === 'frame') {
      queue.push(data);
    }
  };

  // Connect audio nodes
  source.connect(processor);
  processor.connect(ctx.destination);

  try {
    while (true) {
      if (queue.length) {
        yield queue.shift();
      } else {
        await new Promise((r) => setTimeout(r, frameMs));
      }
    }
  } finally {
    // Cleanup on iterator return/break
    processor.disconnect();
    source.disconnect();
    processor.port.close();
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  }
}

export { recordAndDetectVoiceBrowser }; 