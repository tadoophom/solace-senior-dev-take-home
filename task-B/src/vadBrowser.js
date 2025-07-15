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

  const bufferSize = 1024; // ScriptProcessorNode buffer size (pow2)
  const processor = ctx.createScriptProcessor(bufferSize, 1, 1);

  const buf = new Float32Array(frameLength);
  let bufOffset = 0;

  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer.getChannelData(0);
    let i = 0;
    while (i < input.length) {
      const remain = frameLength - bufOffset;
      const toCopy = Math.min(remain, input.length - i);
      buf.set(input.subarray(i, i + toCopy), bufOffset);
      bufOffset += toCopy;
      i += toCopy;

      if (bufOffset === frameLength) {
        const rms = Math.sqrt(buf.reduce((sum, s) => sum + s * s, 0) / buf.length);
        if (rms > rmsThreshold) {
          // Copy to ArrayBuffer to detach from underlying Float32Array
          const frameCopy = new Float32Array(buf).buffer;
          queue.push({ frame: frameCopy, timestamp: Date.now() });
        }
        bufOffset = 0;
      }
    }
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  // Queue for yielded frames
  const queue = [];
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
    processor.onaudioprocess = null;
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  }
}

module.exports = { recordAndDetectVoiceBrowser }; 