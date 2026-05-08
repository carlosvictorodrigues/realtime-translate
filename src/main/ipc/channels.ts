import { IPC } from '../../shared/events';
import type { BidirectionalArgs, DeviceInventory, Direction, DirectionalState } from '../../shared/types';

export interface IpcInvokeMap {
  [IPC.GetApiKeyStatus]: { args: void; result: boolean };
  [IPC.GetApiKeyHint]: { args: void; result: string | undefined };
  [IPC.SetApiKey]: { args: { value: string }; result: void };
  [IPC.ClearApiKey]: { args: void; result: void };
  [IPC.ListDevices]: { args: void; result: DeviceInventory };
  [IPC.StartTranslation]: { args: BidirectionalArgs; result: void };
  [IPC.StopTranslation]: { args: void; result: void };
}

export interface IpcSendMap {
  [IPC.DirectionalStateChanged]: DirectionalState;
  [IPC.TranscriptDelta]: { direction: 'A' | 'B'; kind: 'input' | 'output'; text: string };
  [IPC.LatencyMeasured]: { direction: Direction; averageMs: number; sampleCount: number };
}
