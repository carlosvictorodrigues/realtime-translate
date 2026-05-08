# Realtime Translate M3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the FloatingWidget UI (merged C design), prefs.json persistence, and the M2 backend follow-ups that block release. After M3, the test rig is gone; the user has a real always-on-top bar with pause/resume and a (stub) SetupView opens via the gear icon.

**Architecture:** Two BrowserWindows (FloatingWidget always-on-top transparent + SetupView lazy normal) plus the existing offscreen renderer. Prefs persisted to plain JSON in `userData`. Logger wired to the existing dead `util/logger.ts` with filesystem sink. Latency measured in `OpenAISession`, propagated through `SessionManager` to renderer via new IPC channel. The bar reduces (stateA, stateB) into a single `BarState` via a pure selector.

**Tech Stack:** Electron 42 · electron-vite 4 · React 19 · TypeScript 5.9 · Zustand · ws · vitest. No new runtime dependencies.

**Spec:** [2026-05-08-realtime-translate-m3-floatingwidget.md](../specs/2026-05-08-realtime-translate-m3-floatingwidget.md) (FloatingWidget design source-of-truth) + [2026-05-07-realtime-translate-design.md](../specs/2026-05-07-realtime-translate-design.md) (master).

**Out of scope (separate plans):** SetupView design + implementation (own brainstorm + plan cycle); AudioRouter abstraction; transcript live in renderer; Test Translation flow; export logs button; Mica nativo.

---

## File structure overview

### New files

| Path | Responsibility |
|---|---|
| `src/main/config/userPrefsStore.ts` | Plain-JSON store for widget position, languages, device IDs |
| `src/main/util/jsonlSink.ts` | LogSink writing JSONL to file with rotation (7 days) |
| `src/main/audio/offscreenBridge.ts` | Extracted from `app.ts` — OffscreenController wired to BrowserWindow IPC |
| `src/renderer/state/aggregateState.ts` | Pure selector: (stateA, stateB) → BarState |
| `src/renderer/views/FloatingWidget.tsx` | Root of the bar window |
| `src/renderer/components/Orb.tsx` | Status orb |
| `src/renderer/components/Waveform.tsx` | 5-bar animated decoration |
| `src/renderer/components/LanguagePair.tsx` | `PT ↔ EN` clickable label |
| `src/renderer/components/LatencyMeter.tsx` | Mono latency display |
| `src/renderer/components/ActionButton.tsx` | Pause / Resume / Retry button |
| `src/renderer/components/SettingsButton.tsx` | Gear icon, opens SetupView |
| `src/renderer/views/SetupViewStub.tsx` | Placeholder until SetupView spec lands |
| `src/renderer/floating-widget.html` | HTML entry for the FloatingWidget BrowserWindow |
| `src/renderer/setup-view.html` | HTML entry for the SetupView BrowserWindow |
| `src/renderer/floating-main.tsx` | React entry for FloatingWidget |
| `src/renderer/setup-main.tsx` | React entry for SetupView stub |
| `src/renderer/styles/widget.css` | Widget-only styles |
| `tests/unit/userPrefsStore.test.ts` | UserPrefsStore tests (mock fs) |
| `tests/unit/aggregateState.test.ts` | Selector hierarchy tests |
| `tests/unit/jsonlSink.test.ts` | Sink rotation + flush tests |

### Modified files

| Path | Change |
|---|---|
| `src/renderer/offscreen/workers/pcmEncoder.worklet.ts` | **Renamed** to `pcmEncoder.worklet.js` with JSDoc types |
| `src/renderer/offscreen/webAudioBridge.ts` | Update worklet URL import to `?url` pattern |
| `src/main/util/logger.ts` | Recursive sanitize + `LogSink.flush/close` contract additions |
| `src/main/translate/openaiSession.ts` | Emit `onLatencyMeasured` event (t1 - t0 moving avg) |
| `src/main/translate/sessionManager.ts` | Forward latency events from both sessions to caller |
| `src/main/ipc/channels.ts` | New `LatencyMeasured` send channel; new `prefs:*` invoke channels |
| `src/main/ipc/handlers.ts` | Wire UserPrefsStore + latency emit |
| `src/main/preload.ts` | Expose new IPC methods on `window.rt` |
| `src/main/app.ts` | Two-window architecture (FloatingWidget + SetupView lazy); replace 4 `console.*` callsites with logger; extract OffscreenBridge |
| `src/renderer/state/store.ts` | Add latency, widget position; wire prefs hydration |
| `src/renderer/App.tsx` | Replace BidirectionalTestRig with FloatingWidget routing |
| `electron.vite.config.ts` | Add new HTML entries (floating-widget.html, setup-view.html) |
| `src/renderer/views/BidirectionalTestRig.tsx` | **Deleted** at end |

---

## Phase A — Foundation (Tasks 1-6)

### Task 1: Fix worklet bundle (P0 release blocker)

**Files:**
- Rename: `src/renderer/offscreen/workers/pcmEncoder.worklet.ts` → `src/renderer/offscreen/workers/pcmEncoder.worklet.js`
- Modify: `src/renderer/offscreen/webAudioBridge.ts` (line 32)

**Why:** Vite bundles `.worklet.ts` as inline data URL with TypeScript source. Production build crashes with `SyntaxError`. Solution: rename to `.js` (JSDoc types preserve type checking) and update import to use Vite's `?url` pattern, which produces a real asset URL pointing to a JS file.

- [ ] **Step 1: Rename and rewrite as JS with JSDoc**

Create `src/renderer/offscreen/workers/pcmEncoder.worklet.js` with the following content (and delete the `.ts` file):

```javascript
// @ts-check
// AudioWorklet that emits Float32 frames as messages.
// Resampling to 24kHz is handled by AudioContext sampleRate config.
//
// IMPORTANT: This file is .js (not .ts) because Vite's worklet bundling
// produces a data: URL with raw TypeScript source unless the file is
// already JS. AudioWorklet.addModule cannot evaluate TypeScript.
// Type-checked via @ts-check + JSDoc.

/**
 * @typedef {{ port: MessagePort }} AudioWorkletProcessorInstance
 * @typedef {new () => AudioWorkletProcessorInstance} AudioWorkletProcessorCtor
 */

class PcmEncoderProcessor extends AudioWorkletProcessor {
  /**
   * @param {Float32Array[][]} inputs
   * @returns {boolean}
   */
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;
    // Copy because the buffer is reused.
    const copy = new Float32Array(channel.length);
    copy.set(channel);
    this.port.postMessage(copy, [copy.buffer]);
    return true;
  }
}

registerProcessor('pcm-encoder', PcmEncoderProcessor);
```

```bash
# In Powershell:
Remove-Item src/renderer/offscreen/workers/pcmEncoder.worklet.ts
```

- [ ] **Step 2: Update import in webAudioBridge.ts**

Change line 32 of `src/renderer/offscreen/webAudioBridge.ts` from:

```typescript
await ctx.audioWorklet.addModule(new URL('./workers/pcmEncoder.worklet.ts', import.meta.url));
```

to:

```typescript
// Vite's ?url import produces a real asset URL pointing to a built JS file.
// Without ?url, Vite would inline the source (TypeScript) as a data: URI.
const workletUrl = (await import('./workers/pcmEncoder.worklet.js?url')).default;
await ctx.audioWorklet.addModule(workletUrl);
```

- [ ] **Step 3: Verify dev mode still works**

Run:
```bash
npm run dev
```

Expected: Electron window opens, BidirectionalTestRig renders. Capture mic from BidirectionalTestRig (don't need to click Start — just confirm no console errors about worklet at startup).

- [ ] **Step 4: Verify production build works**

Run:
```bash
npm run build
```

Expected: build completes without errors. Inspect `out/renderer/assets/` — there should be a file matching `pcmEncoder.worklet*.js`. Open `out/renderer/offscreen.html` (or its bundled equivalent) and confirm no inline `data:video/mp2t;base64,...` references to the worklet.

- [ ] **Step 5: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: all pass. 58 tests still passing.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/offscreen/workers/pcmEncoder.worklet.js src/renderer/offscreen/webAudioBridge.ts
git commit -m "Fix worklet bundling for production builds

Vite was inlining pcmEncoder.worklet.ts as a data: URL with raw
TypeScript, which works in dev (Vite middleware transpiles on the fly)
but crashes in production with SyntaxError because AudioWorklet cannot
evaluate TypeScript.

Rename to .js with @ts-check + JSDoc to preserve types, and switch the
import to Vite's ?url pattern which produces a real asset URL pointing
to a built JS file.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: UserPrefsStore + tests

**Files:**
- Create: `src/main/config/userPrefsStore.ts`
- Create: `tests/unit/userPrefsStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/userPrefsStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  UserPrefsStore,
  type FileSystem,
} from '@main/config/userPrefsStore';

class FakeFs implements FileSystem {
  files = new Map<string, Buffer>();
  readFile(path: string): Buffer | undefined {
    return this.files.get(path);
  }
  writeFile(path: string, data: Buffer): void {
    this.files.set(path, data);
  }
  exists(path: string): boolean {
    return this.files.has(path);
  }
}

describe('UserPrefsStore', () => {
  let fs: FakeFs;
  let store: UserPrefsStore;
  const path = 'C:/test/prefs.json';

  beforeEach(() => {
    fs = new FakeFs();
    store = new UserPrefsStore({ fs, prefsPath: path });
  });

  it('load() returns empty object when file does not exist', () => {
    expect(store.load()).toEqual({});
  });

  it('save and load() round-trips a partial prefs object', () => {
    store.save({ widgetPosition: { x: 100, y: 200 } });
    expect(store.load()).toEqual({ widgetPosition: { x: 100, y: 200 } });
  });

  it('save serializes as pretty JSON (human-readable)', () => {
    store.save({ widgetPosition: { x: 1, y: 2 } });
    const raw = fs.readFile(path)!.toString('utf8');
    expect(raw).toContain('\n'); // multi-line
    expect(raw).toContain('"widgetPosition"');
  });

  it('setWidgetPosition merges into existing prefs without losing other fields', () => {
    store.save({ languages: { source: 'pt', target: 'en' } });
    store.setWidgetPosition({ x: 50, y: 60 });
    expect(store.load()).toEqual({
      languages: { source: 'pt', target: 'en' },
      widgetPosition: { x: 50, y: 60 },
    });
  });

  it('setLanguages and setDevices merge similarly', () => {
    store.setWidgetPosition({ x: 10, y: 20 });
    store.setLanguages({ source: 'pt', target: 'en' });
    store.setDevices({ mic: 'mic-id', toMeet: 'a-id' });
    expect(store.load()).toEqual({
      widgetPosition: { x: 10, y: 20 },
      languages: { source: 'pt', target: 'en' },
      devices: { mic: 'mic-id', toMeet: 'a-id' },
    });
  });

  it('load() returns empty object when file is corrupt JSON (no throw)', () => {
    fs.writeFile(path, Buffer.from('{not valid json', 'utf8'));
    expect(store.load()).toEqual({});
  });

  it('load() returns empty object for empty file', () => {
    fs.writeFile(path, Buffer.alloc(0));
    expect(store.load()).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run tests/unit/userPrefsStore.test.ts
```

Expected: All 7 tests fail with import errors (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/main/config/userPrefsStore.ts`:

```typescript
import type { LanguageCode } from '../../shared/languages';

export interface FileSystem {
  readFile(path: string): Buffer | undefined;
  writeFile(path: string, data: Buffer): void;
  exists(path: string): boolean;
}

export interface WidgetPosition {
  x: number;
  y: number;
}

export interface DevicePrefs {
  mic?: string;
  toMeet?: string;
  fromMeet?: string;
  headset?: string;
}

export interface Languages {
  source: LanguageCode;
  target: LanguageCode;
}

export interface UserPrefs {
  widgetPosition?: WidgetPosition;
  languages?: Languages;
  devices?: DevicePrefs;
}

export interface UserPrefsStoreDeps {
  fs: FileSystem;
  prefsPath: string;
}

export class UserPrefsStore {
  constructor(private readonly deps: UserPrefsStoreDeps) {}

  load(): UserPrefs {
    if (!this.deps.fs.exists(this.deps.prefsPath)) return {};
    const raw = this.deps.fs.readFile(this.deps.prefsPath);
    if (!raw || raw.length === 0) return {};
    try {
      return JSON.parse(raw.toString('utf8')) as UserPrefs;
    } catch {
      // Corrupt prefs — start fresh. UI must remain resilient.
      return {};
    }
  }

  save(prefs: UserPrefs): void {
    const buf = Buffer.from(JSON.stringify(prefs, null, 2), 'utf8');
    this.deps.fs.writeFile(this.deps.prefsPath, buf);
  }

  setWidgetPosition(pos: WidgetPosition): void {
    const prefs = this.load();
    prefs.widgetPosition = pos;
    this.save(prefs);
  }

  setLanguages(langs: Languages): void {
    const prefs = this.load();
    prefs.languages = langs;
    this.save(prefs);
  }

  setDevices(devices: DevicePrefs): void {
    const prefs = this.load();
    prefs.devices = devices;
    this.save(prefs);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --run tests/unit/userPrefsStore.test.ts
```

Expected: 7/7 passing.

- [ ] **Step 5: typecheck + lint + full suite**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 65 tests passing (58 + 7 new).

- [ ] **Step 6: Commit**

```bash
git add src/main/config/userPrefsStore.ts tests/unit/userPrefsStore.test.ts
git commit -m "Add UserPrefsStore for plain-JSON prefs persistence

Stores widget position, language pair, and selected device IDs in
prefs.json (under app.getPath('userData')). Designed for resilience:
corrupt file or missing file = start fresh, never throw to caller.

Mirrors ConfigStore pattern (FileSystem dep injection); DI keeps it
testable without hitting real fs. Dropped the safeStorage layer since
device IDs are not secrets.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Logger wire-up — recursive sanitize + flush/close + JSONL file sink

**Files:**
- Modify: `src/main/util/logger.ts`
- Create: `src/main/util/jsonlSink.ts`
- Create: `tests/unit/jsonlSink.test.ts`
- Modify: `src/main/translate/openaiSession.ts` (replace `console.warn` × 3)
- Modify: `src/main/app.ts` (replace `console.error` × 1, instantiate logger)

**Why:** Spec §7 requires structured JSONL logs in `%APPDATA%/realtime-translate/logs/`. Existing `util/logger.ts` is dead code — never instantiated. Top-level field redaction in current sanitize misses nested `audio` keys (privacy leak). LogSink lacks flush/close (file handle leaks).

- [ ] **Step 1: Update logger.ts — recursive sanitize + flush/close in LogSink**

Replace `src/main/util/logger.ts` with:

```typescript
export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

const LEVEL_NAME: Record<LogLevel, string> = {
  [LogLevel.Debug]: 'debug',
  [LogLevel.Info]: 'info',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Error]: 'error',
};

export interface LogSink {
  write(line: string): void;
  /** Async flush of any buffered writes. Optional — sinks may write synchronously. */
  flush?(): Promise<void>;
  /** Best-effort teardown; called from app.before-quit. */
  close?(): Promise<void>;
}

export interface LoggerConfig {
  source: string;
  sink: LogSink;
  minLevel?: LogLevel;
}

export interface Logger {
  debug(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
}

const REDACTED_FIELDS = new Set(['audio', 'audio_delta', 'transcript', 'transcript_delta', 'delta']);
const MAX_DEPTH = 8;

function sanitize(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return '[max-depth]';
  if (value === null || typeof value !== 'object') return value;
  // Circular guard.
  if (seen.has(value as object)) return '[circular]';
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_FIELDS.has(k)) continue;
    out[k] = sanitize(v, depth + 1, seen);
  }
  return out;
}

function sanitizeData(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data) return undefined;
  return sanitize(data, 0, new WeakSet()) as Record<string, unknown>;
}

export function createLogger(config: LoggerConfig): Logger {
  const minLevel = config.minLevel ?? LogLevel.Debug;
  function emit(level: LogLevel, event: string, data?: Record<string, unknown>): void {
    if (level < minLevel) return;
    const payload = {
      ts: Date.now(),
      level: LEVEL_NAME[level],
      source: config.source,
      event,
      data: sanitizeData(data),
    };
    config.sink.write(JSON.stringify(payload));
  }
  return {
    debug: (e, d) => emit(LogLevel.Debug, e, d),
    info: (e, d) => emit(LogLevel.Info, e, d),
    warn: (e, d) => emit(LogLevel.Warn, e, d),
    error: (e, d) => emit(LogLevel.Error, e, d),
  };
}
```

- [ ] **Step 2: Add tests for recursive sanitize**

Create or update `tests/unit/logger.test.ts` (if no existing test for logger.ts, create new file). Add tests verifying nested redaction:

```typescript
import { describe, it, expect } from 'vitest';
import { createLogger, type LogSink } from '@main/util/logger';

class CapturingSink implements LogSink {
  lines: string[] = [];
  write(line: string): void {
    this.lines.push(line);
  }
}

describe('logger', () => {
  it('redacts top-level sensitive fields', () => {
    const sink = new CapturingSink();
    const log = createLogger({ source: 'test', sink });
    log.info('msg', { audio: 'big-base64', other: 'fine' });
    const parsed = JSON.parse(sink.lines[0]!);
    expect(parsed.data.audio).toBeUndefined();
    expect(parsed.data.other).toBe('fine');
  });

  it('redacts nested sensitive fields recursively', () => {
    const sink = new CapturingSink();
    const log = createLogger({ source: 'test', sink });
    log.info('msg', { event: { type: 'delta', audio: 'leak-me' } });
    const parsed = JSON.parse(sink.lines[0]!);
    expect(parsed.data.event.audio).toBeUndefined();
    expect(parsed.data.event.type).toBe('delta');
  });

  it('redacts sensitive fields inside arrays', () => {
    const sink = new CapturingSink();
    const log = createLogger({ source: 'test', sink });
    log.info('msg', { events: [{ audio: 'a' }, { audio: 'b' }] });
    const parsed = JSON.parse(sink.lines[0]!);
    expect(parsed.data.events[0].audio).toBeUndefined();
    expect(parsed.data.events[1].audio).toBeUndefined();
  });

  it('handles circular references without throwing', () => {
    const sink = new CapturingSink();
    const log = createLogger({ source: 'test', sink });
    const obj: Record<string, unknown> = { name: 'cycle' };
    obj.self = obj;
    expect(() => log.info('msg', { obj })).not.toThrow();
    const parsed = JSON.parse(sink.lines[0]!);
    expect(parsed.data.obj.name).toBe('cycle');
    expect(parsed.data.obj.self).toBe('[circular]');
  });

  it('caps depth at 8 with [max-depth] placeholder', () => {
    const sink = new CapturingSink();
    const log = createLogger({ source: 'test', sink });
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let deep: any = { value: 'leaf' };
    for (let i = 0; i < 12; i++) deep = { nested: deep };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    log.info('msg', { deep });
    const parsed = JSON.parse(sink.lines[0]!);
    // walk down — somewhere we expect [max-depth]
    const stringified = JSON.stringify(parsed);
    expect(stringified).toContain('[max-depth]');
  });
});
```

- [ ] **Step 3: Run logger tests**

```bash
npm test -- --run tests/unit/logger.test.ts
```

Expected: 5/5 passing.

- [ ] **Step 4: Create JsonlSink with rotation**

Create `src/main/util/jsonlSink.ts`:

```typescript
import { writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { LogSink } from './logger';

export interface JsonlSinkConfig {
  /** Directory holding session JSONL files (e.g., %APPDATA%/realtime-translate/logs). */
  logsDir: string;
  /** Session id — file name is `<sessionId>.jsonl`. Stable for app lifetime. */
  sessionId: string;
  /** Files older than this many days are deleted on construction. Default: 7. */
  retentionDays?: number;
}

/**
 * JSONL log sink — appends one JSON object per line to a session file.
 * Synchronous writes (like console.log); flush is a no-op since each
 * write hits disk immediately. close() removes anything older than
 * retentionDays.
 */
export class JsonlSink implements LogSink {
  private readonly filePath: string;
  private closed = false;

  constructor(private readonly cfg: JsonlSinkConfig) {
    if (!existsSync(cfg.logsDir)) mkdirSync(cfg.logsDir, { recursive: true });
    this.filePath = join(cfg.logsDir, `${cfg.sessionId}.jsonl`);
    // Touch the file so first write doesn't race with rotation.
    if (!existsSync(this.filePath)) writeFileSync(this.filePath, '');
    this.rotate(cfg.retentionDays ?? 7);
  }

  write(line: string): void {
    if (this.closed) return;
    appendFileSync(this.filePath, line + '\n');
  }

  async flush(): Promise<void> {
    /* synchronous appends — no buffer */
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  /** Delete files in logsDir older than `days`. */
  private rotate(days: number): void {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    for (const name of readdirSync(this.cfg.logsDir)) {
      if (!name.endsWith('.jsonl')) continue;
      const full = join(this.cfg.logsDir, name);
      if (full === this.filePath) continue; // never delete our active file
      try {
        if (statSync(full).mtimeMs < cutoff) unlinkSync(full);
      } catch {
        // best-effort
      }
    }
  }
}
```

- [ ] **Step 5: Test JsonlSink with mock fs (sufficient — real fs in smoke)**

Create `tests/unit/jsonlSink.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonlSink } from '@main/util/jsonlSink';

describe('JsonlSink', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rt-jsonl-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes lines as JSONL appended to the session file', () => {
    const sink = new JsonlSink({ logsDir: dir, sessionId: 'sess-1' });
    sink.write('{"a":1}');
    sink.write('{"b":2}');
    const content = readFileSync(join(dir, 'sess-1.jsonl'), 'utf8');
    expect(content).toBe('{"a":1}\n{"b":2}\n');
  });

  it('rotates files older than retentionDays', () => {
    const stale = join(dir, 'old-session.jsonl');
    writeFileSync(stale, '{"old":true}\n');
    // Force mtime to 10 days ago.
    const tenDaysAgo = (Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(stale, tenDaysAgo, tenDaysAgo);

    new JsonlSink({ logsDir: dir, sessionId: 'sess-new', retentionDays: 7 });

    expect(() => statSync(stale)).toThrow(); // deleted
    expect(() => statSync(join(dir, 'sess-new.jsonl'))).not.toThrow(); // current alive
  });

  it('does not rotate the active session file', () => {
    const sink = new JsonlSink({ logsDir: dir, sessionId: 'sess-now', retentionDays: 0 });
    sink.write('{"a":1}');
    expect(() => statSync(join(dir, 'sess-now.jsonl'))).not.toThrow();
  });

  it('write after close is a no-op', async () => {
    const sink = new JsonlSink({ logsDir: dir, sessionId: 's' });
    await sink.close();
    sink.write('{"x":1}');
    const content = readFileSync(join(dir, 's.jsonl'), 'utf8');
    expect(content).toBe('');
  });
});
```

- [ ] **Step 6: Run JsonlSink tests**

```bash
npm test -- --run tests/unit/jsonlSink.test.ts
```

Expected: 4/4 passing.

- [ ] **Step 7: Wire logger into OpenAISession**

In `src/main/translate/openaiSession.ts`, replace the 3 `console.warn` callsites with logger calls. The class needs an optional `Logger` dep; default to a no-op logger to keep the class testable.

Add to the top imports:

```typescript
import type { Logger } from '../util/logger';
```

In `OpenAISessionConfig`, add:

```typescript
  /** Optional logger; if absent, all warn/error events go nowhere. */
  logger?: Logger;
```

Replace each `console.warn` with `this.cfg.logger?.warn`. The exact replacements:

Line ~73-75 (overflow warn):
```typescript
// BEFORE:
// eslint-disable-next-line no-console
console.warn('OpenAISession: pending audio buffer overflow, dropping oldest');

// AFTER:
this.cfg.logger?.warn('pending_audio_overflow');
```

Line ~148-150 (malformed JSON):
```typescript
// BEFORE:
// eslint-disable-next-line no-console
console.warn('OpenAISession: malformed message ignored');

// AFTER:
this.cfg.logger?.warn('malformed_message_ignored');
```

(There's only one console.warn for malformed JSON — Step 7 totals 2 replacements in openaiSession.ts.)

Update `tests/unit/openaiSession.test.ts` overflow log test (line ~395+) to spy on a mock logger instead of `console.warn`. Replace the `warnSpy` with a mock logger. The test that uses `console.warn` for malformed JSON (around line 395) needs the same treatment.

```typescript
// Helper at top of describe:
const fakeLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

// In the overflow test (around line 444):
it('overflow log fires once per overflow event, not per chunk', () => {
  const logger = fakeLogger();
  const session = new OpenAISession({
    apiKey: 'sk', sourceLang: 'pt', targetLang: 'en', events,
    wsFactory: fakeFactory, logger,
  });
  session.start();
  for (let i = 0; i < 205; i++) session.appendAudio(`chunk-${i}`);
  expect(logger.warn).toHaveBeenCalledTimes(1);
  expect(logger.warn).toHaveBeenCalledWith('pending_audio_overflow');
});

// Update malformed-message test to assert logger.warn instead of console.warn.
```

- [ ] **Step 8: Wire logger into app.ts**

Replace the single `console.error` in `src/main/app.ts` (the `SessionManager.stop() failed during start-rejection cleanup` callsite). The logger is constructed at app startup; pass it down.

In `app.ts`, near the top of `app.whenReady().then(...)` add:

```typescript
import { createLogger, LogLevel, type Logger } from './util/logger';
import { JsonlSink } from './util/jsonlSink';

// ... inside app.whenReady().then(async () => { ...
const logsDir = join(app.getPath('userData'), 'logs');
const sessionId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const sink = new JsonlSink({ logsDir, sessionId });
const logger = createLogger({ source: 'main', sink, minLevel: LogLevel.Info });
```

Replace the `console.error` callsite (around line 230) with:

```typescript
logger.error('session_manager_stop_failed', {
  message: stopErr instanceof Error ? stopErr.message : String(stopErr),
});
```

When passing logger to OpenAISession via SessionManager, thread it through SessionManagerConfig too (see Task 5). For now, store `logger` as a module-level variable accessible by the IPC handlers closure.

Add `app.on('before-quit', async () => { await sink.close(); })` near the bottom of `app.ts`.

- [ ] **Step 9: Run full suite**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: all passing including the updated openaiSession overflow + malformed tests.

- [ ] **Step 10: Commit**

```bash
git add src/main/util/logger.ts src/main/util/jsonlSink.ts tests/unit/logger.test.ts tests/unit/jsonlSink.test.ts src/main/translate/openaiSession.ts tests/unit/openaiSession.test.ts src/main/app.ts
git commit -m "Wire structured JSONL logger across main process

Activates the dead util/logger.ts:
- Recursive sanitize across nested objects and arrays (closes a privacy
  hole where {event: {audio: ...}} would leak audio data)
- WeakSet circular guard, MAX_DEPTH=8 with [max-depth] placeholder
- LogSink contract gains optional flush/close (defensive cleanup)
- JsonlSink writes to %APPDATA%/realtime-translate/logs/<sessionId>.jsonl
- 7-day retention rotation runs on construction, never touches the
  active session file

Replaces 4 console.warn/error callsites in openaiSession.ts and app.ts
with structured logger.warn/error events. OpenAISession accepts an
optional logger via config (no-op by default to keep tests cheap).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Latency measurement in OpenAISession

**Files:**
- Modify: `src/main/translate/openaiSession.ts`
- Modify: `tests/unit/openaiSession.test.ts`

**Why:** Spec §5 says UI shows `t1 - t0` (moving avg of last 5 turns). t0 = first chunk sent after VAD detected end of speech; t1 = first `output_audio.delta` received for that turn. OpenAISession is the only component with visibility into both.

**Approach:** Track a single "turn" — from first appendAudio after a `output_audio.delta` boundary until the next `output_audio.delta`. Maintain a ring buffer of 5 most recent latencies. Emit average via new `onLatencyMeasured` event after each completed turn.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/openaiSession.test.ts`:

```typescript
it('measures and emits latency: t1 - t0 average over last 5 turns', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-08T00:00:00Z'));
  try {
    const onLatency = vi.fn();
    const session = new OpenAISession({
      apiKey: 'sk', sourceLang: 'pt', targetLang: 'en',
      events: { ...events, onLatencyMeasured: onLatency },
      wsFactory: fakeFactory,
    });
    session.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();

    // Turn 1: send audio at t=0, receive delta at t=1500ms
    session.appendAudio('chunk-1');
    vi.advanceTimersByTime(1500);
    ws.simulateMessage({ type: 'session.output_audio.delta', delta: 'reply-1' });

    // Turn 1 complete — average of [1500] = 1500
    expect(onLatency).toHaveBeenLastCalledWith({ averageMs: 1500, sampleCount: 1 });

    // Turn 2: send at +500ms, receive at +2000ms (turn duration 1500ms)
    vi.advanceTimersByTime(500);
    session.appendAudio('chunk-2');
    vi.advanceTimersByTime(1500);
    ws.simulateMessage({ type: 'session.output_audio.delta', delta: 'reply-2' });

    expect(onLatency).toHaveBeenLastCalledWith({ averageMs: 1500, sampleCount: 2 });

    // Turn 3-7: vary durations to verify ring buffer of 5
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(100);
      session.appendAudio(`chunk-extra-${i}`);
      vi.advanceTimersByTime(1000 + i * 200); // 1000, 1200, 1400, 1600, 1800
      ws.simulateMessage({ type: 'session.output_audio.delta', delta: `reply-extra-${i}` });
    }

    // Last 5 turns: 1500 (turn 2), 1000, 1200, 1400, 1600
    // Wait — that's 5 turns. Average = (1500 + 1000 + 1200 + 1400 + 1600) / 5 = 1340
    const lastCall = onLatency.mock.calls.at(-1)![0];
    expect(lastCall.sampleCount).toBe(5);
    expect(lastCall.averageMs).toBe(1340);
  } finally {
    vi.useRealTimers();
  }
});

it('does not emit latency for deltas without a preceding appendAudio', () => {
  // Edge: server might send deltas before any audio (warmup ping). Don't crash.
  const onLatency = vi.fn();
  const session = new OpenAISession({
    apiKey: 'sk', sourceLang: 'pt', targetLang: 'en',
    events: { ...events, onLatencyMeasured: onLatency },
    wsFactory: fakeFactory,
  });
  session.start();
  const ws = FakeWebSocket.instances[0]!;
  ws.simulateOpen();
  ws.simulateMessage({ type: 'session.output_audio.delta', delta: 'unsolicited' });
  expect(onLatency).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run tests/unit/openaiSession.test.ts
```

Expected: 2 new tests fail with type errors / undefined behavior.

- [ ] **Step 3: Add latency state + emission to OpenAISession**

Modify `src/main/translate/openaiSession.ts`:

Add to `SessionEvents` interface:

```typescript
export interface SessionEvents {
  onState: (s: SessionState) => void;
  onAudio: (base64: string) => void;
  onTranscript: (t: { kind: 'input' | 'output'; text: string }) => void;
  /** Optional: emitted after each turn (audio sent → delta received). */
  onLatencyMeasured?: (m: { averageMs: number; sampleCount: number }) => void;
}
```

Add to the `OpenAISession` class private fields:

```typescript
/** Timestamp of first chunk after the last received delta (start of current turn). */
private turnStartMs: number | undefined;
/** Ring buffer of the most recent turn latencies, max 5. */
private readonly recentLatenciesMs: number[] = [];
```

In `appendAudio`, after the `if (!this.isOpen)` early return, when sending audio for real, mark turn start:

```typescript
appendAudio(base64: string): void {
  if (!this.isOpen) {
    // ... existing buffer logic ...
    return;
  }
  // Mark t0 of the current turn — only if we don't already have one in flight.
  // Reset happens when handleMessage receives output_audio.delta.
  if (this.turnStartMs === undefined) {
    this.turnStartMs = Date.now();
  }
  this.sendRaw({ type: 'session.input_audio_buffer.append', audio: base64 });
}
```

In `handleMessage`, when `output_audio.delta` is received, compute and emit latency:

```typescript
if (event.type === 'session.output_audio.delta' && event.delta) {
  // Latency measurement: t1 - t0 for this turn.
  if (this.turnStartMs !== undefined) {
    const latency = Date.now() - this.turnStartMs;
    this.recentLatenciesMs.push(latency);
    if (this.recentLatenciesMs.length > 5) this.recentLatenciesMs.shift();
    const sum = this.recentLatenciesMs.reduce((a, b) => a + b, 0);
    const average = Math.round(sum / this.recentLatenciesMs.length);
    this.cfg.events.onLatencyMeasured?.({
      averageMs: average,
      sampleCount: this.recentLatenciesMs.length,
    });
    this.turnStartMs = undefined; // ready to start next turn on next appendAudio
  }
  this.cfg.events.onAudio(event.delta);
}
```

Reset `recentLatenciesMs` and `turnStartMs` on `start()`:

```typescript
start(): void {
  // ... existing resets ...
  this.recentLatenciesMs.length = 0;
  this.turnStartMs = undefined;
  this.connect();
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run tests/unit/openaiSession.test.ts
```

Expected: 20/20 passing.

- [ ] **Step 5: Run full suite**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add src/main/translate/openaiSession.ts tests/unit/openaiSession.test.ts
git commit -m "Measure latency in OpenAISession (t1 - t0 moving avg)

Per spec §5: track turn start (first appendAudio since last delta) to
turn end (first output_audio.delta). Emit average over last 5 turns
via new optional onLatencyMeasured event.

Edge cases covered:
- Unsolicited delta with no preceding audio: no emit, no crash
- Reset on start() (no leak across pause/resume)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Latency event propagation — SessionManager + IPC + store

**Files:**
- Modify: `src/main/translate/sessionManager.ts`
- Modify: `src/shared/events.ts`
- Modify: `src/main/ipc/channels.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/app.ts`
- Modify: `src/renderer/state/store.ts`

- [ ] **Step 1: Add IPC channel constant**

Modify `src/shared/events.ts`:

```typescript
export const IPC = {
  // ... existing entries ...

  // Main → Renderer (send)
  DirectionalStateChanged: 'session:directionalStateChanged',
  TranscriptDelta: 'transcript:delta',
  LatencyMeasured: 'session:latencyMeasured', // NEW
} as const;
```

- [ ] **Step 2: Add IPC type to channels.ts**

Modify `src/main/ipc/channels.ts`:

```typescript
import { IPC } from '../../shared/events';
import type { BidirectionalArgs, DeviceInventory, Direction, DirectionalState } from '../../shared/types';

// ... existing types ...

export interface IpcSendMap {
  [IPC.DirectionalStateChanged]: DirectionalState;
  [IPC.TranscriptDelta]: { direction: 'A' | 'B'; kind: 'input' | 'output'; text: string };
  [IPC.LatencyMeasured]: { direction: Direction; averageMs: number; sampleCount: number };
}
```

- [ ] **Step 3: Add SessionManagerConfig.onLatencyMeasured**

Modify `src/main/translate/sessionManager.ts`:

In `SessionManagerConfig`, add:

```typescript
onLatencyMeasured: (m: { direction: Direction; averageMs: number; sampleCount: number }) => void;
```

Inside `buildDirection`, add to `events` object:

```typescript
events: {
  onState: (s) => this.cfg.onDirectionalState({ direction, state: s }),
  onAudio: (b64) => pipelineRef?.handleSessionAudio(b64),
  onTranscript: (t) =>
    this.cfg.onTranscript({ direction, kind: t.kind, text: t.text }),
  onLatencyMeasured: (m) =>
    this.cfg.onLatencyMeasured({ direction, ...m }),
},
```

- [ ] **Step 4: Wire emit in app.ts**

In `src/main/app.ts`, where `emitTranscript` and `emitDirectionalState` are defined, add a sibling. At this point in the plan `mainWindow` is still the variable name (Task 7 renames it to `floatingWidget`):

```typescript
const emitLatency = (m: { direction: Direction; averageMs: number; sampleCount: number }): void => {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(IPC.LatencyMeasured, m);
  }
};
```

Add `Direction` to the type imports at the top of `app.ts`:

```typescript
import type {
  DeviceInventory, DeviceSummary, Direction, DirectionalState,
} from '../shared/types';
```

Pass `onLatencyMeasured: emitLatency` into the `SessionManager` config in the `onStart` handler (in the `new SessionManager({...})` call near line 207).

- [ ] **Step 5: Add to preload.ts**

In `src/main/preload.ts`, append a new method to `api`:

```typescript
onLatency: (cb: (m: IpcSendMap[typeof IPC.LatencyMeasured]) => void): (() => void) => {
  const handler = (_evt: unknown, m: IpcSendMap[typeof IPC.LatencyMeasured]): void => cb(m);
  ipcRenderer.on(IPC.LatencyMeasured, handler);
  return (): void => {
    ipcRenderer.off(IPC.LatencyMeasured, handler);
  };
},
```

- [ ] **Step 6: Add latency to store.ts**

Modify `src/renderer/state/store.ts`:

```typescript
interface AppState {
  // ... existing fields ...
  latencyMs: { A: number | undefined; B: number | undefined };

  // ... existing setters ...
  setLatency(direction: Direction, averageMs: number): void;
}

// initial state:
latencyMs: { A: undefined, B: undefined },

// new setter:
setLatency: (direction, averageMs) =>
  set((s) => ({
    ...s,
    latencyMs: { ...s.latencyMs, [direction]: averageMs },
  })),
```

- [ ] **Step 7: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: all passing. SessionManager tests need an `onLatencyMeasured: vi.fn()` added to their config (search for `onTranscript: vi.fn()` and add the new line below).

- [ ] **Step 8: Commit**

```bash
git add src/shared/events.ts src/main/ipc/channels.ts src/main/translate/sessionManager.ts src/main/app.ts src/main/preload.ts src/renderer/state/store.ts tests
git commit -m "Propagate latency events from OpenAISession to renderer

SessionManager forwards per-direction latency from each OpenAISession
to a new onLatencyMeasured callback, which app.ts surfaces via IPC
channel session:latencyMeasured. Renderer subscribes via window.rt.onLatency
and stores per-direction averageMs in Zustand.

The widget's LatencyMeter (Task 9) reads from this store.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: prefs IPC + store hydration

**Files:**
- Modify: `src/shared/events.ts`
- Modify: `src/main/ipc/channels.ts`
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/state/store.ts`

**Why:** Renderer needs to read prefs at startup (rehydrate selected devices, languages, widget position) and write back on changes.

- [ ] **Step 1: Add IPC channels**

Modify `src/shared/events.ts`:

```typescript
export const IPC = {
  // ...

  // Prefs
  PrefsLoad: 'prefs:load',
  PrefsSetWidgetPosition: 'prefs:setWidgetPosition',
  PrefsSetLanguages: 'prefs:setLanguages',
  PrefsSetDevices: 'prefs:setDevices',
} as const;
```

- [ ] **Step 2: Add IPC types**

Modify `src/main/ipc/channels.ts`:

```typescript
import type {
  UserPrefs, WidgetPosition, Languages, DevicePrefs,
} from '../config/userPrefsStore';

export interface IpcInvokeMap {
  // ... existing ...
  [IPC.PrefsLoad]: { args: void; result: UserPrefs };
  [IPC.PrefsSetWidgetPosition]: { args: WidgetPosition; result: void };
  [IPC.PrefsSetLanguages]: { args: Languages; result: void };
  [IPC.PrefsSetDevices]: { args: DevicePrefs; result: void };
}
```

- [ ] **Step 3: Wire UserPrefsStore in handlers.ts**

Modify `src/main/ipc/handlers.ts`:

In imports add:

```typescript
import { UserPrefsStore } from '../config/userPrefsStore';
```

In `registerIpcHandlers`, before the existing handles:

```typescript
const prefsPath = join(app.getPath('userData'), 'prefs.json');
const prefsStore = new UserPrefsStore({
  fs: {
    readFile: (p) => (existsSync(p) ? readFileSync(p) : undefined),
    writeFile: (p, d) => writeFileSync(p, d),
    exists: (p) => existsSync(p),
  },
  prefsPath,
});

handle(IPC.PrefsLoad, () => prefsStore.load());
handle(IPC.PrefsSetWidgetPosition, (_e, pos) => prefsStore.setWidgetPosition(pos));
handle(IPC.PrefsSetLanguages, (_e, langs) => prefsStore.setLanguages(langs));
handle(IPC.PrefsSetDevices, (_e, devices) => prefsStore.setDevices(devices));
```

Update `registerIpcHandlers` return value to include `prefsStore`:

```typescript
export function registerIpcHandlers(deps: HandlerDeps): {
  configStore: ConfigStore;
  prefsStore: UserPrefsStore;
} {
  // ...
  return { configStore, prefsStore };
}
```

(Caller in `app.ts` uses `prefsStore` for first-launch routing — see Task 13.)

- [ ] **Step 4: Add API methods to preload.ts**

In `src/main/preload.ts`, append:

```typescript
loadPrefs: (): Promise<IpcInvokeMap[typeof IPC.PrefsLoad]['result']> =>
  ipcRenderer.invoke(IPC.PrefsLoad),
saveWidgetPosition: (
  pos: IpcInvokeMap[typeof IPC.PrefsSetWidgetPosition]['args'],
): Promise<void> => ipcRenderer.invoke(IPC.PrefsSetWidgetPosition, pos),
saveLanguages: (
  langs: IpcInvokeMap[typeof IPC.PrefsSetLanguages]['args'],
): Promise<void> => ipcRenderer.invoke(IPC.PrefsSetLanguages, langs),
saveDevices: (
  devices: IpcInvokeMap[typeof IPC.PrefsSetDevices]['args'],
): Promise<void> => ipcRenderer.invoke(IPC.PrefsSetDevices, devices),
```

- [ ] **Step 5: Hydrate store on bootstrap**

Modify `src/renderer/state/store.ts`:

Add a `hydrate()` method:

```typescript
interface AppState {
  // ... existing fields ...
  hydrated: boolean;
  hydrate(): Promise<void>;
}

// implementation:
hydrated: false,
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
```

Persistence on changes happens in setters that have a side effect — extend setters to write back:

```typescript
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
  void persistDevices();
},
// ... and analogous for the 3 other selectedX setters
```

Add a helper at top of store file:

```typescript
function persistDevices(): void {
  const s = useStore.getState();
  void window.rt.saveDevices({
    mic: s.selectedMic,
    toMeet: s.selectedToMeet,
    fromMeet: s.selectedFromMeet,
    headset: s.selectedHeadset,
  });
}
```

- [ ] **Step 6: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add src/shared/events.ts src/main/ipc/channels.ts src/main/ipc/handlers.ts src/main/preload.ts src/renderer/state/store.ts
git commit -m "Wire UserPrefsStore through IPC; hydrate Zustand on startup

New IPC channels for prefs:load + prefs:set{WidgetPosition,Languages,Devices}.
Store gains hydrate() that calls loadPrefs once at bootstrap and reflects
changes back via the new setters (debounce-free for now — saves are
small JSON writes, and the calling sites are user actions, not high-rate
events. Widget-position drag will need debouncing per Task 11).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase B — FloatingWidget UI (Tasks 7-12)

### Task 7: Two-window architecture

**Files:**
- Modify: `electron.vite.config.ts`
- Create: `src/renderer/floating-widget.html`
- Create: `src/renderer/setup-view.html`
- Create: `src/renderer/floating-main.tsx`
- Create: `src/renderer/setup-main.tsx`
- Create: `src/renderer/views/SetupViewStub.tsx`
- Modify: `src/main/app.ts`

**Why:** Spec requires two BrowserWindows (FloatingWidget always-on-top + SetupView lazy). Need separate HTML entries for each.

- [ ] **Step 1: Add HTML entries to vite config**

Modify `electron.vite.config.ts`:

```typescript
renderer: {
  // ...
  build: {
    outDir: 'out/renderer',
    rollupOptions: {
      input: {
        index: resolve('src/renderer/index.html'),
        offscreen: resolve('src/renderer/offscreen.html'),
        floatingWidget: resolve('src/renderer/floating-widget.html'),
        setupView: resolve('src/renderer/setup-view.html'),
      }
    }
  },
  // ...
}
```

- [ ] **Step 2: Create floating-widget.html**

Create `src/renderer/floating-widget.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Realtime Translate</title>
  <link rel="stylesheet" href="./styles/widget.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./floating-main.tsx"></script>
</body>
</html>
```

- [ ] **Step 3: Create setup-view.html**

Create `src/renderer/setup-view.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Realtime Translate · Setup</title>
  <link rel="stylesheet" href="./styles/tokens.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./setup-main.tsx"></script>
</body>
</html>
```

- [ ] **Step 4: Create floating-main.tsx and setup-main.tsx**

Create `src/renderer/floating-main.tsx`:

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FloatingWidget } from './views/FloatingWidget';

const container = document.getElementById('root');
if (!container) throw new Error('root not found');
createRoot(container).render(
  <StrictMode>
    <FloatingWidget />
  </StrictMode>,
);
```

Create `src/renderer/setup-main.tsx`:

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SetupViewStub } from './views/SetupViewStub';

const container = document.getElementById('root');
if (!container) throw new Error('root not found');
createRoot(container).render(
  <StrictMode>
    <SetupViewStub />
  </StrictMode>,
);
```

- [ ] **Step 5: Create SetupViewStub**

Create `src/renderer/views/SetupViewStub.tsx`:

```typescript
import type { JSX } from 'react';

/**
 * Placeholder until the full SetupView spec lands. Reuses BidirectionalTestRig
 * to keep the user productive (set API key, pick devices, smoke test).
 */
import { BidirectionalTestRig } from './BidirectionalTestRig';

export function SetupViewStub(): JSX.Element {
  return <BidirectionalTestRig />;
}
```

(BidirectionalTestRig stays alive until Task 12 deletes it. Until SetupView spec lands, it serves as the "setup" surface.)

- [ ] **Step 6: Create FloatingWidget skeleton**

Create `src/renderer/views/FloatingWidget.tsx` (just a placeholder for now — Task 9 fills it in):

```typescript
import type { JSX } from 'react';

export function FloatingWidget(): JSX.Element {
  return <div className="floating-widget-placeholder">Bar placeholder (Task 9)</div>;
}
```

- [ ] **Step 7: Create widget.css**

Create `src/renderer/styles/widget.css` with imports:

```css
@import './tokens.css';

html, body, #root {
  background: transparent;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

.floating-widget-placeholder {
  background: rgba(28, 30, 36, 0.78);
  -webkit-backdrop-filter: blur(40px) saturate(140%);
  backdrop-filter: blur(40px) saturate(140%);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 8px 12px;
  font-size: 12px;
  width: max-content;
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
}
```

- [ ] **Step 8: Wire two windows in app.ts**

Modify `src/main/app.ts`:

Replace the single `mainWindow` declaration with `floatingWidget` and `setupView` (lazy):

```typescript
let floatingWidget: BrowserWindow | null = null;
let setupView: BrowserWindow | null = null;
let offscreenWindow: BrowserWindow | null = null;
```

Replace `RENDERER_URL` with two URL constants:

```typescript
const FLOATING_WIDGET_URL = DEV_BASE
  ? `${DEV_BASE.replace(/\/$/, '')}/floating-widget.html`
  : `file://${resolve(__dirname, '../renderer/floating-widget.html')}`;
const SETUP_VIEW_URL = DEV_BASE
  ? `${DEV_BASE.replace(/\/$/, '')}/setup-view.html`
  : `file://${resolve(__dirname, '../renderer/setup-view.html')}`;
```

Add a `createSetupView` helper (lazy):

```typescript
async function createSetupView(): Promise<BrowserWindow> {
  if (setupView && !setupView.isDestroyed()) {
    setupView.focus();
    return setupView;
  }
  setupView = new BrowserWindow({
    width: 720,
    height: 640,
    backgroundColor: '#08090a',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupView.on('closed', () => { setupView = null; });
  await setupView.loadURL(SETUP_VIEW_URL);
  return setupView;
}
```

Replace `createWindows` with:

```typescript
async function createWindows(): Promise<void> {
  offscreenWindow = new BrowserWindow({
    width: 1, height: 1, show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/offscreenPreload.cjs'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  await offscreenWindow.loadURL(OFFSCREEN_URL);

  floatingWidget = new BrowserWindow({
    width: 480,
    height: 40,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  floatingWidget.setAlwaysOnTop(true, 'screen-saver');
  await floatingWidget.loadURL(FLOATING_WIDGET_URL);
}
```

Update `emitDirectionalState`, `emitTranscript`, `emitLatency` to target `floatingWidget` instead of `mainWindow`. Drop the `mainWindow` variable entirely.

Add a new IPC handler so renderer can request opening SetupView:

In `src/shared/events.ts`:
```typescript
OpenSetupView: 'window:openSetupView',
```

In `src/main/ipc/channels.ts`:
```typescript
[IPC.OpenSetupView]: { args: void; result: void };
```

In `src/main/ipc/handlers.ts`, add this to the `HandlerDeps`:
```typescript
openSetupView: () => Promise<void>;
```
And:
```typescript
handle(IPC.OpenSetupView, () => deps.openSetupView());
```

In `src/main/app.ts`, pass it:
```typescript
const { configStore, prefsStore } = registerIpcHandlers({
  // ... existing onStart, onStop, listDevices ...
  openSetupView: async () => { await createSetupView(); },
});
```

In `src/main/preload.ts`:
```typescript
openSetupView: (): Promise<void> => ipcRenderer.invoke(IPC.OpenSetupView),
```

- [ ] **Step 9: Verify dev mode**

```bash
npm run dev
```

Expected: floating-widget.html opens as a small frameless transparent always-on-top bar with the placeholder text. SetupView is NOT open by default. Window should sit floating, draggable later.

You may see the BidirectionalTestRig appear if any IPC accidentally points there — that's a Task 13 cleanup. For now, only verify the FloatingWidget window appears.

- [ ] **Step 10: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: all passing.

- [ ] **Step 11: Commit**

```bash
git add electron.vite.config.ts src/renderer/floating-widget.html src/renderer/setup-view.html src/renderer/floating-main.tsx src/renderer/setup-main.tsx src/renderer/views/FloatingWidget.tsx src/renderer/views/SetupViewStub.tsx src/renderer/styles/widget.css src/shared/events.ts src/main/ipc/channels.ts src/main/ipc/handlers.ts src/main/preload.ts src/main/app.ts
git commit -m "Set up two-window architecture (FloatingWidget + lazy SetupView)

New BrowserWindow config:
- FloatingWidget: 480x40, frameless, transparent, alwaysOnTop:screen-saver,
  skipTaskbar, hasShadow:false. Loads floating-widget.html.
- SetupView: 720x640, frame normal, lazy-created via window:openSetupView
  IPC. Reuses BidirectionalTestRig as a stub until SetupView spec lands.

Vite config gains two new HTML entries (floating-widget.html, setup-view.html).
preload.ts re-used for both windows; offscreen window unchanged.

FloatingWidget body is a placeholder; Task 9 implements the real bar.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: Aggregate state selector (TDD)

**Files:**
- Create: `src/renderer/state/aggregateState.ts`
- Create: `tests/unit/aggregateState.test.ts`

**Why:** Bar shows ONE visual state, derived from (stateA, stateB). Spec §6 transitions table specifies the hierarchy: error > reconnecting > connecting > active > idle.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/aggregateState.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { selectAggregateState, type BarState } from '@renderer/state/aggregateState';
import type { SessionState } from '@shared/types';

const idle: SessionState = { kind: 'idle' };
const connecting: SessionState = { kind: 'connecting' };
const active: SessionState = { kind: 'active', sinceMs: 0 };
const reconnecting1: SessionState = { kind: 'reconnecting', attempt: 1 };
const reconnecting2: SessionState = { kind: 'reconnecting', attempt: 2 };
const error: SessionState = { kind: 'error', message: 'bad' };

describe('selectAggregateState', () => {
  it('both idle → idle', () => {
    expect(selectAggregateState(idle, idle)).toEqual<BarState>({ kind: 'idle' });
  });

  it('any error → error (carries message from first error direction)', () => {
    expect(selectAggregateState(error, active)).toEqual<BarState>({
      kind: 'error',
      message: 'bad',
      origin: 'A',
    });
    expect(selectAggregateState(active, error)).toEqual<BarState>({
      kind: 'error',
      message: 'bad',
      origin: 'B',
    });
  });

  it('any reconnecting (without error) → reconnecting (carries attempt + origin of the worst direction)', () => {
    expect(selectAggregateState(reconnecting1, active)).toEqual<BarState>({
      kind: 'reconnecting',
      attempt: 1,
      origin: 'A',
    });
    expect(selectAggregateState(active, reconnecting2)).toEqual<BarState>({
      kind: 'reconnecting',
      attempt: 2,
      origin: 'B',
    });
    // Both reconnecting → pick the one with higher attempt count (worst).
    expect(selectAggregateState(reconnecting1, reconnecting2)).toEqual<BarState>({
      kind: 'reconnecting',
      attempt: 2,
      origin: 'B',
    });
  });

  it('connecting + idle/active → connecting', () => {
    expect(selectAggregateState(connecting, idle)).toEqual<BarState>({ kind: 'connecting' });
    expect(selectAggregateState(active, connecting)).toEqual<BarState>({ kind: 'connecting' });
  });

  it('both active → active', () => {
    expect(selectAggregateState(active, active)).toEqual<BarState>({ kind: 'active' });
  });

  it('idle + active → active (one direction running is enough)', () => {
    expect(selectAggregateState(idle, active)).toEqual<BarState>({ kind: 'active' });
    expect(selectAggregateState(active, idle)).toEqual<BarState>({ kind: 'active' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run tests/unit/aggregateState.test.ts
```

Expected: All tests fail (module not found).

- [ ] **Step 3: Write the selector**

Create `src/renderer/state/aggregateState.ts`:

```typescript
import type { Direction, SessionState } from '../../shared/types';

export type BarState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'active' }
  | { kind: 'reconnecting'; attempt: number; origin: Direction }
  | { kind: 'error'; message: string; origin: Direction };

/** Hierarchy: error > reconnecting > connecting > active > idle.
 *  Mixed states (one active, one connecting) → take the worse one. */
export function selectAggregateState(a: SessionState, b: SessionState): BarState {
  // 1. Error wins.
  if (a.kind === 'error') return { kind: 'error', message: a.message, origin: 'A' };
  if (b.kind === 'error') return { kind: 'error', message: b.message, origin: 'B' };

  // 2. Reconnecting wins next; pick the worse (higher attempt count).
  if (a.kind === 'reconnecting' && b.kind === 'reconnecting') {
    return a.attempt >= b.attempt
      ? { kind: 'reconnecting', attempt: a.attempt, origin: 'A' }
      : { kind: 'reconnecting', attempt: b.attempt, origin: 'B' };
  }
  if (a.kind === 'reconnecting') return { kind: 'reconnecting', attempt: a.attempt, origin: 'A' };
  if (b.kind === 'reconnecting') return { kind: 'reconnecting', attempt: b.attempt, origin: 'B' };

  // 3. Connecting next.
  if (a.kind === 'connecting' || b.kind === 'connecting') return { kind: 'connecting' };

  // 4. Active if either is active.
  if (a.kind === 'active' || b.kind === 'active') return { kind: 'active' };

  // 5. Both idle.
  return { kind: 'idle' };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run tests/unit/aggregateState.test.ts
```

Expected: 6/6 passing.

- [ ] **Step 5: Run full suite**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/state/aggregateState.ts tests/unit/aggregateState.test.ts
git commit -m "Add selectAggregateState — reduce 2 SessionStates to 1 BarState

Hierarchy: error > reconnecting > connecting > active > idle (per spec
§6.6 transitions table). When both directions are reconnecting, the
one with higher attempt count wins (its progress is the bar's headline).
Origin is preserved so the bar can show 'A: tentativa 2' vs 'B: ...'.

Pure function, no side effects. Used by FloatingWidget on every
render to derive what the bar should look like.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: FloatingWidget bar — components + 5 visual states

**Files:**
- Modify: `src/renderer/views/FloatingWidget.tsx`
- Create: `src/renderer/components/Orb.tsx`
- Create: `src/renderer/components/Waveform.tsx`
- Create: `src/renderer/components/LanguagePair.tsx`
- Create: `src/renderer/components/LatencyMeter.tsx`
- Create: `src/renderer/components/ActionButton.tsx`
- Create: `src/renderer/components/SettingsButton.tsx`
- Modify: `src/renderer/styles/widget.css`

**Why:** This is the visual delivery of the design spec.

- [ ] **Step 1: Build the components (each file matches the spec)**

Create `src/renderer/components/Orb.tsx`:

```typescript
import type { JSX } from 'react';
import type { BarState } from '../state/aggregateState';

export function Orb({ state }: { state: BarState['kind'] }): JSX.Element {
  return <div className={`rt-orb rt-orb--${state}`} />;
}
```

Create `src/renderer/components/Waveform.tsx`:

```typescript
import type { JSX } from 'react';

export function Waveform(): JSX.Element {
  return (
    <div className="rt-wf">
      <div className="rt-wf__bar" />
      <div className="rt-wf__bar" />
      <div className="rt-wf__bar" />
      <div className="rt-wf__bar" />
      <div className="rt-wf__bar" />
    </div>
  );
}
```

Create `src/renderer/components/LanguagePair.tsx`:

```typescript
import type { JSX } from 'react';
import type { LanguageCode } from '../../shared/languages';

export function LanguagePair({
  source,
  target,
  onClick,
}: {
  source: LanguageCode;
  target: LanguageCode;
  onClick: () => void;
}): JSX.Element {
  return (
    <button className="rt-pair" onClick={onClick}>
      {source.toUpperCase()}
      <span className="rt-pair__arr">↔</span>
      {target.toUpperCase()}
    </button>
  );
}
```

Create `src/renderer/components/LatencyMeter.tsx`:

```typescript
import type { JSX } from 'react';

export function LatencyMeter({ ms }: { ms: number | undefined }): JSX.Element | null {
  if (ms === undefined) return null;
  const seconds = (ms / 1000).toFixed(1);
  return <span className="rt-lat">{seconds}s</span>;
}
```

Create `src/renderer/components/ActionButton.tsx`:

```typescript
import type { JSX } from 'react';
import type { BarState } from '../state/aggregateState';

export function ActionButton({
  state,
  onClick,
}: {
  state: BarState['kind'];
  onClick: () => void;
}): JSX.Element {
  // ▶ for idle, ⏸ for active/connecting/reconnecting, ↻ for error.
  const isPlay = state === 'idle';
  const isRetry = state === 'error';
  const title = isPlay ? 'Iniciar' : isRetry ? 'Tentar novamente' : 'Pausar';
  return (
    <button
      className={`rt-action${isRetry ? ' rt-action--retry' : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {isPlay && (
        <svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4" /></svg>
      )}
      {!isPlay && !isRetry && (
        <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
      )}
      {isRetry && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      )}
    </button>
  );
}
```

Create `src/renderer/components/SettingsButton.tsx`:

```typescript
import type { JSX } from 'react';

export function SettingsButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button className="rt-gear" onClick={onClick} title="Configurações" aria-label="Configurações">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Replace FloatingWidget skeleton with full bar**

Replace `src/renderer/views/FloatingWidget.tsx`:

```typescript
import { useEffect, type JSX } from 'react';
import { useStore } from '../state/store';
import { rt } from '../ipc/client';
import { selectAggregateState } from '../state/aggregateState';
import { Orb } from '../components/Orb';
import { Waveform } from '../components/Waveform';
import { LanguagePair } from '../components/LanguagePair';
import { LatencyMeter } from '../components/LatencyMeter';
import { ActionButton } from '../components/ActionButton';
import { SettingsButton } from '../components/SettingsButton';

export function FloatingWidget(): JSX.Element {
  const {
    sourceLang, targetLang,
    selectedMic, selectedToMeet, selectedFromMeet, selectedHeadset,
    stateA, stateB, latencyMs,
    setDirectionState, setLatency, hydrate,
  } = useStore();

  useEffect(() => {
    void hydrate();
    const offState = rt.onDirectionalState(({ direction, state }) =>
      setDirectionState(direction, state),
    );
    const offLat = rt.onLatency(({ direction, averageMs }) =>
      setLatency(direction, averageMs),
    );
    return (): void => {
      offState();
      offLat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bar = selectAggregateState(stateA, stateB);
  const avgLatency = bar.kind === 'active'
    ? avgDefined(latencyMs.A, latencyMs.B)
    : undefined;

  const onAction = async (): Promise<void> => {
    if (bar.kind === 'idle') {
      if (!selectedMic || !selectedToMeet || !selectedFromMeet || !selectedHeadset) {
        await rt.openSetupView();
        return;
      }
      await rt.startTranslation({
        sourceLang, targetLang,
        micDeviceId: selectedMic,
        toMeetDeviceId: selectedToMeet,
        fromMeetDeviceId: selectedFromMeet,
        headsetDeviceId: selectedHeadset,
      });
    } else if (bar.kind === 'error') {
      await rt.startTranslation({
        sourceLang, targetLang,
        micDeviceId: selectedMic ?? '',
        toMeetDeviceId: selectedToMeet ?? '',
        fromMeetDeviceId: selectedFromMeet ?? '',
        headsetDeviceId: selectedHeadset ?? '',
      });
    } else {
      await rt.stopTranslation();
    }
  };

  return (
    <div className={`rt-bar rt-bar--${bar.kind}`} role="status">
      <Orb state={bar.kind} />
      {bar.kind === 'active' && <Waveform />}
      {(bar.kind === 'idle' || bar.kind === 'active' || bar.kind === 'connecting') && (
        <LanguagePair
          source={sourceLang}
          target={targetLang}
          onClick={(): void => { void rt.openSetupView(); }}
        />
      )}
      {bar.kind === 'reconnecting' && (
        <span className="rt-status">
          Reconectando<span className="rt-status__attempt"> · {bar.origin}: tentativa {bar.attempt}</span>
        </span>
      )}
      {bar.kind === 'error' && (
        <span className="rt-status" title={bar.message}>
          {`${bar.origin}: ${truncate(bar.message, 28)}`}
        </span>
      )}
      <LatencyMeter ms={avgLatency} />
      <ActionButton state={bar.kind} onClick={(): void => { void onAction(); }} />
      <SettingsButton onClick={(): void => { void rt.openSetupView(); }} />
    </div>
  );
}

function avgDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a !== undefined && b !== undefined) return Math.round((a + b) / 2);
  return a ?? b;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
```

- [ ] **Step 3: Add full styles to widget.css**

Replace `src/renderer/styles/widget.css` with:

```css
@import './tokens.css';

html, body, #root {
  background: transparent;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  letter-spacing: -0.005em;
}

.rt-bar {
  position: fixed;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  height: 32px;
  background: rgba(28, 30, 36, 0.78);
  -webkit-backdrop-filter: blur(40px) saturate(140%);
  backdrop-filter: blur(40px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08);
  display: inline-flex;
  align-items: center;
  padding: 0 6px 0 14px;
  gap: 10px;
  font-size: 12px;
  -webkit-app-region: drag;
  transition: background 200ms ease-out, border-color 200ms ease-out;
}

.rt-bar > * {
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}

/* Background tints per state */
.rt-bar--reconnecting {
  background: rgba(60, 45, 18, 0.7);
  border-color: rgba(245, 158, 11, 0.2);
}
.rt-bar--error {
  background: rgba(60, 22, 22, 0.78);
  border-color: rgba(248, 113, 113, 0.25);
}

/* Orb */
.rt-orb {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 150ms;
  background: rgba(244, 244, 245, 0.3);
}
.rt-orb--active {
  background: var(--accent);
  box-shadow: 0 0 12px rgba(110, 127, 196, 0.7);
  animation: rt-orb-pulse 1.6s ease-in-out infinite;
}
.rt-orb--connecting {
  background: var(--accent);
  box-shadow: 0 0 8px rgba(110, 127, 196, 0.4);
  animation: rt-orb-pulse 2.5s ease-in-out infinite;
}
.rt-orb--reconnecting {
  background: var(--warning);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.7);
  animation: rt-orb-pulse 0.9s ease-in-out infinite;
}
.rt-orb--error {
  background: var(--error);
  box-shadow: 0 0 12px rgba(248, 113, 113, 0.6);
}
@keyframes rt-orb-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.65; transform: scale(0.9); }
}

/* Waveform */
.rt-wf {
  display: flex;
  gap: 2px;
  height: 14px;
  align-items: center;
}
.rt-wf__bar {
  width: 2px;
  background: var(--accent);
  border-radius: 1px;
  opacity: 0.7;
  animation: rt-wave 0.8s ease-in-out infinite;
}
.rt-wf__bar:nth-child(1) { height: 30%; animation-delay: 0s; }
.rt-wf__bar:nth-child(2) { height: 60%; animation-delay: 0.1s; }
.rt-wf__bar:nth-child(3) { height: 90%; animation-delay: 0.2s; }
.rt-wf__bar:nth-child(4) { height: 70%; animation-delay: 0.3s; }
.rt-wf__bar:nth-child(5) { height: 40%; animation-delay: 0.4s; }
@keyframes rt-wave {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1.2); }
}

/* Language pair */
.rt-pair {
  background: transparent;
  border: 0;
  color: rgba(244, 244, 245, 0.85);
  font-family: inherit;
  font-weight: 500;
  font-size: 11px;
  letter-spacing: 0.04em;
  padding: 2px 4px;
  border-radius: 3px;
  cursor: pointer;
}
.rt-pair:hover { background: rgba(255,255,255,0.06); }
.rt-pair__arr { color: rgba(244, 244, 245, 0.4); margin: 0 4px; }

/* Status text (reconnecting/error) */
.rt-status {
  font-size: 11px;
  font-weight: 500;
  flex: 1;
  text-align: left;
}
.rt-bar--reconnecting .rt-status { color: var(--warning); }
.rt-bar--reconnecting .rt-status__attempt { color: rgba(245, 158, 11, 0.6); font-weight: 400; }
.rt-bar--error .rt-status { color: var(--error); }

/* Latency tag */
.rt-lat {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 10px;
  color: rgba(244, 244, 245, 0.5);
}

/* Action button */
.rt-action {
  width: 26px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: rgba(244, 244, 245, 0.9);
  background: rgba(110, 127, 196, 0.18);
  border: 1px solid rgba(110, 127, 196, 0.3);
  cursor: pointer;
}
.rt-action:hover { background: rgba(110, 127, 196, 0.32); }
.rt-action svg { width: 11px; height: 11px; fill: currentColor; }
.rt-action--retry {
  background: rgba(248, 113, 113, 0.15);
  border-color: rgba(248, 113, 113, 0.35);
  color: var(--error);
}

/* Settings (gear) */
.rt-gear {
  width: 22px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: rgba(244, 244, 245, 0.55);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.rt-gear:hover { background: rgba(255,255,255,0.06); color: rgba(244, 244, 245, 0.9); }
.rt-gear svg { width: 12px; height: 12px; }
```

- [ ] **Step 4: Verify dev mode renders all states**

```bash
npm run dev
```

Expected: bar appears at the bottom of the screen, frameless, transparent background, glass effect on the bar itself. Idle state by default. State changes will be tested in subsequent tasks.

To exercise reconnecting/error states without OpenAI: in DevTools console, manually dispatch state changes:

```javascript
// In DevTools (right-click bar → Inspect Element)
document.querySelector('.rt-bar').className = 'rt-bar rt-bar--reconnecting';
document.querySelector('.rt-orb').className = 'rt-orb rt-orb--reconnecting';
```

Visually verify: yellow tint, pulsing orb. Repeat for error.

- [ ] **Step 5: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components src/renderer/views/FloatingWidget.tsx src/renderer/styles/widget.css
git commit -m "Implement FloatingWidget bar with all 5 visual states

Components: Orb, Waveform (5 bars), LanguagePair, LatencyMeter,
ActionButton (Pause/Resume/Retry), SettingsButton.

State derivation: selectAggregateState reduces (stateA, stateB) → BarState.
Class hooks (.rt-bar--{state}) drive bg tint, orb color, and content
layout per spec §6. Action button morphs based on state, click handler
delegates to start/stop or opens SetupView when devices missing.

Latency: averaged across both directions (when both present), rounded
to seconds. Source: store.latencyMs populated by Task 5's IPC channel.

Drag region: -webkit-app-region:drag on the bar with no-drag override
on every interactive child.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: Drag persistence

**Files:**
- Modify: `src/main/app.ts`

**Why:** Spec §8 — bar position persists across app restarts. BrowserWindow's `move` event fires while user drags; debounce-save final position to prefs.json. On startup, restore from prefs.

- [ ] **Step 1: Add startup-positioning helper**

In `src/main/app.ts`, before `createWindows`:

```typescript
function computeWidgetPosition(
  preferred: { x: number; y: number } | undefined,
  windowWidth: number,
  windowHeight: number,
): { x: number; y: number } {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  // If preferred is on-screen, use it.
  if (preferred) {
    const onScreen = screen.getAllDisplays().some((d) => {
      const w = d.workArea;
      return preferred.x >= w.x && preferred.y >= w.y &&
        preferred.x + windowWidth <= w.x + w.width &&
        preferred.y + windowHeight <= w.y + w.height;
    });
    if (onScreen) return preferred;
  }
  // Default: centered horizontally, 4px above the taskbar (workArea bottom).
  return {
    x: wa.x + Math.round((wa.width - windowWidth) / 2),
    y: wa.y + wa.height - windowHeight - 4,
  };
}
```

Add `screen` to the electron import at top of file:

```typescript
import { app, BrowserWindow, ipcMain, screen, session } from 'electron';
```

- [ ] **Step 2: Use the helper in createWindows**

Inside `createWindows`, after `floatingWidget = new BrowserWindow({...})`:

```typescript
const stored = prefsStore.load().widgetPosition;
const initial = computeWidgetPosition(stored, 480, 40);
floatingWidget.setPosition(initial.x, initial.y);
```

(`prefsStore` is created by `registerIpcHandlers`, but `createWindows` runs before `registerIpcHandlers`. Refactor: move `prefsStore` construction outside `registerIpcHandlers` so both `createWindows` and the IPC layer can use it.)

Restructure: in `app.ts`, after the existing constants but before `createWindows`, add:

```typescript
const prefsPath = join(app.getPath('userData'), 'prefs.json');
const prefsStore = new UserPrefsStore({
  fs: {
    readFile: (p) => (existsSync(p) ? readFileSync(p) : undefined),
    writeFile: (p, d) => writeFileSync(p, d),
    exists: (p) => existsSync(p),
  },
  prefsPath,
});
```

Update `registerIpcHandlers` and `handlers.ts` to ACCEPT `prefsStore` as a dep instead of constructing it:

```typescript
// handlers.ts HandlerDeps:
prefsStore: UserPrefsStore;

// then in registerIpcHandlers:
handle(IPC.PrefsLoad, () => deps.prefsStore.load());
handle(IPC.PrefsSetWidgetPosition, (_e, pos) => deps.prefsStore.setWidgetPosition(pos));
// ...
```

In `app.ts`, pass `prefsStore` into `registerIpcHandlers`:

```typescript
const { configStore } = registerIpcHandlers({
  prefsStore,
  onStart: ...,
  onStop: ...,
  listDevices: ...,
  openSetupView: ...,
});
```

- [ ] **Step 3: Hook the move event with debounced save**

In `app.ts`, after `floatingWidget.setPosition(initial.x, initial.y);` and before `await floatingWidget.loadURL(...)`:

```typescript
// Debounced save on drag-end. Electron 'moved' fires once per drag stop,
// but on macOS it fires per-pixel during drag — debounce defensively.
let moveTimer: ReturnType<typeof setTimeout> | undefined;
floatingWidget.on('moved', () => {
  if (!floatingWidget) return;
  const [x, y] = floatingWidget.getPosition();
  if (moveTimer) clearTimeout(moveTimer);
  moveTimer = setTimeout(() => {
    prefsStore.setWidgetPosition({ x, y });
  }, 300);
});
```

- [ ] **Step 4: Verify drag persistence**

```bash
npm run dev
```

Drag the bar to a new position. Close the app (Ctrl+C in dev terminal, or close the test rig if it's spawned). Reopen with `npm run dev`. Bar should reappear at the dragged position.

If it returns to default, check `%APPDATA%/realtime-translate/prefs.json` (the userData path):

```powershell
type "$env:APPDATA\realtime-translate\prefs.json"
```

Expected: file exists with `widgetPosition: { x, y }` matching where you dragged.

- [ ] **Step 5: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add src/main/app.ts src/main/ipc/handlers.ts
git commit -m "Persist FloatingWidget position across app restarts

UserPrefsStore now constructed before createWindows so the initial
position can be read pre-window-creation. handlers.ts accepts prefsStore
as an injected dep instead of constructing its own (single source of
truth in main process).

Drag handling: floatingWidget.on('moved') with 300ms debounce writes
{x, y} to prefs.json. computeWidgetPosition validates that any stored
position is still on-screen (multi-monitor unplug case); otherwise
falls back to centered above the taskbar.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: First-launch flow + remove BidirectionalTestRig

**Files:**
- Modify: `src/main/app.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/views/SetupViewStub.tsx`
- Delete: `src/renderer/views/BidirectionalTestRig.tsx`

**Why:** Spec §11 lifecycle — first launch goes to SetupView wizard (no widget), subsequent launches go straight to widget. We don't have a real SetupView yet; the stub stays as the de-facto setup window. The TestRig file itself can be moved into the stub permanently.

- [ ] **Step 1: Add first-launch detection in app.ts**

After `prefsStore` construction and before `createWindows`:

```typescript
function isSetupComplete(): boolean {
  // Setup is complete iff API key is stored AND all 4 devices are remembered.
  const hasKey = configStore.getApiKey() !== undefined;
  if (!hasKey) return false;
  const prefs = prefsStore.load();
  const d = prefs.devices;
  return Boolean(d?.mic && d?.toMeet && d?.fromMeet && d?.headset);
}
```

Wait — `configStore` is constructed inside `registerIpcHandlers`. Same refactor as Task 10 for prefsStore: extract `configStore` construction outside. Move:

```typescript
const apiKeyPath = join(app.getPath('userData'), 'apikey.bin');
const configStore = new ConfigStore({
  safeStorage: { /* same as handlers.ts */ },
  fs: { /* same */ },
  configPath: apiKeyPath,
  envApiKey: readEnvApiKey(),
});
```

…to `app.ts`, before `createWindows`. Pass into `registerIpcHandlers` as a new `configStore` dep.

(Equivalent to the prefsStore refactor in Task 10. By the end, both stores live in app.ts and are injected into handlers.)

- [ ] **Step 2: Extract createFloatingWidget helper + branch createWindows**

In `app.ts`, factor the FloatingWidget creation out of `createWindows` into a reusable helper (so we can call it both at boot AND after setup completes):

```typescript
async function createFloatingWidget(): Promise<BrowserWindow> {
  if (floatingWidget && !floatingWidget.isDestroyed()) {
    floatingWidget.focus();
    return floatingWidget;
  }
  const win = new BrowserWindow({
    width: 480,
    height: 40,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');

  const stored = prefsStore.load().widgetPosition;
  const initial = computeWidgetPosition(stored, 480, 40);
  win.setPosition(initial.x, initial.y);

  let moveTimer: ReturnType<typeof setTimeout> | undefined;
  win.on('moved', () => {
    const [x, y] = win.getPosition();
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => prefsStore.setWidgetPosition({ x, y }), 300);
  });

  await win.loadURL(FLOATING_WIDGET_URL);
  floatingWidget = win;
  return win;
}
```

Replace the existing inline FloatingWidget construction in `createWindows` (added in Tasks 7 + 10) with branched logic:

```typescript
async function createWindows(): Promise<void> {
  offscreenWindow = new BrowserWindow({
    width: 1, height: 1, show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/offscreenPreload.cjs'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  await offscreenWindow.loadURL(OFFSCREEN_URL);

  if (isSetupComplete()) {
    await createFloatingWidget();
  } else {
    await createSetupView();
  }
}
```

- [ ] **Step 3: setup:complete IPC — surface the widget when wizard finishes**

Add a new IPC channel that the SetupView calls when the user has finished configuring.

In `src/shared/events.ts`:

```typescript
SetupComplete: 'setup:complete',
```

In `src/main/ipc/channels.ts` `IpcInvokeMap`:

```typescript
[IPC.SetupComplete]: { args: void; result: void };
```

In `src/main/ipc/handlers.ts`, add to `HandlerDeps`:

```typescript
onSetupComplete: () => Promise<void>;
```

And register the handler:

```typescript
handle(IPC.SetupComplete, () => deps.onSetupComplete());
```

In `src/main/app.ts`, pass the handler that creates the widget and closes the SetupView:

```typescript
onSetupComplete: async () => {
  await createFloatingWidget();
  if (setupView && !setupView.isDestroyed()) setupView.close();
},
```

In `src/main/preload.ts`:

```typescript
markSetupComplete: (): Promise<void> => ipcRenderer.invoke(IPC.SetupComplete),
```

- [ ] **Step 4: Move BidirectionalTestRig content into SetupViewStub**

Surgical migration — move the file, then apply two edits. First rename:

```powershell
Move-Item src/renderer/views/BidirectionalTestRig.tsx src/renderer/views/SetupViewStub.tsx
```

Edit 4a — rename the exported function:

```typescript
// BEFORE:
export function BidirectionalTestRig(): JSX.Element {

// AFTER:
export function SetupViewStub(): JSX.Element {
```

Edit 4b — add a "Concluir setup" button to the existing layout. Find the section (around line 292-313) that contains the Start/Stop button (`<section style={{ marginTop: 4 }}>`). Append a new section right after it:

```tsx
<section style={{ marginTop: 4 }}>
  <button
    onClick={(): void => { void rt.markSetupComplete(); }}
    disabled={
      !hasApiKey ||
      !selectedMic || !selectedToMeet || !selectedFromMeet || !selectedHeadset
    }
    style={{
      width: '100%',
      padding: '8px 12px',
      fontSize: 12,
      fontWeight: 500,
      borderRadius: 6,
      border: '1px solid var(--border-default)',
      background: 'transparent',
      color: 'var(--text-primary)',
      opacity:
        !hasApiKey || !selectedMic || !selectedToMeet || !selectedFromMeet || !selectedHeadset
          ? 0.5
          : 1,
    }}
  >
    Concluir setup → abrir barra
  </button>
</section>
```

The button is enabled when all 4 devices are selected AND API key is saved. Click triggers main process to spawn the FloatingWidget and close the SetupView (Task 11 Step 3 wires this).

That's it. The SetupViewStub keeps all existing TestRig functionality (devices, idiomas, start/stop translation for verification). It's a transitional surface — the real SetupView replaces it in a future plan.

- [ ] **Step 5: Remove the dead BidirectionalTestRig entry chain**

The original entry chain `index.html → main.tsx → App.tsx → BidirectionalTestRig.tsx` is no longer used after Task 7 (which added floating-widget.html and setup-view.html as entries) and Step 4 above (which moved BidirectionalTestRig content into SetupViewStub). Delete the orphans:

```powershell
Remove-Item src/renderer/App.tsx
Remove-Item src/renderer/index.html
Remove-Item src/renderer/main.tsx
```

Update `electron.vite.config.ts` to drop the `index` entry:

```typescript
input: {
  offscreen: resolve('src/renderer/offscreen.html'),
  floatingWidget: resolve('src/renderer/floating-widget.html'),
  setupView: resolve('src/renderer/setup-view.html'),
}
```

Verify no imports remain:

```bash
# From repo root, use Grep tool with pattern: "from './App'" — should return zero matches
# Use Grep tool with pattern: "BidirectionalTestRig" — should return zero matches
```

If grep shows references, fix them (likely just stale imports from your IDE).

- [ ] **Step 6: Verify both flows**

```bash
npm run dev
```

**First-launch flow:** Clear prefs and apikey first:
```powershell
Remove-Item "$env:APPDATA\realtime-translate\prefs.json" -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\realtime-translate\apikey.bin" -ErrorAction SilentlyContinue
```

Run `npm run dev`. Expected: SetupView opens, NO bar visible. Save API key and select devices in the stub. Click "Concluir setup". Bar appears, SetupView closes.

**Subsequent-launch flow:** With prefs/apikey saved, run `npm run dev` again. Expected: bar appears immediately, SetupView NOT visible. Click ⚙ on bar → SetupView opens.

- [ ] **Step 7: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: all passing.

- [ ] **Step 8: Commit**

```bash
git add src/main/app.ts src/main/ipc/handlers.ts src/main/preload.ts src/shared/events.ts src/main/ipc/channels.ts src/renderer/views/SetupViewStub.tsx src/renderer/App.tsx src/renderer/index.html src/renderer/main.tsx src/renderer/views/BidirectionalTestRig.tsx electron.vite.config.ts
git commit -m "First-launch routing + remove BidirectionalTestRig

Setup completeness check: API key stored AND all 4 devices remembered.
- Incomplete → SetupView opens, no bar
- Complete → bar appears, SetupView lazy on ⚙ click

ConfigStore + UserPrefsStore lifted out of registerIpcHandlers into
app.ts so createWindows can read them at boot time.

setup:complete IPC channel: when user finishes initial config in
SetupViewStub, the bar is created and SetupView closes.

BidirectionalTestRig.tsx deleted; its body moved into SetupViewStub.tsx
where it serves as the placeholder until the real SetupView lands.
index.html / main.tsx / App.tsx removed (the test-rig entry); Vite
config drops the index entry.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase C — Wrap-up

### Task 12: Smoke + version bump

- [ ] **Step 1: Manual smoke**

Per [docs/QA-CHECKLIST.md](../../QA-CHECKLIST.md) M2 procedure, but with the new bar:
- Bar opens at last position
- Click ⚙ → SetupView opens with the stub
- Devices auto-selected from prefs
- Click ▶ on bar (or Concluir setup if prefs empty) → bar shows connecting → active
- Verify English audible on remote, Portuguese audible on headset
- Click ⏸ on bar → bar returns to idle
- Click ▶ again → resumes immediately with same devices (no reselect)
- Drag bar → new position; restart app → position preserved

- [ ] **Step 2: Update QA-CHECKLIST**

Add an M3 section to `docs/QA-CHECKLIST.md` mirroring M2 but with bar + pause/resume + drag.

- [ ] **Step 3: Bump version**

In `package.json`:

```diff
-  "version": "0.2.0-m2",
+  "version": "0.3.0-m3",
```

- [ ] **Step 4: Commit + tag**

```bash
git add package.json docs/QA-CHECKLIST.md
git commit -m "M3 release: FloatingWidget + prefs persistence + backend follow-ups

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git tag -a v0.3.0-m3 -m "M3: FloatingWidget UI + prefs persistence + backend follow-ups"
```

---

## Self-review notes

**Spec coverage:** Tasks 1-12 cover the FloatingWidget spec sections 1-13 except SetupView details (intentionally deferred). State emission contract (§7) handled by Task 5. Position persistence (§8) by Task 10. Pause vs Stop semantics (§8) preserved by reusing existing start/stop flow.

**Backend follow-ups:** Worklet bundle (P0) ✅. Logger wire + recursive sanitize + flush/close ✅. Latency event ✅. AudioRouter abstraction NOT included — defers to SetupView plan. Graceful shutdown via app.before-quit + sink.close ✅.

**Out of plan but covered elsewhere:** SetupView (own brainstorm + plan). Test Translation (SetupView). Quick lang popover (deferred to M4+ per spec §13).

---

## Execution handoff

Plan saved. Two execution options:

**1. Subagent-Driven (recommended for this scope)** — fresh subagent per task with two-stage review (spec reviewer + code quality reviewer) per the M1/M2 cadence. Slower wall-clock but the per-task review catches drift before the next task builds on it.

**2. Inline Execution** — execute through this session sequentially with checkpoints between phases (after Task 6, after Task 9, after Task 12).

Which approach? Default recommendation: subagent-driven, matching the M1/M2 pattern that produced clean ships.
