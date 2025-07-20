import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import AudioCaptureService from './services/audioCapture';
import SpeechRecognitionService from './services/speechRecognition';
import ChatService from './services/chatService';
import MemoryService from './services/memoryService';
import TTSService from './services/ttsService';
// import VADIntegration from './utils/vadIntegration';
import ServiceStatus from './components/ServiceStatus';
import ErrorBoundary from './components/ErrorBoundary';

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

  // Service instances - create once and reuse for performance
  const audioCapture = useRef(null);
  const speechRecognition = useRef(null);
  const chatService = useRef(null);
  const memoryService = useRef(null);
  const ttsService = useRef(null);
  // Simple VAD stub to avoid reference errors
  const vadIntegration = useRef({
    stopVAD: () => {},
    setVoiceDetectedCallback: () => {},
    setSilenceDetectedCallback: () => {},
    startVAD: () => Promise.resolve()
  });

  // Initialize services once on mount
  useEffect(() => {
    // Initialize services only once
    if (!audioCapture.current) {
      audioCapture.current = new AudioCaptureService();
    }
    if (!speechRecognition.current) {
      speechRecognition.current = new SpeechRecognitionService();
    }
    if (!chatService.current) {
      chatService.current = new ChatService();
    }
    if (!memoryService.current) {
      memoryService.current = new MemoryService();
    }
    if (!ttsService.current) {
      ttsService.current = new TTSService();
    }

    initializeServices();
    loadConversationHistory();
    
    // Keyboard shortcuts
    const handleKeyPress = (e) => {
      // Don't trigger shortcuts when typing in inputs or if modifiers are pressed
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || 
          e.ctrlKey || e.altKey || e.metaKey) return;
      
      switch(e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          if (!isRecording && !isPlaying) {
            handleStartTalk();
          }
          break;
        case 'enter':
          e.preventDefault();
          if (isRecording) {
            handleStop();
          }
          break;
        case 'p':
          e.preventDefault();
          if (response && !isPlaying && !isRecording && !response.includes('Phase')) {
            handlePlayResponse();
          }
          break;
        case 'c':
          e.preventDefault();
          if (!isRecording && !isPlaying) {
            clearConversation();
          }
          break;
      }
    };
    
    // Use keydown for better responsiveness
    document.addEventListener('keydown', handleKeyPress);
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      // Cleanup services
      if (audioCapture.current) audioCapture.current.cleanup();
      if (speechRecognition.current) speechRecognition.current.cleanup();
      if (chatService.current) chatService.current.cleanup();
      if (ttsService.current) ttsService.current.stopSpeech();
      vadIntegration.current.stopVAD();
    };
  }, []); // Empty dependency array - run only once

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
        let isConfigured = false;
        let isWorking = false;
        
        try {
          // Test service functionality
          if (name === 'Audio Capture' && service) {
            isConfigured = !!navigator.mediaDevices && !!window.MediaRecorder;
            // Try to initialize to check if working
            try {
              await service.initialize();
              isWorking = service.isInitialized();
            } catch (error) {
              console.warn(`Audio Capture initialization failed: ${error.message}`);
              isWorking = false;
            }
          } else if (name === 'Speech Recognition' && service) {
            isConfigured = service.isConfigured();
            isWorking = isConfigured;
          } else if (name === 'AI Chat' && service) {
            isConfigured = service.isConfigured();
            isWorking = isConfigured;
          } else if (name === 'Memory Storage' && service) {
            isConfigured = service.isConfigured();
            isWorking = isConfigured;
          } else if (name === 'Text-to-Speech' && service) {
            isConfigured = 'speechSynthesis' in window || service.isConfigured();
            isWorking = isConfigured;
          } else {
            isConfigured = check();
            isWorking = isConfigured;
          }
        } catch (error) {
          console.warn(`Service check failed for ${name}:`, error);
          isWorking = false;
        }
        
        return { name, isConfigured, isWorking };
      })
    );

    setServices(serviceStatus);
    
    const allReady = serviceStatus.every(s => s.isConfigured && s.isWorking);
    setStatus(allReady ? 'Ready (press Space to talk)' : 'Some services not configured');
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

  // Process transcript and get AI response (shared between Web Speech API and audio recording)
  const processTranscriptAndRespond = async (transcribedText) => {
    if (!transcribedText || transcribedText.trim() === '') {
      throw new Error('No speech detected');
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
  };

  const handleStartTalk = async () => {
    try {
      setError('');
      setStatus('Requesting microphone access...');
      
      // Stop any ongoing TTS playback
      ttsService.current.stopSpeech();
      setIsPlaying(false);
      
      // Clean up any previous recording state
      try {
        audioCapture.current.cleanup();
      } catch (cleanupError) {
        console.warn('Cleanup error:', cleanupError);
      }

      // Try Web Speech API first (works better in browsers)
      if (speechRecognition.current.webSpeechSupported) {
        try {
          setStatus('Starting speech recognition... Please speak now!');
          setIsRecording(true); // Set recording state for UI
          
          console.log('Starting Web Speech API directly...');
          const transcript = await speechRecognition.current.transcribeWithWebSpeech();
          
          console.log('Web Speech API transcript received:', transcript);
          
          // Process the transcript immediately
          await processTranscriptAndRespond(transcript);
          setIsRecording(false);
          return;
          
        } catch (webSpeechError) {
          console.error('Web Speech API failed:', webSpeechError);
          setStatus('Speech recognition failed, trying audio recording...');
          setIsRecording(false);
          // Continue to audio recording fallback below
        }
      } else {
        console.log('Web Speech API not supported, using audio recording');
      }
      
      // Fallback to audio recording for Whisper API
      // Check if we should use Web Speech API fallback
      if (error && error.includes('browser speech recognition')) {
        await handleWebSpeechFallback();
        return;
      }
      
      // Initialize and start audio capture with retry
      await handleWithRetry(async () => {
        await audioCapture.current.initialize();
        await audioCapture.current.startRecording();
      });
      
      // Only set recording state after successful start
      setIsRecording(true);
      setStatus('Recording... (press Enter to stop)');
      
      // Start VAD for real-time voice detection
      const audioStream = audioCapture.current.getAudioStream();
      if (audioStream) {
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
      }
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      setError(`Failed to start recording: ${error.message}`);
      setStatus('Error - Check microphone permissions');
      setIsRecording(false);
      
      // Clean up any partial initialization
      try {
        audioCapture.current.cleanup();
      } catch (cleanupError) {
        console.warn('Cleanup error:', cleanupError);
      }
    }
  };

  // Handle Web Speech API fallback
  const handleWebSpeechFallback = async () => {
    try {
      setError('');
      setStatus('Using browser speech recognition. Please speak now...');
      setIsRecording(true);
      
      // Stop any ongoing TTS to prevent conflicts
      ttsService.current.stopSpeech();
      
      // Use Web Speech API directly
      const transcribedText = await speechRecognition.current.startLiveSpeechRecognition();
      
      setIsRecording(false);
      
      if (!transcribedText || transcribedText.trim() === '') {
        throw new Error('No speech detected');
      }
      
      setTranscript(transcribedText);
      setStatus('Getting AI response...');
      
      // Send to chatbot - this will automatically use demo mode if OpenAI fails
      const aiResponse = await chatService.current.sendMessage(transcribedText, []);
      
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
      console.error('Web Speech API fallback failed:', error);
      
      // If Web Speech API fails, provide a helpful message
      if (error.message.includes('not supported')) {
        setError('Web Speech API not supported in this browser. Please try a different browser or add OpenAI credits.');
      } else {
        setError(`Speech recognition failed: ${error.message}. Please try again.`);
      }
      
      setStatus('Error - Try again');
      setIsRecording(false);
    }
  };

  const handleStop = async () => {
    try {
      setStatus('Processing audio...');
      
      // Stop VAD first
      vadIntegration.current.stopVAD();
      
      // Stop recording and get audio blob
      const audioBlob = await audioCapture.current.stopRecording();
      setIsRecording(false);
      
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('No audio recorded - please try speaking louder or check microphone');
      }
      
      setStatus('Converting speech to text...');
      
      // Convert audio to text using Whisper with retry
      let transcribedText;
      try {
        transcribedText = await handleWithRetry(async () => {
          return await speechRecognition.current.transcribeAudio(audioBlob);
        });
        
        // Check if we need to use Web Speech API fallback
        if (transcribedText === 'WEBSPEECH_FALLBACK_NEEDED') {
          setStatus('OpenAI quota exceeded. Please click "Talk" and speak again for browser speech recognition...');
          setError('OpenAI quota exceeded. Click "Talk" and speak again - the app will use browser speech recognition.');
          return;
        }
        
      } catch (error) {
        // Check if it's a quota error that requires Web Speech API fallback
        if (error.message.includes('quota exceeded') || error.message.includes('browser speech recognition')) {
          setStatus('OpenAI quota exceeded. Please speak again for browser speech recognition...');
          setError('OpenAI quota exceeded. Click "Talk" and speak again - the app will use browser speech recognition.');
          return;
        }
        throw error;
      }
      
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
      setIsRecording(false);
      
      // Clean up on error
      try {
        vadIntegration.current.stopVAD();
      } catch (vadError) {
        console.warn('VAD cleanup error:', vadError);
      }
    }
  };

  const handlePlayResponse = async () => {
    if (!response || response.includes('Phase')) {
      console.log('No response to play or response contains "Phase"');
      return;
    }

    try {
      console.log('Starting TTS playback for response:', response);
      setIsPlaying(true);
      setStatus('Synthesizing speech...');
      
      // Use TTS service to speak the response with retry
      await handleWithRetry(async () => {
        await ttsService.current.playSpeech(response, selectedVoice);
      });
      
      setStatus('Ready (press Space to talk)');
      console.log('TTS playback completed successfully');
      
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

  // Debug function for testing optimizations
  const testOptimizations = async () => {
    try {
      console.log('=== OPTIMIZATION TEST ===');
      
      // Test chat service caching
      const testMessage = "Hello, can you hear me?";
      const startTime = performance.now();
      const demoResponse = chatService.current.getOptimizedDemoResponse(testMessage);
      const endTime = performance.now();
      
      console.log(`Demo response: "${demoResponse}"`);
      console.log(`Processing time: ${endTime - startTime}ms`);
      
      // Get performance stats
      const chatStats = chatService.current.getStats();
      const speechStats = speechRecognition.current.getStats();
      const audioStats = audioCapture.current.getStats();
      
      console.log('Chat Service Stats:', chatStats);
      console.log('Speech Recognition Stats:', speechStats);
      console.log('Audio Capture Stats:', audioStats);
      
      setResponse(demoResponse);
      setStatus('Optimization test completed - check console for details');
      
    } catch (error) {
      console.error('Optimization test failed:', error);
      setError(`Test failed: ${error.message}`);
    }
  };

  // Test voice functionality
  const testVoice = async () => {
    try {
      setError('');
      setStatus('Testing voice...');
      
      console.log('=== VOICE TEST ===');
      
      // Test current selected voice
      const testText = `Hello! This is a test of the ${selectedVoice} voice. Can you hear me clearly?`;
      
      setIsPlaying(true);
      await ttsService.current.testVoice(selectedVoice, testText);
      
      setStatus('Voice test completed successfully');
      
    } catch (error) {
      console.error('Voice test failed:', error);
      setError(`Voice test failed: ${error.message}`);
      setStatus('Voice test failed');
    } finally {
      setIsPlaying(false);
    }
  };

  // Test AWS Polly specifically
  const testPolly = async () => {
    try {
      setError('');
      setStatus('Testing AWS Polly...');
      
      console.log('=== AWS POLLY TEST ===');
      
      setIsPlaying(true);
      await ttsService.current.testPolly(selectedVoice);
      
      setStatus('AWS Polly test completed successfully');
      
    } catch (error) {
      console.error('AWS Polly test failed:', error);
      setError(`AWS Polly test failed: ${error.message}`);
      setStatus('AWS Polly test failed');
    } finally {
      setIsPlaying(false);
    }
  };

  return (
    <ErrorBoundary>
      <div className="app">
        <div className="container">
          <ErrorBoundary minimal fallback={({ retry }) => (
            <div className="header-error">
              <span>⚠️ Header component failed</span>
              <button onClick={retry}>Retry</button>
            </div>
          )}>
            <header className="header">
              <h1>Solace Lite Voice Companion</h1>
              <p className="subtitle">Production-grade voice-to-voice AI with encrypted memory</p>
            </header>
          </ErrorBoundary>

          <div className="main-content">
            <ErrorBoundary minimal fallback={({ retry }) => (
              <div className="controls-error">
                <span>⚠️ Controls unavailable</span>
                <button onClick={retry}>Retry</button>
              </div>
            )}>
              <div className="controls">
                <div className="recording-controls">
                  <button 
                    className={`btn primary ${isRecording ? 'recording' : ''}`}
                    onClick={isRecording ? handleStop : handleStartTalk}
                    disabled={isPlaying}
                  >
                    {isRecording ? 'Stop (Enter)' : 'Talk (Space)'}
                  </button>
                  
                  <button 
                    className="btn secondary"
                    onClick={handlePlayResponse}
                    disabled={!response || isRecording || isPlaying || response.includes('Phase')}
                  >
                    {isPlaying ? 'Playing...' : 'Play Response (P)'}
                  </button>
                </div>

                <div className="voice-controls">
                  <label htmlFor="voice-select">Voice:</label>
                  <select 
                    id="voice-select"
                    value={selectedVoice} 
                    onChange={handleVoiceChange}
                    disabled={isRecording || isPlaying}
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>

                <div className="utility-controls">
                  <button 
                    className="btn tertiary"
                    onClick={clearConversation}
                    disabled={isRecording || isPlaying}
                  >
                    Clear (C)
                  </button>
                  
                  <button 
                    className="btn tertiary"
                    onClick={testVoice}
                    disabled={isRecording || isPlaying}
                  >
                    Test Voice
                  </button>
                  
                  <button 
                    className="btn tertiary"
                    onClick={testPolly}
                    disabled={isRecording || isPlaying}
                  >
                    Test Polly
                  </button>
                  
                  <button 
                    className="btn tertiary"
                    onClick={testOptimizations}
                    disabled={isRecording || isPlaying}
                  >
                    Test Optimizations
                  </button>
                </div>
              </div>
            </ErrorBoundary>

            <ErrorBoundary minimal fallback={({ retry }) => (
              <div className="status-error">
                <span>⚠️ Status display failed</span>
                <button onClick={retry}>Retry</button>
              </div>
            )}>
              <div className="status-section">
                <div className={`status ${isRecording ? 'recording' : isPlaying ? 'playing' : ''}`}>
                  <span className="status-indicator"></span>
                  {status}
                </div>
                
                {error && (
                  <div className="error">
                    <span>{error}</span>
                    <button onClick={clearError} className="error-close">×</button>
                  </div>
                )}
                
                {retryCount > 0 && (
                  <div className="retry-info">
                    Retries: {retryCount}
                  </div>
                )}
              </div>
            </ErrorBoundary>

            <ErrorBoundary minimal fallback={({ retry }) => (
              <div className="conversation-error">
                <span>⚠️ Conversation display failed</span>
                <button onClick={retry}>Retry</button>
              </div>
            )}>
              <div className="conversation">
                {transcript && (
                  <div className="message user">
                    <div className="message-header">
                      <span className="sender">You</span>
                      <span className="timestamp">{new Date().toLocaleTimeString()}</span>
                    </div>
                    <div className="message-content">{transcript}</div>
                  </div>
                )}
                
                {response && (
                  <div className="message assistant">
                    <div className="message-header">
                      <span className="sender">AI Assistant</span>
                      <span className="timestamp">{new Date().toLocaleTimeString()}</span>
                    </div>
                    <div className="message-content">{response}</div>
                  </div>
                )}
              </div>
            </ErrorBoundary>
          </div>

          <ErrorBoundary minimal fallback={({ retry }) => (
            <div className="service-status-error">
              <span>⚠️ Service status unavailable</span>
              <button onClick={retry}>Retry</button>
            </div>
          )}>
            <ServiceStatus 
              services={services}
              isMinimized={statusMinimized}
              onToggle={() => setStatusMinimized(!statusMinimized)}
            />
          </ErrorBoundary>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
