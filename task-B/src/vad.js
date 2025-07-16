/*
 * Voice-Activity-Detection helper (Node.js).
 *
 * Streams microphone audio (16-kHz, 16-bit PCM) and yields only the frames
 * that contain speech according to WebRTC-VAD.  Returned async iterator
 * objects: { frame: ArrayBuffer, timestamp: number }
 */

import record from 'node-record-lpcm16';
import WebRtcVad from 'webrtcvad';

const SAMPLE_RATE = 16_000;             // Hz – required by webrtcvad
const FRAME_DURATION_MS = 30;           // 10 / 20 / 30 ms supported by VAD
const FRAME_SIZE_BYTES = SAMPLE_RATE * 2 * (FRAME_DURATION_MS / 1000); // 16-bit PCM

/**
 * Continuously records from the system microphone and yields speech frames.
 *
 * Usage:
 *   for await (const { frame, timestamp } of recordAndDetectVoice()) {
 *     // transmit frame …
 *   }
 *
 * The consumer is responsible for terminating iteration, e.g. via
 * `break` or an `AbortController`.
 *
 * @yields {{ frame: ArrayBuffer, timestamp: number }} Speech frames only.
 */
async function* recordAndDetectVoice() {
  const vad = new WebRtcVad(2);          // aggressiveness: 0-3 (0 = permissive)

  const mic = record.start({
    sampleRateHertz: SAMPLE_RATE,
    threshold: 0,
    verbose: false,
    recordProgram: 'sox'                 // cross-platform dependency
  });

  let buffer = Buffer.alloc(0);

  for await (const chunk of mic) {
    buffer = Buffer.concat([buffer, chunk]);

    // Process fixed-size frames required by VAD
    while (buffer.length >= FRAME_SIZE_BYTES) {
      const frame = buffer.slice(0, FRAME_SIZE_BYTES);
      buffer = buffer.slice(FRAME_SIZE_BYTES);

      if (vad.processAudio(frame, SAMPLE_RATE)) {
        yield { frame: frame.buffer, timestamp: Date.now() };
      }
    }
  }
}
export { recordAndDetectVoice };

