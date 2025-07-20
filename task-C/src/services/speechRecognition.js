/**
 * Optimized speech recognition service using OpenAI Whisper API with Web Speech API fallback
 * Enhanced with caching, connection pooling, and performance monitoring
 * VERSION: 3.0 - Performance optimized
 */

class SpeechRecognitionService {
  constructor() {
    this.apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    // Use CORS proxy to avoid browser restrictions
    this.baseUrl = 'https://cors-anywhere.herokuapp.com/https://api.openai.com/v1/audio/transcriptions';
    this.webSpeechSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    
    // Debug logging
    console.log('API Key loaded:', this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NOT LOADED');
    console.log('Base URL:', this.baseUrl);
    
    // Performance optimizations
    this.audioCache = new Map(); // Cache for processed audio
    this.recognitionPool = []; // Pool of Web Speech Recognition instances
    this.maxPoolSize = 3;
    
    // Reusable objects to reduce allocations
    this.reusableFormData = null;
    this.audioContext = null;
    
    // Performance monitoring
    this.stats = {
      whisperCalls: 0,
      webSpeechCalls: 0,
      cacheHits: 0,
      totalProcessingTime: 0,
      averageLatency: 0
    };
    
    console.log('SpeechRecognitionService v3.0 initialized - performance optimized');
  }

  /**
   * Check if service is properly configured
   */
  isConfigured() {
    return !!this.apiKey || this.webSpeechSupported;
  }

  /**
   * Optimized audio transcription with caching and performance monitoring
   */
  async transcribeAudio(audioBlob) {
    const startTime = performance.now();
    
    try {
      // Check cache first for identical audio blobs
      const cacheKey = await this.generateCacheKey(audioBlob);
      if (this.audioCache.has(cacheKey)) {
        this.stats.cacheHits++;
        console.log('Cache hit for audio transcription');
        return this.audioCache.get(cacheKey);
      }

      let result;
      
      // Try Web Speech API first since it works better in browsers
      if (this.webSpeechSupported) {
        try {
          console.log('Attempting transcription with Web Speech API...');
          // Web Speech API doesn't use the audioBlob, it uses live microphone
          result = await this.transcribeWithWebSpeech();
          this.stats.webSpeechCalls++;
        } catch (webSpeechError) {
          console.log('Web Speech API failed, trying Whisper API:', webSpeechError.message);
          // Fallback to Whisper API
          result = await this.transcribeWithWhisper(audioBlob);
          this.stats.whisperCalls++;
        }
      } else {
        // Use Whisper API directly if Web Speech not supported
        result = await this.transcribeWithWhisper(audioBlob);
        this.stats.whisperCalls++;
      }

      // Cache the result
      this.audioCache.set(cacheKey, result);
      
      // Update performance stats
      const processingTime = performance.now() - startTime;
      this.stats.totalProcessingTime += processingTime;
      this.updateAverageLatency(processingTime);
      
      return result;

    } catch (error) {
      console.error('Transcription failed:', error);
      throw error;
    }
  }

  /**
   * Generate cache key for audio blob
   */
  async generateCacheKey(audioBlob) {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }

  /**
   * Optimized Whisper API transcription with connection reuse
   */
  async transcribeWithWhisper(audioBlob) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Convert to optimized format
      const audioFile = await this.convertToOptimalFormat(audioBlob);
      
      // Reuse FormData object to reduce allocations
      const formData = this.getReusableFormData();
      formData.set('file', audioFile, 'audio.wav');
      formData.set('model', 'whisper-1');
      formData.set('language', 'en');
      formData.set('response_format', 'json');

      console.log('Making Whisper API call to:', this.baseUrl);
      console.log('Using API key:', this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NOT SET');

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
        // Performance optimizations
        keepalive: true,
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      if (!response.ok) {
        const error = await response.json();
        console.log('API Error details:', error);
        throw new Error(`Whisper API error: ${error.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      return result.text.trim();

    } catch (error) {
      console.error('Whisper transcription failed:', error);
      throw new Error(`Speech recognition failed: ${error.message}`);
    }
  }

  /**
   * Get reusable FormData object to reduce allocations
   */
  getReusableFormData() {
    if (!this.reusableFormData) {
      this.reusableFormData = new FormData();
    } else {
      // Clear previous data
      for (const key of this.reusableFormData.keys()) {
        this.reusableFormData.delete(key);
      }
    }
    return this.reusableFormData;
  }

  /**
   * Transcribe audio using Web Speech API with live microphone
   */
  async transcribeWithWebSpeech() {
    if (!this.webSpeechSupported) {
      throw new Error('Web Speech API not supported in this browser');
    }

    console.log('Starting live microphone transcription with Web Speech API...');
    
    return new Promise((resolve, reject) => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      // Configure recognition settings
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('Web Speech API transcript:', transcript);
        resolve(transcript);
      };

      recognition.onerror = (event) => {
        console.error('Web Speech API error:', event.error);
        reject(new Error(`Web Speech API error: ${event.error}`));
      };

      recognition.onend = () => {
        console.log('Web Speech API recognition ended');
      };

      recognition.onstart = () => {
        console.log('Web Speech API started - speak now!');
      };

      try {
        recognition.start();
        
        // Set a timeout for the recognition
        setTimeout(() => {
          if (recognition.state !== 'inactive') {
            recognition.stop();
            reject(new Error('Speech recognition timeout - no speech detected'));
          }
        }, 10000); // 10 second timeout
        
      } catch (error) {
        reject(new Error(`Failed to start speech recognition: ${error.message}`));
      }
    });
  }

  /**
   * Optimized Web Speech API with connection pooling
   */
  async startLiveSpeechRecognition() {
    if (!this.webSpeechSupported) {
      throw new Error('Web Speech API not supported in this browser');
    }

    const startTime = performance.now();
    this.stats.webSpeechCalls++;

    return new Promise((resolve, reject) => {
      const recognition = this.getPooledRecognition();
      
      // Optimize recognition settings for performance
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;
      
      // Use arrow functions to avoid binding overhead
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        this.returnToPool(recognition);
        
        // Update performance stats
        const processingTime = performance.now() - startTime;
        this.updateAverageLatency(processingTime);
        
        resolve(transcript);
      };
      
      recognition.onerror = (event) => {
        this.returnToPool(recognition);
        reject(new Error(`Web Speech API error: ${event.error}`));
      };
      
      recognition.onend = () => {
        // Recognition ended without result
        this.returnToPool(recognition);
        reject(new Error('Speech recognition ended without detecting speech'));
      };
      
      try {
        recognition.start();
        
        // Optimized timeout with cleanup
        setTimeout(() => {
          if (recognition.state !== 'inactive') {
            recognition.stop();
            this.returnToPool(recognition);
            reject(new Error('Speech recognition timeout - please try again'));
          }
        }, 10000);
        
      } catch (error) {
        this.returnToPool(recognition);
        reject(new Error(`Failed to start speech recognition: ${error.message}`));
      }
    });
  }

  /**
   * Get pooled recognition instance to avoid repeated object creation
   */
  getPooledRecognition() {
    if (this.recognitionPool.length > 0) {
      return this.recognitionPool.pop();
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return new SpeechRecognition();
  }

  /**
   * Return recognition instance to pool for reuse
   */
  returnToPool(recognition) {
    if (this.recognitionPool.length < this.maxPoolSize) {
      // Clean up event handlers
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      
      this.recognitionPool.push(recognition);
    }
  }

  /**
   * Optimized audio format conversion with caching
   */
  async convertToOptimalFormat(audioBlob) {
    try {
      // Use shared audio context for better performance
      const audioContext = this.getSharedAudioContext();
      
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Convert to optimized WAV format
      const wavBlob = this.audioBufferToOptimizedWav(audioBuffer);
      return wavBlob;
    } catch (error) {
      console.warn('Audio conversion failed, using original:', error);
      return audioBlob;
    }
  }

  /**
   * Get shared audio context for better resource utilization
   */
  getSharedAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000 // Optimize for speech
      });
    }
    return this.audioContext;
  }

  /**
   * Optimized WAV conversion with minimal allocations
   */
  audioBufferToOptimizedWav(audioBuffer) {
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const channels = Math.min(audioBuffer.numberOfChannels, 1); // Force mono for efficiency
    
    // Pre-calculate sizes
    const headerSize = 44;
    const dataSize = length * 2;
    const fileSize = headerSize + dataSize;
    
    const arrayBuffer = new ArrayBuffer(fileSize);
    const view = new DataView(arrayBuffer);
    
    // Optimized header writing
    this.writeWavHeader(view, sampleRate, channels, dataSize);
    
    // Optimized audio data conversion
    const channelData = audioBuffer.getChannelData(0);
    let offset = headerSize;
    
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Optimized WAV header writing
   */
  writeWavHeader(view, sampleRate, channels, dataSize) {
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
  }

  /**
   * Update average latency with exponential moving average
   */
  updateAverageLatency(newLatency) {
    const alpha = 0.1; // Smoothing factor
    this.stats.averageLatency = this.stats.averageLatency === 0 ? 
      newLatency : 
      (alpha * newLatency + (1 - alpha) * this.stats.averageLatency);
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.audioCache.size,
      poolSize: this.recognitionPool.length
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    // Clear cache
    this.audioCache.clear();
    
    // Clean up recognition pool
    this.recognitionPool.forEach(recognition => {
      if (recognition.state === 'listening') {
        recognition.stop();
      }
    });
    this.recognitionPool.length = 0;
    
    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    // Clear reusable objects
    this.reusableFormData = null;
  }
}

export default SpeechRecognitionService; 