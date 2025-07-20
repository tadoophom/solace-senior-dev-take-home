# Task C: Solace Lite End-to-End Demo

**Goal**: Prototype a minimal voice→voice companion with chat and voice customization.

## Requirements Implemented

### 1. Voice Capture & ASR
- **Web Audio API**: Browser microphone capture
- **VAD Integration**: Reuses `@solace/client-sdk` for voice detection
- **OpenAI Whisper**: Batch transcription API integration
- **Web Speech API**: Browser fallback for ASR

### 2. Chatbot
- **OpenAI GPT-3.5/4**: AI responses with context
- **Conversation Memory**: Last 3 transcripts maintained
- **Error Handling**: Graceful API failure handling

### 3. TTS & Voice Customization
- **AWS Polly**: Cloud text-to-speech service
- **Web Speech API**: Browser fallback TTS
- **Voice Selection**: UI toggle for male/female voices
- **Audio Playback**: Browser audio synthesis

### 4. UI/UX
- **React Application**: Modern component architecture
- **Minimal Interface**: Talk, Stop, Play Response buttons
- **Voice Dropdown**: Male/female voice selection
- **Status Indicators**: Real-time feedback

### 5. Memory Layer
- **Encrypted Storage**: Last 3 transcripts via `@solace/client-sdk`
- **localStorage Fallback**: Local storage without encryption
- **Data Persistence**: Conversation history maintained

### 6. Error Handling & Logging
- **Network Errors**: Retry logic and fallbacks
- **Decryption Errors**: Graceful degradation
- **UI Error Display**: User-friendly error messages
- **Console Logging**: Debug information

## Setup Instructions

### Prerequisites
- Node.js >=16.x
- Modern browser with microphone access
- OpenAI API account

### Environment Variables

**Required**:
```bash
VITE_OPENAI_API_KEY=your-openai-api-key
```

**Optional** (with fallbacks):
```bash
# AWS Polly TTS (falls back to Web Speech API)
VITE_AWS_ACCESS_KEY_ID=your-aws-access-key
VITE_AWS_SECRET_ACCESS_KEY=your-aws-secret-key
VITE_AWS_REGION=us-west-2

# Solace API (falls back to localStorage)
VITE_SOLACE_API_URL=your-lambda-url
VITE_SOLACE_ENC_KEY=your-base64-encryption-key
```

### Run Steps

1. **Install Dependencies**:
```bash
npm install
```

2. **Configure Environment**:
```bash
cp .env.example .env
# Edit .env with your OpenAI API key
```

3. **Start Development Server**:
```bash
npm run dev
```

4. **Access Demo**:
```
http://localhost:3000
```

## Application Architecture

### Service Layer
```
src/services/
├── speechRecognition.js    # OpenAI Whisper + Web Speech API
├── chatService.js          # OpenAI GPT integration
├── ttsService.js           # AWS Polly + Web Speech TTS
├── memoryService.js        # Encrypted conversation storage
└── audioCapture.js         # Web Audio API recording
```

### Component Structure
```
src/components/
├── ErrorBoundary.jsx       # Error handling wrapper
└── ServiceStatus.jsx       # Service status indicators
```

### Utilities
```
src/utils/
├── logger.js               # Debug logging
└── vadIntegration.js       # Voice Activity Detection
```

## User Interface

### Main Controls
- **Talk Button**: Start voice recording with VAD
- **Stop Button**: End recording and process transcript  
- **Voice Dropdown**: Select male/female voice for TTS
- **Status Display**: Real-time service status

### Voice Flow
1. Click "Talk" → Microphone starts, VAD detects speech
2. Click "Stop" → Audio processed by Whisper API
3. Transcript sent to GPT for AI response
4. Response synthesized to speech and played
5. Conversation saved to encrypted memory

## Features

### Voice Capture
- **MediaRecorder API**: High-quality audio recording
- **Voice Activity Detection**: Automatic speech detection
- **Format Support**: WebM/MP3 audio formats
- **Permission Handling**: Microphone access requests

### Speech Recognition  
- **Primary**: OpenAI Whisper API for accuracy
- **Fallback**: Browser Web Speech API
- **Language Support**: English (configurable)
- **Error Recovery**: Automatic retry with exponential backoff

### AI Chat
- **Model**: GPT-3.5-turbo for cost-efficiency
- **Context**: Conversation history maintained
- **Prompt Engineering**: Psychiatric knowledge focus
- **Response Streaming**: Real-time text generation

### Text-to-Speech
- **Primary**: AWS Polly with natural voices
- **Fallback**: Browser Web Speech API
- **Voice Options**: Male (Matthew) / Female (Joanna)
- **Audio Controls**: Play, pause, volume control

### Memory System
- **Encryption**: AES-GCM via @solace/client-sdk
- **Storage**: Task A Lambda service integration
- **Fallback**: Unencrypted localStorage
- **Limit**: Last 3 conversations retained

## Testing

### Unit Tests
```bash
npm test
```

### Integration Tests  
```bash
npm run test:integration
```

### Manual Testing
1. **Microphone Access**: Grant permissions when prompted
2. **Voice Recognition**: Speak clearly into microphone
3. **AI Response**: Verify GPT responses are contextual
4. **TTS Playback**: Confirm audio synthesis works
5. **Memory**: Check conversation persistence

## Error Handling

### Graceful Degradation
- **No OpenAI Key**: Shows setup instructions
- **Network Failures**: Retry with exponential backoff
- **Microphone Denied**: Shows permission instructions
- **TTS Failure**: Falls back to text display
- **Memory Failure**: Falls back to session storage

### User Feedback
- **Loading States**: Visual indicators during processing
- **Error Messages**: Clear, actionable error descriptions
- **Service Status**: Real-time connection indicators
- **Debug Mode**: Console logging for troubleshooting

## Browser Compatibility

- **Chrome**: 60+ (recommended)
- **Firefox**: 57+
- **Safari**: 11+
- **Edge**: 79+

### Required APIs
- **MediaRecorder**: Audio recording
- **Web Audio**: Audio processing
- **Fetch**: API communications  
- **Web Speech**: Fallback ASR/TTS
- **localStorage**: Fallback memory

## Performance Optimization

- **Lazy Loading**: Components loaded on demand
- **Audio Caching**: TTS responses cached locally
- **Debounced Processing**: Prevents duplicate requests
- **Memory Management**: Automatic cleanup of audio buffers
- **Progressive Enhancement**: Core features work without advanced APIs

## Security Considerations

- **API Keys**: Environment variables only, never hardcoded
- **CORS**: Proper headers for cross-origin requests
- **Input Validation**: Sanitized user inputs
- **Memory Encryption**: Sensitive data encrypted at rest
- **HTTPS**: Secure transport for all API calls
