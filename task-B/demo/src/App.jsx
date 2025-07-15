import React, { useState } from 'react';
import {
  encryptBlob,
  uploadBlob,
  downloadAndDecrypt,
  recordAndDetectVoice
} from '@solace/client-sdk';

const API_URL = import.meta.env.VITE_API_URL;
const ENC_KEY = import.meta.env.VITE_ENC_KEY;

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
    const data = Buffer.concat(frames.map((f) => Buffer.from(f)));
    const cipher = await encryptBlob(data, Buffer.from(ENC_KEY, 'base64'));
    const blob = new Blob([JSON.stringify(cipher)], { type: 'application/json' });
    const key = await uploadBlob(blob, API_URL);
    setBlobKey(key);
  }

  async function handleFetch() {
    if (!blobKey) return;
    const plain = await downloadAndDecrypt(blobKey, API_URL, Buffer.from(ENC_KEY, 'base64'));
    setPlaintext(plain);
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