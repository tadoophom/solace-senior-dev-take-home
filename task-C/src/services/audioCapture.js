/**
 * Audio capture service using Web Audio API
 */

class AudioCaptureService {
  constructor() {
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.audioChunks = [];
    this.isRecording = false;
  }

  /**
   * Initialize audio capture with microphone permissions
   */
  async initialize() {
    try {
      // Request microphone permission
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // Optimal for speech recognition
        }
      });

      // Create audio context for processing
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize audio capture:', error);
      throw new Error('Microphone access denied or unavailable');
    }
  }

  /**
   * Start recording audio
   */
  async startRecording() {
    if (!this.mediaStream) {
      await this.initialize();
    }

    this.audioChunks = [];

    try {
      // Check MediaRecorder support
      if (!window.MediaRecorder) {
        throw new Error('MediaRecorder not supported in this browser');
      }

      // Create MediaRecorder for audio capture
      const options = { mimeType: 'audio/webm;codecs=opus' };
      
      // Fallback to other formats if webm/opus not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          options.mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          options.mimeType = 'audio/mp4';
        } else {
          options.mimeType = 'audio/wav';
        }
      }

      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstart = () => {
        console.log('MediaRecorder started');
        this.isRecording = true;
      };

      this.mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped');
        // Don't set isRecording to false here - let stopRecording() handle it
      };

      this.mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error);
        this.isRecording = false;
      };

      // Start recording
      this.mediaRecorder.start(100); // Collect data every 100ms
      
      // Wait for the recording to actually start
      return new Promise((resolve, reject) => {
        let timeoutId;
        
        const checkStart = () => {
          if (!this.mediaRecorder) {
            reject(new Error('MediaRecorder was destroyed'));
            return;
          }
          
          if (this.mediaRecorder.state === 'recording') {
            if (timeoutId) clearTimeout(timeoutId);
            resolve(true);
          } else if (this.mediaRecorder.state === 'inactive') {
            if (timeoutId) clearTimeout(timeoutId);
            reject(new Error('MediaRecorder failed to start'));
          } else {
            setTimeout(checkStart, 50);
          }
        };
        
        // Start checking after a small delay
        setTimeout(checkStart, 100);
        
        // Timeout after 3 seconds
        timeoutId = setTimeout(() => {
          if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
            reject(new Error('MediaRecorder start timeout'));
          }
        }, 3000);
      });
      
    } catch (error) {
      this.isRecording = false;
      console.error('Failed to start MediaRecorder:', error);
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }

  /**
   * Stop recording and return audio blob
   */
  async stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder not initialized'));
        return;
      }

      // If already stopped, return existing chunks
      if (this.mediaRecorder.state === 'inactive') {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.isRecording = false;
        // Reset MediaRecorder after use
        setTimeout(() => this.resetMediaRecorder(), 100);
        resolve(audioBlob);
        return;
      }

      // If paused, resume and then stop
      if (this.mediaRecorder.state === 'paused') {
        this.mediaRecorder.resume();
      }

      // Only proceed if recording or paused
      if (this.mediaRecorder.state === 'recording') {
        // Set up the stop handler before stopping
        const originalOnStop = this.mediaRecorder.onstop;
        this.mediaRecorder.onstop = (event) => {
          // Call original handler if it exists
          if (originalOnStop) {
            originalOnStop.call(this.mediaRecorder, event);
          }
          
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          this.isRecording = false;
          
          // Reset MediaRecorder after use
          setTimeout(() => this.resetMediaRecorder(), 100);
          
          resolve(audioBlob);
        };

        this.mediaRecorder.onerror = (error) => {
          this.isRecording = false;
          setTimeout(() => this.resetMediaRecorder(), 100);
          reject(error);
        };

        try {
          this.mediaRecorder.stop();
        } catch (error) {
          this.isRecording = false;
          setTimeout(() => this.resetMediaRecorder(), 100);
          reject(new Error(`Failed to stop recording: ${error.message}`));
        }
      } else {
        reject(new Error(`Cannot stop recording in state: ${this.mediaRecorder.state}`));
      }
    });
  }

  /**
   * Get audio stream for real-time processing
   */
  getAudioStream() {
    return this.mediaStream;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
      // Don't set mediaRecorder to null immediately - let it finish stopping
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioChunks = [];
    this.isRecording = false;
  }

  /**
   * Reset the MediaRecorder after use
   */
  resetMediaRecorder() {
    this.mediaRecorder = null;
  }

  /**
   * Check if recording is active
   */
  getIsRecording() {
    return this.isRecording && this.mediaRecorder && this.mediaRecorder.state === 'recording';
  }
}

export default AudioCaptureService; 