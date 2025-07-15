# Task B – @solace/client-sdk

This package offers:

* AES-GCM-256 encryption helpers (`encryptBlob`, `decryptBlob`)
* Voice Activity Detection (auto-selects Node WebRTC-VAD or browser RMS)
* Convenience HTTP helpers to talk to Task-A (`uploadBlob`, `downloadAndDecrypt`)

## Installation

```bash
# from repo root
pnpm install          # or npm install / yarn

# build SDK
pnpm --filter @solace/client-sdk run build
```

## Demo (Web)

```bash
cd task-B/demo
cp .env.example .env   # fill API_URL & ENC_KEY
pnpm install           # installs React + Vite
pnpm dev
```

Navigate to http://localhost:5173 and follow the UI.

## API Reference (TL;DR)

```ts
import { encryptBlob, decryptBlob, recordAndDetectVoice, uploadBlob, downloadAndDecrypt } from '@solace/client-sdk';
```

See inline JSDoc for full details. 