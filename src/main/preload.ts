import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/events';
import type { DeviceInventory, SessionState, StartTranslationArgs } from '../shared/types';

const api = {
  getApiKey: (): Promise<string | undefined> => ipcRenderer.invoke(IPC.GetApiKey),
  setApiKey: (value: string): Promise<void> => ipcRenderer.invoke(IPC.SetApiKey, { value }),
  clearApiKey: (): Promise<void> => ipcRenderer.invoke(IPC.ClearApiKey),
  listDevices: (): Promise<DeviceInventory> => ipcRenderer.invoke(IPC.ListDevices),
  startTranslation: (args: StartTranslationArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.StartTranslation, args),
  stopTranslation: (): Promise<void> => ipcRenderer.invoke(IPC.StopTranslation),

  onSessionState: (cb: (s: SessionState) => void): (() => void) => {
    const handler = (_evt: unknown, s: SessionState): void => cb(s);
    ipcRenderer.on(IPC.SessionStateChanged, handler);
    return () => {
      ipcRenderer.off(IPC.SessionStateChanged, handler);
    };
  },
  onTranscript: (cb: (t: { kind: 'input' | 'output'; text: string }) => void): (() => void) => {
    const handler = (_evt: unknown, t: { kind: 'input' | 'output'; text: string }): void => cb(t);
    ipcRenderer.on(IPC.TranscriptDelta, handler);
    return () => {
      ipcRenderer.off(IPC.TranscriptDelta, handler);
    };
  },
};

declare global {
  interface Window {
    rt: typeof api;
  }
}

contextBridge.exposeInMainWorld('rt', api);

export type RtApi = typeof api;
