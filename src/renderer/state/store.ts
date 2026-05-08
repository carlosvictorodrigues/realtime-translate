import { create } from 'zustand';
import type { DeviceInventory, SessionState } from '../../shared/types';

interface AppState {
  apiKey: string | undefined;
  devices: DeviceInventory | undefined;
  selectedMic: string | undefined;
  selectedOutput: string | undefined;
  sessionState: SessionState;
  setApiKey(value: string | undefined): void;
  setDevices(value: DeviceInventory): void;
  setSelectedMic(deviceId: string): void;
  setSelectedOutput(deviceId: string): void;
  setSessionState(state: SessionState): void;
}

export const useStore = create<AppState>((set) => ({
  apiKey: undefined,
  devices: undefined,
  selectedMic: undefined,
  selectedOutput: undefined,
  sessionState: { kind: 'idle' },
  setApiKey: (apiKey) => set({ apiKey }),
  setDevices: (devices) => set({ devices }),
  setSelectedMic: (selectedMic) => set({ selectedMic }),
  setSelectedOutput: (selectedOutput) => set({ selectedOutput }),
  setSessionState: (sessionState) => set({ sessionState }),
}));
