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

export type Direction = 'A' | 'B';

/** Per-direction state for bidirectional translation. */
export interface DirectionalState {
  direction: Direction;
  state: SessionState;
}

/**
 * Bidirectional translation startup args. Direction A = user speaks → interlocutor;
 * Direction B = interlocutor speaks → user.
 *
 * Device names from the *device's* perspective (matches Web Audio's MediaDeviceInfo.kind):
 * - micDeviceId: real mic, Direction A audio source (audioinput)
 * - toMeetDeviceId: where Direction A's translated output is played; Meet records from
 *   this cable's recording side (audiooutput, e.g., 'CABLE-A Input')
 * - fromMeetDeviceId: where the app captures Meet's incoming audio; Meet plays into
 *   this cable's playback side, app reads from the recording side (audioinput, e.g., 'CABLE-B Output')
 * - headsetDeviceId: real speakers/headphones, Direction B output (audiooutput)
 */
export interface BidirectionalArgs {
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  micDeviceId: string;
  toMeetDeviceId: string;
  fromMeetDeviceId: string;
  headsetDeviceId: string;
}
