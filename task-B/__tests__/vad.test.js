const { recordAndDetectVoice } = require('../src/vad/index');

// Mock webrtcvad
jest.mock('webrtcvad', () => {
  return jest.fn().mockImplementation(() => ({
    processAudio: jest.fn().mockReturnValue(true) // Always detect voice for testing
  }));
});

// Mock node-record-lpcm16
jest.mock('node-record-lpcm16', () => ({
  start: jest.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      // Simulate audio chunks
      const chunk = Buffer.alloc(320); // 20ms at 16kHz
      yield chunk;
      yield chunk;
    }
  })
}));

describe('Voice Activity Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('recordAndDetectVoice yields voice frames', async () => {
    const frames = [];
    let count = 0;
    
    for await (const frame of recordAndDetectVoice()) {
      frames.push(frame);
      count++;
      if (count >= 2) break; // Stop after 2 frames to avoid infinite loop
    }
    
    expect(frames.length).toBe(2);
    expect(frames[0]).toHaveProperty('frame');
    expect(frames[0]).toHaveProperty('timestamp');
    expect(frames[0].frame).toBeInstanceOf(ArrayBuffer);
    expect(typeof frames[0].timestamp).toBe('number');
  });

  test('VAD processes audio frames correctly', async () => {
    const WebRtcVad = require('webrtcvad');
    const mockVad = new WebRtcVad();
    
    let frameCount = 0;
    for await (const frame of recordAndDetectVoice()) {
      frameCount++;
      if (frameCount >= 1) break;
    }
    
    expect(mockVad.processAudio).toHaveBeenCalled();
    expect(frameCount).toBe(1);
  });

  test('VAD handles silence correctly', async () => {
    const WebRtcVad = require('webrtcvad');
    WebRtcVad.mockImplementation(() => ({
      processAudio: jest.fn().mockReturnValue(false) // No voice detected
    }));
    
    const frames = [];
    let count = 0;
    
    for await (const frame of recordAndDetectVoice()) {
      frames.push(frame);
      count++;
      if (count >= 10) break; // Try 10 iterations
    }
    
    // Should not yield any frames when no voice is detected
    expect(frames.length).toBe(0);
  });

  test('VAD frame format is correct', async () => {
    let firstFrame;
    
    for await (const frame of recordAndDetectVoice()) {
      firstFrame = frame;
      break;
    }
    
    expect(firstFrame).toBeDefined();
    expect(firstFrame.frame).toBeInstanceOf(ArrayBuffer);
    expect(typeof firstFrame.timestamp).toBe('number');
    expect(firstFrame.timestamp).toBeGreaterThan(0);
  });
}); 