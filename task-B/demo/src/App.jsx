import React, { useState } from 'react';
import { encryptBlob, uploadBlob, downloadAndDecrypt, recordAndDetectVoice } from '@solace/client-sdk';

const API_URL = import.meta.env.VITE_API_URL;
const ENC_KEY = import.meta.env.VITE_ENC_KEY;

// Helper function to safely decode base64 key
function decodeEncryptionKey(key) {
  if (!key) {
    throw new Error('Encryption key is not defined in environment variables');
  }
  
  try {
    // Clean the key (remove whitespace)
    const cleanKey = key.trim();
    
    // Validate base64 format
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanKey)) {
      throw new Error('Invalid base64 format for encryption key');
    }
    
    return Uint8Array.from(atob(cleanKey), c => c.charCodeAt(0));
  } catch (error) {
    throw new Error(`Failed to decode encryption key: ${error.message}`);
  }
}

export default function App() {
  const [blobKey, setBlobKey] = useState(null);
  const [plaintext, setPlaintext] = useState('');
  const [recording, setRecording] = useState(false);
  const [frames, setFrames] = useState([]);

  async function handleStart() {
    setRecording(true);
    setFrames([]);

    for await (const frame of recordAndDetectVoice()) {
      if (!recording) break;
      setFrames((prev) => [...prev, new Uint8Array(frame.frame)]);
    }
  }

  async function handleStopUpload() {
    setRecording(false);
    try {
      const combined = new Uint8Array(frames.reduce((acc, frame) => acc + frame.length, 0));
      let offset = 0;
      for (const arr of frames) {
        combined.set(arr, offset);
        offset += arr.length;
      }

      const keyBytes = decodeEncryptionKey(ENC_KEY);
      const cipher = await encryptBlob(combined, keyBytes);
      const blob = new Blob([JSON.stringify(cipher)], { type: 'application/json' });
      const key = await uploadBlob(blob, API_URL);
      setBlobKey(key);
    } catch (error) {
      console.error('Error in handleStopUpload:', error);
      alert('Error processing audio: ' + error.message);
    }
  }

  async function handleFetch() {
    if (!blobKey) return;
    try {
      const keyBytes = decodeEncryptionKey(ENC_KEY);
      const plain = await downloadAndDecrypt(blobKey, API_URL, keyBytes);
      setPlaintext(plain);
    } catch (error) {
      console.error('Error in handleFetch:', error);
      alert('Error fetching audio: ' + error.message);
    }
  }

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 600, margin: '2rem auto' }}>
      <h1>Solace Demo</h1>
      <button onClick={handleStart} disabled={recording}>Start Recording</button>
      <button onClick={handleStopUpload} disabled={!recording}>Stop & Upload</button>
      <button onClick={handleFetch} disabled={!blobKey}>Fetch & Decrypt</button>

      {blobKey && <p>BlobKey: {blobKey}</p>}
      {plaintext && (
        <section>
          <h2>Plaintext</h2>
          <pre>{plaintext}</pre>
        </section>
      )}
    </main>
  );
} 