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
  const ctx = new AudioContext({ sampleRate: 24000 });
  await ctx.audioWorklet.addModule(new URL('./workers/pcmEncoder.worklet.ts', import.meta.url));
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
      void ctx.close();
    },
  };
}

export async function startPlayback(outputDeviceId: string): Promise<PlaybackHandle> {
  const ctx = new AudioContext({ sampleRate: 24000 });
  // Cast: setSinkId is part of the spec but TS lib may not have it on AudioContext yet.
  const ctxAny = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (typeof ctxAny.setSinkId === 'function') {
    await ctxAny.setSinkId(outputDeviceId);
  } else {
    throw new Error('AudioContext.setSinkId is not supported in this Electron build');
  }

  return {
    push(base64Pcm16: string): void {
      const samples = pcm16Base64ToFloat32(base64Pcm16);
      if (samples.length === 0) return;
      const buffer = ctx.createBuffer(1, samples.length, 24000);
      // Cast: lib.dom's copyToChannel expects Float32Array<ArrayBuffer> but
      // pcm16Base64ToFloat32 returns Float32Array<ArrayBufferLike>. Runtime is fine.
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start();
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
