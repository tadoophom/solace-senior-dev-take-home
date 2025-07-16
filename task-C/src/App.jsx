import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import AudioCaptureService from './services/audioCapture';
import SpeechRecognitionService from './services/speechRecognition';
import VADIntegration from './utils/vadIntegration';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('female');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');

  // Service instances
  const audioCapture = useRef(new AudioCaptureService());
  const speechRecognition = useRef(new SpeechRecognitionService());
  const vadIntegration = useRef(new VADIntegration());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioCapture.current.cleanup();
      vadIntegration.current.stopVAD();
    };
  }, []);

  const handleStartTalk = async () => {
    try {
      setError('');
      setStatus('Requesting microphone access...');
      
      // Initialize and start audio capture
      await audioCapture.current.initialize();
      await audioCapture.current.startRecording();
      
      setIsRecording(true);
      setStatus('Recording... (speak now)');
      
      // Start VAD for real-time voice detection
      const audioStream = audioCapture.current.getAudioStream();
      vadIntegration.current.setVoiceDetectedCallback((frame) => {
        // Visual feedback for voice detection
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
      setStatus('Error');
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
      
      // Convert audio to text using Whisper
      const transcribedText = await speechRecognition.current.transcribeAudio(audioBlob);
      
      if (!transcribedText || transcribedText.trim() === '') {
        throw new Error('No speech detected in audio');
      }
      
      setTranscript(transcribedText);
      setStatus('Speech recognition complete');
      
      // TODO: Send to chatbot in Phase 3
      setResponse('AI response will be implemented in Phase 3');
      
    } catch (error) {
      console.error('Failed to process audio:', error);
      setError(`Failed to process audio: ${error.message}`);
      setStatus('Error');
    }
  };

  const handlePlayResponse = () => {
    setIsPlaying(true);
    setStatus('Playing response...');
    
    // TODO: Implement TTS playback in Phase 4
    setTimeout(() => {
      setIsPlaying(false);
      setStatus('Ready');
    }, 2000);
  };

  const handleVoiceChange = (event) => {
    setSelectedVoice(event.target.value);
  };

  const clearError = () => {
    setError('');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Solace Lite - Voice Companion</h1>
        <p className="status">Status: {status}</p>
        {error && (
          <div className="error-message">
            <p>{error}</p>
            <button onClick={clearError} className="error-close">×</button>
          </div>
        )}
      </header>

      <main className="app-main">
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
            >
              {isRecording ? 'Recording...' : 'Talk'}
            </button>

            <button 
              className="btn btn-secondary" 
              onClick={handleStop}
              disabled={!isRecording}
            >
              Stop
            </button>

            <button 
              className="btn btn-success" 
              onClick={handlePlayResponse}
              disabled={!response || isPlaying || response.includes('Phase')}
            >
              {isPlaying ? 'Playing...' : 'Play Response'}
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
      </main>
    </div>
  );
}

export default App;
