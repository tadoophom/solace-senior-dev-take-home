// Browser test setup for Jest
// Mock browser APIs that are not available in Jest environment

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

// Mock performance API
global.performance = {
  now: jest.fn().mockReturnValue(Date.now())
};

// Mock import.meta.url for VAD processor
global.importMetaUrl = 'file:///mock/path/to/module.js'; 