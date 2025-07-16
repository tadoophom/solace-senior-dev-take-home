/**
 * Text-to-Speech service using AWS Polly
 */

class TTSService {
  constructor() {
    this.accessKeyId = import.meta.env.VITE_AWS_ACCESS_KEY_ID;
    this.secretAccessKey = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
    this.region = import.meta.env.VITE_AWS_REGION || 'us-west-2';
    this.currentAudio = null;
    this.isPlaying = false;
  }

  /**
   * Generate AWS signature for Polly request
   */
  async generateSignature(method, url, headers, payload) {
    const crypto = window.crypto;
    const encoder = new TextEncoder();
    
    // Create canonical request
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map(key => `${key.toLowerCase()}:${headers[key]}`)
      .join('\n') + '\n';
    
    const signedHeaders = Object.keys(headers)
      .sort()
      .map(key => key.toLowerCase())
      .join(';');
    
    const payloadHash = await this.sha256(payload);
    const canonicalRequest = `${method}\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    
    // Create string to sign
    const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = date.substr(0, 8);
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.region}/polly/aws4_request`;
    const stringToSign = `${algorithm}\n${date}\n${credentialScope}\n${await this.sha256(canonicalRequest)}`;
    
    // Calculate signature
    const signingKey = await this.getSignatureKey(this.secretAccessKey, dateStamp, this.region, 'polly');
    const signature = await this.hmacSha256(signingKey, stringToSign);
    
    return {
      authorization: `${algorithm} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      date: date
    };
  }

  /**
   * SHA256 hash function
   */
  async sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * HMAC SHA256 function
   */
  async hmacSha256(key, message) {
    const encoder = new TextEncoder();
    const keyBuffer = typeof key === 'string' ? encoder.encode(key) : key;
    const messageBuffer = encoder.encode(message);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageBuffer);
    const signatureArray = Array.from(new Uint8Array(signature));
    return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Get AWS signature key
   */
  async getSignatureKey(key, dateStamp, regionName, serviceName) {
    const encoder = new TextEncoder();
    const kDate = await this.hmacSha256(encoder.encode('AWS4' + key), dateStamp);
    const kRegion = await this.hmacSha256(this.hexToBytes(kDate), regionName);
    const kService = await this.hmacSha256(this.hexToBytes(kRegion), serviceName);
    const kSigning = await this.hmacSha256(this.hexToBytes(kService), 'aws4_request');
    return this.hexToBytes(kSigning);
  }

  /**
   * Convert hex string to bytes
   */
  hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Synthesize speech using AWS Polly (fallback to Web Speech API)
   */
  async synthesizeSpeech(text, voiceType = 'female') {
    // Try Web Speech API first (simpler and more reliable)
    if ('speechSynthesis' in window) {
      return this.synthesizeWithWebAPI(text, voiceType);
    }
    
    // Fallback to AWS Polly if Web Speech API not available
    if (this.isConfigured()) {
      return this.synthesizeWithPolly(text, voiceType);
    }
    
    throw new Error('No TTS service available');
  }

  /**
   * Synthesize speech using Web Speech API
   */
  async synthesizeWithWebAPI(text, voiceType) {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Web Speech API not supported'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      
      // Configure voice
      const voices = speechSynthesis.getVoices();
      const preferredVoice = voices.find(voice => 
        voiceType === 'female' 
          ? voice.name.toLowerCase().includes('female') || voice.name.toLowerCase().includes('samantha')
          : voice.name.toLowerCase().includes('male') || voice.name.toLowerCase().includes('alex')
      );
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      utterance.onend = () => resolve();
      utterance.onerror = (error) => reject(error);
      
      speechSynthesis.speak(utterance);
    });
  }

  /**
   * Synthesize speech using AWS Polly
   */
  async synthesizeWithPolly(text, voiceType) {
    const voiceId = voiceType === 'female' ? 'Joanna' : 'Matthew';
    
    const payload = JSON.stringify({
      Text: text,
      VoiceId: voiceId,
      OutputFormat: 'mp3',
      TextType: 'text'
    });

    const headers = {
      'Content-Type': 'application/x-amz-json-1.0',
      'X-Amz-Target': 'AWSPollyFrontendService.SynthesizeSpeech'
    };

    const { authorization, date } = await this.generateSignature('POST', '/', headers, payload);
    headers['Authorization'] = authorization;
    headers['X-Amz-Date'] = date;

    const response = await fetch(`https://polly.${this.region}.amazonaws.com/`, {
      method: 'POST',
      headers: headers,
      body: payload
    });

    if (!response.ok) {
      throw new Error(`Polly API error: ${response.status}`);
    }

    const audioData = await response.arrayBuffer();
    const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(audioBlob);
    
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      audio.onerror = reject;
      audio.play();
    });
  }

  /**
   * Play synthesized speech
   */
  async playSpeech(text, voiceType = 'female') {
    if (this.isPlaying) {
      this.stopSpeech();
    }

    this.isPlaying = true;
    
    try {
      await this.synthesizeSpeech(text, voiceType);
    } finally {
      this.isPlaying = false;
    }
  }

  /**
   * Stop current speech playback
   */
  stopSpeech() {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    
    this.isPlaying = false;
  }

  /**
   * Check if TTS service is configured
   */
  isConfigured() {
    return !!(this.accessKeyId && this.secretAccessKey);
  }

  /**
   * Check if currently playing
   */
  getIsPlaying() {
    return this.isPlaying;
  }
}

export default TTSService; 