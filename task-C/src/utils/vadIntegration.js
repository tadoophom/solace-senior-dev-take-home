/**
 * Voice Activity Detection integration using @solace/client-sdk
 */

import { recordAndDetectVoice } from '@solace/client-sdk';

class VADIntegration {
  constructor() {
    this.isActive = false;
    this.voiceFrames = [];
    this.onVoiceDetected = null;
    this.onSilenceDetected = null;
  }

  /**
   * Start voice activity detection
   */
  async startVAD(audioStream, options = {}) {
    if (!audioStream) {
      throw new Error('Audio stream is required for VAD');
    }

    this.isActive = true;
    this.voiceFrames = [];

    const vadOptions = {
      sampleRate: 16000,
      frameSize: 320, // 20ms frames at 16kHz
      threshold: options.threshold || 0.5,
      ...options
    };

    try {
      // Use the recordAndDetectVoice function from @solace/client-sdk
      const voiceIterator = recordAndDetectVoice(audioStream, vadOptions);
      
      for await (const frame of voiceIterator) {
        if (!this.isActive) break;
        
        // Process voice frame
        this.voiceFrames.push(frame);
        
        // Trigger voice detected callback
        if (this.onVoiceDetected) {
          this.onVoiceDetected(frame);
        }
        
        // Check for silence periods
        if (this.isSilencePeriod(frame)) {
          if (this.onSilenceDetected) {
            this.onSilenceDetected();
          }
        }
      }
    } catch (error) {
      console.error('VAD error:', error);
      throw new Error(`Voice Activity Detection failed: ${error.message}`);
    }
  }

  /**
   * Stop voice activity detection
   */
  stopVAD() {
    this.isActive = false;
    return this.voiceFrames;
  }

  /**
   * Check if current frame indicates silence
   */
  isSilencePeriod(frame) {
    // Simple silence detection based on frame energy
    const energy = this.calculateFrameEnergy(frame.frame);
    return energy < 0.01; // Threshold for silence
  }

  /**
   * Calculate energy of audio frame
   */
  calculateFrameEnergy(audioBuffer) {
    if (!audioBuffer || audioBuffer.byteLength === 0) return 0;
    
    const samples = new Float32Array(audioBuffer);
    let energy = 0;
    
    for (let i = 0; i < samples.length; i++) {
      energy += samples[i] * samples[i];
    }
    
    return energy / samples.length;
  }

  /**
   * Set callback for voice detection
   */
  setVoiceDetectedCallback(callback) {
    this.onVoiceDetected = callback;
  }

  /**
   * Set callback for silence detection
   */
  setSilenceDetectedCallback(callback) {
    this.onSilenceDetected = callback;
  }

  /**
   * Get accumulated voice frames
   */
  getVoiceFrames() {
    return this.voiceFrames;
  }

  /**
   * Clear accumulated frames
   */
  clearFrames() {
    this.voiceFrames = [];
  }

  /**
   * Check if VAD is active
   */
  isVADActive() {
    return this.isActive;
  }
}

export default VADIntegration; 