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
  hydrated: boolean;

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
  hydrate(): Promise<void>;
}

function persistDevices(): void {
  const s = useStore.getState();
  const devices: { mic?: string; toMeet?: string; fromMeet?: string; headset?: string } = {};
  if (s.selectedMic !== undefined) devices.mic = s.selectedMic;
  if (s.selectedToMeet !== undefined) devices.toMeet = s.selectedToMeet;
  if (s.selectedFromMeet !== undefined) devices.fromMeet = s.selectedFromMeet;
  if (s.selectedHeadset !== undefined) devices.headset = s.selectedHeadset;
  void window.rt.saveDevices(devices);
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
  hydrated: false,
  setHasApiKey: (hasApiKey) => set({ hasApiKey }),
  setApiKeyHint: (apiKeyHint) => set({ apiKeyHint }),
  setDevices: (devices) => set({ devices }),
  setSourceLang: (sourceLang) => {
    set({ sourceLang });
    void window.rt.saveLanguages({ source: sourceLang, target: useStore.getState().targetLang });
  },
  setTargetLang: (targetLang) => {
    set({ targetLang });
    void window.rt.saveLanguages({ source: useStore.getState().sourceLang, target: targetLang });
  },
  setSelectedMic: (selectedMic) => {
    set({ selectedMic });
    persistDevices();
  },
  setSelectedToMeet: (selectedToMeet) => {
    set({ selectedToMeet });
    persistDevices();
  },
  setSelectedFromMeet: (selectedFromMeet) => {
    set({ selectedFromMeet });
    persistDevices();
  },
  setSelectedHeadset: (selectedHeadset) => {
    set({ selectedHeadset });
    persistDevices();
  },
  setDirectionState: (d, state) =>
    set((s) => (d === 'A' ? { ...s, stateA: state } : { ...s, stateB: state })),
  setLatency: (direction, averageMs) =>
    set((s) => ({
      ...s,
      latencyMs: { ...s.latencyMs, [direction]: averageMs },
    })),
  hydrate: async () => {
    const prefs = await window.rt.loadPrefs();
    set((s) => ({
      ...s,
      sourceLang: prefs.languages?.source ?? s.sourceLang,
      targetLang: prefs.languages?.target ?? s.targetLang,
      selectedMic: prefs.devices?.mic ?? s.selectedMic,
      selectedToMeet: prefs.devices?.toMeet ?? s.selectedToMeet,
      selectedFromMeet: prefs.devices?.fromMeet ?? s.selectedFromMeet,
      selectedHeadset: prefs.devices?.headset ?? s.selectedHeadset,
      hydrated: true,
    }));
  },
}));
