# Realtime Translate — M2 Implementation Plan (Bidirectional)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bidirectional translation (PT↔EN). Two parallel `OpenAISession`s coordinated by a new `SessionManager`. User speaks PT → interlocutor hears EN through Meet (Session A); interlocutor speaks EN → user hears PT through headset (Session B). Plus quick wins: take API key out of renderer (spec violation fix C1) and add language dropdowns to test rig.

**Architecture:** Extend the M1 single-direction pipeline to multi-stream by adding `streamId: 'A' | 'B'` parameter to `OffscreenController` interface. New `SessionManager` owns two `OpenAISession`s + two `AudioPipeline`s. Each direction has independent state and reconnect logic. UI shows per-direction status (degraded mode allowed: one direction can fail while the other continues).

**Tech Stack:** Same as M1. No new dependencies.

**M2 Definition of Done:**
- User installs VB-CABLE A+B (donationware, separate from basic VB-CABLE)
- App detects both cables, configures Meet (mic = CABLE-A Output, speaker = CABLE-B Input)
- User clicks Start, status shows both directions: `A: active · B: active`
- User speaks PT → interlocutor in Meet hears EN
- Interlocutor speaks EN in Meet → user hears PT through headset
- Stop cleanly tears down both sessions
- One-direction failure doesn't take down the other (degraded mode)
- 47 (M1) + new tests pass on CI without OpenAI/hardware

**Out of M2 scope:** polished FloatingWidget (M3), SetupView (M3), transcript display (M3), electron-builder release (M4).

---

## File Structure (M2 changes)

### New files
- `src/main/translate/sessionManager.ts` — orchestrates 2 sessions + 2 pipelines
- `tests/integration/sessionManager.test.ts` — tests for SessionManager
- `docs/superpowers/plans/2026-05-07-realtime-translate-m2.md` — this file

### Modified files
- `src/shared/types.ts` — add `Direction`, replace `StartTranslationArgs` with `BidirectionalArgs`, add `DirectionalState`
- `src/shared/events.ts` — adjust IPC channel constants (`SessionStateChanged` → `DirectionalStateChanged`, etc.)
- `src/main/ipc/channels.ts` — update `IpcInvokeMap` and `IpcSendMap`
- `src/main/preload.ts` — new method shapes; `getApiKey` returns boolean (C1 fix)
- `src/main/ipc/handlers.ts` — new handler signatures
- `src/main/translate/audioPipeline.ts` — `OffscreenController` gains `streamId`; `AudioPipelineConfig` gains `streamId`
- `tests/integration/audioPipeline.test.ts` — update fakes for streamId
- `src/renderer/offscreen/index.ts` — Map-based stream tracking
- `src/renderer/offscreen.html` — no change
- `src/main/offscreenPreload.ts` — `onPushPlayback` and `sendPcm` carry `streamId`
- `src/main/app.ts` — `OffscreenBridge` carries `streamId`; replace `SessionRunner` with `SessionManager`
- `src/renderer/state/store.ts` — `hasApiKey: boolean`, `apiKeyHint`, `sourceLang`, `targetLang`, per-direction state
- `src/renderer/views/M1TestRig.tsx` → rename to `BidirectionalTestRig.tsx`; add language dropdowns + 4 device dropdowns + 2 status lines
- `src/renderer/App.tsx` — render `BidirectionalTestRig`
- `docs/QA-CHECKLIST.md` — add M2 smoke section
- `docs/superpowers/specs/2026-05-07-realtime-translate-design.md` — mark M2 sections as implemented

---

## Task 1: Add Direction, BidirectionalArgs, DirectionalState types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add new types (additive — old StartTranslationArgs kept for now)**

Append to `src/shared/types.ts`:

```typescript
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
 * - toMeetDeviceId: where Direction A's translated output is played; Meet records from this cable's recording side (audiooutput, e.g., 'CABLE-A Input')
 * - fromMeetDeviceId: where the app captures Meet's incoming audio; Meet plays into this cable's playback side, app reads from the recording side (audioinput, e.g., 'CABLE-B Output')
 * - headsetDeviceId: real speakers/headphones, Direction B output (audiooutput)
 */
export interface BidirectionalArgs {
  sourceLang: import('./languages').LanguageCode;
  targetLang: import('./languages').LanguageCode;
  micDeviceId: string;
  toMeetDeviceId: string;
  fromMeetDeviceId: string;
  headsetDeviceId: string;
}
```

(Keep the existing `StartTranslationArgs` interface for now — Task 2 will phase it out by changing IPC contracts. Don't break the M1 build mid-way.)

- [ ] **Step 2: Verify typecheck**

```powershell
npm run typecheck
```

Expected: exit 0. No code consumes the new types yet, but they should be valid declarations.

- [ ] **Step 3: Commit**

```powershell
git add src/shared/types.ts
git commit -m "Add Direction/BidirectionalArgs/DirectionalState types for M2"
```

---

## Task 2: C1 fix — API key never reaches renderer

**Files:**
- Modify: `src/shared/events.ts`, `src/main/ipc/channels.ts`, `src/main/preload.ts`, `src/main/ipc/handlers.ts`
- Modify: `src/renderer/state/store.ts`, `src/renderer/views/M1TestRig.tsx`

This task is large but coherent — all the IPC/store/UI changes for the GetApiKey split happen together.

- [ ] **Step 1: Update IPC channel constants**

`src/shared/events.ts` — replace `GetApiKey` with two channels. Also rename `SessionStateChanged` to `DirectionalStateChanged` (M2 prep):

```typescript
export const IPC = {
  // Renderer → Main (invoke)
  GetApiKeyStatus: 'config:getApiKeyStatus',
  GetApiKeyHint: 'config:getApiKeyHint',
  SetApiKey: 'config:setApiKey',
  ClearApiKey: 'config:clearApiKey',
  ListDevices: 'audio:listDevices',
  StartTranslation: 'translation:start',
  StopTranslation: 'translation:stop',

  // Main → Renderer (send)
  DirectionalStateChanged: 'session:directionalStateChanged',
  TranscriptDelta: 'transcript:delta',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
```

- [ ] **Step 2: Update channels.ts type maps**

`src/main/ipc/channels.ts`:
```typescript
import { IPC } from '../../shared/events';
import type { BidirectionalArgs, DeviceInventory, DirectionalState } from '../../shared/types';

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
}
```

- [ ] **Step 3: Update preload.ts**

`src/main/preload.ts`:
```typescript
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/events';
import type { IpcInvokeMap, IpcSendMap } from './ipc/channels';

const api = {
  hasApiKey: (): Promise<IpcInvokeMap[typeof IPC.GetApiKeyStatus]['result']> =>
    ipcRenderer.invoke(IPC.GetApiKeyStatus),
  getApiKeyHint: (): Promise<IpcInvokeMap[typeof IPC.GetApiKeyHint]['result']> =>
    ipcRenderer.invoke(IPC.GetApiKeyHint),
  setApiKey: (
    value: IpcInvokeMap[typeof IPC.SetApiKey]['args']['value'],
  ): Promise<IpcInvokeMap[typeof IPC.SetApiKey]['result']> =>
    ipcRenderer.invoke(IPC.SetApiKey, { value }),
  clearApiKey: (): Promise<IpcInvokeMap[typeof IPC.ClearApiKey]['result']> =>
    ipcRenderer.invoke(IPC.ClearApiKey),
  listDevices: (): Promise<IpcInvokeMap[typeof IPC.ListDevices]['result']> =>
    ipcRenderer.invoke(IPC.ListDevices),
  startTranslation: (
    args: IpcInvokeMap[typeof IPC.StartTranslation]['args'],
  ): Promise<IpcInvokeMap[typeof IPC.StartTranslation]['result']> =>
    ipcRenderer.invoke(IPC.StartTranslation, args),
  stopTranslation: (): Promise<IpcInvokeMap[typeof IPC.StopTranslation]['result']> =>
    ipcRenderer.invoke(IPC.StopTranslation),

  onDirectionalState: (
    cb: (s: IpcSendMap[typeof IPC.DirectionalStateChanged]) => void,
  ): (() => void) => {
    const handler = (_evt: unknown, s: IpcSendMap[typeof IPC.DirectionalStateChanged]): void =>
      cb(s);
    ipcRenderer.on(IPC.DirectionalStateChanged, handler);
    return (): void => {
      ipcRenderer.off(IPC.DirectionalStateChanged, handler);
    };
  },
  onTranscript: (cb: (t: IpcSendMap[typeof IPC.TranscriptDelta]) => void): (() => void) => {
    const handler = (_evt: unknown, t: IpcSendMap[typeof IPC.TranscriptDelta]): void => cb(t);
    ipcRenderer.on(IPC.TranscriptDelta, handler);
    return (): void => {
      ipcRenderer.off(IPC.TranscriptDelta, handler);
    };
  },
};

declare global {
  interface Window {
    rt: typeof api;
  }
}

contextBridge.exposeInMainWorld('rt', api);

export type RtApi = typeof api;
```

- [ ] **Step 4: Update handlers.ts**

`src/main/ipc/handlers.ts` — change channel registrations. Replace `handle(IPC.GetApiKey, ...)` with two handlers:

```typescript
  handle(IPC.GetApiKeyStatus, () => configStore.getApiKey() !== undefined);
  handle(IPC.GetApiKeyHint, () => {
    const key = configStore.getApiKey();
    return key && key.length > 4 ? key.slice(-4) : undefined;
  });
```

The full file should still register all 7 channels (Get*, SetApiKey, ClearApiKey, ListDevices, StartTranslation, StopTranslation). Update accordingly. Old `IPC.GetApiKey` references are gone.

- [ ] **Step 5: Update renderer state store**

`src/renderer/state/store.ts`:
```typescript
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
}));
```

- [ ] **Step 6: M1TestRig still works (interim — full M2 UI in Task 7)**

`src/renderer/views/M1TestRig.tsx` — minimal patch to keep the M1 UI compiling and runnable while later tasks land. Replace the API-key portion with the new methods:

```tsx
// In the useEffect:
useEffect(() => {
  rt.hasApiKey().then(setHasApiKey);
  rt.getApiKeyHint().then(setApiKeyHint);
  rt.listDevices().then(setDevices);
  // M1 single-state subscription replaced with directional in Task 7; for now we just
  // ignore directional events to keep this file compiling without referring to a vanished method.
  return undefined;
}, [setHasApiKey, setApiKeyHint, setDevices]);

// Replace `apiKey ? (...display) : (...input)` ternary:
{hasApiKey ? (
  <div /* same styles */>
    ●●●●●●●●{apiKeyHint ?? '••••'}{' '}
    <button onClick={(): void => { void (async (): Promise<void> => { await rt.clearApiKey(); setHasApiKey(false); setApiKeyHint(undefined); })(); }}>clear</button>
  </div>
) : (...same input form...)
```

Stub the Start button so the M1 test rig still compiles during the M2 refactor — full bidirectional UI lands in Task 7:

```tsx
const onStart = async (): Promise<void> => {
  setError('Start button is wired in Task 7 (BidirectionalTestRig)');
};
```

(Acceptable interim degradation — we're in mid-refactor. M2 UI lands in Task 7.)

- [ ] **Step 7: Run typecheck**

```powershell
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 8: Run tests**

```powershell
npm test
```

Expected: all 49 tests still pass. Configstore tests don't change (handler-level change only).

- [ ] **Step 9: Commit**

```powershell
git add src/shared/events.ts src/main/ipc/channels.ts src/main/preload.ts src/main/ipc/handlers.ts src/renderer/state/store.ts src/renderer/views/M1TestRig.tsx
git commit -m "C1 fix: API key never crosses to renderer (status + hint only)"
```

---

## Task 3: Extend OffscreenController interface with streamId

`OffscreenController` is the contract between `AudioPipeline` and the offscreen window. M2 needs two pipelines, so each call must specify which stream it's operating on.

**Files:**
- Modify: `src/main/translate/audioPipeline.ts`, `tests/integration/audioPipeline.test.ts`

- [ ] **Step 1: Update OffscreenController interface and AudioPipelineConfig**

`src/main/translate/audioPipeline.ts`:
```typescript
export interface OffscreenController {
  startCapture(streamId: string, deviceId: string, onPcm: (b64: string) => void): Promise<void>;
  startPlayback(streamId: string, deviceId: string): Promise<void>;
  pushPlayback(streamId: string, b64: string): void;
  stopStream(streamId: string): void;
  stopAll(): void;
}

/** Narrow session interface — pipeline only uses these three methods. */
export interface SessionLike {
  start(): void;
  appendAudio(base64: string): void;
  stop(): void;
}

export interface AudioPipelineConfig {
  streamId: string;
  offscreen: OffscreenController;
  session: SessionLike;
  micDeviceId: string;
  outputDeviceId: string;
}

export class AudioPipeline {
  constructor(private readonly cfg: AudioPipelineConfig) {}

  async start(): Promise<void> {
    await this.cfg.offscreen.startPlayback(this.cfg.streamId, this.cfg.outputDeviceId);
    try {
      await this.cfg.offscreen.startCapture(this.cfg.streamId, this.cfg.micDeviceId, (b64) =>
        this.cfg.session.appendAudio(b64),
      );
    } catch (err) {
      this.cfg.offscreen.stopStream(this.cfg.streamId);
      throw err;
    }
    this.cfg.session.start();
  }

  handleSessionAudio(base64: string): void {
    this.cfg.offscreen.pushPlayback(this.cfg.streamId, base64);
  }

  stop(): void {
    this.cfg.session.stop();
    this.cfg.offscreen.stopStream(this.cfg.streamId);
  }
}
```

- [ ] **Step 2: Update existing audioPipeline tests**

`tests/integration/audioPipeline.test.ts` — `FakeOffscreen` must implement the new contract; assertions track per-stream state:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { AudioPipeline, type OffscreenController, type SessionLike } from '@main/translate/audioPipeline';

class FakeOffscreen implements OffscreenController {
  startCaptureCalled = new Map<string, string>();
  startPlaybackCalled = new Map<string, string>();
  pushedAudio = new Map<string, string[]>();
  pcmCallbacks = new Map<string, (b64: string) => void>();
  stoppedStreams = new Set<string>();
  stoppedAll = false;

  async startCapture(
    streamId: string,
    deviceId: string,
    onPcm: (b64: string) => void,
  ): Promise<void> {
    this.startCaptureCalled.set(streamId, deviceId);
    this.pcmCallbacks.set(streamId, onPcm);
  }
  async startPlayback(streamId: string, deviceId: string): Promise<void> {
    this.startPlaybackCalled.set(streamId, deviceId);
  }
  pushPlayback(streamId: string, b64: string): void {
    const list = this.pushedAudio.get(streamId) ?? [];
    list.push(b64);
    this.pushedAudio.set(streamId, list);
  }
  stopStream(streamId: string): void {
    this.stoppedStreams.add(streamId);
  }
  stopAll(): void {
    this.stoppedAll = true;
  }
}

class FakeSession implements SessionLike {
  appendCalls: string[] = [];
  startCalled = false;
  stopCalled = false;
  start() {
    this.startCalled = true;
  }
  appendAudio(b64: string) {
    this.appendCalls.push(b64);
  }
  stop() {
    this.stopCalled = true;
  }
}

describe('AudioPipeline', () => {
  let offscreen: FakeOffscreen;
  let session: FakeSession;
  let pipeline: AudioPipeline;

  beforeEach(() => {
    offscreen = new FakeOffscreen();
    session = new FakeSession();
    pipeline = new AudioPipeline({
      streamId: 'A',
      offscreen,
      session,
      micDeviceId: 'mic-123',
      outputDeviceId: 'cable-a-456',
    });
  });

  it('start() initializes capture, playback, and the session for its streamId', async () => {
    await pipeline.start();
    expect(offscreen.startCaptureCalled.get('A')).toBe('mic-123');
    expect(offscreen.startPlaybackCalled.get('A')).toBe('cable-a-456');
    expect(session.startCalled).toBe(true);
  });

  it('forwards captured PCM chunks to session.appendAudio', async () => {
    await pipeline.start();
    offscreen.pcmCallbacks.get('A')?.('chunk1');
    offscreen.pcmCallbacks.get('A')?.('chunk2');
    expect(session.appendCalls).toEqual(['chunk1', 'chunk2']);
  });

  it('forwards session audio deltas to offscreen playback for its streamId', async () => {
    await pipeline.start();
    pipeline.handleSessionAudio('output-chunk-1');
    pipeline.handleSessionAudio('output-chunk-2');
    expect(offscreen.pushedAudio.get('A')).toEqual(['output-chunk-1', 'output-chunk-2']);
  });

  it('stop() stops session and the pipeline\'s stream only', async () => {
    await pipeline.start();
    pipeline.stop();
    expect(session.stopCalled).toBe(true);
    expect(offscreen.stoppedStreams.has('A')).toBe(true);
    expect(offscreen.stoppedAll).toBe(false);
  });

  it('rolls back offscreen on capture init failure (stops the same stream only)', async () => {
    class FailingOffscreen extends FakeOffscreen {
      override async startCapture(): Promise<void> {
        throw new Error('mic permission denied');
      }
    }
    const failing = new FailingOffscreen();
    const p = new AudioPipeline({
      streamId: 'A',
      offscreen: failing,
      session,
      micDeviceId: 'mic-x',
      outputDeviceId: 'cable-x',
    });
    await expect(p.start()).rejects.toThrow('mic permission denied');
    expect(failing.startPlaybackCalled.get('A')).toBe('cable-x');
    expect(failing.stoppedStreams.has('A')).toBe(true);
    expect(session.startCalled).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests, expect them to pass**

```powershell
npm test -- audioPipeline
```

Expected: 5 passing.

- [ ] **Step 4: Run full suite to confirm no regressions in non-test consumers**

```powershell
npm test
```

Expected: 49 still passing. The full suite will still pass even though `OffscreenBridge` in `app.ts` doesn't yet implement the new interface — `app.ts` is not exercised by unit tests. Typecheck below catches the mismatch.

- [ ] **Step 5: Run typecheck (will fail — that's expected, drives Task 4)**

```powershell
npm run typecheck
```

Expected: errors in `src/main/app.ts` because `OffscreenBridge` no longer matches `OffscreenController`. We fix this in Task 4.

- [ ] **Step 6: Commit**

```powershell
git add src/main/translate/audioPipeline.ts tests/integration/audioPipeline.test.ts
git commit -m "Extend OffscreenController with streamId for multi-stream support"
```

---

## Task 4: Update offscreen renderer + OffscreenBridge for streamId

The offscreen window currently tracks one capture and one playback. M2 needs Maps keyed by streamId.

**Files:**
- Modify: `src/renderer/offscreen/index.ts`, `src/main/offscreenPreload.ts`, `src/main/app.ts`

- [ ] **Step 1: Update offscreen index.ts for multi-stream**

`src/renderer/offscreen/index.ts`:
```typescript
import {
  startCapture,
  startPlayback,
  listDevices,
  type CaptureHandle,
  type PlaybackHandle,
} from './webAudioBridge';

declare global {
  interface Window {
    offscreen: {
      listDevices(): Promise<{ deviceId: string; label: string; kind: string }[]>;
      startCapture(streamId: string, micDeviceId: string): Promise<void>;
      startPlayback(streamId: string, outDeviceId: string): Promise<void>;
      pushPlayback(streamId: string, base64: string): void;
      stopStream(streamId: string): void;
      stopAll(): void;
    };
    offscreenBridge?: {
      onPushPlayback(handler: (streamId: string, base64: string) => void): void;
      sendPcm(streamId: string, base64: string): void;
    };
  }
}

const captures = new Map<string, CaptureHandle>();
const playbacks = new Map<string, PlaybackHandle>();

window.offscreen = {
  async listDevices() {
    const devs = await listDevices();
    return devs.map((d) => ({ deviceId: d.deviceId, label: d.label, kind: d.kind }));
  },
  async startCapture(streamId, micDeviceId) {
    captures.get(streamId)?.stop();
    captures.set(
      streamId,
      await startCapture(micDeviceId, (b64) => {
        window.offscreenBridge?.sendPcm(streamId, b64);
      }),
    );
  },
  async startPlayback(streamId, outDeviceId) {
    playbacks.get(streamId)?.stop();
    playbacks.set(streamId, await startPlayback(outDeviceId));
  },
  pushPlayback(streamId, base64) {
    playbacks.get(streamId)?.push(base64);
  },
  stopStream(streamId) {
    captures.get(streamId)?.stop();
    playbacks.get(streamId)?.stop();
    captures.delete(streamId);
    playbacks.delete(streamId);
  },
  stopAll() {
    for (const c of captures.values()) c.stop();
    for (const p of playbacks.values()) p.stop();
    captures.clear();
    playbacks.clear();
  },
};

if (!window.offscreenBridge) {
  // eslint-disable-next-line no-console
  console.error(
    'OffscreenBridge not installed. Did the preload script run? Captured audio will not reach main process.',
  );
} else {
  window.offscreenBridge.onPushPlayback((streamId, base64) => {
    window.offscreen.pushPlayback(streamId, base64);
  });
}
```

- [ ] **Step 2: Update offscreenPreload.ts**

`src/main/offscreenPreload.ts`:
```typescript
import { contextBridge, ipcRenderer } from 'electron';

const bridge = {
  onPushPlayback: (handler: (streamId: string, base64: string) => void): void => {
    ipcRenderer.on(
      'offscreen:pushPlayback',
      (_e, payload: { streamId: string; base64: string }) =>
        handler(payload.streamId, payload.base64),
    );
  },
  sendPcm: (streamId: string, base64: string): void => {
    ipcRenderer.send('offscreen:pcm', { streamId, base64 });
  },
};

declare global {
  interface Window {
    offscreenBridge: typeof bridge;
  }
}

contextBridge.exposeInMainWorld('offscreenBridge', bridge);
```

- [ ] **Step 3: Update OffscreenBridge in app.ts**

In `src/main/app.ts`, replace the `OffscreenBridge` class:

```typescript
class OffscreenBridge implements OffscreenController {
  private pcmCallbacks = new Map<string, (b64: string) => void>();

  constructor(private readonly window: BrowserWindow) {
    ipcMain.on('offscreen:pcm', (_e, payload: { streamId: string; base64: string }) => {
      this.pcmCallbacks.get(payload.streamId)?.(payload.base64);
    });
  }

  private isAlive(): boolean {
    return !this.window.isDestroyed() && !this.window.webContents.isDestroyed();
  }

  async startCapture(
    streamId: string,
    deviceId: string,
    onPcm: (b64: string) => void,
  ): Promise<void> {
    this.pcmCallbacks.set(streamId, onPcm);
    if (!this.isAlive()) return;
    await this.window.webContents.executeJavaScript(
      `window.offscreen.startCapture(${JSON.stringify(streamId)}, ${JSON.stringify(deviceId)})`,
    );
  }
  async startPlayback(streamId: string, deviceId: string): Promise<void> {
    if (!this.isAlive()) return;
    await this.window.webContents.executeJavaScript(
      `window.offscreen.startPlayback(${JSON.stringify(streamId)}, ${JSON.stringify(deviceId)})`,
    );
  }
  pushPlayback(streamId: string, b64: string): void {
    if (!this.isAlive()) return;
    this.window.webContents.send('offscreen:pushPlayback', { streamId, base64: b64 });
  }
  stopStream(streamId: string): void {
    this.pcmCallbacks.delete(streamId);
    if (!this.isAlive()) return;
    this.window.webContents
      .executeJavaScript(`window.offscreen.stopStream(${JSON.stringify(streamId)})`)
      .catch(() => undefined);
  }
  stopAll(): void {
    this.pcmCallbacks.clear();
    if (!this.isAlive()) return;
    this.window.webContents
      .executeJavaScript('window.offscreen.stopAll()')
      .catch(() => undefined);
  }
}
```

- [ ] **Step 4: Verify typecheck**

```powershell
npm run typecheck
```

Expected: exit 0 (Task 3 typecheck failure resolved). The SessionRunner still references the old single-stream model — typecheck will now flag that it's calling `pipeline.start()` correctly but creating an `AudioPipeline` without `streamId`. We'll fix that in Task 5 (SessionManager).

If typecheck flags `app.ts` complaining about `streamId`, add `streamId: 'A'` to the existing `new AudioPipeline({...})` call in SessionRunner as a temporary measure to unblock — Task 5 replaces SessionRunner entirely.

- [ ] **Step 5: Verify all tests still pass**

```powershell
npm test
```

Expected: 49 passing.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/offscreen/index.ts src/main/offscreenPreload.ts src/main/app.ts
git commit -m "Multi-stream offscreen renderer + bridge (M2 step)"
```

---

## Task 5: SessionManager class (TDD)

Owns 2 sessions + 2 pipelines. Per-direction independent state. One-fails-other-survives.

**Files:**
- Create: `src/main/translate/sessionManager.ts`
- Create: `tests/integration/sessionManager.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/integration/sessionManager.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SessionManager,
  type SessionManagerConfig,
} from '@main/translate/sessionManager';
import type { OffscreenController } from '@main/translate/audioPipeline';
import type { Direction, SessionState } from '@shared/types';
import type { WebSocketLike, WebSocketFactory } from '@main/translate/openaiSession';

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen?: () => void;
  onclose?: (code: number, reason: string) => void;
  onmessage?: (data: string) => void;
  onerror?: (err: Error) => void;
  constructor(public url: string, public headers: Record<string, string>) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.onclose?.(code ?? 1000, reason ?? '');
  }
  simulateOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  simulateError(err: Error): void {
    this.onerror?.(err);
  }
}

class FakeOffscreen implements OffscreenController {
  startCaptureCalled = new Map<string, string>();
  startPlaybackCalled = new Map<string, string>();
  pushedAudio = new Map<string, string[]>();
  pcmCallbacks = new Map<string, (b64: string) => void>();
  stoppedStreams = new Set<string>();
  stoppedAll = false;

  async startCapture(
    streamId: string,
    deviceId: string,
    onPcm: (b64: string) => void,
  ): Promise<void> {
    this.startCaptureCalled.set(streamId, deviceId);
    this.pcmCallbacks.set(streamId, onPcm);
  }
  async startPlayback(streamId: string, deviceId: string): Promise<void> {
    this.startPlaybackCalled.set(streamId, deviceId);
  }
  pushPlayback(streamId: string, b64: string): void {
    const list = this.pushedAudio.get(streamId) ?? [];
    list.push(b64);
    this.pushedAudio.set(streamId, list);
  }
  stopStream(streamId: string): void {
    this.stoppedStreams.add(streamId);
  }
  stopAll(): void {
    this.stoppedAll = true;
  }
}

describe('SessionManager', () => {
  let offscreen: FakeOffscreen;
  let onState: ReturnType<typeof vi.fn>;
  let onTranscript: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    offscreen = new FakeOffscreen();
    onState = vi.fn();
    onTranscript = vi.fn();
  });

  const buildConfig = (overrides: Partial<SessionManagerConfig> = {}): SessionManagerConfig => {
    const wsFactory: WebSocketFactory = (url, headers) => new FakeWebSocket(url, headers);
    return {
      apiKey: 'sk-test',
      sourceLang: 'pt',
      targetLang: 'en',
      micDeviceId: 'mic',
      toMeetDeviceId: 'cableA-input',
      fromMeetDeviceId: 'cableB-output',
      headsetDeviceId: 'headset',
      offscreen,
      wsFactory,
      onDirectionalState: onState as (s: { direction: Direction; state: SessionState }) => void,
      onTranscript: onTranscript as (t: {
        direction: Direction;
        kind: 'input' | 'output';
        text: string;
      }) => void,
      ...overrides,
    };
  };

  it('start() opens both sessions and configures both pipelines', async () => {
    const mgr = new SessionManager(buildConfig());
    await mgr.start();
    // 2 sockets opened
    expect(FakeWebSocket.instances).toHaveLength(2);
    // streams A and B are configured
    expect(offscreen.startCaptureCalled.get('A')).toBe('mic');
    expect(offscreen.startPlaybackCalled.get('A')).toBe('cableA-input');
    expect(offscreen.startCaptureCalled.get('B')).toBe('cableB-output');
    expect(offscreen.startPlaybackCalled.get('B')).toBe('headset');
  });

  it('emits per-direction state transitions', async () => {
    const mgr = new SessionManager(buildConfig());
    await mgr.start();
    expect(onState).toHaveBeenCalledWith({ direction: 'A', state: { kind: 'connecting' } });
    expect(onState).toHaveBeenCalledWith({ direction: 'B', state: { kind: 'connecting' } });
    FakeWebSocket.instances[0]!.simulateOpen();
    FakeWebSocket.instances[1]!.simulateOpen();
    const lastA = onState.mock.calls
      .map((c) => c[0])
      .filter((s) => (s as { direction: Direction }).direction === 'A')
      .pop();
    expect((lastA as { state: SessionState }).state.kind).toBe('active');
  });

  it('routes session A audio deltas to stream A playback', async () => {
    const mgr = new SessionManager(buildConfig());
    await mgr.start();
    const wsA = FakeWebSocket.instances[0]!;
    wsA.simulateOpen();
    // Server sends audio delta to A
    wsA.onmessage?.(JSON.stringify({ type: 'session.output_audio.delta', delta: 'a-out' }));
    expect(offscreen.pushedAudio.get('A')).toEqual(['a-out']);
    expect(offscreen.pushedAudio.get('B') ?? []).toEqual([]);
    void mgr;
  });

  it('routes session B audio deltas to stream B playback', async () => {
    const mgr = new SessionManager(buildConfig());
    await mgr.start();
    const wsB = FakeWebSocket.instances[1]!;
    wsB.simulateOpen();
    wsB.onmessage?.(JSON.stringify({ type: 'session.output_audio.delta', delta: 'b-out' }));
    expect(offscreen.pushedAudio.get('B')).toEqual(['b-out']);
    expect(offscreen.pushedAudio.get('A') ?? []).toEqual([]);
    void mgr;
  });

  it('one direction failing does not stop the other (degraded mode)', async () => {
    const mgr = new SessionManager(buildConfig());
    await mgr.start();
    const wsA = FakeWebSocket.instances[0]!;
    const wsB = FakeWebSocket.instances[1]!;
    wsA.simulateOpen();
    wsB.simulateOpen();
    // Server-side error on A
    wsA.onmessage?.(
      JSON.stringify({ type: 'error', error: { message: 'A failed' } }),
    );
    // Last emitted A state is error; B state is still active
    const aStates = onState.mock.calls
      .map((c) => c[0])
      .filter((s) => (s as { direction: Direction }).direction === 'A');
    expect((aStates[aStates.length - 1] as { state: SessionState }).state.kind).toBe('error');
    const bStates = onState.mock.calls
      .map((c) => c[0])
      .filter((s) => (s as { direction: Direction }).direction === 'B');
    expect((bStates[bStates.length - 1] as { state: SessionState }).state.kind).toBe('active');
  });

  it('stop() tears down both sessions and both streams', async () => {
    const mgr = new SessionManager(buildConfig());
    await mgr.start();
    FakeWebSocket.instances[0]!.simulateOpen();
    FakeWebSocket.instances[1]!.simulateOpen();
    await mgr.stop();
    expect(FakeWebSocket.instances[0]!.closed).toBe(true);
    expect(FakeWebSocket.instances[1]!.closed).toBe(true);
    expect(offscreen.stoppedStreams.has('A')).toBe(true);
    expect(offscreen.stoppedStreams.has('B')).toBe(true);
  });

  it('start() throws and emits error on direction A if pipeline A startCapture fails', async () => {
    class FailingOffscreenA extends FakeOffscreen {
      override async startCapture(
        streamId: string,
        deviceId: string,
        onPcm: (b64: string) => void,
      ): Promise<void> {
        if (streamId === 'A') throw new Error('A capture failed');
        return super.startCapture(streamId, deviceId, onPcm);
      }
    }
    const offA = new FailingOffscreenA();
    const mgr = new SessionManager(buildConfig({ offscreen: offA }));
    await expect(mgr.start()).rejects.toThrow();
    const aStates = onState.mock.calls
      .map((c) => c[0])
      .filter((s) => (s as { direction: Direction }).direction === 'A');
    expect((aStates[aStates.length - 1] as { state: SessionState }).state.kind).toBe('error');
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```powershell
npm test -- sessionManager
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement SessionManager**

`src/main/translate/sessionManager.ts`:
```typescript
import type { OffscreenController } from './audioPipeline';
import { AudioPipeline } from './audioPipeline';
import {
  OpenAISession,
  type WebSocketFactory,
} from './openaiSession';
import type { Direction, SessionState } from '../../shared/types';
import type { LanguageCode } from '../../shared/languages';

export interface SessionManagerConfig {
  apiKey: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  micDeviceId: string;
  toMeetDeviceId: string;
  fromMeetDeviceId: string;
  headsetDeviceId: string;
  offscreen: OffscreenController;
  wsFactory: WebSocketFactory;
  onDirectionalState: (s: { direction: Direction; state: SessionState }) => void;
  onTranscript: (t: { direction: Direction; kind: 'input' | 'output'; text: string }) => void;
}

interface DirectionContext {
  session: OpenAISession;
  pipeline: AudioPipeline;
}

export class SessionManager {
  private a: DirectionContext | undefined;
  private b: DirectionContext | undefined;

  constructor(private readonly cfg: SessionManagerConfig) {}

  async start(): Promise<void> {
    this.a = this.buildDirection('A', this.cfg.sourceLang, this.cfg.targetLang, this.cfg.micDeviceId, this.cfg.toMeetDeviceId);
    this.b = this.buildDirection('B', this.cfg.targetLang, this.cfg.sourceLang, this.cfg.fromMeetDeviceId, this.cfg.headsetDeviceId);

    // Start both pipelines in parallel; if one fails, surface its error via state and rethrow.
    // The other pipeline's state is independent — no automatic teardown of the surviving direction.
    const results = await Promise.allSettled([this.a.pipeline.start(), this.b.pipeline.start()]);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length > 0) {
      throw failures[0]!.reason;
    }
  }

  async stop(): Promise<void> {
    this.a?.pipeline.stop();
    this.b?.pipeline.stop();
    this.a = undefined;
    this.b = undefined;
  }

  private buildDirection(
    direction: Direction,
    source: LanguageCode,
    target: LanguageCode,
    micDeviceId: string,
    outputDeviceId: string,
  ): DirectionContext {
    let pipelineRef: AudioPipeline | undefined;
    const session = new OpenAISession({
      apiKey: this.cfg.apiKey,
      sourceLang: source,
      targetLang: target,
      events: {
        onState: (s) => this.cfg.onDirectionalState({ direction, state: s }),
        onAudio: (b64) => pipelineRef?.handleSessionAudio(b64),
        onTranscript: (t) =>
          this.cfg.onTranscript({ direction, kind: t.kind, text: t.text }),
      },
      wsFactory: this.cfg.wsFactory,
    });
    const pipeline = new AudioPipeline({
      streamId: direction,
      offscreen: this.cfg.offscreen,
      session,
      micDeviceId,
      outputDeviceId,
    });
    pipelineRef = pipeline;
    return { session, pipeline };
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```powershell
npm test -- sessionManager
```

Expected: 7 passing.

- [ ] **Step 5: Run full suite**

```powershell
npm test
```

Expected: previous 49 + 7 new = 56 passing.

- [ ] **Step 6: Commit**

```powershell
git add src/main/translate/sessionManager.ts tests/integration/sessionManager.test.ts
git commit -m "Add SessionManager orchestrating 2 sessions + 2 pipelines (TDD)"
```

---

## Task 6: Wire SessionManager into app.ts

Replace `SessionRunner` with `SessionManager`. Update IPC handlers to use `BidirectionalArgs`.

**Files:**
- Modify: `src/main/app.ts`, `src/main/ipc/handlers.ts`

- [ ] **Step 1: Replace SessionRunner with SessionManager in app.ts**

In `src/main/app.ts`:

1. Add import: `import { SessionManager } from './translate/sessionManager';`
2. Remove the entire `SessionRunner` class
3. Update the `app.whenReady` block:

```typescript
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });

  await createWindows();
  if (!offscreenWindow || !mainWindow) throw new Error('windows not created');

  const offscreenBridge = new OffscreenBridge(offscreenWindow);

  const emitDirectionalState = (s: {
    direction: 'A' | 'B';
    state: SessionState;
  }): void => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(IPC.DirectionalStateChanged, s);
    }
  };
  const emitTranscript = (t: {
    direction: 'A' | 'B';
    kind: 'input' | 'output';
    text: string;
  }): void => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(IPC.TranscriptDelta, t);
    }
  };

  // eslint-disable-next-line prefer-const
  let manager: SessionManager | undefined;

  const { configStore } = registerIpcHandlers({
    onStart: async (args) => {
      if (manager) await manager.stop();
      const apiKey = configStore.getApiKey();
      if (!apiKey) {
        emitDirectionalState({ direction: 'A', state: { kind: 'error', message: 'No API key' } });
        emitDirectionalState({ direction: 'B', state: { kind: 'error', message: 'No API key' } });
        throw new Error('No API key configured');
      }
      manager = new SessionManager({
        apiKey,
        sourceLang: args.sourceLang,
        targetLang: args.targetLang,
        micDeviceId: args.micDeviceId,
        toMeetDeviceId: args.toMeetDeviceId,
        fromMeetDeviceId: args.fromMeetDeviceId,
        headsetDeviceId: args.headsetDeviceId,
        offscreen: offscreenBridge,
        wsFactory,
        onDirectionalState: emitDirectionalState,
        onTranscript: emitTranscript,
      });
      try {
        await manager.start();
      } catch (err) {
        manager = undefined;
        throw err;
      }
    },
    onStop: async () => {
      if (!manager) return;
      await manager.stop();
      manager = undefined;
    },
    listDevices: () => buildDeviceInventory(offscreenWindow!),
  });
});
```

- [ ] **Step 2: Update handlers.ts onStart args type**

`src/main/ipc/handlers.ts`:
```typescript
import type { BidirectionalArgs, DeviceInventory } from '../../shared/types';

interface HandlerDeps {
  /**
   * Translation start. The implementation in SessionManager is responsible for emitting
   * `{ direction, state: { kind: 'error' } }` via the DirectionalStateChanged channel
   * BEFORE rejecting this promise. The IPC layer just rethrows.
   */
  onStart: (args: BidirectionalArgs) => Promise<void>;
  onStop: () => Promise<void>;
  listDevices: () => Promise<DeviceInventory>;
}
```

- [ ] **Step 3: Verify typecheck**

```powershell
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Verify tests still pass**

```powershell
npm test
```

Expected: 56 still passing.

- [ ] **Step 5: Commit**

```powershell
git add src/main/app.ts src/main/ipc/handlers.ts
git commit -m "Wire SessionManager into main process (replaces SessionRunner)"
```

---

## Task 7: BidirectionalTestRig UI

Replace M1TestRig with full M2 UI: 2 language dropdowns, 4 device dropdowns, 2 status lines.

**Files:**
- Create: `src/renderer/views/BidirectionalTestRig.tsx`
- Delete: `src/renderer/views/M1TestRig.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Create BidirectionalTestRig.tsx**

`src/renderer/views/BidirectionalTestRig.tsx`:
```tsx
import type { JSX } from 'react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { rt } from '../ipc/client';
import { LANGUAGES, type LanguageCode } from '../../shared/languages';

export function BidirectionalTestRig(): JSX.Element {
  const {
    hasApiKey,
    apiKeyHint,
    devices,
    sourceLang,
    targetLang,
    selectedMic,
    selectedToMeet,
    selectedFromMeet,
    selectedHeadset,
    stateA,
    stateB,
    setHasApiKey,
    setApiKeyHint,
    setDevices,
    setSourceLang,
    setTargetLang,
    setSelectedMic,
    setSelectedToMeet,
    setSelectedFromMeet,
    setSelectedHeadset,
    setDirectionState,
  } = useStore();

  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    rt.hasApiKey().then(setHasApiKey);
    rt.getApiKeyHint().then(setApiKeyHint);
    rt.listDevices().then((d) => {
      setDevices(d);
      // Auto-select cable A and B if detected.
      if (d.cableA?.playback && !selectedToMeet) setSelectedToMeet(d.cableA.playback.deviceId);
      if (d.cableB?.recording && !selectedFromMeet) setSelectedFromMeet(d.cableB.recording.deviceId);
    });
    const off = rt.onDirectionalState(({ direction, state }) => setDirectionState(direction, state));
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSaveKey = async (): Promise<void> => {
    setError(undefined);
    if (!keyInput.startsWith('sk-')) {
      setError('Key must start with sk-');
      return;
    }
    await rt.setApiKey(keyInput);
    setHasApiKey(true);
    setApiKeyHint(keyInput.length > 4 ? keyInput.slice(-4) : undefined);
    setKeyInput('');
  };

  const onStart = async (): Promise<void> => {
    setError(undefined);
    if (!selectedMic || !selectedToMeet || !selectedFromMeet || !selectedHeadset) {
      setError('Pick all four devices: mic, to-meet, from-meet, headset');
      return;
    }
    try {
      await rt.startTranslation({
        sourceLang,
        targetLang,
        micDeviceId: selectedMic,
        toMeetDeviceId: selectedToMeet,
        fromMeetDeviceId: selectedFromMeet,
        headsetDeviceId: selectedHeadset,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onStop = async (): Promise<void> => {
    await rt.stopTranslation();
  };

  const isAnyActive = stateA.kind === 'active' || stateB.kind === 'active';
  const isConnecting = stateA.kind === 'connecting' || stateB.kind === 'connecting';

  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)' };
  const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ marginBottom: 4 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-tertiary)',
          }}
        >
          M2 Bidirectional
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Realtime Translate</h1>
      </header>

      <section style={sectionStyle}>
        <label style={labelStyle}>OpenAI API Key</label>
        {hasApiKey ? (
          <div
            style={{
              fontSize: 13,
              padding: '8px 10px',
              background: 'var(--surface)',
              borderRadius: 6,
            }}
          >
            ●●●●●●●●{apiKeyHint ?? '••••'}{' '}
            <button
              onClick={(): void => {
                void (async (): Promise<void> => {
                  await rt.clearApiKey();
                  setHasApiKey(false);
                  setApiKeyHint(undefined);
                })();
              }}
              style={{
                marginLeft: 8,
                fontSize: 11,
                background: 'none',
                color: 'var(--text-tertiary)',
                border: 0,
              }}
            >
              clear
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={keyInput}
              onChange={(e): void => setKeyInput(e.target.value)}
              placeholder="sk-proj-..."
              style={{
                flex: 1,
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                padding: '7px 10px',
                fontFamily: 'inherit',
                fontSize: 13,
              }}
            />
            <button
              onClick={(): void => {
                void onSaveKey();
              }}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 0,
                borderRadius: 6,
                padding: '7px 14px',
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              Save
            </button>
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <label style={labelStyle}>Languages (you ↔ them)</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={sourceLang}
            onChange={(e): void => setSourceLang(e.target.value as LanguageCode)}
            style={selectStyle}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <span style={{ color: 'var(--text-tertiary)' }}>↔</span>
          <select
            value={targetLang}
            onChange={(e): void => setTargetLang(e.target.value as LanguageCode)}
            style={selectStyle}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section style={sectionStyle}>
        <label style={labelStyle}>Microphone (you speak)</label>
        <select
          value={selectedMic ?? ''}
          onChange={(e): void => setSelectedMic(e.target.value)}
          style={selectStyle}
        >
          <option value="">— select —</option>
          {devices?.inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </section>

      <section style={sectionStyle}>
        <label style={labelStyle}>To Meet (CABLE-A Input — Direction A output)</label>
        <select
          value={selectedToMeet ?? ''}
          onChange={(e): void => setSelectedToMeet(e.target.value)}
          style={selectStyle}
        >
          <option value="">— select —</option>
          {devices?.cableA?.playback && (
            <option value={devices.cableA.playback.deviceId}>
              {devices.cableA.playback.label} (recommended)
            </option>
          )}
          {devices?.outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </section>

      <section style={sectionStyle}>
        <label style={labelStyle}>From Meet (CABLE-B Output — Direction B input)</label>
        <select
          value={selectedFromMeet ?? ''}
          onChange={(e): void => setSelectedFromMeet(e.target.value)}
          style={selectStyle}
        >
          <option value="">— select —</option>
          {devices?.cableB?.recording && (
            <option value={devices.cableB.recording.deviceId}>
              {devices.cableB.recording.label} (recommended)
            </option>
          )}
          {devices?.inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </section>

      <section style={sectionStyle}>
        <label style={labelStyle}>Headset (you hear translation)</label>
        <select
          value={selectedHeadset ?? ''}
          onChange={(e): void => setSelectedHeadset(e.target.value)}
          style={selectStyle}
        >
          <option value="">— select —</option>
          {devices?.outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </section>

      <section style={{ marginTop: 4 }}>
        <button
          onClick={(): void => {
            void (isAnyActive ? onStop() : onStart());
          }}
          disabled={!hasApiKey || isConnecting}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 6,
            border: 0,
            background: isAnyActive ? 'transparent' : 'var(--accent)',
            color: isAnyActive ? 'var(--text-primary)' : '#fff',
            outline: isAnyActive ? '1px solid var(--border-default)' : undefined,
            opacity: !hasApiKey || isConnecting ? 0.5 : 1,
          }}
        >
          {isAnyActive ? 'Stop' : isConnecting ? 'Connecting…' : 'Start translation'}
        </button>
      </section>

      <section style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        <div>
          A ({sourceLang} → {targetLang}):{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{stateA.kind}</strong>
          {stateA.kind === 'error' && (
            <span style={{ color: 'var(--error)' }}> — {stateA.message}</span>
          )}
        </div>
        <div>
          B ({targetLang} → {sourceLang}):{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{stateB.kind}</strong>
          {stateB.kind === 'error' && (
            <span style={{ color: 'var(--error)' }}> — {stateB.message}</span>
          )}
        </div>
      </section>

      {error && <div style={{ color: 'var(--error)', fontSize: 12 }}>{error}</div>}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
};
```

- [ ] **Step 2: Update App.tsx**

`src/renderer/App.tsx`:
```tsx
import type { JSX } from 'react';
import { BidirectionalTestRig } from './views/BidirectionalTestRig';

export function App(): JSX.Element {
  return <BidirectionalTestRig />;
}
```

- [ ] **Step 3: Delete M1TestRig.tsx**

```powershell
git rm src/renderer/views/M1TestRig.tsx
```

- [ ] **Step 4: Verify typecheck**

```powershell
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 5: Verify tests still pass**

```powershell
npm test
```

Expected: 56 passing.

- [ ] **Step 6: Verify dev mode launches**

```powershell
npm run dev
```

Expected: app opens, shows "M2 Bidirectional" caption, languages PT↔EN by default, all 4 device dropdowns visible. Close cleanly.

- [ ] **Step 7: Commit**

```powershell
git add src/renderer/App.tsx src/renderer/views/
git commit -m "Add BidirectionalTestRig UI (replaces M1 test rig)"
```

---

## Task 8: M2 manual smoke test

**Files:**
- Modify: `docs/QA-CHECKLIST.md`

This is a GATE: the user must run the smoke test on their machine with VB-CABLE A+B installed.

- [ ] **Step 1: Update QA-CHECKLIST.md with M2 procedure**

Add a new section after "M1 End-to-End Smoke Test":

```markdown
## M2 End-to-End Smoke Test (Bidirectional)

Final manual gate before tagging M2.

### Prerequisites

- All M1 prerequisites
- **VB-CABLE A+B** installed (separate from basic VB-CABLE): https://vb-audio.com/Cable/ (donationware variant; reboot after install). M1 used the basic cable; M2 needs both A and B for proper isolation.
- Google Meet account (or another video-conf app) for end-to-end test

### Setup

1. **Configure two monitoring routes** so you can hear both directions:
   - Win+R → `mmsys.cpl` → Recording tab
   - Right-click **CABLE-A Output** → Properties → Listen tab → "Listen to this device" → choose your real headset → OK
   - Right-click **CABLE-B Output** → same flow → choose your real headset → OK
   - This way you'll hear: (a) what your translated voice sounds like in EN going to Meet, and (b) what Meet sends to the app for EN→PT translation.

2. **Configure Meet:**
   - Open Google Meet → join a test call (any room)
   - Settings → Audio → Microphone → **CABLE-A Output**
   - Settings → Audio → Speaker → **CABLE-B Input**

### Procedure

1. `npm run dev`
2. In M2 BidirectionalTestRig: paste API key (or already saved); pick mic, to-meet (CABLE-A Input recommended), from-meet (CABLE-B Output recommended), headset.
3. Languages: leave PT ↔ EN (default).
4. Click Start translation. Both A and B status should transition idle → connecting → active.
5. Speak Portuguese into the mic. Verify:
   - You hear the EN translation through your headset (via CABLE-A Output monitoring).
   - The Meet test call participant (could be a second device or earphones with same Meet on phone) hears the EN translation.
6. Have someone speak English into the Meet call. Verify:
   - You hear the PT translation through your headset (via CABLE-B Output monitoring + the app's playback to your headset).
7. Stop. Both directions return to idle.

### Pass criteria

- [ ] Both directions show `active`
- [ ] PT→EN audible at the interlocutor side (Meet)
- [ ] EN→PT audible in your headset
- [ ] Stop returns both to idle without crash
- [ ] If one direction fails (simulate by killing network briefly), the other continues — degraded mode

### Document result

Update `docs/superpowers/spikes/2026-05-07-setsinkid-spike.md` with M2 smoke result. Tag if PASS:

```powershell
git tag -a v0.2.0-m2 -m "M2: bidirectional PT<->EN translation"
```
```

- [ ] **Step 2: Commit checklist update**

```powershell
git add docs/QA-CHECKLIST.md
git commit -m "Add M2 bidirectional smoke checklist"
```

- [ ] **Step 3: Run the smoke test (USER MANUAL STEP)**

User executes the checklist. Reports PASS or FAIL.

- [ ] **Step 4: On PASS, update spike doc and tag**

User updates `docs/superpowers/spikes/2026-05-07-setsinkid-spike.md` with PASS notes, then:

```powershell
git tag -a v0.2.0-m2 -m "M2: bidirectional PT<->EN translation"
```

- [ ] **Step 5: On FAIL, debug**

Capture exact errors and console output. Common failure modes:
- Only basic VB-CABLE installed (not A+B) — M2 detects no cableB; fall back to M1 unidirectional or block with clear error
- Meet config wrong (mic should be CABLE-A Output, speaker should be CABLE-B Input — reverse of how the app names them)
- Echo loop (CABLE-A Output also routed to default speakers, causing the EN to feed back into the mic)

---

## Self-review

After writing the plan, run through:

**1. Spec coverage:**
- §3 Architecture: 2 sessions in parallel ✓ (Task 5)
- §4 Components: SessionManager added ✓ (Task 5); SessionRunner removed ✓ (Task 6); audioPipeline gains streamId ✓ (Task 3)
- §5 Data flow direction B ✓ (Task 5 SessionManager builds Direction B)
- §7 Independence between sessions ✓ (Task 5 test "one direction failing does not stop the other")
- §7 Reconnect per session ✓ (already in OpenAISession from M1)
- Spec §3 principle: renderer never receives API key ✓ (Task 2 C1 fix)

**2. Placeholder scan:** none found.

**3. Type consistency:**
- `BidirectionalArgs` defined Task 1, used Tasks 2, 6, 7 ✓
- `Direction` defined Task 1, used Tasks 5, 6, 7 ✓
- `DirectionalState` defined Task 1, used Tasks 2, 6 ✓
- `OffscreenController` extended Task 3, implemented Task 4 ✓
- `SessionLike` unchanged from M1 ✓
- `IPC.GetApiKeyStatus`/`GetApiKeyHint` added Task 2 ✓
- `IPC.DirectionalStateChanged` renamed Task 2, used in Tasks 6, 7 ✓
- `streamId: string` param: Task 3 (interface), Task 4 (offscreen impl + bridge), Task 5 (passes 'A'/'B'), tests use literal strings ✓

---

## Followup plan (after M2 ships)

- **M3 plan:** polished FloatingWidget (always-on-top, draggable, transcript expansible), full SetupView with diagnostics + Test Translation, language pair component, status badge, latency meter. Plus the M1/M2 deferrals: I3 (worklet bundle), I4 (logger wired), file size cleanup of app.ts.
- **M4 plan:** electron-builder, GitHub Actions, code signing, public release.
