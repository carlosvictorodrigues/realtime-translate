import { IPC } from '../../shared/events';
import type { DeviceInventory, SessionState, StartTranslationArgs } from '../../shared/types';

export interface IpcInvokeMap {
  [IPC.GetApiKey]: { args: void; result: string | undefined };
  [IPC.SetApiKey]: { args: { value: string }; result: void };
  [IPC.ClearApiKey]: { args: void; result: void };
  [IPC.ListDevices]: { args: void; result: DeviceInventory };
  [IPC.StartTranslation]: { args: StartTranslationArgs; result: void };
  [IPC.StopTranslation]: { args: void; result: void };
}

export interface IpcSendMap {
  [IPC.SessionStateChanged]: SessionState;
  [IPC.TranscriptDelta]: { kind: 'input' | 'output'; text: string };
}
