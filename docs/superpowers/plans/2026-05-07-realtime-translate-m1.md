# Realtime Translate — M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Windows Electron app that translates PT→EN unidirectionally end-to-end via `gpt-realtime-translate`, capturing mic audio and routing translated output to VB-CABLE A. Validates the architectural spike (Web Audio `setSinkId` to virtual cable) that gates everything else.

**Architecture:** Electron 3-process model (main / renderer / offscreen). Main owns WebSocket session and API key. Offscreen renderer handles all Web Audio I/O. Renderer is a minimal "test rig" UI for M1 (full FloatingWidget comes in M3). One WebSocket session to `wss://api.openai.com/v1/realtime/translations`.

**Tech Stack:** Electron 33+, TypeScript 5+, React 19, Vite 6, Zustand, ws, vitest, Playwright, electron-builder.

**M1 Definition of Done:**
- `npm run dev` opens app window
- User pastes OpenAI API key, app encrypts via `safeStorage`
- User picks mic + CABLE-A from device dropdowns
- User clicks "Start", speaks PT into mic, hears EN come back through CABLE-A (verifiable by listening to CABLE-B Output, or by using a Meet test call)
- Unit + integration tests pass on CI without any hardware/network dependency
- Validation spike documented as ✓ pass (or pivots to plan B)

**Out of M1 scope (future plans):** bidirectional (M2), polished FloatingWidget + SetupView (M3), error UI states, transcript display, latency meter, electron-builder release pipeline (M4), GitHub Actions, code signing, auto-update.

---

## File Structure (M1)

### Root
- `package.json` — dependencies + scripts
- `tsconfig.json` — base TS config
- `tsconfig.main.json` — main process (Node target)
- `tsconfig.renderer.json` — renderer process (DOM target)
- `vite.config.ts` — renderer + offscreen build config
- `electron.vite.config.ts` — full Electron build orchestration (uses `electron-vite`)
- `.eslintrc.cjs`
- `.prettierrc`
- `.editorconfig`
- `vitest.config.ts`
- `README.md`

### Shared (`src/shared/`)
- `types.ts` — shared types (Language, SessionState, IPCEvent)
- `events.ts` — IPC channel name constants
- `languages.ts` — language list (PT, EN, plus a few common pairs)

### Main process (`src/main/`)
- `app.ts` — Electron entry, creates windows, wires IPC
- `preload.ts` — context bridge exposing typed IPC to renderer
- `config/configStore.ts` — safeStorage wrapper with env fallback
- `config/envFallback.ts` — reads `OPENAI_API_KEY`
- `audio/deviceDetector.ts` — regex matching for VB-CABLE devices
- `translate/openaiSession.ts` — single WebSocket session lifecycle
- `translate/audioPipeline.ts` — wires capture → session → playback (M1: 1 direction only)
- `ipc/channels.ts` — channel name constants + payload types
- `ipc/handlers.ts` — registers ipcMain handlers
- `util/pcmCodec.ts` — PCM16 ↔ base64
- `util/retryPolicy.ts` — exponential backoff iterator
- `util/logger.ts` — structured JSONL logger

### Offscreen renderer
- HTML: `src/renderer/offscreen.html` — invisible window (lives next to renderer's `index.html` so Vite's root picks it up)
- `src/offscreen/index.ts` — boot, listens to IPC from main, controls Web Audio
- `src/offscreen/webAudioBridge.ts` — wraps AudioContext, getUserMedia, setSinkId
- `src/offscreen/workers/pcmEncoder.worklet.ts` — AudioWorklet that emits PCM16 chunks

### UI renderer (`src/renderer/`)
- `index.html`
- `main.tsx` — React mount
- `App.tsx` — routes between SetupRig / Idle / Active states
- `views/M1TestRig.tsx` — barebones M1 UI (replaced by FloatingWidget in M3)
- `state/store.ts` — Zustand store (apiKey, devices, sessionState)
- `ipc/client.ts` — typed wrapper around exposed preload API
- `styles/tokens.css` — design tokens (extracted from `docs/design/design-system.html`)
- `styles/global.css` — base resets + body bg

### Tests
- `tests/unit/pcmCodec.test.ts`
- `tests/unit/retryPolicy.test.ts`
- `tests/unit/deviceDetector.test.ts`
- `tests/unit/configStore.test.ts`
- `tests/unit/openaiSession.test.ts` — fakes WebSocket
- `tests/unit/logger.test.ts`
- `tests/integration/audioPipeline.test.ts` — fake offscreen + fake session
- `tests/setup.ts` — vitest globals

---

## Task 1: Project bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.main.json`, `tsconfig.renderer.json`, `electron.vite.config.ts`, `.editorconfig`, `.prettierrc`, `.eslintrc.cjs`, `README.md`

- [ ] **Step 1: Initialize npm project**

Run from `C:\dev\realtime-translate`:
```powershell
npm init -y
```

Then **replace** `package.json` with this content:

```json
{
  "name": "realtime-translate",
  "version": "0.1.0-m1",
  "description": "Realtime translation app for Google Meet powered by OpenAI gpt-realtime-translate",
  "main": "out/main/app.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.main.json && tsc --noEmit -p tsconfig.renderer.json",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx,css,html}\" \"tests/**/*.ts\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "license": "MIT",
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Install dev dependencies**

```powershell
npm i -D electron@^33 electron-vite@^2 vite@^6 typescript@^5 @types/node @types/ws ws react@^19 react-dom@^19 @types/react @types/react-dom zustand vitest @vitest/coverage-v8 @playwright/test eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier eslint-config-prettier eslint-plugin-react eslint-plugin-react-hooks lucide-react
```

- [ ] **Step 3: Create base tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"],
      "@offscreen/*": ["src/offscreen/*"],
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

- [ ] **Step 4: Create tsconfig.main.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "out/main",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 5: Create tsconfig.renderer.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "out/renderer",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src/renderer/**/*", "src/offscreen/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 6: Create electron.vite.config.ts**

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: { entry: 'src/main/app.ts', formats: ['es'] },
      rollupOptions: { external: ['electron', 'ws'] }
    },
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: { entry: 'src/main/preload.ts', formats: ['cjs'] }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          offscreen: resolve('src/renderer/offscreen.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@offscreen': resolve('src/offscreen'),
        '@shared': resolve('src/shared')
      }
    }
  }
});
```

Install the React plugin we just referenced:

```powershell
npm i -D @vitejs/plugin-react
```

- [ ] **Step 7: Create .prettierrc, .eslintrc.cjs, .editorconfig**

`.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

`.eslintrc.cjs`:
```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier'
  ],
  settings: { react: { version: 'detect' } },
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
  },
  ignorePatterns: ['out/', 'dist/', 'node_modules/']
};
```

`.editorconfig`:
```ini
root = true

[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
```

- [ ] **Step 8: Create minimal README.md**

```markdown
# Realtime Translate

Open-source desktop app that translates speech in realtime during Google Meet calls (and other apps), powered by OpenAI's `gpt-realtime-translate` model. Bring your own OpenAI API key.

**Status:** M1 in development — not ready for use yet.

See `docs/superpowers/specs/2026-05-07-realtime-translate-design.md` for the design.
```

- [ ] **Step 9: Verify typecheck runs (no source files yet, should still succeed)**

```powershell
npm run typecheck
```

Expected: exits with code 0 (nothing to check yet, no errors).

- [ ] **Step 10: Commit**

```powershell
git add package.json package-lock.json tsconfig*.json electron.vite.config.ts .prettierrc .eslintrc.cjs .editorconfig README.md
git commit -m "Bootstrap Electron + Vite + React + TypeScript project"
```

---

## Task 2: Test infrastructure

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/sanity.test.ts`

- [ ] **Step 1: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/*.worklet.ts']
    }
  },
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@renderer': resolve('src/renderer'),
      '@offscreen': resolve('src/offscreen'),
      '@shared': resolve('src/shared')
    }
  }
});
```

- [ ] **Step 2: Create tests/setup.ts (placeholder for shared test setup)**

```typescript
// Global test setup. Add fakes/mocks here as the suite grows.
```

- [ ] **Step 3: Write sanity test that should pass**

`tests/sanity.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run the test**

```powershell
npm test
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```powershell
git add vitest.config.ts tests/
git commit -m "Add vitest test infrastructure"
```

---

## Task 3: pcmCodec utility (TDD)

**Files:**
- Create: `src/main/util/pcmCodec.ts`, `tests/unit/pcmCodec.test.ts`

The OpenAI realtime translation API expects audio as base64-encoded PCM16 little-endian at 24kHz mono. Web Audio gives us Float32 samples; we need to convert.

- [ ] **Step 1: Write failing tests**

`tests/unit/pcmCodec.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { float32ToPcm16Base64, pcm16Base64ToFloat32 } from '@main/util/pcmCodec';

describe('pcmCodec', () => {
  it('encodes a known Float32 sample to PCM16 base64', () => {
    // 4 samples at amplitudes 0, 0.5, -0.5, 1.0 (clamped)
    const input = new Float32Array([0, 0.5, -0.5, 1.0]);
    const result = float32ToPcm16Base64(input);

    // Manually computed expected:
    // 0    -> 0x0000      -> bytes 00 00
    // 0.5  -> 16383       -> bytes FF 3F (little endian)
    // -0.5 -> -16384      -> bytes 00 C0
    // 1.0  -> 32767       -> bytes FF 7F
    const expectedBytes = new Uint8Array([0x00, 0x00, 0xff, 0x3f, 0x00, 0xc0, 0xff, 0x7f]);
    const expected = Buffer.from(expectedBytes).toString('base64');
    expect(result).toBe(expected);
  });

  it('round-trips Float32 ↔ base64 ↔ Float32 (within quantization tolerance)', () => {
    const input = new Float32Array([0, 0.25, -0.25, 0.7, -0.9]);
    const encoded = float32ToPcm16Base64(input);
    const decoded = pcm16Base64ToFloat32(encoded);
    expect(decoded.length).toBe(input.length);
    for (let i = 0; i < input.length; i++) {
      expect(Math.abs(decoded[i]! - input[i]!)).toBeLessThan(1 / 32768);
    }
  });

  it('clamps values outside [-1, 1]', () => {
    const input = new Float32Array([2.0, -2.0]);
    const decoded = pcm16Base64ToFloat32(float32ToPcm16Base64(input));
    expect(decoded[0]).toBeCloseTo(0.99997, 3);
    expect(decoded[1]).toBeCloseTo(-1.0, 3);
  });

  it('handles empty input', () => {
    expect(float32ToPcm16Base64(new Float32Array(0))).toBe('');
    expect(pcm16Base64ToFloat32('').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```powershell
npm test -- pcmCodec
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement pcmCodec**

`src/main/util/pcmCodec.ts`:
```typescript
const MAX_INT16 = 0x7fff;
const MIN_INT16 = -0x8000;

export function float32ToPcm16Base64(samples: Float32Array): string {
  if (samples.length === 0) return '';
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i]!;
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    const int16 = s < 0 ? s * -MIN_INT16 : s * MAX_INT16;
    view.setInt16(i * 2, Math.round(int16), true);
  }
  return Buffer.from(buf).toString('base64');
}

export function pcm16Base64ToFloat32(b64: string): Float32Array {
  if (b64 === '') return new Float32Array(0);
  const buf = Buffer.from(b64, 'base64');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const len = Math.floor(view.byteLength / 2);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const int16 = view.getInt16(i * 2, true);
    out[i] = int16 < 0 ? int16 / -MIN_INT16 : int16 / MAX_INT16;
  }
  return out;
}
```

- [ ] **Step 4: Run tests, expect pass**

```powershell
npm test -- pcmCodec
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```powershell
git add src/main/util/pcmCodec.ts tests/unit/pcmCodec.test.ts
git commit -m "Add pcmCodec util for PCM16 base64 conversion (TDD)"
```

---

## Task 4: retryPolicy utility (TDD)

**Files:**
- Create: `src/main/util/retryPolicy.ts`, `tests/unit/retryPolicy.test.ts`

Exponential backoff used by `openaiSession` for reconnect.

- [ ] **Step 1: Write failing tests**

`tests/unit/retryPolicy.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ExponentialBackoff } from '@main/util/retryPolicy';

describe('ExponentialBackoff', () => {
  it('produces sequence with doubling delays', () => {
    const backoff = new ExponentialBackoff({ baseMs: 1000, maxMs: 30000, maxAttempts: 5 });
    const delays: number[] = [];
    while (backoff.hasNext()) {
      delays.push(backoff.next());
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('caps delay at maxMs', () => {
    const backoff = new ExponentialBackoff({ baseMs: 1000, maxMs: 5000, maxAttempts: 10 });
    const delays: number[] = [];
    while (backoff.hasNext()) {
      delays.push(backoff.next());
    }
    expect(delays.every((d) => d <= 5000)).toBe(true);
    expect(delays.filter((d) => d === 5000).length).toBeGreaterThan(0);
  });

  it('reset() restarts from baseMs', () => {
    const backoff = new ExponentialBackoff({ baseMs: 100, maxMs: 1000, maxAttempts: 3 });
    backoff.next();
    backoff.next();
    backoff.reset();
    expect(backoff.next()).toBe(100);
  });

  it('hasNext returns false after maxAttempts', () => {
    const backoff = new ExponentialBackoff({ baseMs: 100, maxMs: 1000, maxAttempts: 2 });
    backoff.next();
    backoff.next();
    expect(backoff.hasNext()).toBe(false);
  });

  it('throws if next() called past maxAttempts', () => {
    const backoff = new ExponentialBackoff({ baseMs: 100, maxMs: 1000, maxAttempts: 1 });
    backoff.next();
    expect(() => backoff.next()).toThrow();
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```powershell
npm test -- retryPolicy
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement retryPolicy**

`src/main/util/retryPolicy.ts`:
```typescript
export interface BackoffConfig {
  baseMs: number;
  maxMs: number;
  maxAttempts: number;
}

export class ExponentialBackoff {
  private attempt = 0;

  constructor(private readonly config: BackoffConfig) {}

  hasNext(): boolean {
    return this.attempt < this.config.maxAttempts;
  }

  next(): number {
    if (!this.hasNext()) {
      throw new Error('ExponentialBackoff: max attempts reached');
    }
    const delay = Math.min(this.config.baseMs * 2 ** this.attempt, this.config.maxMs);
    this.attempt += 1;
    return delay;
  }

  reset(): void {
    this.attempt = 0;
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```powershell
npm test -- retryPolicy
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```powershell
git add src/main/util/retryPolicy.ts tests/unit/retryPolicy.test.ts
git commit -m "Add exponential backoff retry policy (TDD)"
```

---

## Task 5: Logger utility (TDD)

**Files:**
- Create: `src/main/util/logger.ts`, `tests/unit/logger.test.ts`

Structured JSONL logger. Writes to a file-like sink. We'll inject the sink in tests.

- [ ] **Step 1: Write failing tests**

`tests/unit/logger.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger, LogLevel, type LogSink } from '@main/util/logger';

describe('logger', () => {
  let captured: string[] = [];
  const sink: LogSink = { write: (line) => captured.push(line) };

  beforeEach(() => {
    captured = [];
  });

  it('emits JSONL with required fields', () => {
    const log = createLogger({ source: 'test', sink });
    log.info('something happened', { foo: 'bar' });
    expect(captured).toHaveLength(1);
    const parsed = JSON.parse(captured[0]!);
    expect(parsed.level).toBe('info');
    expect(parsed.source).toBe('test');
    expect(parsed.event).toBe('something happened');
    expect(parsed.data).toEqual({ foo: 'bar' });
    expect(typeof parsed.ts).toBe('number');
  });

  it('respects minimum level', () => {
    const log = createLogger({ source: 'test', sink, minLevel: LogLevel.Warn });
    log.debug('debug msg');
    log.info('info msg');
    log.warn('warn msg');
    log.error('error msg');
    expect(captured).toHaveLength(2);
    expect(JSON.parse(captured[0]!).level).toBe('warn');
    expect(JSON.parse(captured[1]!).level).toBe('error');
  });

  it('does not log audio or transcript fields by default', () => {
    const log = createLogger({ source: 'audio', sink });
    log.info('chunk received', { audio: 'base64data...', size: 4096 });
    const parsed = JSON.parse(captured[0]!);
    expect(parsed.data.audio).toBeUndefined();
    expect(parsed.data.size).toBe(4096);
  });

  it('redacts transcript fields', () => {
    const log = createLogger({ source: 'session', sink });
    log.info('delta', { transcript: 'sensitive content', kind: 'output' });
    const parsed = JSON.parse(captured[0]!);
    expect(parsed.data.transcript).toBeUndefined();
    expect(parsed.data.kind).toBe('output');
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```powershell
npm test -- logger
```

Expected: FAIL.

- [ ] **Step 3: Implement logger**

`src/main/util/logger.ts`:
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

const REDACTED_FIELDS = new Set(['audio', 'audio_delta', 'transcript', 'transcript_delta']);

function sanitize(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!REDACTED_FIELDS.has(k)) out[k] = v;
  }
  return out;
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
      data: sanitize(data),
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

- [ ] **Step 4: Run tests, expect pass**

```powershell
npm test -- logger
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```powershell
git add src/main/util/logger.ts tests/unit/logger.test.ts
git commit -m "Add structured JSONL logger with redaction (TDD)"
```

---

## Task 6: deviceDetector (TDD)

**Files:**
- Create: `src/main/audio/deviceDetector.ts`, `tests/unit/deviceDetector.test.ts`

Detects VB-CABLE A and B input/output devices from a list of `MediaDeviceInfo`. The labels vary slightly across versions; matching is permissive.

- [ ] **Step 1: Write failing tests**

`tests/unit/deviceDetector.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { detectVirtualCables, type DeviceInfo } from '@main/audio/deviceDetector';

const dev = (kind: 'audioinput' | 'audiooutput', label: string, deviceId = label): DeviceInfo => ({
  kind,
  label,
  deviceId,
});

describe('detectVirtualCables', () => {
  it('finds VB-CABLE A input/output', () => {
    const devices: DeviceInfo[] = [
      dev('audiooutput', 'CABLE-A Input (VB-Audio Cable A)'),
      dev('audioinput', 'CABLE-A Output (VB-Audio Cable A)'),
      dev('audiooutput', 'Speakers (Realtek)'),
      dev('audioinput', 'Mic (USB)'),
    ];
    const result = detectVirtualCables(devices);
    expect(result.cableA?.playback?.label).toContain('CABLE-A Input');
    expect(result.cableA?.recording?.label).toContain('CABLE-A Output');
  });

  it('finds VB-CABLE B input/output', () => {
    const devices: DeviceInfo[] = [
      dev('audiooutput', 'CABLE-B Input (VB-Audio Cable B)'),
      dev('audioinput', 'CABLE-B Output (VB-Audio Cable B)'),
    ];
    const result = detectVirtualCables(devices);
    expect(result.cableB?.playback?.label).toContain('CABLE-B Input');
    expect(result.cableB?.recording?.label).toContain('CABLE-B Output');
  });

  it('handles alternate label formats', () => {
    const devices: DeviceInfo[] = [
      dev('audiooutput', 'VB-Audio Cable A Input'),
      dev('audioinput', 'VB-Audio Cable A Output'),
    ];
    const result = detectVirtualCables(devices);
    expect(result.cableA?.playback).toBeDefined();
    expect(result.cableA?.recording).toBeDefined();
  });

  it('returns undefined for missing cables', () => {
    const devices: DeviceInfo[] = [
      dev('audioinput', 'Mic'),
      dev('audiooutput', 'Speakers'),
    ];
    const result = detectVirtualCables(devices);
    expect(result.cableA).toBeUndefined();
    expect(result.cableB).toBeUndefined();
  });

  it('listRealDevices excludes virtual cables', () => {
    const devices: DeviceInfo[] = [
      dev('audioinput', 'Mic (USB)'),
      dev('audioinput', 'CABLE-A Output'),
      dev('audiooutput', 'Speakers'),
      dev('audiooutput', 'CABLE-B Input'),
    ];
    const real = detectVirtualCables(devices).realDevices;
    expect(real.inputs.map((d) => d.label)).toEqual(['Mic (USB)']);
    expect(real.outputs.map((d) => d.label)).toEqual(['Speakers']);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```powershell
npm test -- deviceDetector
```

Expected: FAIL.

- [ ] **Step 3: Implement deviceDetector**

`src/main/audio/deviceDetector.ts`:
```typescript
export interface DeviceInfo {
  kind: 'audioinput' | 'audiooutput';
  label: string;
  deviceId: string;
}

export interface CablePair {
  playback?: DeviceInfo;
  recording?: DeviceInfo;
}

export interface DetectionResult {
  cableA?: CablePair;
  cableB?: CablePair;
  realDevices: { inputs: DeviceInfo[]; outputs: DeviceInfo[] };
}

const A_PLAYBACK = /CABLE[-\s]?A.*Input|VB-?Audio.*Cable[-\s]?A.*Input/i;
const A_RECORDING = /CABLE[-\s]?A.*Output|VB-?Audio.*Cable[-\s]?A.*Output/i;
const B_PLAYBACK = /CABLE[-\s]?B.*Input|VB-?Audio.*Cable[-\s]?B.*Input/i;
const B_RECORDING = /CABLE[-\s]?B.*Output|VB-?Audio.*Cable[-\s]?B.*Output/i;
const ANY_VIRTUAL = /CABLE[-\s]?[AB]|VB-?Audio.*Cable/i;

export function detectVirtualCables(devices: DeviceInfo[]): DetectionResult {
  const findOne = (kind: 'audioinput' | 'audiooutput', re: RegExp): DeviceInfo | undefined =>
    devices.find((d) => d.kind === kind && re.test(d.label));

  const cableAPlayback = findOne('audiooutput', A_PLAYBACK);
  const cableARecording = findOne('audioinput', A_RECORDING);
  const cableBPlayback = findOne('audiooutput', B_PLAYBACK);
  const cableBRecording = findOne('audioinput', B_RECORDING);

  const cableA =
    cableAPlayback || cableARecording
      ? { playback: cableAPlayback, recording: cableARecording }
      : undefined;
  const cableB =
    cableBPlayback || cableBRecording
      ? { playback: cableBPlayback, recording: cableBRecording }
      : undefined;

  const inputs = devices.filter((d) => d.kind === 'audioinput' && !ANY_VIRTUAL.test(d.label));
  const outputs = devices.filter((d) => d.kind === 'audiooutput' && !ANY_VIRTUAL.test(d.label));

  return { cableA, cableB, realDevices: { inputs, outputs } };
}
```

- [ ] **Step 4: Run tests, expect pass**

```powershell
npm test -- deviceDetector
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```powershell
git add src/main/audio/deviceDetector.ts tests/unit/deviceDetector.test.ts
git commit -m "Add VB-CABLE device detection (TDD)"
```

---

## Task 7: configStore + envFallback (TDD)

**Files:**
- Create: `src/main/config/configStore.ts`, `src/main/config/envFallback.ts`, `tests/unit/configStore.test.ts`

`safeStorage` is from Electron and wraps Windows DPAPI. We inject the encryptor for tests.

- [ ] **Step 1: Write failing tests**

`tests/unit/configStore.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigStore, type SafeStorage, type FileSystem } from '@main/config/configStore';

class FakeSafeStorage implements SafeStorage {
  isEncryptionAvailable() {
    return true;
  }
  encryptString(value: string): Buffer {
    return Buffer.from(`enc:${value}`);
  }
  decryptString(buf: Buffer): string {
    const s = buf.toString('utf8');
    if (!s.startsWith('enc:')) throw new Error('bad ciphertext');
    return s.slice(4);
  }
}

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

describe('ConfigStore', () => {
  let safe: FakeSafeStorage;
  let fs: FakeFs;
  let store: ConfigStore;

  beforeEach(() => {
    safe = new FakeSafeStorage();
    fs = new FakeFs();
    store = new ConfigStore({ safeStorage: safe, fs, configPath: 'C:/test/config.bin', envApiKey: undefined });
  });

  it('returns undefined when no key is stored and env empty', () => {
    expect(store.getApiKey()).toBeUndefined();
  });

  it('saves and retrieves API key encrypted', () => {
    store.setApiKey('sk-proj-abc123');
    expect(store.getApiKey()).toBe('sk-proj-abc123');
    // verify it's actually encrypted on disk
    const raw = fs.readFile('C:/test/config.bin')!;
    expect(raw.toString('utf8').startsWith('enc:')).toBe(true);
  });

  it('persists across instances (reads from disk)', () => {
    store.setApiKey('sk-proj-xyz');
    const store2 = new ConfigStore({ safeStorage: safe, fs, configPath: 'C:/test/config.bin', envApiKey: undefined });
    expect(store2.getApiKey()).toBe('sk-proj-xyz');
  });

  it('falls back to env var when nothing stored', () => {
    const store2 = new ConfigStore({ safeStorage: safe, fs, configPath: 'C:/test/c.bin', envApiKey: 'sk-env-fallback' });
    expect(store2.getApiKey()).toBe('sk-env-fallback');
  });

  it('stored key takes precedence over env var', () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    store.setApiKey('sk-stored');
    expect(store.getApiKey()).toBe('sk-stored');
  });

  it('clearApiKey removes stored key', () => {
    store.setApiKey('sk-stored');
    store.clearApiKey();
    expect(store.getApiKey()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```powershell
npm test -- configStore
```

Expected: FAIL.

- [ ] **Step 3: Implement configStore + envFallback**

`src/main/config/envFallback.ts`:
```typescript
export function readEnvApiKey(): string | undefined {
  const v = process.env.OPENAI_API_KEY;
  return v && v.trim().length > 0 ? v.trim() : undefined;
}
```

`src/main/config/configStore.ts`:
```typescript
export interface SafeStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(buf: Buffer): string;
}

export interface FileSystem {
  readFile(path: string): Buffer | undefined;
  writeFile(path: string, data: Buffer): void;
  exists(path: string): boolean;
}

export interface ConfigStoreDeps {
  safeStorage: SafeStorage;
  fs: FileSystem;
  configPath: string;
  envApiKey: string | undefined;
}

export class ConfigStore {
  constructor(private readonly deps: ConfigStoreDeps) {}

  getApiKey(): string | undefined {
    if (this.deps.fs.exists(this.deps.configPath)) {
      const ciphertext = this.deps.fs.readFile(this.deps.configPath);
      if (ciphertext && this.deps.safeStorage.isEncryptionAvailable()) {
        try {
          return this.deps.safeStorage.decryptString(ciphertext);
        } catch {
          /* fall through */
        }
      }
    }
    return this.deps.envApiKey;
  }

  setApiKey(value: string): void {
    if (!this.deps.safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage encryption not available on this platform');
    }
    const ciphertext = this.deps.safeStorage.encryptString(value);
    this.deps.fs.writeFile(this.deps.configPath, ciphertext);
  }

  clearApiKey(): void {
    this.deps.fs.writeFile(this.deps.configPath, Buffer.alloc(0));
  }
}
```

Note: `clearApiKey` writes empty buffer — `getApiKey` will fail to decrypt and fall through to env. Adjust the `getApiKey` flow:

In the existing implementation, an empty buffer would cause decryption to throw. The catch block means it falls through to env, which is the desired behavior.

But the test `clearApiKey removes stored key` expects `undefined` even when no env. That works because `envApiKey` is `undefined` in that test.

- [ ] **Step 4: Run tests, expect pass**

```powershell
npm test -- configStore
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```powershell
git add src/main/config/ tests/unit/configStore.test.ts
git commit -m "Add ConfigStore with safeStorage encryption + env fallback (TDD)"
```

---

## Task 8: Shared types and language list

**Files:**
- Create: `src/shared/types.ts`, `src/shared/events.ts`, `src/shared/languages.ts`

These are small, no tests needed (pure data definitions).

- [ ] **Step 1: Create src/shared/languages.ts**

```typescript
export interface Language {
  code: string;
  label: string;
}

export const LANGUAGES: Language[] = [
  { code: 'pt', label: 'Português' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
];

export function languageByCode(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}
```

- [ ] **Step 2: Create src/shared/types.ts**

```typescript
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
```

- [ ] **Step 3: Create src/shared/events.ts**

```typescript
export const IPC = {
  // Renderer → Main (invoke)
  GetApiKey: 'config:getApiKey',
  SetApiKey: 'config:setApiKey',
  ClearApiKey: 'config:clearApiKey',
  ListDevices: 'audio:listDevices',
  StartTranslation: 'translation:start',
  StopTranslation: 'translation:stop',

  // Main → Renderer (send)
  SessionStateChanged: 'session:stateChanged',
  TranscriptDelta: 'transcript:delta',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
```

- [ ] **Step 4: Verify typecheck still passes**

```powershell
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/
git commit -m "Add shared types, IPC channels, and language list"
```

---

## Task 9: openaiSession (TDD with fake WebSocket)

**Files:**
- Create: `src/main/translate/openaiSession.ts`, `tests/unit/openaiSession.test.ts`

`OpenAISession` wraps a single WebSocket connection to `wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate` with lifecycle callbacks. Tests use a fake WebSocket. We inject a `WebSocket` factory.

- [ ] **Step 1: Write failing tests**

`tests/unit/openaiSession.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAISession, type SessionEvents, type WebSocketLike, type WebSocketFactory } from '@main/translate/openaiSession';

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  readyState = 0; // CONNECTING
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
  // helpers for tests
  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
  simulateMessage(payload: object) {
    this.onmessage?.(JSON.stringify(payload));
  }
  simulateError(err: Error) {
    this.onerror?.(err);
  }
}

const fakeFactory: WebSocketFactory = (url, headers) => new FakeWebSocket(url, headers);

describe('OpenAISession', () => {
  let events: SessionEvents;
  let onState: ReturnType<typeof vi.fn>;
  let onAudio: ReturnType<typeof vi.fn>;
  let onTranscript: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    onState = vi.fn();
    onAudio = vi.fn();
    onTranscript = vi.fn();
    events = { onState, onAudio, onTranscript };
  });

  it('opens connection with correct URL and headers, then sends session.update', async () => {
    const session = new OpenAISession({
      apiKey: 'sk-test',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();

    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe('wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate');
    expect(ws.headers.Authorization).toBe('Bearer sk-test');

    ws.simulateOpen();

    expect(ws.sent).toHaveLength(1);
    const config = JSON.parse(ws.sent[0]!);
    expect(config.type).toBe('session.update');
    expect(config.session.audio.output.language).toBe('en');
    expect(config.session.input_audio_format).toBe('pcm16');
    expect(config.session.output_audio_format).toBe('pcm16');
  });

  it('emits state transitions: connecting -> active', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    expect(onState).toHaveBeenCalledWith({ kind: 'connecting' });
    FakeWebSocket.instances[0]!.simulateOpen();
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'active' }));
  });

  it('appendAudio sends input_audio_buffer.append', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.sent = []; // reset

    session.appendAudio('base64audiochunk');
    const msg = JSON.parse(ws.sent[0]!);
    expect(msg.type).toBe('session.input_audio_buffer.append');
    expect(msg.audio).toBe('base64audiochunk');
  });

  it('emits audio delta events', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ type: 'session.output_audio.delta', delta: 'b64chunk' });
    expect(onAudio).toHaveBeenCalledWith('b64chunk');
  });

  it('emits transcript deltas', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ type: 'session.input_transcript.delta', delta: 'olá' });
    ws.simulateMessage({ type: 'session.output_transcript.delta', delta: 'hello' });
    expect(onTranscript).toHaveBeenCalledWith({ kind: 'input', text: 'olá' });
    expect(onTranscript).toHaveBeenCalledWith({ kind: 'output', text: 'hello' });
  });

  it('stop() closes the socket and emits idle state', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    session.stop();
    expect(ws.closed).toBe(true);
    expect(onState).toHaveBeenLastCalledWith({ kind: 'idle' });
  });

  it('appendAudio before open is silently buffered until open', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    session.appendAudio('chunk1');
    session.appendAudio('chunk2');
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.sent).toHaveLength(0);
    ws.simulateOpen();
    // After open: session.update + 2 buffered chunks
    expect(ws.sent).toHaveLength(3);
    expect(JSON.parse(ws.sent[1]!).audio).toBe('chunk1');
    expect(JSON.parse(ws.sent[2]!).audio).toBe('chunk2');
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```powershell
npm test -- openaiSession
```

Expected: FAIL.

- [ ] **Step 3: Implement OpenAISession**

`src/main/translate/openaiSession.ts`:
```typescript
import type { SessionState } from '@shared/types';

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen?: () => void;
  onclose?: (code: number, reason: string) => void;
  onmessage?: (data: string) => void;
  onerror?: (err: Error) => void;
}

export type WebSocketFactory = (url: string, headers: Record<string, string>) => WebSocketLike;

export interface SessionEvents {
  onState: (s: SessionState) => void;
  onAudio: (base64: string) => void;
  onTranscript: (t: { kind: 'input' | 'output'; text: string }) => void;
}

export interface OpenAISessionConfig {
  apiKey: string;
  sourceLang: string;
  targetLang: string;
  events: SessionEvents;
  wsFactory: WebSocketFactory;
  voice?: string;
}

const ENDPOINT = 'wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate';

export class OpenAISession {
  private ws?: WebSocketLike;
  private isOpen = false;
  private pendingAudio: string[] = [];

  constructor(private readonly cfg: OpenAISessionConfig) {}

  start(): void {
    this.cfg.events.onState({ kind: 'connecting' });
    this.ws = this.cfg.wsFactory(ENDPOINT, {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      'OpenAI-Safety-Identifier': 'realtime-translate-client',
    });
    this.ws.onopen = () => this.handleOpen();
    this.ws.onmessage = (data) => this.handleMessage(data);
    this.ws.onclose = (code, reason) => this.handleClose(code, reason);
    this.ws.onerror = (err) => this.handleError(err);
  }

  appendAudio(base64: string): void {
    if (!this.isOpen) {
      this.pendingAudio.push(base64);
      return;
    }
    this.sendRaw({ type: 'session.input_audio_buffer.append', audio: base64 });
  }

  stop(): void {
    if (this.ws && !this.isClosed()) {
      this.ws.close(1000, 'client stop');
    }
    this.cfg.events.onState({ kind: 'idle' });
  }

  private handleOpen(): void {
    this.isOpen = true;
    this.sendRaw({
      type: 'session.update',
      session: {
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        audio: {
          output: {
            language: this.cfg.targetLang,
            ...(this.cfg.voice ? { voice: this.cfg.voice } : {}),
          },
        },
      },
    });
    for (const chunk of this.pendingAudio) {
      this.sendRaw({ type: 'session.input_audio_buffer.append', audio: chunk });
    }
    this.pendingAudio = [];
    this.cfg.events.onState({ kind: 'active', sinceMs: Date.now() });
  }

  private handleMessage(raw: string): void {
    let event: { type: string; delta?: string };
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    if (event.type === 'session.output_audio.delta' && event.delta) {
      this.cfg.events.onAudio(event.delta);
    } else if (event.type === 'session.input_transcript.delta' && event.delta) {
      this.cfg.events.onTranscript({ kind: 'input', text: event.delta });
    } else if (event.type === 'session.output_transcript.delta' && event.delta) {
      this.cfg.events.onTranscript({ kind: 'output', text: event.delta });
    }
  }

  private handleClose(_code: number, _reason: string): void {
    this.isOpen = false;
  }

  private handleError(err: Error): void {
    this.cfg.events.onState({ kind: 'error', message: err.message });
  }

  private sendRaw(payload: object): void {
    this.ws?.send(JSON.stringify(payload));
  }

  private isClosed(): boolean {
    return !this.ws || this.ws.readyState === 3;
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```powershell
npm test -- openaiSession
```

Expected: 7 passing.

- [ ] **Step 5: Commit**

```powershell
git add src/main/translate/openaiSession.ts tests/unit/openaiSession.test.ts
git commit -m "Add OpenAISession with WebSocket lifecycle (TDD)"
```

---

## Task 10: Offscreen renderer scaffold + AudioWorklet

**Files:**
- Create: `src/renderer/offscreen.html`, `src/offscreen/index.ts`, `src/offscreen/webAudioBridge.ts`, `src/offscreen/workers/pcmEncoder.worklet.ts`

The offscreen renderer is a hidden Electron window that owns Web Audio. Main controls it via IPC. The HTML lives next to the main renderer's index.html so vite's dev server picks it up at `/offscreen.html`; the script is in `src/offscreen/` to keep the source separation.

- [ ] **Step 1: Create src/renderer/offscreen.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Realtime Translate — Offscreen</title>
  </head>
  <body>
    <script type="module" src="../offscreen/index.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create src/offscreen/workers/pcmEncoder.worklet.ts**

```typescript
// AudioWorklet that emits Float32 frames as 'pcm' messages.
// Resampling to 24kHz is handled by AudioContext sampleRate config.

class PcmEncoderProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
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

- [ ] **Step 3: Create src/offscreen/webAudioBridge.ts**

```typescript
import { float32ToPcm16Base64, pcm16Base64ToFloat32 } from '../main/util/pcmCodec';

export interface CaptureHandle {
  stop(): void;
}

export interface PlaybackHandle {
  push(base64Pcm16: string): void;
  stop(): void;
}

export async function startCapture(
  micDeviceId: string,
  onPcmChunk: (base64: string) => void,
): Promise<CaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: micDeviceId },
      sampleRate: { ideal: 24000 },
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const ctx = new AudioContext({ sampleRate: 24000 });
  await ctx.audioWorklet.addModule(new URL('./workers/pcmEncoder.worklet.ts', import.meta.url));
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'pcm-encoder');
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    onPcmChunk(float32ToPcm16Base64(e.data));
  };
  source.connect(node);
  return {
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      node.disconnect();
      void ctx.close();
    },
  };
}

export async function startPlayback(outputDeviceId: string): Promise<PlaybackHandle> {
  const ctx = new AudioContext({ sampleRate: 24000 });
  // Cast: setSinkId is part of the spec but TS lib may not have it on AudioContext yet.
  const ctxAny = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (typeof ctxAny.setSinkId === 'function') {
    await ctxAny.setSinkId(outputDeviceId);
  } else {
    throw new Error('AudioContext.setSinkId is not supported in this Electron build');
  }

  return {
    push(base64Pcm16: string): void {
      const samples = pcm16Base64ToFloat32(base64Pcm16);
      if (samples.length === 0) return;
      const buffer = ctx.createBuffer(1, samples.length, 24000);
      buffer.copyToChannel(samples, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start();
    },
    stop(): void {
      void ctx.close();
    },
  };
}

export async function listDevices(): Promise<MediaDeviceInfo[]> {
  // Enumerate requires permission to expose labels — request once.
  await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => undefined);
  return navigator.mediaDevices.enumerateDevices();
}
```

- [ ] **Step 4: Create src/offscreen/index.ts (boot)**

```typescript
import { startCapture, startPlayback, listDevices, type CaptureHandle, type PlaybackHandle } from './webAudioBridge';

declare global {
  interface Window {
    offscreen: {
      listDevices(): Promise<{ deviceId: string; label: string; kind: string }[]>;
      startCapture(micDeviceId: string): Promise<void>;
      startPlayback(outDeviceId: string): Promise<void>;
      pushAudio(base64: string): void;
      stopAll(): void;
    };
  }
}

let capture: CaptureHandle | undefined;
let playback: PlaybackHandle | undefined;
const pcmListeners = new Set<(b64: string) => void>();

window.offscreen = {
  async listDevices() {
    const devs = await listDevices();
    return devs.map((d) => ({ deviceId: d.deviceId, label: d.label, kind: d.kind }));
  },
  async startCapture(micDeviceId) {
    capture?.stop();
    capture = await startCapture(micDeviceId, (b64) => {
      for (const cb of pcmListeners) cb(b64);
    });
  },
  async startPlayback(outDeviceId) {
    playback?.stop();
    playback = await startPlayback(outDeviceId);
  },
  pushAudio(base64) {
    playback?.push(base64);
  },
  stopAll() {
    capture?.stop();
    playback?.stop();
    capture = undefined;
    playback = undefined;
  },
};

// Expose pcm listener registration to main via postMessage.
window.addEventListener('message', (event) => {
  if (event.data?.type === 'register-pcm-listener') {
    const port = event.ports[0];
    if (!port) return;
    pcmListeners.add((b64) => port.postMessage({ type: 'pcm', data: b64 }));
  }
});
```

> Note: this file uses `window.offscreen` as an injection point. The main process will navigate the offscreen window and call into it via Electron's `webContents.executeJavaScript` or via a MessageChannel. We finalize the bridge in Task 12.

- [ ] **Step 5: Verify offscreen builds (type-check only — full build comes in Task 14)**

```powershell
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```powershell
git add src/offscreen/
git commit -m "Add offscreen renderer Web Audio bridge + PCM AudioWorklet"
```

---

## Task 11: VALIDATION SPIKE — `setSinkId` to virtual cable

**This is a GATE.** If the spike fails, downstream tasks change (use `naudiodon` as plan B).

**Files:**
- Create: `docs/superpowers/spikes/2026-05-07-setsinkid-spike.md`, `scripts/spike-setSinkId.ts`

The spike test: in a minimal Electron app, can we route Web Audio output to a specific virtual cable device?

- [ ] **Step 1: Create spike doc shell**

`docs/superpowers/spikes/2026-05-07-setsinkid-spike.md`:
```markdown
# Spike: AudioContext.setSinkId to VB-CABLE A

**Question:** Can an Electron renderer (Web Audio API, Chromium-based) route output to VB-CABLE A virtual playback device using `AudioContext.setSinkId`?

**Why it matters:** Our entire audio output path depends on this working. If it doesn't, we pivot to `naudiodon` (Node-PortAudio bindings).

## Setup
- VB-CABLE A+B installed
- Electron version: <fill in after install>
- Spike script: `scripts/spike-setSinkId.ts`

## Method

1. Run `npm run dev`
2. App lists output devices
3. Click "Test" — generates a 1-second 440 Hz tone
4. AudioContext output is routed to CABLE-A Input (selected by user)
5. Listener captures CABLE-A Output via a separate listener app (e.g., Audacity, OBS, or just set Windows monitoring on CABLE-A Output)
6. Verify: tone is heard from CABLE-A Output

## Result

- [ ] PASS — tone audible on CABLE-A Output
- [ ] FAIL — describe what happened

## If FAIL
Pivot to `naudiodon`:
- Install `npm i naudiodon`
- Implement `playback` in main process via portaudio bindings instead of Web Audio
- Update plan file structure: remove `setSinkId` references in `webAudioBridge.ts`, add `src/main/audio/nativePlayback.ts`
```

- [ ] **Step 2: Create scripts/spike-setSinkId.ts**

```typescript
// Standalone HTML spike runner — opens an Electron window that lists output
// devices, plays a 1-second 440 Hz tone, and pipes it to a chosen device via setSinkId.

// This script is invoked by `npm run spike` (added in step 3). It bootstraps a
// minimal BrowserWindow without any of the app code.

import { app, BrowserWindow } from 'electron';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 480,
    height: 320,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const html = `
    <!doctype html>
    <html><body style="font-family: system-ui; padding: 20px; background: #111; color: #eee;">
      <h2>setSinkId spike</h2>
      <select id="dev"></select>
      <button id="play">Play 440 Hz tone</button>
      <pre id="log"></pre>
      <script>
        const log = (m) => { document.getElementById('log').textContent += m + '\\n'; };
        async function init() {
          await navigator.mediaDevices.getUserMedia({ audio: true });
          const all = await navigator.mediaDevices.enumerateDevices();
          const outs = all.filter(d => d.kind === 'audiooutput');
          const sel = document.getElementById('dev');
          for (const d of outs) {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || d.deviceId;
            sel.appendChild(opt);
          }
        }
        async function play() {
          const id = document.getElementById('dev').value;
          const ctx = new AudioContext();
          if (!ctx.setSinkId) { log('AudioContext.setSinkId NOT supported'); return; }
          try {
            await ctx.setSinkId(id);
            log('setSinkId OK: ' + id);
          } catch (e) {
            log('setSinkId failed: ' + e.message);
            return;
          }
          const osc = ctx.createOscillator();
          osc.frequency.value = 440;
          osc.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 1.0);
          log('tone playing for 1s');
        }
        document.getElementById('play').addEventListener('click', play);
        init();
      </script>
    </body></html>
  `;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});

app.on('window-all-closed', () => app.quit());
```

- [ ] **Step 3: Add `spike` script to package.json**

Open `package.json` and add to the `"scripts"` block:

```json
"spike": "tsc --module CommonJS --outDir out/spike scripts/spike-setSinkId.ts && electron out/spike/spike-setSinkId.js"
```

- [ ] **Step 4: Run the spike**

```powershell
npm run spike
```

Manual procedure:
1. Confirm VB-CABLE A+B are installed (Windows Sound Control Panel shows them under Playback and Recording)
2. App opens with dropdown listing output devices
3. Select **CABLE-A Input (VB-Audio Cable A)**
4. Click "Play 440 Hz tone"
5. Confirm: tone is audible on CABLE-A Output. Easiest verification: in Windows Sound > Recording > right-click CABLE-A Output > Properties > Listen tab > "Listen to this device" → choose your real headset → click OK. You should hear the tone.

- [ ] **Step 5: Document spike result**

Edit `docs/superpowers/spikes/2026-05-07-setsinkid-spike.md` to mark PASS or FAIL. If FAIL, **stop the plan here** and revise the file structure before continuing — this changes Task 10's `webAudioBridge.ts` and Task 12's `audioPipeline.ts`.

- [ ] **Step 6: Commit spike result**

```powershell
git add docs/superpowers/spikes/ scripts/spike-setSinkId.ts package.json
git commit -m "Validation spike: AudioContext.setSinkId to VB-CABLE A — <PASS|FAIL>"
```

> ⚠️ If FAIL, do not proceed past this point until the plan is revised.

---

## Task 12: audioPipeline (integration test)

**Files:**
- Create: `src/main/translate/audioPipeline.ts`, `tests/integration/audioPipeline.test.ts`

The pipeline orchestrates: capture chunks from offscreen → forward to OpenAI session → forward audio deltas back to offscreen for playback. M1 has only one direction (mic → PT→EN session → CABLE-A).

We abstract the offscreen renderer behind an `OffscreenController` interface so we can fake it in tests.

- [ ] **Step 1: Write failing integration tests**

`tests/integration/audioPipeline.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioPipeline, type OffscreenController } from '@main/translate/audioPipeline';
import type { OpenAISession } from '@main/translate/openaiSession';

class FakeOffscreen implements OffscreenController {
  startCaptureCalled = '';
  startPlaybackCalled = '';
  pushedAudio: string[] = [];
  pcmCallback?: (b64: string) => void;
  stopped = false;

  async startCapture(deviceId: string, onPcm: (b64: string) => void): Promise<void> {
    this.startCaptureCalled = deviceId;
    this.pcmCallback = onPcm;
  }
  async startPlayback(deviceId: string): Promise<void> {
    this.startPlaybackCalled = deviceId;
  }
  pushPlayback(b64: string): void {
    this.pushedAudio.push(b64);
  }
  stopAll(): void {
    this.stopped = true;
  }
}

class FakeSession {
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
      offscreen,
      session: session as unknown as OpenAISession,
      micDeviceId: 'mic-123',
      outputDeviceId: 'cable-a-456',
    });
  });

  it('start() initializes capture, playback, and the session', async () => {
    await pipeline.start();
    expect(offscreen.startCaptureCalled).toBe('mic-123');
    expect(offscreen.startPlaybackCalled).toBe('cable-a-456');
    expect(session.startCalled).toBe(true);
  });

  it('forwards captured PCM chunks to session.appendAudio', async () => {
    await pipeline.start();
    offscreen.pcmCallback?.('chunk1');
    offscreen.pcmCallback?.('chunk2');
    expect(session.appendCalls).toEqual(['chunk1', 'chunk2']);
  });

  it('forwards session audio deltas to offscreen playback', async () => {
    await pipeline.start();
    pipeline.handleSessionAudio('output-chunk-1');
    pipeline.handleSessionAudio('output-chunk-2');
    expect(offscreen.pushedAudio).toEqual(['output-chunk-1', 'output-chunk-2']);
  });

  it('stop() cleans up everything', async () => {
    await pipeline.start();
    pipeline.stop();
    expect(session.stopCalled).toBe(true);
    expect(offscreen.stopped).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```powershell
npm test -- audioPipeline
```

Expected: FAIL.

- [ ] **Step 3: Implement audioPipeline**

`src/main/translate/audioPipeline.ts`:
```typescript
import type { OpenAISession } from './openaiSession';

export interface OffscreenController {
  startCapture(deviceId: string, onPcm: (b64: string) => void): Promise<void>;
  startPlayback(deviceId: string): Promise<void>;
  pushPlayback(b64: string): void;
  stopAll(): void;
}

export interface AudioPipelineConfig {
  offscreen: OffscreenController;
  session: OpenAISession;
  micDeviceId: string;
  outputDeviceId: string;
}

export class AudioPipeline {
  constructor(private readonly cfg: AudioPipelineConfig) {}

  async start(): Promise<void> {
    await this.cfg.offscreen.startPlayback(this.cfg.outputDeviceId);
    await this.cfg.offscreen.startCapture(this.cfg.micDeviceId, (b64) =>
      this.cfg.session.appendAudio(b64),
    );
    this.cfg.session.start();
  }

  handleSessionAudio(base64: string): void {
    this.cfg.offscreen.pushPlayback(base64);
  }

  stop(): void {
    this.cfg.session.stop();
    this.cfg.offscreen.stopAll();
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```powershell
npm test -- audioPipeline
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```powershell
git add src/main/translate/audioPipeline.ts tests/integration/audioPipeline.test.ts
git commit -m "Add AudioPipeline orchestrating capture, session, and playback (TDD)"
```

---

## Task 13: IPC channels and preload bridge

**Files:**
- Create: `src/main/ipc/channels.ts`, `src/main/ipc/handlers.ts`, `src/main/preload.ts`

`channels.ts` declares the typed payloads for each IPC channel. `handlers.ts` registers the actual handlers. `preload.ts` exposes a typed API to renderer via `contextBridge`.

- [ ] **Step 1: Create src/main/ipc/channels.ts**

```typescript
import { IPC } from '@shared/events';
import type { DeviceInventory, SessionState, StartTranslationArgs } from '@shared/types';

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
```

- [ ] **Step 2: Create src/main/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/events';
import type { IpcInvokeMap, IpcSendMap } from './ipc/channels';
import type { DeviceInventory, SessionState, StartTranslationArgs } from '../shared/types';

const api = {
  getApiKey: (): Promise<string | undefined> => ipcRenderer.invoke(IPC.GetApiKey),
  setApiKey: (value: string): Promise<void> => ipcRenderer.invoke(IPC.SetApiKey, { value }),
  clearApiKey: (): Promise<void> => ipcRenderer.invoke(IPC.ClearApiKey),
  listDevices: (): Promise<DeviceInventory> => ipcRenderer.invoke(IPC.ListDevices),
  startTranslation: (args: StartTranslationArgs): Promise<void> =>
    ipcRenderer.invoke(IPC.StartTranslation, args),
  stopTranslation: (): Promise<void> => ipcRenderer.invoke(IPC.StopTranslation),

  onSessionState: (cb: (s: SessionState) => void): (() => void) => {
    const handler = (_evt: unknown, s: SessionState) => cb(s);
    ipcRenderer.on(IPC.SessionStateChanged, handler);
    return () => ipcRenderer.off(IPC.SessionStateChanged, handler);
  },
  onTranscript: (cb: (t: { kind: 'input' | 'output'; text: string }) => void): (() => void) => {
    const handler = (_evt: unknown, t: { kind: 'input' | 'output'; text: string }) => cb(t);
    ipcRenderer.on(IPC.TranscriptDelta, handler);
    return () => ipcRenderer.off(IPC.TranscriptDelta, handler);
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

- [ ] **Step 3: Create src/main/ipc/handlers.ts (skeleton — wired in Task 14)**

```typescript
import { ipcMain, safeStorage, app } from 'electron';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { IPC } from '../../shared/events';
import { ConfigStore } from '../config/configStore';
import { readEnvApiKey } from '../config/envFallback';
import type { DeviceInventory, StartTranslationArgs } from '../../shared/types';

interface HandlerDeps {
  onStart: (args: StartTranslationArgs) => Promise<void>;
  onStop: () => Promise<void>;
  listDevices: () => Promise<DeviceInventory>;
}

export function registerIpcHandlers(deps: HandlerDeps): { configStore: ConfigStore } {
  const configPath = join(app.getPath('userData'), 'apikey.bin');

  const configStore = new ConfigStore({
    safeStorage: {
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
      encryptString: (s) => safeStorage.encryptString(s),
      decryptString: (b) => safeStorage.decryptString(b),
    },
    fs: {
      readFile: (p) => (existsSync(p) ? readFileSync(p) : undefined),
      writeFile: (p, d) => writeFileSync(p, d),
      exists: (p) => existsSync(p),
    },
    configPath,
    envApiKey: readEnvApiKey(),
  });

  ipcMain.handle(IPC.GetApiKey, () => configStore.getApiKey());
  ipcMain.handle(IPC.SetApiKey, (_e, args: { value: string }) => configStore.setApiKey(args.value));
  ipcMain.handle(IPC.ClearApiKey, () => configStore.clearApiKey());
  ipcMain.handle(IPC.ListDevices, () => deps.listDevices());
  ipcMain.handle(IPC.StartTranslation, (_e, args: StartTranslationArgs) => deps.onStart(args));
  ipcMain.handle(IPC.StopTranslation, () => deps.onStop());

  return { configStore };
}
```

- [ ] **Step 4: Verify typecheck**

```powershell
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```powershell
git add src/main/ipc/ src/main/preload.ts
git commit -m "Add typed IPC channels, handlers skeleton, and preload bridge"
```

---

## Task 14: Main process boot — wire it all together

**Files:**
- Create: `src/main/app.ts`

This brings up two windows: the visible UI window and the hidden offscreen window. It wires IPC handlers to a `SessionRunner` that owns the active `OpenAISession` and `AudioPipeline`.

- [ ] **Step 1: Implement src/main/app.ts**

```typescript
import { app, BrowserWindow, MessageChannelMain, ipcMain } from 'electron';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { registerIpcHandlers } from './ipc/handlers';
import { OpenAISession, type WebSocketLike, type WebSocketFactory } from './translate/openaiSession';
import { AudioPipeline, type OffscreenController } from './translate/audioPipeline';
import { detectVirtualCables, type DeviceInfo } from './audio/deviceDetector';
import { IPC } from '../shared/events';
import type { DeviceInventory, SessionState, StartTranslationArgs } from '../shared/types';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEV_BASE = process.env.ELECTRON_RENDERER_URL;
const RENDERER_URL = DEV_BASE
  ? `${DEV_BASE.replace(/\/$/, '')}/index.html`
  : `file://${resolve(__dirname, '../renderer/index.html')}`;
const OFFSCREEN_URL = DEV_BASE
  ? `${DEV_BASE.replace(/\/$/, '')}/offscreen.html`
  : `file://${resolve(__dirname, '../renderer/offscreen.html')}`;

let mainWindow: BrowserWindow | null = null;
let offscreenWindow: BrowserWindow | null = null;

const wsFactory: WebSocketFactory = (url, headers) => {
  const ws = new WebSocket(url, { headers });
  const handle: WebSocketLike & {
    onopen?: () => void;
    onclose?: (c: number, r: string) => void;
    onmessage?: (d: string) => void;
    onerror?: (e: Error) => void;
  } = {
    get readyState() {
      return ws.readyState;
    },
    send: (data) => ws.send(data),
    close: (code, reason) => ws.close(code, reason),
  };
  ws.on('open', () => handle.onopen?.());
  ws.on('close', (c, r) => handle.onclose?.(c, r.toString()));
  ws.on('message', (d) => handle.onmessage?.(d.toString()));
  ws.on('error', (e) => handle.onerror?.(e));
  return handle;
};

class OffscreenBridge implements OffscreenController {
  private pcmCallback?: (b64: string) => void;

  constructor(private readonly window: BrowserWindow) {
    ipcMain.on('offscreen:pcm', (_e, b64: string) => this.pcmCallback?.(b64));
  }

  async startCapture(deviceId: string, onPcm: (b64: string) => void): Promise<void> {
    this.pcmCallback = onPcm;
    await this.window.webContents.executeJavaScript(
      `window.offscreen.startCapture(${JSON.stringify(deviceId)})`,
    );
  }
  async startPlayback(deviceId: string): Promise<void> {
    await this.window.webContents.executeJavaScript(
      `window.offscreen.startPlayback(${JSON.stringify(deviceId)})`,
    );
  }
  pushPlayback(b64: string): void {
    this.window.webContents.send('offscreen:pushAudio', b64);
  }
  stopAll(): void {
    this.window.webContents.executeJavaScript('window.offscreen.stopAll()').catch(() => undefined);
  }
}

class SessionRunner {
  private session?: OpenAISession;
  private pipeline?: AudioPipeline;

  constructor(
    private readonly getApiKey: () => string | undefined,
    private readonly offscreen: OffscreenController,
    private readonly emitState: (s: SessionState) => void,
    private readonly emitTranscript: (t: { kind: 'input' | 'output'; text: string }) => void,
  ) {}

  async start(args: StartTranslationArgs): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('No API key configured');
    this.session = new OpenAISession({
      apiKey,
      sourceLang: args.sourceLang,
      targetLang: args.targetLang,
      events: {
        onState: (s) => this.emitState(s),
        onAudio: (b64) => this.pipeline?.handleSessionAudio(b64),
        onTranscript: (t) => this.emitTranscript(t),
      },
      wsFactory,
    });
    this.pipeline = new AudioPipeline({
      offscreen: this.offscreen,
      session: this.session,
      micDeviceId: args.micDeviceId,
      outputDeviceId: args.outputDeviceId,
    });
    await this.pipeline.start();
  }

  stop(): void {
    this.pipeline?.stop();
    this.pipeline = undefined;
    this.session = undefined;
  }
}

async function createWindows(): Promise<void> {
  offscreenWindow = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await offscreenWindow.loadURL(OFFSCREEN_URL);

  mainWindow = new BrowserWindow({
    width: 360,
    height: 480,
    backgroundColor: '#08090a',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await mainWindow.loadURL(RENDERER_URL);
}

app.whenReady().then(async () => {
  await createWindows();
  if (!offscreenWindow || !mainWindow) throw new Error('windows not created');

  const offscreenBridge = new OffscreenBridge(offscreenWindow);

  const emitState = (s: SessionState) => mainWindow?.webContents.send(IPC.SessionStateChanged, s);
  const emitTranscript = (t: { kind: 'input' | 'output'; text: string }) =>
    mainWindow?.webContents.send(IPC.TranscriptDelta, t);

  const { configStore } = registerIpcHandlers({
    onStart: async (args) => runner.start(args),
    onStop: async () => runner.stop(),
    listDevices: async (): Promise<DeviceInventory> => {
      const raw: { deviceId: string; label: string; kind: string }[] =
        await offscreenWindow!.webContents.executeJavaScript('window.offscreen.listDevices()');
      const typed: DeviceInfo[] = raw.map((d) => ({
        deviceId: d.deviceId,
        label: d.label,
        kind: d.kind as 'audioinput' | 'audiooutput',
      }));
      const detection = detectVirtualCables(typed);
      return {
        inputs: detection.realDevices.inputs.map((d) => ({
          deviceId: d.deviceId,
          label: d.label,
          kind: d.kind,
        })),
        outputs: detection.realDevices.outputs.map((d) => ({
          deviceId: d.deviceId,
          label: d.label,
          kind: d.kind,
        })),
        ...(detection.cableA
          ? {
              cableA: {
                playback: detection.cableA.playback
                  ? { deviceId: detection.cableA.playback.deviceId, label: detection.cableA.playback.label, kind: detection.cableA.playback.kind }
                  : undefined,
                recording: detection.cableA.recording
                  ? { deviceId: detection.cableA.recording.deviceId, label: detection.cableA.recording.label, kind: detection.cableA.recording.kind }
                  : undefined,
              },
            }
          : {}),
        ...(detection.cableB
          ? {
              cableB: {
                playback: detection.cableB.playback
                  ? { deviceId: detection.cableB.playback.deviceId, label: detection.cableB.playback.label, kind: detection.cableB.playback.kind }
                  : undefined,
                recording: detection.cableB.recording
                  ? { deviceId: detection.cableB.recording.deviceId, label: detection.cableB.recording.label, kind: detection.cableB.recording.kind }
                  : undefined,
              },
            }
          : {}),
      };
    },
  });

  const runner = new SessionRunner(
    () => configStore.getApiKey(),
    offscreenBridge,
    emitState,
    emitTranscript,
  );
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2: Update offscreen index.ts to wire pushAudio over IPC**

Edit `src/offscreen/index.ts`. Replace the `window.addEventListener('message', ...)` block (added in Task 10 step 4) with a call to `ipcRenderer.on`:

Replace lines starting with `// Expose pcm listener registration to main via postMessage.` through end of file with:

```typescript
import { ipcRenderer } from 'electron';

// Forward outbound audio from main to playback.
ipcRenderer.on('offscreen:pushAudio', (_e, b64: string) => {
  window.offscreen.pushAudio(b64);
});

// Forward captured PCM chunks back to main.
const captureFn = window.offscreen.startCapture;
window.offscreen.startCapture = async (micId: string) => {
  await startCapture(micId, (b64) => ipcRenderer.send('offscreen:pcm', b64));
};
```

> Note: this wraps the existing `startCapture` to also emit each chunk over IPC.

- [ ] **Step 3: Verify typecheck**

```powershell
npm run typecheck
```

Expected: 0 errors. (Some red flags may need cleanup — fix until clean.)

- [ ] **Step 4: Commit**

```powershell
git add src/main/app.ts src/offscreen/index.ts
git commit -m "Wire main process: SessionRunner, OffscreenBridge, IPC handlers"
```

---

## Task 15: Renderer scaffold — design tokens + minimal M1 UI

**Files:**
- Create: `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/state/store.ts`, `src/renderer/ipc/client.ts`, `src/renderer/views/M1TestRig.tsx`, `src/renderer/styles/tokens.css`, `src/renderer/styles/global.css`

The M1 UI is intentionally simple: API key entry, device pickers, Start/Stop button, status text. Same design language (tokens) as the spec, just compressed UI. The polished `FloatingWidget` ships in M3.

- [ ] **Step 1: Extract design tokens from docs/design/design-system.html**

`src/renderer/styles/tokens.css`:
```css
:root {
  --bg-canvas: #08090a;
  --bg-base: #0a0a0b;
  --surface: #131517;
  --surface-elevated: #1a1d20;
  --surface-overlay: #202428;
  --border-subtle: #1f2226;
  --border-default: #2a2e34;
  --border-strong: #3a3f47;

  --text-primary: #f4f4f5;
  --text-secondary: #a1a1aa;
  --text-tertiary: #71717a;
  --text-quaternary: #52525b;

  --accent: #6e7fc4;
  --accent-hover: #8290d0;
  --accent-muted: rgba(110, 127, 196, 0.14);
  --accent-border: rgba(110, 127, 196, 0.32);

  --success: #4ade80;
  --warning: #f59e0b;
  --error: #f87171;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  --shadow-widget: 0 1px 2px rgba(0, 0, 0, 0.2), 0 12px 32px rgba(0, 0, 0, 0.55),
    0 0 0 0.5px rgba(255, 255, 255, 0.05);

  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;
}
```

- [ ] **Step 2: Create global.css**

`src/renderer/styles/global.css`:
```css
@import './tokens.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  background: var(--bg-canvas);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  letter-spacing: -0.005em;
}

button {
  font: inherit;
  cursor: pointer;
}
```

- [ ] **Step 3: Create index.html**

`src/renderer/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="preconnect" href="https://rsms.me/" />
    <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
    <title>Realtime Translate</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create state/store.ts**

`src/renderer/state/store.ts`:
```typescript
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
```

- [ ] **Step 5: Create ipc/client.ts**

`src/renderer/ipc/client.ts`:
```typescript
// The preload exposes window.rt — re-export with type for renderer use.
import type { RtApi } from '../../main/preload';

declare global {
  interface Window {
    rt: RtApi;
  }
}

export const rt: RtApi = window.rt;
```

- [ ] **Step 6: Create views/M1TestRig.tsx**

`src/renderer/views/M1TestRig.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { rt } from '../ipc/client';

export function M1TestRig(): JSX.Element {
  const {
    apiKey,
    devices,
    selectedMic,
    selectedOutput,
    sessionState,
    setApiKey,
    setDevices,
    setSelectedMic,
    setSelectedOutput,
    setSessionState,
  } = useStore();

  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    rt.getApiKey().then(setApiKey);
    rt.listDevices().then(setDevices);
    const off1 = rt.onSessionState(setSessionState);
    return () => off1();
  }, [setApiKey, setDevices, setSessionState]);

  const onSaveKey = async () => {
    setError(undefined);
    if (!keyInput.startsWith('sk-')) {
      setError('Key must start with sk-');
      return;
    }
    await rt.setApiKey(keyInput);
    setApiKey(keyInput);
    setKeyInput('');
  };

  const onStart = async () => {
    setError(undefined);
    if (!selectedMic || !selectedOutput) {
      setError('Pick mic and output');
      return;
    }
    try {
      await rt.startTranslation({
        sourceLang: 'pt',
        targetLang: 'en',
        micDeviceId: selectedMic,
        outputDeviceId: selectedOutput,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onStop = async () => {
    await rt.stopTranslation();
  };

  const cableAOption = devices?.cableA?.playback;
  const isActive = sessionState.kind === 'active';
  const isConnecting = sessionState.kind === 'connecting';

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ marginBottom: 8 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-tertiary)',
          }}
        >
          M1 Test Rig
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Realtime Translate</h1>
      </header>

      <section>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>OpenAI API Key</label>
        {apiKey ? (
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-primary)',
              padding: '8px 10px',
              background: 'var(--surface)',
              borderRadius: 6,
              marginTop: 4,
            }}
          >
            ●●●●●●●●{apiKey.slice(-4)}{' '}
            <button
              onClick={async () => {
                await rt.clearApiKey();
                setApiKey(undefined);
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
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
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
              onClick={onSaveKey}
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

      <section>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Microphone</label>
        <select
          value={selectedMic ?? ''}
          onChange={(e) => setSelectedMic(e.target.value)}
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

      <section>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Output (CABLE-A or speaker)
        </label>
        <select
          value={selectedOutput ?? ''}
          onChange={(e) => setSelectedOutput(e.target.value)}
          style={selectStyle}
        >
          <option value="">— select —</option>
          {cableAOption && (
            <option value={cableAOption.deviceId}>{cableAOption.label} (recommended)</option>
          )}
          {devices?.outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </section>

      <section style={{ marginTop: 8 }}>
        <button
          onClick={isActive ? onStop : onStart}
          disabled={!apiKey || isConnecting}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 6,
            border: 0,
            background: isActive ? 'transparent' : 'var(--accent)',
            color: isActive ? 'var(--text-primary)' : '#fff',
            outline: isActive ? '1px solid var(--border-default)' : undefined,
            opacity: !apiKey || isConnecting ? 0.5 : 1,
          }}
        >
          {isActive ? 'Stop' : isConnecting ? 'Connecting…' : 'Start translation (PT → EN)'}
        </button>
      </section>

      <section style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        Status: <strong style={{ color: 'var(--text-primary)' }}>{sessionState.kind}</strong>
        {sessionState.kind === 'error' && (
          <span style={{ color: 'var(--error)' }}> — {sessionState.message}</span>
        )}
      </section>

      {error && (
        <div style={{ color: 'var(--error)', fontSize: 12 }}>{error}</div>
      )}
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
  marginTop: 4,
};
```

- [ ] **Step 7: Create App.tsx and main.tsx**

`src/renderer/App.tsx`:
```typescript
import { M1TestRig } from './views/M1TestRig';

export function App(): JSX.Element {
  return <M1TestRig />;
}
```

`src/renderer/main.tsx`:
```typescript
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('No #root');
createRoot(container).render(<App />);
```

- [ ] **Step 8: Verify typecheck**

```powershell
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```powershell
git add src/renderer/
git commit -m "Add minimal M1 renderer UI (test rig) with design tokens"
```

---

## Task 16: Run end-to-end smoke test

This is the M1 acceptance gate. Manual test on your Windows machine.

- [ ] **Step 1: Start dev mode**

```powershell
npm run dev
```

Expected: app window opens (~360x480), "M1 Test Rig" header visible.

- [ ] **Step 2: Save your OpenAI API key**

Paste your key (`sk-proj-...`), click Save. Expect: input replaced by `●●●●...XXXX` showing last 4 chars.

- [ ] **Step 3: Pick devices**

Microphone: choose your real headset mic.
Output: choose **CABLE-A Input (VB-Audio Cable A)** — should be marked "(recommended)" in the list.

- [ ] **Step 4: Click Start translation**

Status changes: `idle` → `connecting` → `active`.

- [ ] **Step 5: Speak in Portuguese for 5-10 seconds**

Examples: "Olá, meu nome é Gabriel. Estou testando o aplicativo de tradução em tempo real."

- [ ] **Step 6: Verify EN output on CABLE-A**

Easiest: open Windows Sound > Recording > right-click "CABLE-A Output" > Properties > Listen tab > "Listen to this device" → choose your real headset → OK.

You should hear English coming back, with 1-3s latency.

- [ ] **Step 7: Click Stop, then close**

Status returns to `idle`. App can be closed cleanly.

- [ ] **Step 8: Document the smoke test result**

Update `docs/superpowers/spikes/2026-05-07-setsinkid-spike.md` (created in Task 11) — add a section "M1 end-to-end smoke" with your observations:

```markdown
## M1 end-to-end smoke (YYYY-MM-DD)

Setup: <Windows version>, Electron <version>, VB-CABLE A+B installed
Result: PASS / PARTIAL / FAIL
Notes: <any observations — latency, audio quality, glitches, what worked, what didn't>
```

- [ ] **Step 9: Commit smoke test result**

```powershell
git add docs/superpowers/spikes/2026-05-07-setsinkid-spike.md
git commit -m "M1 end-to-end smoke test result"
```

- [ ] **Step 10: Tag M1**

```powershell
git tag -a v0.1.0-m1 -m "M1: foundation + unidirectional PT->EN through CABLE-A"
git log --oneline -10
```

---

## Self-review checklist (run after writing the plan)

After this plan is fully written, review against the spec:

**Spec coverage (M1 portion):**
- [✓] Spec §3 architecture: main + renderer + offscreen — Tasks 14, 15, 10
- [✓] Spec §4 components for M1: configStore, deviceDetector, openaiSession, audioPipeline, retryPolicy, logger, pcmCodec — Tasks 3-12
- [✓] Spec §5 data flow direction A — Tasks 10, 12, 14
- [✓] Spec §11 risk #1 (setSinkId spike) — Task 11
- [✓] Spec §9 design language (tokens) — Task 15
- [✓] Spec §8 testing strategy: unit + integration with no OpenAI dependency — Tasks 3-12 use fakes
- [Deferred to M2] Spec §5 direction B (bidirectional)
- [Deferred to M3] Spec §6 SetupView, FloatingWidget polish
- [Deferred to M4] Spec §10 release pipeline

**Placeholder scan:** none found.

**Type consistency:** verified — `OffscreenController`, `SessionState`, `IPC` channels all consistent across tasks.

---

## Followup plans (sketch — not yet written)

After M1 ships and is verified:

- **M2 plan:** add Sessão B (EN→PT). Bidirectional `SessionManager`, second WebSocket, capture from CABLE-B, playback to headset. New tests for both-sessions-running, one-fails-other-survives, reconnect logic.
- **M3 plan:** polished FloatingWidget (always-on-top, draggable, expandable transcript), full SetupView with diagnostics + Test Translation, language pair dropdowns, status badge component, latency meter.
- **M4 plan:** electron-builder config, GitHub Actions release workflow, code signing path, README + screenshots, public GitHub release.

Each milestone gets its own plan file: `docs/superpowers/plans/YYYY-MM-DD-realtime-translate-mN.md`.
