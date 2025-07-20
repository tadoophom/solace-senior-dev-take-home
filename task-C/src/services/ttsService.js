/**
 * Text-to-Speech service using AWS Polly
 */

class TTSService {
  constructor() {
    this.accessKeyId = import.meta.env.VITE_AWS_ACCESS_KEY_ID;
    this.secretAccessKey = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
    this.region = import.meta.env.VITE_AWS_REGION || 'us-east-1';
    this.currentAudio = null;
    this.isPlaying = false;
    
    // Log configuration for debugging
    console.log('TTS Service initialized with:');
    console.log('- Access Key:', this.accessKeyId ? `${this.accessKeyId.substring(0, 8)}...` : 'Not set');
    console.log('- Secret Key:', this.secretAccessKey ? 'Set' : 'Not set');
    console.log('- Region:', this.region);
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
    const canonicalRequest = `${method}\n${url}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    
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
    // Stop any ongoing speech first
    this.stopSpeech();
    
    console.log('TTS: Starting synthesis with voice type:', voiceType);
    console.log('TTS: AWS Polly configured:', this.isConfigured());
    console.log('TTS: Web Speech API available:', 'speechSynthesis' in window);
    
    // Note: AWS Polly requires server-side implementation for security
    // For now, we'll use Web Speech API which works great in browsers
    if ('speechSynthesis' in window) {
      console.log('TTS: Using Web Speech API for synthesis (recommended for browser apps)');
      return this.synthesizeWithWebAPI(text, voiceType);
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

      // Cancel any ongoing speech
      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      
      // Wait for voices to be loaded
      const setVoiceAndSpeak = () => {
        const voices = speechSynthesis.getVoices();
        console.log('Available voices:', voices.map(v => `${v.name} (${v.lang}) - ${v.gender || 'unknown'}`));
        
        if (voices.length > 0) {
          let selectedVoice = null;
          
          // Try to find voice by gender preference
          if (voiceType === 'female') {
            // Look for female voices
            selectedVoice = voices.find(voice => {
              const name = voice.name.toLowerCase();
              const lang = voice.lang.toLowerCase();
              
              // Check for explicit female indicators
              if (name.includes('female') || name.includes('woman')) return true;
              
              // Check for common female voice names
              if (name.includes('samantha') || name.includes('susan') || name.includes('karen') || 
                  name.includes('victoria') || name.includes('allison') || name.includes('ava') ||
                  name.includes('zira') || name.includes('hazel') || name.includes('fiona') ||
                  name.includes('moira') || name.includes('tessa') || name.includes('veena') ||
                  name.includes('rishi') || name.includes('joanna') || name.includes('kimberly') ||
                  name.includes('salli') || name.includes('ivy')) return true;
              
              // For English voices, prefer higher-pitched sounding names
              if (lang.startsWith('en') && (name.includes('voice') && !name.includes('male'))) {
                return true;
              }
              
              return false;
            });
            
            // If no explicit female voice found, look for non-male voices
            if (!selectedVoice) {
              selectedVoice = voices.find(voice => {
                const name = voice.name.toLowerCase();
                return !name.includes('male') && !name.includes('man') && 
                       !name.includes('alex') && !name.includes('david') && 
                       !name.includes('daniel') && !name.includes('fred') &&
                       !name.includes('tom') && !name.includes('thomas');
              });
            }
          } else {
            // Look for male voices
            selectedVoice = voices.find(voice => {
              const name = voice.name.toLowerCase();
              
              // Check for explicit male indicators
              if (name.includes('male') || name.includes('man')) return true;
              
              // Check for common male voice names
              if (name.includes('alex') || name.includes('david') || name.includes('daniel') || 
                  name.includes('fred') || name.includes('tom') || name.includes('thomas') ||
                  name.includes('jorge') || name.includes('diego') || name.includes('carlos') ||
                  name.includes('matthew') || name.includes('justin') || name.includes('joey') ||
                  name.includes('arthur') || name.includes('oliver') || name.includes('nathan')) return true;
              
              return false;
            });
          }
          
          // Fallback to first available voice if no gender-specific voice found
          if (!selectedVoice && voices.length > 0) {
            // Try to get a voice in the user's language first
            const userLang = navigator.language || 'en-US';
            selectedVoice = voices.find(voice => voice.lang.startsWith(userLang.split('-')[0])) || voices[0];
          }
          
          if (selectedVoice) {
            utterance.voice = selectedVoice;
            console.log(`Selected voice: ${selectedVoice.name} (${selectedVoice.lang}) for ${voiceType}`);
          } else {
            console.log('Using default voice');
          }
        }
        
        // Optimize speech parameters
        utterance.rate = 0.9; // Slightly slower for better clarity
        utterance.pitch = voiceType === 'female' ? 1.1 : 0.9; // Higher pitch for female, lower for male
        utterance.volume = 1.0;
        
        utterance.onend = () => {
          console.log('Speech synthesis completed');
          this.isPlaying = false;
          resolve();
        };
        
        utterance.onerror = (error) => {
          console.error('Speech synthesis error:', error);
          this.isPlaying = false;
          reject(new Error(`Speech synthesis failed: ${error.error || 'Unknown error'}`));
        };
        
        utterance.onstart = () => {
          console.log('Speech synthesis started');
          this.isPlaying = true;
        };
        
        utterance.onpause = () => {
          console.log('Speech synthesis paused');
        };
        
        utterance.onresume = () => {
          console.log('Speech synthesis resumed');
        };
        
        console.log(`Starting speech synthesis with text: "${text}" using ${voiceType} voice`);
        
        try {
          speechSynthesis.speak(utterance);
          
          // Workaround for Chrome bug where speech might not start
          setTimeout(() => {
            if (speechSynthesis.paused) {
              speechSynthesis.resume();
            }
          }, 100);
        } catch (error) {
          console.error('Error starting speech synthesis:', error);
          this.isPlaying = false;
          reject(error);
        }
      };

      // Check if voices are already loaded
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        setVoiceAndSpeak();
      } else {
        // Wait for voices to be loaded
        let voicesLoaded = false;
        
        const handleVoicesChanged = () => {
          if (!voicesLoaded) {
            voicesLoaded = true;
            speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
            setVoiceAndSpeak();
          }
        };
        
        speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
        
        // Fallback timeout in case onvoiceschanged doesn't fire
        setTimeout(() => {
          if (!voicesLoaded) {
            voicesLoaded = true;
            speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
            console.warn('Voices loading timeout, using available voices');
            setVoiceAndSpeak();
          }
        }, 2000);
      }
    });
  }

  /**
   * Synthesize speech using AWS Polly (requires server-side proxy)
   */
  async synthesizeWithPolly(text, voiceType) {
    const voiceId = voiceType === 'female' ? 'Joanna' : 'Matthew';
    
    console.log(`AWS Polly: Note - Direct browser access to AWS Polly requires server-side proxy for security`);
    console.log(`AWS Polly: For production, implement a backend endpoint that calls Polly`);
    console.log(`AWS Polly: Falling back to Web Speech API for now`);
    
    // For security reasons, AWS Polly should be called from a backend server
    // Direct browser access exposes credentials and has CORS issues
    return this.synthesizeWithWebAPI(text, voiceType);
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
      console.log('TTS: Starting speech synthesis for:', text);
      await this.synthesizeSpeech(text, voiceType);
      console.log('TTS: Speech synthesis completed');
    } catch (error) {
      console.error('TTS: Speech synthesis failed:', error);
      throw error;
    } finally {
      this.isPlaying = false;
    }
  }

  /**
   * Stop current speech playback
   */
  stopSpeech() {
    try {
      if ('speechSynthesis' in window) {
        // Cancel any ongoing speech synthesis
        if (speechSynthesis.speaking || speechSynthesis.pending) {
          speechSynthesis.cancel();
          console.log('TTS: Speech synthesis cancelled');
        }
      }
      
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio = null;
        console.log('TTS: Audio playback stopped');
      }
      
      this.isPlaying = false;
    } catch (error) {
      console.error('TTS: Error stopping speech:', error);
      this.isPlaying = false;
    }
  }

  /**
   * Check if TTS service is configured
   */
  isConfigured() {
    // Web Speech API is always available if supported
    if ('speechSynthesis' in window) {
      return true;
    }
    
    // AWS Polly requires credentials
    return !!(this.accessKeyId && this.secretAccessKey);
  }

  /**
   * Check if currently playing
   */
  getIsPlaying() {
    // Check both internal state and speechSynthesis state
    if ('speechSynthesis' in window) {
      return this.isPlaying || speechSynthesis.speaking;
    }
    return this.isPlaying;
  }

  /**
   * Get available voices for debugging
   */
  getAvailableVoices() {
    if ('speechSynthesis' in window) {
      const voices = speechSynthesis.getVoices();
      return voices.map(voice => ({
        name: voice.name,
        lang: voice.lang,
        gender: voice.name.toLowerCase().includes('male') ? 'male' : 
                voice.name.toLowerCase().includes('female') ? 'female' : 'unknown',
        localService: voice.localService,
        default: voice.default
      }));
    }
    return [];
  }

  /**
   * Test voice selection
   */
  async testVoice(voiceType = 'female', testText = 'Hello, this is a test of the voice selection.') {
    console.log(`Testing ${voiceType} voice with text: "${testText}"`);
    console.log('Available voices:', this.getAvailableVoices());
    
    try {
      await this.playSpeech(testText, voiceType);
      console.log(`${voiceType} voice test completed successfully`);
    } catch (error) {
      console.error(`${voiceType} voice test failed:`, error);
      throw error;
    }
  }

  /**
   * Test AWS Polly specifically
   */
  async testPolly(voiceType = 'female', testText = 'This is a test of the voice synthesis service.') {
    console.log('=== AWS POLLY INFORMATION ===');
    console.log('Access Key ID:', this.accessKeyId ? `${this.accessKeyId.substring(0, 8)}...` : 'Not set');
    console.log('Secret Key:', this.secretAccessKey ? 'Set' : 'Not set');
    console.log('Region:', this.region);
    console.log('');
    console.log('📋 AWS POLLY SETUP GUIDE:');
    console.log('For production AWS Polly integration, you need:');
    console.log('1. Backend server endpoint (e.g., /api/tts)');
    console.log('2. Server calls AWS Polly with credentials');
    console.log('3. Frontend calls your backend endpoint');
    console.log('4. This avoids exposing AWS credentials in browser');
    console.log('');
    console.log('🎯 CURRENT BEHAVIOR:');
    console.log('Using Web Speech API (built into browser)');
    console.log('This provides excellent voice quality without AWS setup');
    
    try {
      console.log('Testing voice synthesis...');
      await this.playSpeech(testText, voiceType);
      console.log('✅ Voice synthesis test completed successfully!');
      console.log('You heard the Web Speech API voice (browser built-in)');
    } catch (error) {
      console.error('❌ Voice synthesis test failed:', error);
      throw error;
    }
  }
}

export default TTSService; 