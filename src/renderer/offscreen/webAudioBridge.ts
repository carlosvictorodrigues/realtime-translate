import { float32ToPcm16Base64, pcm16Base64ToFloat32 } from '@shared/util/pcmCodec';

export interface CaptureHandle {
  stop(): void;
}

export interface PlaybackHandle {
  push(base64Pcm16: string): void;
  stop(): void;
}

export async function startCapture(
  micDeviceId: string,
  onPcmChunk: (base64: string) => void,
): Promise<CaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: micDeviceId },
      sampleRate: { ideal: 24000 },
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  let ctx: AudioContext | undefined;
  try {
    ctx = new AudioContext({ sampleRate: 24000 });
    if (ctx.sampleRate !== 24000) {
      throw new Error(`AudioContext sampleRate=${ctx.sampleRate}, expected 24000`);
    }
    // Vite's ?url import produces a real asset URL pointing to a built JS file.
    // Without ?url, Vite would inline the source (TypeScript) as a data: URI.
    const workletUrl = (await import('./workers/pcmEncoder.worklet.js?url')).default;
    await ctx.audioWorklet.addModule(workletUrl);
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'pcm-encoder');
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      onPcmChunk(float32ToPcm16Base64(e.data));
    };
    source.connect(node);
    return {
      stop() {
        stream.getTracks().forEach((t) => t.stop());
        node.disconnect();
        void ctx!.close();
      },
    };
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    if (ctx) void ctx.close();
    throw err;
  }
}

export async function startPlayback(outputDeviceId: string): Promise<PlaybackHandle> {
  const ctx = new AudioContext({ sampleRate: 24000 });
  // Defense-in-depth: AudioContext sampleRate is requested but not always honored.
  if (ctx.sampleRate !== 24000) {
    throw new Error(`AudioContext sampleRate=${ctx.sampleRate}, expected 24000`);
  }
  const ctxAny = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (typeof ctxAny.setSinkId === 'function') {
    await ctxAny.setSinkId(outputDeviceId);
  } else {
    throw new Error('AudioContext.setSinkId is not supported in this Electron build');
  }

  // Write head: tracks where the next chunk should start so consecutive chunks
  // play sequentially instead of overlapping. Reset when ctx.currentTime catches up
  // (e.g., after a silence gap).
  let writeHead = 0;

  return {
    push(base64Pcm16: string): void {
      if (ctx.state === 'closed') return;
      const samples = pcm16Base64ToFloat32(base64Pcm16);
      if (samples.length === 0) return;
      const buffer = ctx.createBuffer(1, samples.length, 24000);
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime, writeHead);
      src.start(startAt);
      writeHead = startAt + samples.length / 24000;
    },
    stop(): void {
      void ctx.close();
    },
  };
}

export async function listDevices(): Promise<MediaDeviceInfo[]> {
  // Enumerate requires permission to expose labels — request once.
  await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => undefined);
  return navigator.mediaDevices.enumerateDevices();
}
