// AudioWorklet that emits Float32 frames as messages.
// Resampling to 24kHz is handled by AudioContext sampleRate config.

declare const AudioWorkletProcessor: { new (): { port: MessagePort } };
declare function registerProcessor(name: string, processorCtor: unknown): void;

class PcmEncoderProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
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
