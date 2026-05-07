import {
  startCapture,
  startPlayback,
  listDevices,
  type CaptureHandle,
  type PlaybackHandle,
} from './webAudioBridge';

declare global {
  interface Window {
    /** Public API the main process calls via webContents.executeJavaScript. */
    offscreen: {
      listDevices(): Promise<{ deviceId: string; label: string; kind: string }[]>;
      startCapture(micDeviceId: string): Promise<void>;
      startPlayback(outDeviceId: string): Promise<void>;
      pushPlayback(base64: string): void;
      stopAll(): void;
    };
    /**
     * IPC bridge installed by the offscreen preload (Task 14).
     * onPushPlayback receives base64 PCM16 from main; sendPcm forwards captured chunks to main.
     */
    offscreenBridge?: {
      onPushPlayback(handler: (base64: string) => void): void;
      sendPcm(base64: string): void;
    };
  }
}

let capture: CaptureHandle | undefined;
let playback: PlaybackHandle | undefined;

window.offscreen = {
  async listDevices() {
    const devs = await listDevices();
    return devs.map((d) => ({ deviceId: d.deviceId, label: d.label, kind: d.kind }));
  },
  async startCapture(micDeviceId) {
    capture?.stop();
    capture = await startCapture(micDeviceId, (b64) => {
      window.offscreenBridge?.sendPcm(b64);
    });
  },
  async startPlayback(outDeviceId) {
    playback?.stop();
    playback = await startPlayback(outDeviceId);
  },
  pushPlayback(base64) {
    playback?.push(base64);
  },
  stopAll() {
    capture?.stop();
    playback?.stop();
    capture = undefined;
    playback = undefined;
  },
};

// Wire incoming-from-main playback chunks to the playback handle.
window.offscreenBridge?.onPushPlayback((base64) => {
  window.offscreen.pushPlayback(base64);
});
