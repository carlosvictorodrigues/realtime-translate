// @ts-check
// AudioWorklet that emits Float32 frames as messages.
// Resampling to 24kHz is handled by AudioContext sampleRate config.
//
// IMPORTANT: This file is .js (not .ts) because Vite's worklet bundling
// produces a data: URL with raw TypeScript source unless the file is
// already JS. AudioWorklet.addModule cannot evaluate TypeScript.
// Type-checked via @ts-check + JSDoc.

/**
 * @typedef {{ port: MessagePort }} AudioWorkletProcessorInstance
 * @typedef {new () => AudioWorkletProcessorInstance} AudioWorkletProcessorCtor
 */

class PcmEncoderProcessor extends AudioWorkletProcessor {
  /**
   * @param {Float32Array[][]} inputs
   * @returns {boolean}
   */
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;
    // Copy because the buffer is reused.
    const copy = new Float32Array(channel.length);
    copy.set(channel);
    this.port.postMessage(copy, [copy.buffer]);
    return true;
  }
}

registerProcessor('pcm-encoder', PcmEncoderProcessor);
