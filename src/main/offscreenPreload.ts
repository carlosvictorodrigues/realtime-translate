import { contextBridge, ipcRenderer } from 'electron';

const bridge = {
  onPushPlayback: (handler: (base64: string) => void): void => {
    ipcRenderer.on('offscreen:pushPlayback', (_e, base64: string) => handler(base64));
  },
  sendPcm: (base64: string): void => {
    ipcRenderer.send('offscreen:pcm', base64);
  },
};

declare global {
  interface Window {
    offscreenBridge: typeof bridge;
  }
}

contextBridge.exposeInMainWorld('offscreenBridge', bridge);
