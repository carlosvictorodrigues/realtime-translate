import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/events';
import type { IpcInvokeMap, IpcSendMap } from './ipc/channels';

const api = {
  hasApiKey: (): Promise<IpcInvokeMap[typeof IPC.GetApiKeyStatus]['result']> =>
    ipcRenderer.invoke(IPC.GetApiKeyStatus),
  getApiKeyHint: (): Promise<IpcInvokeMap[typeof IPC.GetApiKeyHint]['result']> =>
    ipcRenderer.invoke(IPC.GetApiKeyHint),
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

  loadPrefs: (): Promise<IpcInvokeMap[typeof IPC.PrefsLoad]['result']> =>
    ipcRenderer.invoke(IPC.PrefsLoad),
  saveWidgetPosition: (
    pos: IpcInvokeMap[typeof IPC.PrefsSetWidgetPosition]['args'],
  ): Promise<void> => ipcRenderer.invoke(IPC.PrefsSetWidgetPosition, pos),
  saveLanguages: (
    langs: IpcInvokeMap[typeof IPC.PrefsSetLanguages]['args'],
  ): Promise<void> => ipcRenderer.invoke(IPC.PrefsSetLanguages, langs),
  saveDevices: (
    devices: IpcInvokeMap[typeof IPC.PrefsSetDevices]['args'],
  ): Promise<void> => ipcRenderer.invoke(IPC.PrefsSetDevices, devices),
  saveUiLanguage: (
    locale: IpcInvokeMap[typeof IPC.PrefsSetUiLanguage]['args'],
  ): Promise<void> => ipcRenderer.invoke(IPC.PrefsSetUiLanguage, locale),

  openSetupView: (): Promise<IpcInvokeMap[typeof IPC.OpenSetupView]['result']> =>
    ipcRenderer.invoke(IPC.OpenSetupView),

  markSetupComplete: (): Promise<IpcInvokeMap[typeof IPC.SetupComplete]['result']> =>
    ipcRenderer.invoke(IPC.SetupComplete),

  showBarMenu: (): Promise<IpcInvokeMap[typeof IPC.ShowBarMenu]['result']> =>
    ipcRenderer.invoke(IPC.ShowBarMenu),

  quit: (): Promise<IpcInvokeMap[typeof IPC.AppQuit]['result']> =>
    ipcRenderer.invoke(IPC.AppQuit),

  resolveLocale: (): Promise<IpcInvokeMap[typeof IPC.ResolveLocale]['result']> =>
    ipcRenderer.invoke(IPC.ResolveLocale),

  onDirectionalState: (
    cb: (s: IpcSendMap[typeof IPC.DirectionalStateChanged]) => void,
  ): (() => void) => {
    const handler = (_evt: unknown, s: IpcSendMap[typeof IPC.DirectionalStateChanged]): void =>
      cb(s);
    ipcRenderer.on(IPC.DirectionalStateChanged, handler);
    return (): void => {
      ipcRenderer.off(IPC.DirectionalStateChanged, handler);
    };
  },
  onTranscript: (cb: (t: IpcSendMap[typeof IPC.TranscriptDelta]) => void): (() => void) => {
    const handler = (_evt: unknown, t: IpcSendMap[typeof IPC.TranscriptDelta]): void => cb(t);
    ipcRenderer.on(IPC.TranscriptDelta, handler);
    return (): void => {
      ipcRenderer.off(IPC.TranscriptDelta, handler);
    };
  },
  onLatency: (cb: (m: IpcSendMap[typeof IPC.LatencyMeasured]) => void): (() => void) => {
    const handler = (_evt: unknown, m: IpcSendMap[typeof IPC.LatencyMeasured]): void => cb(m);
    ipcRenderer.on(IPC.LatencyMeasured, handler);
    return (): void => {
      ipcRenderer.off(IPC.LatencyMeasured, handler);
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
