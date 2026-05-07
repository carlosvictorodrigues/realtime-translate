import type { LanguageCode } from './languages';

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

// Renderer-facing twin of the main-process CablePair from src/main/audio/deviceDetector.ts.
// Uses DeviceSummary instead of DeviceInfo so this type can live in `shared` without pulling
// in main-only code. Main process maps DeviceInfo -> DeviceSummary at the IPC boundary.
export interface DeviceInventory {
  inputs: DeviceSummary[];
  outputs: DeviceSummary[];
  cableA?: { playback?: DeviceSummary; recording?: DeviceSummary };
  cableB?: { playback?: DeviceSummary; recording?: DeviceSummary };
}

export interface StartTranslationArgs {
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  micDeviceId: string;
  outputDeviceId: string; // M1: target playback (cable A or test speaker)
}
