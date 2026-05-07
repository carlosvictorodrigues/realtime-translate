export type SessionState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'active'; sinceMs: number }
  | { kind: 'reconnecting'; attempt: number }
  | { kind: 'error'; message: string };

export interface DeviceSummary {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

export interface DeviceInventory {
  inputs: DeviceSummary[];
  outputs: DeviceSummary[];
  cableA?: { playback?: DeviceSummary; recording?: DeviceSummary };
  cableB?: { playback?: DeviceSummary; recording?: DeviceSummary };
}

export interface StartTranslationArgs {
  sourceLang: string;
  targetLang: string;
  micDeviceId: string;
  outputDeviceId: string; // M1: target playback (cable A or test speaker)
}
