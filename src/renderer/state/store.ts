import { create } from 'zustand';
import type { DeviceInventory, Direction, SessionState } from '../../shared/types';
import type { LanguageCode } from '../../shared/languages';

interface AppState {
  hasApiKey: boolean;
  apiKeyHint: string | undefined;
  devices: DeviceInventory | undefined;

  // Per-direction config + state (M2)
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  selectedMic: string | undefined;
  selectedToMeet: string | undefined;
  selectedFromMeet: string | undefined;
  selectedHeadset: string | undefined;
  stateA: SessionState;
  stateB: SessionState;
  latencyMs: { A: number | undefined; B: number | undefined };

  setHasApiKey(value: boolean): void;
  setApiKeyHint(value: string | undefined): void;
  setDevices(value: DeviceInventory): void;
  setSourceLang(code: LanguageCode): void;
  setTargetLang(code: LanguageCode): void;
  setSelectedMic(deviceId: string): void;
  setSelectedToMeet(deviceId: string): void;
  setSelectedFromMeet(deviceId: string): void;
  setSelectedHeadset(deviceId: string): void;
  setDirectionState(d: Direction, state: SessionState): void;
  setLatency(direction: Direction, averageMs: number): void;
}

export const useStore = create<AppState>((set) => ({
  hasApiKey: false,
  apiKeyHint: undefined,
  devices: undefined,
  sourceLang: 'pt',
  targetLang: 'en',
  selectedMic: undefined,
  selectedToMeet: undefined,
  selectedFromMeet: undefined,
  selectedHeadset: undefined,
  stateA: { kind: 'idle' },
  stateB: { kind: 'idle' },
  latencyMs: { A: undefined, B: undefined },
  setHasApiKey: (hasApiKey) => set({ hasApiKey }),
  setApiKeyHint: (apiKeyHint) => set({ apiKeyHint }),
  setDevices: (devices) => set({ devices }),
  setSourceLang: (sourceLang) => set({ sourceLang }),
  setTargetLang: (targetLang) => set({ targetLang }),
  setSelectedMic: (selectedMic) => set({ selectedMic }),
  setSelectedToMeet: (selectedToMeet) => set({ selectedToMeet }),
  setSelectedFromMeet: (selectedFromMeet) => set({ selectedFromMeet }),
  setSelectedHeadset: (selectedHeadset) => set({ selectedHeadset }),
  setDirectionState: (d, state) =>
    set((s) => (d === 'A' ? { ...s, stateA: state } : { ...s, stateB: state })),
  setLatency: (direction, averageMs) =>
    set((s) => ({
      ...s,
      latencyMs: { ...s.latencyMs, [direction]: averageMs },
    })),
}));
