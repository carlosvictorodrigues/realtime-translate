import { IPC } from '../../shared/events';
import type { BidirectionalArgs, DeviceInventory, Direction, DirectionalState } from '../../shared/types';
import type {
  UserPrefs, WidgetPosition, Languages, DevicePrefs,
} from '../config/userPrefsStore';
import type { Locale } from '../../shared/i18n';

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
  [IPC.OpenSetupView]: { args: void; result: void };
  [IPC.SetupComplete]: { args: void; result: void };
  [IPC.ShowBarMenu]: { args: void; result: void };
  [IPC.AppQuit]: { args: void; result: void };
  [IPC.ResolveLocale]: { args: void; result: Locale };
}

export interface IpcSendMap {
  [IPC.DirectionalStateChanged]: DirectionalState;
  [IPC.TranscriptDelta]: { direction: 'A' | 'B'; kind: 'input' | 'output'; text: string };
  [IPC.LatencyMeasured]: { direction: Direction; averageMs: number; sampleCount: number };
}
