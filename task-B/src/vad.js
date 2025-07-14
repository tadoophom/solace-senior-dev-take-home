const record = require('node-record-lpcm16');
const WebRtcVad = require('webrtcvad');

const SAMPLE_RATE = 16000;
const FRAME_DURATION_MS = 30;
const FRAME_SIZE_BYTES = SAMPLE_RATE * 2 * (FRAME_DURATION_MS / 1000);

async function* recordAndDetectVoice() {
  const vad = new WebRtcVad(2);
  const mic = record.start({
    sampleRateHertz: SAMPLE_RATE,
    threshold: 0,
    verbose: false,
    recordProgram: 'sox'
  });
  let buffer = Buffer.alloc(0);

  for await (const chunk of mic) {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= FRAME_SIZE_BYTES) {
      const frame = buffer.slice(0, FRAME_SIZE_BYTES);
      buffer = buffer.slice(FRAME_SIZE_BYTES);
      if (vad.processAudio(frame, SAMPLE_RATE)) {
        yield { frame: frame.buffer, timestamp: Date.now() };
      }
    }
  }
}

module.exports = { recordAndDetectVoice };
