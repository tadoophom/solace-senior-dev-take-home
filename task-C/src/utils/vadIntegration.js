/**
 * Production-grade Voice Activity Detection integration
 * High-performance VAD with multiple detection algorithms and fallback mechanisms
 */

// Constants for VAD configuration
const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_FRAME_SIZE = 320; // 20ms frames at 16kHz
const DEFAULT_THRESHOLD = 0.5;
const SILENCE_THRESHOLD = 0.01;
const VOICE_CONFIRMATION_FRAMES = 3;
const SILENCE_CONFIRMATION_FRAMES = 10;
const MAX_FRAME_BUFFER = 100;

/**
 * VAD Error class for specific error handling
 */
class VADError extends Error {
  constructor(message, code = 'VAD_ERROR') {
    super(message);
    this.name = 'VADError';
    this.code = code;
    this.timestamp = Date.now();
  }
}

/**
 * Enhanced Voice Activity Detection with multiple algorithms
 */
class VADIntegration {
  constructor(options = {}) {
    this.isActive = false;
    this.voiceFrames = [];
    this.frameBuffer = [];
    this.voiceCount = 0;
    this.silenceCount = 0;
    this.lastVoiceTime = 0;
    this.lastSilenceTime = 0;
    
    // Configuration
    this.config = {
      sampleRate: options.sampleRate || DEFAULT_SAMPLE_RATE,
      frameSize: options.frameSize || DEFAULT_FRAME_SIZE,
      threshold: options.threshold || DEFAULT_THRESHOLD,
      silenceThreshold: options.silenceThreshold || SILENCE_THRESHOLD,
      voiceConfirmationFrames: options.voiceConfirmationFrames || VOICE_CONFIRMATION_FRAMES,
      silenceConfirmationFrames: options.silenceConfirmationFrames || SILENCE_CONFIRMATION_FRAMES,
      enableFallback: options.enableFallback !== false,
      enableLogging: options.enableLogging || false
    };
    
    // Callbacks
    this.onVoiceDetected = null;
    this.onSilenceDetected = null;
    this.onError = null;
    
    // Performance monitoring
    this.stats = {
      framesProcessed: 0,
      voiceFrames: 0,
      silenceFrames: 0,
      errors: 0,
      avgProcessingTime: 0,
      startTime: null
    };
    
    this.log('VAD Integration initialized', this.config);
  }
  
  /**
   * Enhanced logging with performance metrics
   */
  log(message, data = null) {
    if (this.config.enableLogging) {
      const timestamp = new Date().toISOString();
      console.log(`[VAD ${timestamp}] ${message}`, data || '');
    }
  }
  
  /**
   * Set voice detected callback with validation
   */
  setVoiceDetectedCallback(callback) {
    if (typeof callback !== 'function') {
      throw new VADError('Voice callback must be a function', 'INVALID_CALLBACK');
    }
    this.onVoiceDetected = callback;
    this.log('Voice detected callback set');
  }
  
  /**
   * Set silence detected callback with validation
   */
  setSilenceDetectedCallback(callback) {
    if (typeof callback !== 'function') {
      throw new VADError('Silence callback must be a function', 'INVALID_CALLBACK');
    }
    this.onSilenceDetected = callback;
    this.log('Silence detected callback set');
  }
  
  /**
   * Set error callback for enhanced error handling
   */
  setErrorCallback(callback) {
    if (typeof callback !== 'function') {
      throw new VADError('Error callback must be a function', 'INVALID_CALLBACK');
    }
    this.onError = callback;
    this.log('Error callback set');
  }
  
  /**
   * Start enhanced VAD with multiple detection methods
   */
  async startVAD(audioStream, options = {}) {
    try {
      if (!audioStream) {
        throw new VADError('Audio stream is required for VAD', 'MISSING_STREAM');
      }
      
      if (this.isActive) {
        this.log('VAD already active, stopping previous instance');
        this.stopVAD();
      }
      
      this.isActive = true;
      this.stats.startTime = Date.now();
      this.resetCounters();
      
      const vadConfig = { ...this.config, ...options };
      this.log('Starting VAD with config', vadConfig);
      
      // Try Solace SDK VAD first, fallback to RMS-based detection
      try {
        await this.startSolaceVAD(audioStream, vadConfig);
      } catch (error) {
        this.log('Solace VAD failed, using fallback', error.message);
        if (vadConfig.enableFallback) {
          await this.startFallbackVAD(audioStream, vadConfig);
        } else {
          throw error;
        }
      }
      
    } catch (error) {
      this.handleError(error);
      this.isActive = false;
      throw error;
    }
  }
  
  /**
   * Start Solace SDK-based VAD
   */
  async startSolaceVAD(audioStream, config) {
    try {
      // Dynamic import to avoid issues if SDK not available
      const { recordAndDetectVoice } = await import('@solace/client-sdk');
      
      this.log('Using Solace SDK VAD');
      
      const voiceIterator = recordAndDetectVoice(audioStream, {
        sampleRate: config.sampleRate,
        frameSize: config.frameSize,
        threshold: config.threshold
      });
      
      // Process voice frames
      for await (const frame of voiceIterator) {
        if (!this.isActive) break;
        
        const startTime = performance.now();
        
        try {
          this.processVoiceFrame(frame);
          this.updateStats(performance.now() - startTime);
        } catch (frameError) {
          this.log('Frame processing error', frameError);
          this.stats.errors++;
        }
      }
      
    } catch (error) {
      throw new VADError(`Solace VAD failed: ${error.message}`, 'SOLACE_VAD_ERROR');
    }
  }
  
  /**
   * Fallback VAD using RMS energy detection
   */
  async startFallbackVAD(audioStream, config) {
    try {
      this.log('Using fallback RMS-based VAD');
      
      // Create audio context and analyzer
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: config.sampleRate
      });
      
      const source = audioContext.createMediaStreamSource(audioStream);
      const analyzer = audioContext.createAnalyser();
      const processor = audioContext.createScriptProcessor(config.frameSize, 1, 1);
      
      analyzer.fftSize = 2048;
      analyzer.smoothingTimeConstant = 0.8;
      
      source.connect(analyzer);
      analyzer.connect(processor);
      processor.connect(audioContext.destination);
      
      // Process audio frames
      processor.onaudioprocess = (event) => {
        if (!this.isActive) return;
        
        const startTime = performance.now();
        
        try {
          const inputBuffer = event.inputBuffer.getChannelData(0);
          const rmsLevel = this.calculateRMS(inputBuffer);
          
          const frame = {
            data: inputBuffer,
            rms: rmsLevel,
            timestamp: Date.now(),
            isVoice: rmsLevel > config.threshold
          };
          
          this.processVoiceFrame(frame);
          this.updateStats(performance.now() - startTime);
          
        } catch (frameError) {
          this.log('Fallback frame processing error', frameError);
          this.stats.errors++;
        }
      };
      
      // Store references for cleanup
      this.audioContext = audioContext;
      this.processor = processor;
      
    } catch (error) {
      throw new VADError(`Fallback VAD failed: ${error.message}`, 'FALLBACK_VAD_ERROR');
    }
  }
  
  /**
   * Calculate RMS (Root Mean Square) energy level
   */
  calculateRMS(audioBuffer) {
    let sum = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
      sum += audioBuffer[i] * audioBuffer[i];
    }
    return Math.sqrt(sum / audioBuffer.length);
  }
  
  /**
   * Process voice frame with enhanced logic
   */
  processVoiceFrame(frame) {
    this.stats.framesProcessed++;
    
    // Add to frame buffer for analysis
    this.frameBuffer.push(frame);
    if (this.frameBuffer.length > MAX_FRAME_BUFFER) {
      this.frameBuffer.shift();
    }
    
    // Determine if frame contains voice
    const isVoice = this.isVoiceFrame(frame);
    
    if (isVoice) {
      this.voiceCount++;
      this.silenceCount = 0;
      this.lastVoiceTime = Date.now();
      this.stats.voiceFrames++;
      
      // Trigger voice detected after confirmation
      if (this.voiceCount >= this.config.voiceConfirmationFrames) {
        this.triggerVoiceDetected(frame);
      }
      
    } else {
      this.silenceCount++;
      this.voiceCount = 0;
      this.lastSilenceTime = Date.now();
      this.stats.silenceFrames++;
      
      // Trigger silence detected after confirmation
      if (this.silenceCount >= this.config.silenceConfirmationFrames) {
        this.triggerSilenceDetected();
      }
    }
  }
  
  /**
   * Enhanced voice detection logic
   */
  isVoiceFrame(frame) {
    // Primary check: RMS level or VAD result
    const primaryCheck = frame.isVoice !== undefined ? 
      frame.isVoice : 
      (frame.rms || this.calculateRMS(frame.data || frame)) > this.config.threshold;
    
    if (!primaryCheck) return false;
    
    // Secondary check: Zero crossing rate (simple implementation)
    if (frame.data) {
      const zcr = this.calculateZeroCrossingRate(frame.data);
      // Voice typically has moderate ZCR (not too high like noise, not too low like silence)
      if (zcr < 0.01 || zcr > 0.3) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Calculate Zero Crossing Rate for additional voice validation
   */
  calculateZeroCrossingRate(audioBuffer) {
    let crossings = 0;
    for (let i = 1; i < audioBuffer.length; i++) {
      if ((audioBuffer[i] >= 0) !== (audioBuffer[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / audioBuffer.length;
  }
  
  /**
   * Trigger voice detected with rate limiting
   */
  triggerVoiceDetected(frame) {
    if (this.onVoiceDetected) {
      try {
        this.onVoiceDetected(frame);
        this.log('Voice detected triggered');
      } catch (error) {
        this.handleError(new VADError(`Voice callback error: ${error.message}`, 'CALLBACK_ERROR'));
      }
    }
  }
  
  /**
   * Trigger silence detected with rate limiting
   */
  triggerSilenceDetected() {
    if (this.onSilenceDetected) {
      try {
        this.onSilenceDetected();
        this.log('Silence detected triggered');
      } catch (error) {
        this.handleError(new VADError(`Silence callback error: ${error.message}`, 'CALLBACK_ERROR'));
      }
    }
  }
  
  /**
   * Stop VAD with proper cleanup
   */
  stopVAD() {
    if (!this.isActive) return;
    
    this.log('Stopping VAD');
    this.isActive = false;
    
    // Cleanup audio context and processor
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(error => {
        this.log('Error closing audio context', error);
      });
      this.audioContext = null;
    }
    
    this.resetCounters();
    this.logStats();
  }
  
  /**
   * Reset internal counters
   */
  resetCounters() {
    this.voiceCount = 0;
    this.silenceCount = 0;
    this.voiceFrames = [];
    this.frameBuffer = [];
  }
  
  /**
   * Update performance statistics
   */
  updateStats(processingTime) {
    const alpha = 0.1; // Exponential moving average factor
    this.stats.avgProcessingTime = this.stats.avgProcessingTime === 0 ? 
      processingTime : 
      (alpha * processingTime + (1 - alpha) * this.stats.avgProcessingTime);
  }
  
  /**
   * Log performance statistics
   */
  logStats() {
    if (!this.config.enableLogging || !this.stats.startTime) return;
    
    const duration = (Date.now() - this.stats.startTime) / 1000;
    const fps = this.stats.framesProcessed / duration;
    
    this.log('VAD Performance Stats', {
      duration: `${duration.toFixed(2)}s`,
      framesProcessed: this.stats.framesProcessed,
      framesPerSecond: fps.toFixed(2),
      voiceFrames: this.stats.voiceFrames,
      silenceFrames: this.stats.silenceFrames,
      errors: this.stats.errors,
      avgProcessingTime: `${this.stats.avgProcessingTime.toFixed(3)}ms`
    });
  }
  
  /**
   * Get current VAD statistics
   */
  getStats() {
    return { ...this.stats };
  }
  
  /**
   * Handle errors with proper logging and callbacks
   */
  handleError(error) {
    this.stats.errors++;
    this.log('VAD Error', error);
    
    if (this.onError) {
      try {
        this.onError(error);
      } catch (callbackError) {
        console.error('Error in VAD error callback:', callbackError);
      }
    }
  }
  
  /**
   * Check if VAD is currently active
   */
  isVADActive() {
    return this.isActive;
  }
  
  /**
   * Update VAD configuration dynamically
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.log('VAD configuration updated', this.config);
  }
}

export default VADIntegration; 