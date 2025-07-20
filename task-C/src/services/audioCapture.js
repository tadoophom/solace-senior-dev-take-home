/**
 * Optimized audio capture service using Web Audio API
 * Enhanced with connection pooling, memory optimization, and performance monitoring
 */

class AudioCaptureService {
  constructor() {
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.audioChunks = [];
    this.isRecording = false;
    this._isInitialized = false;
    
    // Performance optimization: reuse objects
    this.reusableConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000, // Optimal for speech recognition
        channelCount: 1,   // Mono for efficiency
        autoGainControl: true
      }
    };
    
    // Connection pooling for audio context
    this.sharedAudioContext = null;
    this.contextRefCount = 0;
    
    // Performance monitoring
    this.stats = {
      initTime: 0,
      recordingTime: 0,
      chunksProcessed: 0,
      totalDataSize: 0
    };
  }

  /**
   * Check if service is properly initialized
   */
  isInitialized() {
    return this._isInitialized && this.mediaStream && this.mediaStream.active;
  }

  /**
   * Optimized initialization with connection pooling
   */
  async initialize() {
    if (this._isInitialized && this.mediaStream && this.mediaStream.active) {
      return true;
    }

    const startTime = performance.now();
    
    try {
      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported');
      }

      if (!window.MediaRecorder) {
        throw new Error('MediaRecorder API not supported');
      }
      
      // Request microphone permission with optimized constraints
      this.mediaStream = await navigator.mediaDevices.getUserMedia(this.reusableConstraints);

      // Use shared audio context for better performance
      this.audioContext = this.getSharedAudioContext();
      
      this._isInitialized = true;
      this.stats.initTime = performance.now() - startTime;
      return true;
    } catch (error) {
      console.error('Failed to initialize audio capture:', error);
      this._isInitialized = false;
      throw new Error(`Microphone initialization failed: ${error.message}`);
    }
  }

  /**
   * Get or create shared audio context for better resource utilization
   */
  getSharedAudioContext() {
    if (!this.sharedAudioContext || this.sharedAudioContext.state === 'closed') {
      this.sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
        latencyHint: 'interactive' // Optimize for low latency
      });
    }
    
    this.contextRefCount++;
    return this.sharedAudioContext;
  }

  /**
   * Optimized recording start with efficient MediaRecorder setup
   */
  async startRecording() {
    try {
      // Ensure proper initialization
      if (!this.isInitialized()) {
        await this.initialize();
      }

      // Double-check we have a valid stream
      if (!this.mediaStream || !this.mediaStream.active) {
        throw new Error('Media stream not available');
      }

      // Pre-allocate array with estimated size for better performance
      this.audioChunks = [];
      this.audioChunks.length = 0; // Ensure clean start
      
      const recordingStartTime = performance.now();

      // Optimize MediaRecorder options for performance
      const options = this.getOptimalRecorderOptions();
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

      // Optimized event handlers with minimal allocations
      this.mediaRecorder.ondataavailable = this.handleDataAvailable.bind(this);
      this.mediaRecorder.onstart = () => {
        this.isRecording = true;
        this.stats.recordingTime = performance.now() - recordingStartTime;
      };
      this.mediaRecorder.onstop = () => {
        // Handled in stopRecording promise
      };
      this.mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error);
        this.isRecording = false;
      };

      // Start recording with optimized timeslice
      this.mediaRecorder.start(50); // 50ms chunks for responsive UI
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.isRecording = false;
      throw new Error(`Recording failed: ${error.message}`);
    }
  }

  /**
   * Optimized data handler to minimize allocations
   */
  handleDataAvailable(event) {
    if (event.data.size > 0) {
      this.audioChunks.push(event.data);
      this.stats.chunksProcessed++;
      this.stats.totalDataSize += event.data.size;
    }
  }

  /**
   * Get optimal MediaRecorder options based on browser support
   */
  getOptimalRecorderOptions() {
    // Priority order for best performance/compatibility
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/wav'
    ];
    
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return { 
          mimeType,
          audioBitsPerSecond: 128000 // Optimize for speech
        };
      }
    }
    
    return {}; // Fallback to default
  }

  /**
   * Get audio stream for external processors (VAD, etc.)
   */
  getAudioStream() {
    return this.mediaStream;
  }

  /**
   * Check if currently recording
   */
  isCurrentlyRecording() {
    return this.isRecording && this.mediaRecorder && this.mediaRecorder.state === 'recording';
  }

  /**
   * Optimized stop recording with efficient blob creation
   */
  async stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        console.warn('MediaRecorder not initialized, returning empty blob');
        const emptyBlob = new Blob([], { type: 'audio/webm' });
        this.isRecording = false;
        resolve(emptyBlob);
        return;
      }

      // If already stopped, return existing chunks efficiently
      if (this.mediaRecorder.state === 'inactive') {
        const audioBlob = this.createOptimizedBlob();
        this.isRecording = false;
        this.scheduleCleanup();
        resolve(audioBlob);
        return;
      }

      // If paused, resume and then stop
      if (this.mediaRecorder.state === 'paused') {
        this.mediaRecorder.resume();
      }

      // Only proceed if recording or paused
      if (this.mediaRecorder.state === 'recording') {
        // Set up optimized stop handler
        const originalOnStop = this.mediaRecorder.onstop;
        this.mediaRecorder.onstop = (event) => {
          // Call original handler if it exists
          if (originalOnStop) {
            originalOnStop.call(this.mediaRecorder, event);
          }
          
          const audioBlob = this.createOptimizedBlob();
          this.isRecording = false;
          this.scheduleCleanup();
          resolve(audioBlob);
        };

        this.mediaRecorder.onerror = (error) => {
          this.isRecording = false;
          this.scheduleCleanup();
          reject(error);
        };

        try {
          this.mediaRecorder.stop();
        } catch (error) {
          this.isRecording = false;
          this.scheduleCleanup();
          reject(new Error(`Failed to stop recording: ${error.message}`));
        }
      } else {
        console.warn(`Cannot stop recording in state: ${this.mediaRecorder.state}`);
        const audioBlob = this.createOptimizedBlob();
        this.isRecording = false;
        this.scheduleCleanup();
        resolve(audioBlob);
      }
    });
  }

  /**
   * Create optimized blob with efficient type detection
   */
  createOptimizedBlob() {
    if (this.audioChunks.length === 0) {
      return new Blob([], { type: 'audio/webm' });
    }
    
    // Use the MediaRecorder's mime type for consistency
    const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
    return new Blob(this.audioChunks, { type: mimeType });
  }

  /**
   * Schedule cleanup to avoid blocking the main thread
   */
  scheduleCleanup() {
    // Use setTimeout to avoid blocking the main thread
    setTimeout(() => this.resetMediaRecorder(), 10);
  }

  /**
   * Reset MediaRecorder for reuse
   */
  resetMediaRecorder() {
    if (this.mediaRecorder) {
      // Remove event listeners to prevent memory leaks
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstart = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.onerror = null;
      this.mediaRecorder = null;
    }
    
    // Clear chunks array efficiently
    this.audioChunks.length = 0;
  }

  /**
   * Optimized cleanup with reference counting
   */
  cleanup() {
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
      this.resetMediaRecorder();
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Use reference counting for shared audio context
    this.contextRefCount--;
    if (this.contextRefCount <= 0 && this.sharedAudioContext) {
      this.sharedAudioContext.close();
      this.sharedAudioContext = null;
      this.contextRefCount = 0;
    }

    this.audioChunks.length = 0;
    this.isRecording = false;
    this._isInitialized = false; // Reset initialization state
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      ...this.stats,
      averageChunkSize: this.stats.chunksProcessed > 0 ? 
        this.stats.totalDataSize / this.stats.chunksProcessed : 0
    };
  }
}

export default AudioCaptureService; 