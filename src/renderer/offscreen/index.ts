import {
  startCapture,
  startPlayback,
  listDevices,
  type CaptureHandle,
  type PlaybackHandle,
} from './webAudioBridge';

declare global {
  interface Window {
    offscreen: {
      listDevices(): Promise<{ deviceId: string; label: string; kind: string }[]>;
      startCapture(streamId: string, micDeviceId: string): Promise<void>;
      startPlayback(streamId: string, outDeviceId: string): Promise<void>;
      pushPlayback(streamId: string, base64: string): void;
      stopStream(streamId: string): void;
      stopAll(): void;
      runLoopback(
        deviceId: string,
        thresholdRms: number,
        timeoutMs: number,
      ): Promise<{ detected: boolean }>;
    };
    offscreenBridge?: {
      onPushPlayback(handler: (streamId: string, base64: string) => void): void;
      sendPcm(streamId: string, base64: string): void;
    };
  }
}

const captures = new Map<string, CaptureHandle>();
const playbacks = new Map<string, PlaybackHandle>();

window.offscreen = {
  async listDevices() {
    const devs = await listDevices();
    return devs.map((d) => ({ deviceId: d.deviceId, label: d.label, kind: d.kind }));
  },
  async startCapture(streamId, micDeviceId) {
    captures.get(streamId)?.stop();
    captures.set(
      streamId,
      await startCapture(micDeviceId, (b64) => {
        window.offscreenBridge?.sendPcm(streamId, b64);
      }),
    );
  },
  async startPlayback(streamId, outDeviceId) {
    playbacks.get(streamId)?.stop();
    playbacks.set(streamId, await startPlayback(outDeviceId));
  },
  pushPlayback(streamId, base64) {
    playbacks.get(streamId)?.push(base64);
  },
  stopStream(streamId) {
    captures.get(streamId)?.stop();
    playbacks.get(streamId)?.stop();
    captures.delete(streamId);
    playbacks.delete(streamId);
  },
  stopAll() {
    // Best-effort teardown — swallow per-handle errors so one stuck handle
    // doesn't leak the rest. App-shutdown path: defensive cleanup matters most here.
    for (const c of captures.values()) {
      try {
        c.stop();
      } catch {
        /* swallow */
      }
    }
    for (const p of playbacks.values()) {
      try {
        p.stop();
      } catch {
        /* swallow */
      }
    }
    captures.clear();
    playbacks.clear();
  },
  async runLoopback(deviceId, thresholdRms, timeoutMs) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        sampleRate: 24000,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const ctx = new AudioContext({ sampleRate: 24000 });
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const startedAt = Date.now();
    let detected = false;
    while (Date.now() - startedAt < timeoutMs) {
      analyser.getFloatTimeDomainData(buf);
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i] ?? 0; // noUncheckedIndexedAccess guard
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buf.length);
      if (rms > thresholdRms) {
        detected = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    return { detected };
  },
};

if (!window.offscreenBridge) {
  // eslint-disable-next-line no-console
  console.error(
    'OffscreenBridge not installed. Did the preload script run? Captured audio will not reach main process.',
  );
} else {
  window.offscreenBridge.onPushPlayback((streamId, base64) => {
    window.offscreen.pushPlayback(streamId, base64);
  });
}
