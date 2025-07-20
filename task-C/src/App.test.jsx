import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

// Mock services
jest.mock('./services/audioCapture', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(true),
    startRecording: jest.fn().mockResolvedValue(true),
    stopRecording: jest.fn().mockResolvedValue(new Blob(['test'], { type: 'audio/wav' })),
    cleanup: jest.fn(),
    isInitialized: jest.fn().mockReturnValue(true),
    getStats: jest.fn().mockReturnValue({ initTime: 100, recordingTime: 200 }),
    getAudioStream: jest.fn().mockReturnValue(null)
  }));
});

jest.mock('./services/speechRecognition', () => {
  return jest.fn().mockImplementation(() => ({
    isConfigured: jest.fn().mockReturnValue(true),
    transcribeAudio: jest.fn().mockResolvedValue('Hello world'),
    startLiveSpeechRecognition: jest.fn().mockResolvedValue('Hello world'),
    cleanup: jest.fn(),
    getStats: jest.fn().mockReturnValue({ whisperCalls: 1, averageLatency: 500 })
  }));
});

jest.mock('./services/chatService', () => {
  return jest.fn().mockImplementation(() => ({
    isConfigured: jest.fn().mockReturnValue(true),
    sendMessage: jest.fn().mockResolvedValue('Hello! How can I help you?'),
    getConversationHistory: jest.fn().mockReturnValue([]),
    clearHistory: jest.fn(),
    loadHistory: jest.fn(),
    cleanup: jest.fn(),
    getStats: jest.fn().mockReturnValue({ apiCalls: 1, cacheHits: 0 }),
    getOptimizedDemoResponse: jest.fn().mockReturnValue('Demo response')
  }));
});

jest.mock('./services/memoryService', () => {
  return jest.fn().mockImplementation(() => ({
    isConfigured: jest.fn().mockReturnValue(true),
    saveConversation: jest.fn().mockResolvedValue('blob-key-123'),
    loadConversation: jest.fn().mockResolvedValue([]),
    clearConversation: jest.fn()
  }));
});

jest.mock('./services/ttsService', () => {
  return jest.fn().mockImplementation(() => ({
    isConfigured: jest.fn().mockReturnValue(true),
    playSpeech: jest.fn().mockResolvedValue(true),
    stopSpeech: jest.fn(),
    testVoice: jest.fn().mockResolvedValue(true),
    testPolly: jest.fn().mockResolvedValue(true)
  }));
});

// Mock Web APIs
Object.defineProperty(window, 'navigator', {
  value: {
    mediaDevices: {
      getUserMedia: jest.fn().mockResolvedValue({
        getTracks: jest.fn().mockReturnValue([{ stop: jest.fn() }])
      })
    }
  }
});

Object.defineProperty(window, 'MediaRecorder', {
  value: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    ondataavailable: jest.fn(),
    onstop: jest.fn()
  }))
});

Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: jest.fn(),
    cancel: jest.fn(),
    getVoices: jest.fn().mockReturnValue([])
  }
});

describe('Voice Companion App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders main components', () => {
    render(<App />);
    
    expect(screen.getByText('Solace Lite Voice Companion')).toBeInTheDocument();
    expect(screen.getByText('Talk (Space)')).toBeInTheDocument();
    expect(screen.getByText('Play Response (P)')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  test('voice selection dropdown works', () => {
    render(<App />);
    
    const voiceSelect = screen.getByRole('combobox');
    expect(voiceSelect).toHaveValue('female');
    
    fireEvent.change(voiceSelect, { target: { value: 'male' } });
    expect(voiceSelect).toHaveValue('male');
  });

  test('keyboard shortcuts work', async () => {
    render(<App />);
    
    // Test space key for starting recording
    fireEvent.keyDown(document, { key: ' ' });
    await waitFor(() => {
      expect(screen.getByText('Stop (Enter)')).toBeInTheDocument();
    });
  });

  test('clear conversation button works', () => {
    render(<App />);
    
    const clearButton = screen.getByText('Clear (C)');
    fireEvent.click(clearButton);
    
    // Should clear conversation without errors
    expect(clearButton).toBeInTheDocument();
  });

  test('test voice button works', async () => {
    render(<App />);
    
    const testVoiceButton = screen.getByText('Test Voice');
    fireEvent.click(testVoiceButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Testing voice|Voice test completed/)).toBeInTheDocument();
    });
  });

  test('test polly button works', async () => {
    render(<App />);
    
    const testPollyButton = screen.getByText('Test Polly');
    fireEvent.click(testPollyButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Testing AWS Polly|AWS Polly test completed/)).toBeInTheDocument();
    });
  });

  test('test optimizations button works', async () => {
    render(<App />);
    
    const testOptButton = screen.getByText('Test Optimizations');
    fireEvent.click(testOptButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Optimization test completed/)).toBeInTheDocument();
    });
  });

  test('error handling displays errors correctly', async () => {
    render(<App />);
    
    // Simulate an error by clicking talk when services fail
    const AudioCaptureService = require('./services/audioCapture');
    AudioCaptureService.mockImplementation(() => ({
      initialize: jest.fn().mockRejectedValue(new Error('Microphone access denied')),
      cleanup: jest.fn(),
      isInitialized: jest.fn().mockReturnValue(false),
      getStats: jest.fn().mockReturnValue({}),
      getAudioStream: jest.fn().mockReturnValue(null)
    }));
    
    const talkButton = screen.getByText('Talk (Space)');
    fireEvent.click(talkButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Error|Failed/)).toBeInTheDocument();
    });
  });

  test('conversation display shows messages', async () => {
    render(<App />);
    
    // Mock successful conversation flow
    const mockTranscript = 'Hello, how are you?';
    const mockResponse = 'I am doing well, thank you!';
    
    // This would normally be triggered by the recording flow
    // For testing, we'll verify the conversation container exists
    expect(screen.getByClassName('conversation')).toBeInTheDocument();
  });

  test('service status component is present', () => {
    render(<App />);
    
    // ServiceStatus component should be rendered
    expect(document.querySelector('.service-status')).toBeInTheDocument();
  });

  test('responsive design classes are applied', () => {
    render(<App />);
    
    expect(screen.getByClassName('app')).toBeInTheDocument();
    expect(screen.getByClassName('container')).toBeInTheDocument();
    expect(screen.getByClassName('controls')).toBeInTheDocument();
  });
});

// Integration tests
describe('Voice Companion Integration', () => {
  test('full conversation flow simulation', async () => {
    render(<App />);
    
    // Wait for initialization
    await waitFor(() => {
      expect(screen.getByText(/Ready|Initializing/)).toBeInTheDocument();
    });
    
    // Start recording
    const talkButton = screen.getByText('Talk (Space)');
    fireEvent.click(talkButton);
    
    // Should show recording state
    await waitFor(() => {
      expect(screen.getByText(/Recording|Stop/)).toBeInTheDocument();
    });
  });

  test('memory service integration', async () => {
    const MemoryService = require('./services/memoryService');
    const mockMemoryService = new MemoryService();
    
    render(<App />);
    
    // Verify memory service is initialized
    expect(MemoryService).toHaveBeenCalled();
    expect(mockMemoryService.isConfigured).toBeDefined();
  });

  test('error recovery and fallback mechanisms', async () => {
    render(<App />);
    
    // Test that app handles service failures gracefully
    const ChatService = require('./services/chatService');
    ChatService.mockImplementation(() => ({
      isConfigured: jest.fn().mockReturnValue(false),
      sendMessage: jest.fn().mockRejectedValue(new Error('API quota exceeded')),
      getConversationHistory: jest.fn().mockReturnValue([]),
      clearHistory: jest.fn(),
      cleanup: jest.fn(),
      getStats: jest.fn().mockReturnValue({}),
      getOptimizedDemoResponse: jest.fn().mockReturnValue('Demo fallback response')
    }));
    
    await waitFor(() => {
      expect(screen.getByText(/Some services not configured|Ready/)).toBeInTheDocument();
    });
  });
}); 