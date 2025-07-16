import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import AudioCaptureService from './services/audioCapture';
import SpeechRecognitionService from './services/speechRecognition';
import ChatService from './services/chatService';
import MemoryService from './services/memoryService';
import TTSService from './services/ttsService';
import VADIntegration from './utils/vadIntegration';
import ServiceStatus from './components/ServiceStatus';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('female');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState('');
  const [services, setServices] = useState([]);
  const [statusMinimized, setStatusMinimized] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  // Service instances
  const audioCapture = useRef(new AudioCaptureService());
  const speechRecognition = useRef(new SpeechRecognitionService());
  const chatService = useRef(new ChatService());
  const memoryService = useRef(new MemoryService());
  const ttsService = useRef(new TTSService());
  const vadIntegration = useRef(new VADIntegration());

  // Initialize services and check status
  useEffect(() => {
    initializeServices();
    loadConversationHistory();
    
    // Keyboard shortcuts
    const handleKeyPress = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      switch(e.key) {
        case ' ':
          e.preventDefault();
          if (!isRecording && !isPlaying) handleStartTalk();
          break;
        case 'Enter':
          e.preventDefault();
          if (isRecording) handleStop();
          break;
        case 'p':
          e.preventDefault();
          if (response && !isPlaying && !isRecording) handlePlayResponse();
          break;
        case 'c':
          e.preventDefault();
          if (!isRecording && !isPlaying) clearConversation();
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyPress);
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      audioCapture.current.cleanup();
      vadIntegration.current.stopVAD();
      ttsService.current.stopSpeech();
    };
  }, [isRecording, isPlaying, response]);

  // Initialize and check service status
  const initializeServices = async () => {
    const serviceChecks = [
      { name: 'Audio Capture', service: audioCapture.current, check: () => !!navigator.mediaDevices },
      { name: 'Speech Recognition', service: speechRecognition.current, check: () => speechRecognition.current.isConfigured() },
      { name: 'AI Chat', service: chatService.current, check: () => chatService.current.isConfigured() },
      { name: 'Memory Storage', service: memoryService.current, check: () => memoryService.current.isConfigured() },
      { name: 'Text-to-Speech', service: ttsService.current, check: () => 'speechSynthesis' in window || ttsService.current.isConfigured() }
    ];

    const serviceStatus = await Promise.all(
      serviceChecks.map(async ({ name, service, check }) => {
        const isConfigured = check();
        let isWorking = null;
        
        try {
          // Test service functionality
          if (name === 'Audio Capture' && isConfigured) {
            isWorking = true; // Will be tested on first use
          } else if (name === 'Speech Recognition' && isConfigured) {
            isWorking = true; // Will be tested on first use
          } else if (name === 'AI Chat' && isConfigured) {
            isWorking = true; // Will be tested on first use
          } else if (name === 'Memory Storage' && isConfigured) {
            isWorking = true; // Will be tested on first use
          } else if (name === 'Text-to-Speech' && isConfigured) {
            isWorking = true; // Will be tested on first use
          } else {
            isWorking = isConfigured;
          }
        } catch (error) {
          isWorking = false;
        }
        
        return { name, isConfigured, isWorking };
      })
    );

    setServices(serviceStatus);
    
    const allReady = serviceStatus.every(s => s.isConfigured && s.isWorking);
    setStatus(allReady ? 'Ready' : 'Some services not configured');
  };

  // Load saved conversation from encrypted storage
  const loadConversationHistory = async () => {
    try {
      const savedHistory = await memoryService.current.loadConversation();
      if (savedHistory.length > 0) {
        chatService.current.loadHistory(savedHistory);
        setStatus('Conversation history loaded');
      }
    } catch (error) {
      console.warn('Failed to load conversation history:', error);
    }
  };

  // Enhanced error handling with retry logic
  const handleWithRetry = async (operation, maxRetries = 2) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        setRetryCount(prev => prev + 1);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  };

  const handleStartTalk = async () => {
    try {
      setError('');
      setStatus('Requesting microphone access...');
      
      // Stop any ongoing TTS playback
      ttsService.current.stopSpeech();
      setIsPlaying(false);
      
      // Initialize and start audio capture with retry
      await handleWithRetry(async () => {
        await audioCapture.current.initialize();
        await audioCapture.current.startRecording();
      });
      
      setIsRecording(true);
      setStatus('Recording... (press Enter to stop)');
      
      // Start VAD for real-time voice detection
      const audioStream = audioCapture.current.getAudioStream();
      vadIntegration.current.setVoiceDetectedCallback((frame) => {
        setStatus('Recording... (voice detected)');
      });
      
      vadIntegration.current.setSilenceDetectedCallback(() => {
        setStatus('Recording... (listening)');
      });
      
      // Start VAD in background
      vadIntegration.current.startVAD(audioStream).catch(err => {
        console.warn('VAD failed, continuing without it:', err);
      });
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      setError(`Failed to start recording: ${error.message}`);
      setStatus('Error - Check microphone permissions');
      setIsRecording(false);
    }
  };

  const handleStop = async () => {
    try {
      setStatus('Processing audio...');
      
      // Stop VAD
      vadIntegration.current.stopVAD();
      
      // Stop recording and get audio blob
      const audioBlob = await audioCapture.current.stopRecording();
      setIsRecording(false);
      
      if (audioBlob.size === 0) {
        throw new Error('No audio recorded');
      }
      
      setStatus('Converting speech to text...');
      
      // Convert audio to text using Whisper with retry
      const transcribedText = await handleWithRetry(async () => {
        return await speechRecognition.current.transcribeAudio(audioBlob);
      });
      
      if (!transcribedText || transcribedText.trim() === '') {
        throw new Error('No speech detected in audio');
      }
      
      setTranscript(transcribedText);
      setStatus('Getting AI response...');
      
      // Send to chatbot and get response with retry
      const aiResponse = await handleWithRetry(async () => {
        const conversationHistory = chatService.current.getConversationHistory();
        return await chatService.current.sendMessage(transcribedText, conversationHistory);
      });
      
      setResponse(aiResponse);
      setStatus('Response ready (press P to play)');
      
      // Save conversation to encrypted storage
      try {
        const updatedHistory = chatService.current.getConversationHistory();
        await memoryService.current.saveConversation(updatedHistory);
      } catch (memoryError) {
        console.warn('Failed to save conversation:', memoryError);
      }
      
    } catch (error) {
      console.error('Failed to process audio:', error);
      setError(`Failed to process audio: ${error.message}`);
      setStatus('Error - Try again');
    }
  };

  const handlePlayResponse = async () => {
    if (!response || response.includes('Phase')) {
      return;
    }

    try {
      setIsPlaying(true);
      setStatus('Synthesizing speech...');
      
      // Use TTS service to speak the response with retry
      await handleWithRetry(async () => {
        await ttsService.current.playSpeech(response, selectedVoice);
      });
      
      setStatus('Ready (press Space to talk)');
      
    } catch (error) {
      console.error('Failed to play response:', error);
      setError(`Failed to play response: ${error.message}`);
      setStatus('Error - TTS failed');
    } finally {
      setIsPlaying(false);
    }
  };

  const handleVoiceChange = (event) => {
    setSelectedVoice(event.target.value);
  };

  const clearError = () => {
    setError('');
    setRetryCount(0);
  };

  const clearConversation = () => {
    chatService.current.clearHistory();
    memoryService.current.clearConversation();
    setTranscript('');
    setResponse('');
    setStatus('Conversation cleared');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Solace Lite - Voice Companion</h1>
        <p className="status">Status: {status}</p>
        {error && (
          <div className="error-message">
            <p>{error}</p>
            {retryCount > 0 && <small>Retries: {retryCount}</small>}
            <button onClick={clearError} className="error-close">×</button>
          </div>
        )}
      </header>

      <main className="app-main">
        <ServiceStatus 
          services={services} 
          isMinimized={statusMinimized} 
          onToggle={() => setStatusMinimized(!statusMinimized)} 
        />

        <div className="controls">
          <div className="voice-selection">
            <label htmlFor="voice-select">Voice:</label>
            <select 
              id="voice-select" 
              value={selectedVoice} 
              onChange={handleVoiceChange}
              disabled={isRecording}
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </div>

          <div className="action-buttons">
            <button 
              className="btn btn-primary" 
              onClick={handleStartTalk}
              disabled={isRecording || isPlaying}
              title="Start recording (Space)"
            >
              {isRecording ? 'Recording...' : 'Talk'}
            </button>

            <button 
              className="btn btn-secondary" 
              onClick={handleStop}
              disabled={!isRecording}
              title="Stop recording (Enter)"
            >
              Stop
            </button>

            <button 
              className="btn btn-success" 
              onClick={handlePlayResponse}
              disabled={!response || isPlaying || response.includes('Phase')}
              title="Play response (P)"
            >
              {isPlaying ? 'Playing...' : 'Play Response'}
            </button>

            <button 
              className="btn btn-warning" 
              onClick={clearConversation}
              disabled={isRecording || isPlaying}
              title="Clear conversation (C)"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="conversation">
          <div className="transcript-section">
            <h3>Your Message:</h3>
            <div className="transcript-box">
              {transcript || 'Your speech will appear here...'}
            </div>
          </div>

          <div className="response-section">
            <h3>AI Response:</h3>
            <div className="response-box">
              {response || 'AI response will appear here...'}
            </div>
          </div>
        </div>

        <div className="keyboard-shortcuts">
          <small>
            Shortcuts: Space=Talk • Enter=Stop • P=Play • C=Clear
          </small>
        </div>
      </main>
    </div>
  );
}

export default App;
