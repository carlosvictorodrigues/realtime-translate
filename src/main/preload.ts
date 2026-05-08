import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/events';
import type { IpcInvokeMap, IpcSendMap } from './ipc/channels';

const api = {
  getApiKey: (): Promise<IpcInvokeMap[typeof IPC.GetApiKey]['result']> =>
    ipcRenderer.invoke(IPC.GetApiKey),
  setApiKey: (
    value: IpcInvokeMap[typeof IPC.SetApiKey]['args']['value'],
  ): Promise<IpcInvokeMap[typeof IPC.SetApiKey]['result']> =>
    ipcRenderer.invoke(IPC.SetApiKey, { value }),
  clearApiKey: (): Promise<IpcInvokeMap[typeof IPC.ClearApiKey]['result']> =>
    ipcRenderer.invoke(IPC.ClearApiKey),
  listDevices: (): Promise<IpcInvokeMap[typeof IPC.ListDevices]['result']> =>
    ipcRenderer.invoke(IPC.ListDevices),
  startTranslation: (
    args: IpcInvokeMap[typeof IPC.StartTranslation]['args'],
  ): Promise<IpcInvokeMap[typeof IPC.StartTranslation]['result']> =>
    ipcRenderer.invoke(IPC.StartTranslation, args),
  stopTranslation: (): Promise<IpcInvokeMap[typeof IPC.StopTranslation]['result']> =>
    ipcRenderer.invoke(IPC.StopTranslation),

  onSessionState: (cb: (s: IpcSendMap[typeof IPC.SessionStateChanged]) => void): (() => void) => {
    const handler = (_evt: unknown, s: IpcSendMap[typeof IPC.SessionStateChanged]): void => cb(s);
    ipcRenderer.on(IPC.SessionStateChanged, handler);
    return (): void => {
      ipcRenderer.off(IPC.SessionStateChanged, handler);
    };
  },
  onTranscript: (cb: (t: IpcSendMap[typeof IPC.TranscriptDelta]) => void): (() => void) => {
    const handler = (_evt: unknown, t: IpcSendMap[typeof IPC.TranscriptDelta]): void => cb(t);
    ipcRenderer.on(IPC.TranscriptDelta, handler);
    return (): void => {
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
