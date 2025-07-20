# Solace Senior Developer Take-Home Assignment

This repository implements a secure voice-to-voice AI companion system across three interconnected components as specified in the technical requirements.

## Project Structure & Submission

### Repository Structure
```
solace-senior-dev-take-home/
├── task-A/                 # Enclave-Style Decryption Service
├── task-B/                 # Cross-Platform Client SDK  
├── task-C/                 # Solace Lite End-to-End Demo
├── README.md               # This file - high-level overview
├── .gitignore              # Excludes node_modules/, venv/, secrets
└── .env.example            # Example environment variables
```

## Common Prerequisites

### Languages & Runtimes
- **Node.js** >=16.x
- **Python** >=3.9

### CLI Tools
- **AWS CLI** (configured with credentials)
- **Docker**
- **Git**
- **Terraform** or AWS SAM CLI

### Accounts
- **AWS Account** with permissions for Lambda, KMS, S3, IAM
- **NPM Account** (optional) for publishing @solace/client-sdk

## Task Overview

### Task A: Enclave-Style Decryption Service
**Status**: Complete  
**Location**: `task-A/`

AWS Lambda + KMS implementation that:
- Receives blobKey via HTTP POST
- Fetches encrypted blob from S3
- Decrypts with KMS (Lambda-only key policy)
- Returns JSON `{ plaintext: string }` with CORS

### Task B: Cross-Platform Client SDK  
**Status**: Complete  
**Location**: `task-B/`

`@solace/client-sdk` package providing:
- AES-GCM 256 encryption/decryption APIs
- Voice Activity Detection with webrtcvad
- Upload/download helpers for Task A integration
- React demo application

### Task C: Solace Lite End-to-End Demo
**Status**: Complete  
**Location**: `task-C/`

Voice-to-voice companion with:
- Browser mic capture + VAD processing
- OpenAI Whisper ASR integration
- OpenAI GPT-3.5/4 chatbot responses
- AWS Polly TTS with voice selection
- Encrypted memory via Task A/B integration

## Quick Start

1. **Clone and setup**:
```bash
git clone <repo-url>
cd solace-senior-dev-take-home
```

2. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your API keys and AWS credentials
```

3. **Deploy Task A**:
```bash
cd task-A/infra
terraform init
terraform apply
```

4. **Build Task B**:
```bash
cd task-B
npm install
npm run build
```

5. **Run Task C**:
```bash
cd task-C
npm install
npm run dev
# Open http://localhost:3000
```

## Submission Checklist

- **Repository**: `solace-senior-dev-take-home` with required structure
- **Task A**: Lambda decryption service with Terraform infrastructure
- **Task B**: Client SDK with encryption, VAD, and demo
- **Task C**: Voice companion demo with TTS and memory
- **Documentation**: Task-specific READMEs with setup instructions
- **Security**: KMS encryption, IAM policies, secret handling
- **Testing**: Unit tests and integration examples
- **Environment**: `.env.example` provided (no secrets committed)

## Evaluation Criteria

- **Code Quality**: TypeScript, Python best practices, modular design
- **Documentation**: Clear setup steps, API definitions, architecture notes  
- **Security**: Proper encryption, IAM policies, secret management
- **Functionality**: Requirements met, edge cases handled, tested
- **Integratability**: Microservices-ready, configurable, scalable

## Support

**Question Window**: First 48 hours  
**Contact**: kellyzeng@solacelaunch.org  
**Submission**: Repository link + .env.example via email
