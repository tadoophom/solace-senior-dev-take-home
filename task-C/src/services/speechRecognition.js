/**
 * Speech recognition service using OpenAI Whisper API
 */

class SpeechRecognitionService {
  constructor() {
    this.apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    this.baseUrl = 'https://api.openai.com/v1/audio/transcriptions';
  }

  /**
   * Convert audio blob to text using Whisper API
   */
  async transcribeAudio(audioBlob) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Convert webm to wav for better compatibility
      const audioFile = await this.convertToWav(audioBlob);
      
      // Prepare form data for API request
      const formData = new FormData();
      formData.append('file', audioFile, 'audio.wav');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en'); // English language
      formData.append('response_format', 'json');

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Whisper API error: ${error.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      return result.text.trim();

    } catch (error) {
      console.error('Speech recognition failed:', error);
      throw new Error(`Speech recognition failed: ${error.message}`);
    }
  }

  /**
   * Convert audio blob to WAV format
   */
  async convertToWav(audioBlob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target.result;
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Convert to WAV format
          const wavBlob = this.audioBufferToWav(audioBuffer);
          resolve(wavBlob);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = reject;
      reader.readAsArrayBuffer(audioBlob);
    });
  }

  /**
   * Convert AudioBuffer to WAV blob
   */
  audioBufferToWav(audioBuffer) {
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);
    const channels = audioBuffer.numberOfChannels;
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
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
    view.setUint32(40, length * 2, true);
    
    // Convert audio data
    const channelData = audioBuffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Check if service is properly configured
   */
  isConfigured() {
    return !!this.apiKey;
  }
}

export default SpeechRecognitionService; 