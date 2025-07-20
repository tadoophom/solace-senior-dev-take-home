import '@testing-library/jest-dom';

// Mock Web APIs that are not available in jsdom
global.MediaRecorder = class MediaRecorder {
  constructor() {
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
  }
  
  start() {
    this.state = 'recording';
  }
  
  stop() {
    this.state = 'inactive';
    if (this.onstop) this.onstop();
  }
  
  static isTypeSupported() {
    return true;
  }
};

global.AudioContext = class AudioContext {
  constructor() {
    this.state = 'running';
    this.sampleRate = 44100;
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

global.AudioWorkletNode = class AudioWorkletNode {
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

global.speechSynthesis = {
  speak: jest.fn(),
  cancel: jest.fn(),
  getVoices: jest.fn().mockReturnValue([
    { name: 'Female Voice', lang: 'en-US', gender: 'female' },
    { name: 'Male Voice', lang: 'en-US', gender: 'male' }
  ])
};

global.SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.voice = null;
    this.pitch = 1;
    this.rate = 1;
    this.volume = 1;
    this.onend = null;
    this.onerror = null;
  }
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

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

// Mock performance API
global.performance = {
  now: jest.fn().mockReturnValue(Date.now())
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
global.localStorage = localStorageMock;

// Mock crypto API for encryption
global.crypto = {
  getRandomValues: jest.fn().mockImplementation((arr) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }),
  subtle: {
    encrypt: jest.fn().mockResolvedValue(new ArrayBuffer(16)),
    decrypt: jest.fn().mockResolvedValue(new ArrayBuffer(16)),
    importKey: jest.fn().mockResolvedValue({}),
    exportKey: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
    generateKey: jest.fn().mockResolvedValue({})
  }
};

// Suppress console warnings during tests
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  // Suppress specific warnings that are expected during testing
  if (args[0] && typeof args[0] === 'string') {
    if (args[0].includes('VAD failed') || 
        args[0].includes('Failed to load conversation') ||
        args[0].includes('OpenAI quota exceeded')) {
      return;
    }
  }
  originalConsoleWarn.apply(console, args);
};

// Mock fetch globally
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: jest.fn().mockResolvedValue({ message: 'Mock response' }),
  text: jest.fn().mockResolvedValue('Mock text response')
}); 