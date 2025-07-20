# Task B: Cross-Platform Client SDK

**Goal**: Build `@solace/client-sdk` for secure blob encryption and VAD-based audio capture.

## Requirements Implemented

### 1. Package Structure
- `task-B/src/` - TypeScript source code
- `package.json` - Proper name, version, scripts configured
- Build system with Rollup for multiple targets

### 2. Encryption APIs
```javascript
// AES-GCM 256-bit encryption using Web Crypto API
encryptBlob(data: string): Promise<{ iv: string; ciphertext: string; tag: string }>
decryptBlob({ iv, ciphertext, tag }, key): Promise<string>
```

### 3. Voice Activity Detection
```javascript
// WebRTC VAD integration with speech detection
recordAndDetectVoice(): AsyncIterable<{ frame: ArrayBuffer; timestamp: number }>
```

### 4. Upload/Download Helpers
```javascript
// Task A endpoint integration
uploadBlob(blob, apiUrl, token): Promise<string>        // Returns blobKey
downloadAndDecrypt(blobKey, apiUrl, key): Promise<string>
```

### 5. Sample Demo
- React demo application in `task-B/demo/`
- Buttons: Start Recording, Stop & Upload, Fetch & Decrypt
- Display plaintext results

### 6. Testing
- Jest unit tests for encryption/decryption
- VAD simulation on prerecorded audio
- HTTP utility testing with mocks

## Installation

```bash
npm install @solace/client-sdk
```

## API Usage

### Encryption APIs

```javascript
import { encryptBlob, decryptBlob } from '@solace/client-sdk';

// Encrypt data with AES-GCM-256
const encrypted = await encryptBlob("Sensitive data");
console.log(encrypted);
// { 
//   iv: "base64-encoded-iv",
//   ciphertext: "base64-encoded-ciphertext", 
//   tag: "base64-encoded-auth-tag"
// }

// Decrypt data
const key = "base64-encoded-256-bit-key";
const plaintext = await decryptBlob(encrypted, key);
console.log(plaintext); // "Sensitive data"
```

### Voice Activity Detection

```javascript
import { recordAndDetectVoice } from '@solace/client-sdk';

// Record audio with speech detection
for await (const audioFrame of recordAndDetectVoice()) {
  console.log(`Speech detected at ${audioFrame.timestamp}ms`);
  console.log(`Frame size: ${audioFrame.frame.byteLength} bytes`);
  
  // Process audio frame
  processAudioFrame(audioFrame.frame);
}
```

### HTTP Utilities

```javascript
import { uploadBlob, downloadAndDecrypt } from '@solace/client-sdk';

// Upload encrypted blob to Task A service
const apiUrl = "https://your-lambda-url.amazonaws.com/";
const blobKey = await uploadBlob("Hello World", apiUrl);
console.log(`Uploaded as: ${blobKey}`);

// Download and decrypt blob
const encryptionKey = "base64-encoded-key";
const plaintext = await downloadAndDecrypt(blobKey, apiUrl, encryptionKey);
console.log(`Decrypted: ${plaintext}`);
```

## Demo Launch

### Local Development
```bash
cd task-B/demo
npm install
npm run dev
# Open http://localhost:5173
```

### Demo Features
- **Start Recording**: Captures microphone with VAD
- **Stop & Upload**: Encrypts and uploads to Task A service  
- **Fetch & Decrypt**: Downloads and decrypts by blobKey
- **Visual Feedback**: Real-time audio levels and status

## Package Structure

```
task-B/
├── src/
│   ├── crypto.js           # AES-GCM encryption implementation
│   ├── vad.js             # Voice Activity Detection
│   ├── vadBrowser.js      # Browser-specific VAD
│   ├── http.js            # Upload/download utilities
│   └── index.js           # Main SDK exports
├── demo/
│   ├── src/
│   │   ├── App.jsx        # React demo application
│   │   └── main.jsx       # Entry point
│   ├── package.json       # Demo dependencies
│   └── vite.config.js     # Vite configuration
├── __tests__/             # Jest unit tests
├── package.json           # Main package configuration
├── rollup.config.js       # Build configuration
└── README.md              # This file
```

## Testing

### Run Unit Tests
```bash
npm test
```

### Test Coverage Areas
- **Encryption**: AES-GCM-256 round-trip tests
- **VAD**: Audio processing with mock audio data
- **HTTP**: Upload/download with mock Task A service
- **Integration**: End-to-end workflow testing

### Test Example
```javascript
// Encryption round-trip test
test('encrypt and decrypt preserves data', async () => {
  const original = "Test message";
  const key = await generateKey();
  
  const encrypted = await encryptBlob(original);
  const decrypted = await decryptBlob(encrypted, key);
  
  expect(decrypted).toBe(original);
});
```

## Browser Compatibility

- **Modern Browsers**: Chrome 60+, Firefox 57+, Safari 11+
- **Node.js**: 16+ with crypto module support
- **Web Crypto API**: Required for encryption
- **WebRTC**: Required for VAD (falls back to RMS detection)

## Security Features

- **AES-GCM-256**: Authenticated encryption with 256-bit keys
- **Secure Random**: Cryptographically secure IV generation
- **Key Derivation**: PBKDF2 for password-based keys (optional)
- **Memory Safety**: Automatic cleanup of sensitive data

## Performance

- **Streaming VAD**: Real-time voice detection with minimal latency
- **Chunk Processing**: Efficient handling of large audio buffers
- **Worker Support**: Optional Web Worker for background processing
- **Memory Management**: Automatic buffer cleanup and GC optimization

## Publishing

### NPM Package
```bash
npm run build
npm publish
```

### Local Install Instructions
```bash
# Install from local directory
npm install ./task-B

# Or link for development
cd task-B && npm link
cd ../your-app && npm link @solace/client-sdk
```
