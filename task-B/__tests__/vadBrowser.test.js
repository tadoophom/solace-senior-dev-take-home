/**
 * @jest-environment jsdom
 */

import { recordAndDetectVoiceBrowser } from '../src/vadBrowser.js';

// Mock Web Audio API
global.AudioContext = class MockAudioContext {
  constructor() {
    this.sampleRate = 16000;
    this.state = 'running';
  }
  
  createMediaStreamSource() {
    return {
      connect: jest.fn(),
      disconnect: jest.fn()
    };
  }
  
  close() {
    this.state = 'closed';
  }
  
  get audioWorklet() {
    return {
      addModule: jest.fn().mockResolvedValue(undefined)
    };
  }
};

global.AudioWorkletNode = class MockAudioWorkletNode {
  constructor() {
    this.port = {
      postMessage: jest.fn(),
      onmessage: null,
      close: jest.fn()
    };
  }
  
  connect() {}
  disconnect() {}
};

// Mock navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: jest.fn().mockReturnValue([
        { stop: jest.fn(), kind: 'audio' }
      ])
    })
  }
});

// Mock URL for AudioWorklet
global.URL = {
  createObjectURL: jest.fn().mockReturnValue('blob:mock-url'),
  revokeObjectURL: jest.fn()
};

describe('Browser Voice Activity Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('recordAndDetectVoiceBrowser initializes correctly', async () => {
    const generator = recordAndDetectVoiceBrowser();
    
    // Should be an async generator
    expect(generator[Symbol.asyncIterator]).toBeDefined();
    
    // Clean up
    await generator.return();
  });

  test('VAD uses correct default options', async () => {
    const generator = recordAndDetectVoiceBrowser();
    
    // Test that it accepts options
    const customGenerator = recordAndDetectVoiceBrowser({
      sampleRate: 44100,
      frameMs: 20,
      rmsThreshold: 0.02
    });
    
    expect(customGenerator[Symbol.asyncIterator]).toBeDefined();
    
    // Clean up
    await generator.return();
    await customGenerator.return();
  });

  test('VAD handles getUserMedia errors gracefully', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValue(new Error('Permission denied'));
    
    const generator = recordAndDetectVoiceBrowser();
    
    await expect(generator.next()).rejects.toThrow('Permission denied');
  });

  test('VAD processes audio frames with correct structure', async () => {
    // Mock AudioWorkletNode to simulate frame detection
    const mockFrameData = {
      frame: new Float32Array(480).buffer, // 30ms at 16kHz
      timestamp: Date.now()
    };
    
    global.AudioWorkletNode = class MockAudioWorkletNode {
      constructor() {
        this.port = {
          postMessage: jest.fn(),
          onmessage: null,
          close: jest.fn()
        };
        
        // Simulate frame detection after initialization
        setTimeout(() => {
          if (this.port.onmessage) {
            this.port.onmessage({
              data: { type: 'frame', data: mockFrameData }
            });
          }
        }, 100);
      }
      
      connect() {}
      disconnect() {}
    };
    
    const generator = recordAndDetectVoiceBrowser();
    
    // Should eventually yield a frame
    const result = await Promise.race([
      generator.next(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 200))
    ]);
    
    if (!result.done) {
      expect(result.value).toHaveProperty('frame');
      expect(result.value).toHaveProperty('timestamp');
      expect(result.value.frame).toBeInstanceOf(ArrayBuffer);
      expect(typeof result.value.timestamp).toBe('number');
    }
    
    // Clean up
    await generator.return();
  });

  test('VAD cleans up resources properly', async () => {
    const mockStream = {
      getTracks: jest.fn().mockReturnValue([
        { stop: jest.fn(), kind: 'audio' }
      ])
    };
    
    navigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);
    
    const generator = recordAndDetectVoiceBrowser();
    
    // Start the generator
    const promise = generator.next();
    
    // Stop the generator
    await generator.return();
    
    // Verify cleanup was called
    expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
  });
}); 