// AudioWorklet processor for VAD
class VADProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameLength = 0;
    this.rmsThreshold = 0.015;
    this.buf = null;
    this.bufOffset = 0;
    
    // Listen for parameters from main thread
    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'init') {
        this.frameLength = data.frameLength;
        this.rmsThreshold = data.rmsThreshold;
        this.buf = new Float32Array(this.frameLength);
        this.bufOffset = 0;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0] || !this.buf) return true;

    const inputData = input[0];
    let i = 0;
    
    while (i < inputData.length) {
      const remain = this.frameLength - this.bufOffset;
      const toCopy = Math.min(remain, inputData.length - i);
      
      this.buf.set(inputData.subarray(i, i + toCopy), this.bufOffset);
      this.bufOffset += toCopy;
      i += toCopy;

      if (this.bufOffset === this.frameLength) {
        const rms = Math.sqrt(this.buf.reduce((sum, s) => sum + s * s, 0) / this.buf.length);
        if (rms > this.rmsThreshold) {
          // Send frame to main thread
          const frameCopy = new Float32Array(this.buf).buffer;
          this.port.postMessage({
            type: 'frame',
            data: { frame: frameCopy, timestamp: Date.now() }
          });
        }
        this.bufOffset = 0;
      }
    }

    return true;
  }
}

registerProcessor('vad-processor', VADProcessor); 