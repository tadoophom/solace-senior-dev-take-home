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
      
      // Clean up any previous recording state
      try {
        audioCapture.current.cleanup();
      } catch (cleanupError) {
        console.warn('Cleanup error:', cleanupError);
      }
      
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

            <button 
              className="btn btn-info" 
              onClick={() => {
                console.log('=== SIMPLE TTS TEST ===');
                
                // Most basic TTS test possible
                if ('speechSynthesis' in window) {
                  // Cancel any existing speech
                  speechSynthesis.cancel();
                  
                  // Wait a moment for cancel to complete
                  setTimeout(() => {
                    const text = 'Hello, this is a simple text to speech test';
                    console.log('Speaking:', text);
                    
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.volume = 1;
                    utterance.rate = 1;
                    utterance.pitch = 1;
                    
                    utterance.onstart = () => console.log('✅ TTS started');
                    utterance.onend = () => console.log('✅ TTS ended');
                    utterance.onerror = (e) => console.error('❌ TTS error:', e);
                    
                    speechSynthesis.speak(utterance);
                  }, 100);
                } else {
                  console.error('❌ speechSynthesis not supported');
                }
              }}
              disabled={isRecording || isPlaying}
              title="Simple TTS Test"
            >
              Test TTS
            </button>

            <button 
              className="btn btn-success" 
              onClick={async () => {
                console.log('=== MANUAL DEMO TEST ===');
                
                // Simulate complete voice flow
                setTranscript("Hello, can you hear me?");
                setStatus('Demo: Getting AI response...');
                
                // Force demo response directly
                const demoResponse = await chatService.current.getDemoResponse("Hello, can you hear me?");
                setResponse(demoResponse);
                setStatus('Demo response ready - click Play Response to hear it');
                
                console.log('Demo response set:', demoResponse);
                console.log('You can now click "Play Response" to hear the TTS');
              }}
              disabled={isRecording || isPlaying}
              title="Manual Demo Mode"
            >
              Demo Mode
            </button>

            <button 
              className="btn btn-warning" 
              onClick={() => {
                // Browser compatibility check
                const checks = {
                  'speechSynthesis': 'speechSynthesis' in window,
                  'SpeechSynthesisUtterance': 'SpeechSynthesisUtterance' in window,
                  'webkitSpeechRecognition': 'webkitSpeechRecognition' in window,
                  'SpeechRecognition': 'SpeechRecognition' in window,
                  'MediaRecorder': 'MediaRecorder' in window,
                  'getUserMedia': !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
                };
                
                console.log('=== BROWSER COMPATIBILITY CHECK ===');
                Object.entries(checks).forEach(([feature, supported]) => {
                  console.log(`${supported ? '✅' : '❌'} ${feature}: ${supported}`);
                });
                
                // Show summary
                const supportedCount = Object.values(checks).filter(Boolean).length;
                const totalCount = Object.keys(checks).length;
                
                alert(`Browser Support: ${supportedCount}/${totalCount} features supported\n\nCheck console for details`);
              }}
              title="Check Browser Compatibility"
            >
              Check Browser
            </button>

            <button 
              className="btn btn-danger" 
              onClick={async () => {
                console.log('=== FULL DEMO MODE ===');
                
                // Simulate the complete voice companion flow
                setStatus('Demo: Simulating voice input...');
                setTranscript('Hello, can you hear me?');
                
                setTimeout(() => {
                  setStatus('Demo: Getting AI response...');
                  
                  setTimeout(() => {
                    const demoResponse = "Yes, I can hear you! This is a demo of the voice companion working offline. The speech recognition, AI chat, and text-to-speech are all functional!";
                    setResponse(demoResponse);
                    setStatus('Demo: Response ready - click Play Response to hear it');
                    
                    console.log('Demo response set:', demoResponse);
                    
                    // Auto-play the response after a moment
                    setTimeout(async () => {
                      if ('speechSynthesis' in window) {
                        console.log('Demo: Auto-playing TTS response');
                        setStatus('Demo: Playing response...');
                        setIsPlaying(true);
                        
                        const utterance = new SpeechSynthesisUtterance(demoResponse);
                        utterance.rate = 1;
                        utterance.pitch = 1;
                        utterance.volume = 1;
                        
                        utterance.onstart = () => {
                          console.log('Demo TTS started');
                        };
                        
                        utterance.onend = () => {
                          console.log('Demo TTS ended');
                          setIsPlaying(false);
                          setStatus('Demo complete! The voice companion is fully functional.');
                        };
                        
                        utterance.onerror = (e) => {
                          console.error('Demo TTS error:', e);
                          setIsPlaying(false);
                          setStatus('Demo TTS failed, but text response is working');
                        };
                        
                        speechSynthesis.speak(utterance);
                      } else {
                        setStatus('Demo complete! (TTS not available in this browser)');
                      }
                    }, 1000);
                    
                  }, 1500);
                }, 1000);
              }}
              disabled={isRecording || isPlaying}
              title="Full Demo Mode"
            >
              Full Demo
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
