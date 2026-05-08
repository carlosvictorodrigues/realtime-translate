import { contextBridge, ipcRenderer } from 'electron';

const bridge = {
  onPushPlayback: (handler: (streamId: string, base64: string) => void): void => {
    ipcRenderer.on(
      'offscreen:pushPlayback',
      (_e, payload: { streamId: string; base64: string }) =>
        handler(payload.streamId, payload.base64),
    );
  },
  sendPcm: (streamId: string, base64: string): void => {
    ipcRenderer.send('offscreen:pcm', { streamId, base64 });
  },
};

declare global {
  interface Window {
    offscreenBridge: typeof bridge;
  }
}

contextBridge.exposeInMainWorld('offscreenBridge', bridge);
