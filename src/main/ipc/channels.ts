import { IPC } from '../../shared/events';
import type { BidirectionalArgs, DeviceInventory, Direction, DirectionalState } from '../../shared/types';
import type {
  UserPrefs, WidgetPosition, Languages, DevicePrefs,
} from '../config/userPrefsStore';
import type { Locale } from '../../shared/i18n';
import type { LanguageCode } from '../../shared/languages';

export interface IpcInvokeMap {
  [IPC.GetApiKeyStatus]: { args: void; result: boolean };
  [IPC.GetApiKeyHint]: { args: void; result: string | undefined };
  [IPC.SetApiKey]: { args: { value: string }; result: void };
  [IPC.ClearApiKey]: { args: void; result: void };
  [IPC.ListDevices]: { args: void; result: DeviceInventory };
  [IPC.StartTranslation]: { args: BidirectionalArgs; result: void };
  [IPC.StopTranslation]: { args: void; result: void };
  [IPC.PrefsLoad]: { args: void; result: UserPrefs };
  [IPC.PrefsSetWidgetPosition]: { args: WidgetPosition; result: void };
  [IPC.PrefsSetLanguages]: { args: Languages; result: void };
  [IPC.PrefsSetDevices]: { args: DevicePrefs; result: void };
  [IPC.PrefsSetUiLanguage]: { args: Locale; result: void };
  [IPC.PrefsSetMeetConfirmed]: { args: boolean; result: void };
  [IPC.OpenSetupView]: { args: void; result: void };
  [IPC.SetupComplete]: { args: void; result: void };
  [IPC.ShowBarMenu]: { args: void; result: void };
  [IPC.SetBarMouseEvents]: { args: { ignore: boolean }; result: void };
  [IPC.AppQuit]: { args: void; result: void };
  [IPC.OpenExternalUrl]: { args: { url: string }; result: void };
  [IPC.ResolveLocale]: { args: void; result: Locale };
  [IPC.TestSessionStart]: {
    args: { direction: Direction; sourceLang: LanguageCode; targetLang: LanguageCode };
    result: void;
  };
  [IPC.TestSessionInject]: { args: { direction: Direction; base64: string }; result: void };
  [IPC.TestSessionInputDone]: { args: { direction: Direction }; result: void };
  [IPC.TestSessionStop]: { args: { direction: Direction }; result: void };
  [IPC.LoopbackStart]: {
    args: { deviceId: string; thresholdRms: number; timeoutMs: number };
    result: { detected: boolean };
  };
  [IPC.TestRoutePlayback]: {
    args: { direction: Direction; deviceId: string; base64: string };
    result: void;
  };
  [IPC.ApplyUpdate]: { args: void; result: void };
}

export interface IpcSendMap {
  [IPC.DirectionalStateChanged]: DirectionalState;
  [IPC.TranscriptDelta]: { direction: 'A' | 'B'; kind: 'input' | 'output'; text: string };
  [IPC.LatencyMeasured]: { direction: Direction; averageMs: number; sampleCount: number };
  [IPC.UpdateAvailable]: { version: string };
  [IPC.UpdateDownloaded]: { version: string };
}
