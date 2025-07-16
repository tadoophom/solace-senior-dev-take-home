import React, { useState } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('female');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState('Ready');

  const handleStartTalk = () => {
    setIsRecording(true);
    setStatus('Recording...');
    // Voice capture implementation will go here
  };

  const handleStop = () => {
    setIsRecording(false);
    setStatus('Processing...');
    // Stop recording and process audio
  };

  const handlePlayResponse = () => {
    setIsPlaying(true);
    setStatus('Playing response...');
    // TTS playback implementation will go here
  };

  const handleVoiceChange = (event) => {
    setSelectedVoice(event.target.value);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Solace Lite - Voice Companion</h1>
        <p className="status">Status: {status}</p>
      </header>

      <main className="app-main">
        <div className="controls">
          <div className="voice-selection">
            <label htmlFor="voice-select">Voice:</label>
            <select 
              id="voice-select" 
              value={selectedVoice} 
              onChange={handleVoiceChange}
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
              disabled={!response || isPlaying}
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
