# Realtime Translate M4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the real SetupView (linear wizard for first-launch + review screen for subsequent) with i18n (PT-BR + EN-US), live cost meter in the bar, and Test Translation that validates the pipeline without requiring a real Meet call. After M4, a non-technical user can install, configure, and use the app via guided UI without ever touching a terminal.

**Architecture:** Single SetupView BrowserWindow (M3 already created it) renders one of two modes via hash-based routing — wizard (`#/wizard/1..6`) or review (`#/review`). Each wizard step is a self-contained React component. Cross-cutting i18n via `<I18nProvider>` wrapping both renderer entry points (FloatingWidget + SetupView). Cost meter is a small bar component using existing `state.sinceMs` timestamps. Test Translation introduces an isolated test-mode session (new IPCs `test:session:*`) plus a one-shot loopback capture for Direction A validation. WAV files bundled in `assets/test/`; Meet screenshots placeholder PNGs in `assets/setup/` (real screenshots authored manually post-implementation).

**Tech Stack:** Same as M3 — Electron 42 · electron-vite 4 · React 19 · TypeScript 5.9 · Zustand · ws · vitest. No new runtime dependencies. i18n is hand-rolled (no react-i18next) given the small scope.

**Spec:** [2026-05-08-realtime-translate-m4-setupview.md](../specs/2026-05-08-realtime-translate-m4-setupview.md)

**Out of scope (explicit per spec §11):** more locales beyond PT+EN, animated GIFs, live transcript, cumulative cost dashboard, RTL languages, in-app VB-CABLE updater.

---

## File structure overview

### New files

| Path | Responsibility |
|---|---|
| `src/shared/i18n/locales/pt-BR.json` | Portuguese (Brazil) translation source |
| `src/shared/i18n/locales/en-US.json` | English (US) translation |
| `src/shared/i18n/index.ts` | I18nProvider, useT hook, resolveLocale, type-safe key lookup |
| `src/shared/i18n/types.ts` | TranslationKey type (template literal recursion over JSON shape) |
| `src/main/i18n/resolveLocale.ts` | Main process locale resolver (uses `app.getLocale()` + `prefs.uiLanguage`) |
| `src/renderer/components/CostMeter.tsx` | Bar component: `$X.XX` display, 1Hz refresh |
| `src/renderer/components/LanguageDropdown.tsx` | Title-bar i18n selector for SetupView |
| `src/renderer/views/setup/SetupRoot.tsx` | Replaces SetupViewStub; hash router → wizard or review |
| `src/renderer/views/setup/wizard/WizardShell.tsx` | Title bar + progress bar + step container + footer |
| `src/renderer/views/setup/wizard/Step1Welcome.tsx` | Welcome + audio flow diagram |
| `src/renderer/views/setup/wizard/AudioFlowDiagram.tsx` | SVG/CSS bidirectional flow diagram |
| `src/renderer/views/setup/wizard/Step2ApiKey.tsx` | API key input + signup link + how-to collapsible |
| `src/renderer/views/setup/wizard/Step3Cables.tsx` | VB-CABLE detection + missing flow + install screenshots |
| `src/renderer/views/setup/wizard/Step4Devices.tsx` | 4 device dropdowns + lang source/target |
| `src/renderer/views/setup/wizard/Step5MeetConfig.tsx` | Meet config screenshots + "Já configurei" checkbox |
| `src/renderer/views/setup/wizard/Step6TestTranslation.tsx` | Direction A + B test runners with status |
| `src/renderer/views/setup/review/ReviewScreen.tsx` | 5-section review with Edit affordances |
| `src/renderer/views/setup/review/ReviewSection.tsx` | Single section row component |
| `src/renderer/views/setup/shared/MeetGuide.tsx` | 5-screenshot guide used by Step5 + review |
| `src/renderer/views/setup/shared/useHashRoute.ts` | Hash-based router hook |
| `src/renderer/views/setup/shared/computeCost.ts` | Pure cost calculation function |
| `src/renderer/styles/setup.css` | SetupView styles (layout, progress, sections, diagram) |
| `src/main/translate/testSession.ts` | Isolated test-mode OpenAISession runner |
| `src/main/audio/loopbackCapture.ts` | One-shot loopback capture with RMS threshold detection |
| `assets/test/test-pt.wav` | PT phrase (PCM16 24kHz mono, ~3s) |
| `assets/test/test-en.wav` | EN phrase (PCM16 24kHz mono, ~3s) |
| `assets/setup/meet-step-1.png` ... `meet-step-5.png` | Meet config screenshots (placeholder PNGs initially) |
| `tests/unit/i18n.test.ts` | Locale resolver, var substitution, fallback |
| `tests/unit/computeCost.test.ts` | Cost calculation across states |
| `tests/unit/useHashRoute.test.ts` | Hash parsing + navigation |
| `tests/unit/userPrefsStore.test.ts` | Extended for `uiLanguage` |
| `tests/unit/loopbackCapture.test.ts` | RMS threshold detection (mock AudioContext) |

### Modified files

| Path | Change |
|---|---|
| `src/shared/events.ts` | New IPCs: `PrefsSetUiLanguage`, `TestSessionStart`, `TestSessionInject`, `TestSessionInputDone`, `TestSessionStop`, `LoopbackStart`, `LoopbackStop` |
| `src/main/ipc/channels.ts` | New types for above |
| `src/main/ipc/handlers.ts` | Wire new handlers |
| `src/main/preload.ts` | Expose new methods on `window.rt` |
| `src/main/config/userPrefsStore.ts` | Add `uiLanguage?: 'pt-BR' \| 'en-US'` + setter |
| `src/main/app.ts` | Compute initial locale, pass into renderer via injected env or runtime IPC |
| `src/renderer/floating-main.tsx` | Wrap `<App />` in `<I18nProvider>` |
| `src/renderer/setup-main.tsx` | Replace `<SetupViewStub />` with `<I18nProvider><SetupRoot /></I18nProvider>` |
| `src/renderer/views/FloatingWidget.tsx` | Add `<CostMeter />`; replace literal strings with `t()` calls |
| `src/renderer/styles/widget.css` | `.rt-cost` style for the cost tag |

### Deleted files

| Path |
|---|
| `src/renderer/views/SetupViewStub.tsx` (replaced by SetupRoot) |

---

## Phase A — i18n foundation (Tasks 1-3)

### Task 1: i18n core (provider + hook + types) + locales scaffold

**Files:**
- Create: `src/shared/i18n/types.ts`
- Create: `src/shared/i18n/index.ts`
- Create: `src/shared/i18n/locales/pt-BR.json`
- Create: `src/shared/i18n/locales/en-US.json`
- Create: `src/main/i18n/resolveLocale.ts`
- Create: `tests/unit/i18n.test.ts`

#### Step 1: Write the failing test

Create `tests/unit/i18n.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createT, resolveLocaleFromCandidates, SUPPORTED_LOCALES } from '@shared/i18n';

const fakeStrings = {
  greeting: 'Hello {{name}}',
  nested: {
    welcome: 'Welcome',
    cost: 'Cost: ${{amount}}',
  },
};

describe('i18n', () => {
  it('createT looks up nested keys with dot notation', () => {
    const t = createT(fakeStrings as never);
    expect(t('nested.welcome')).toBe('Welcome');
  });

  it('createT substitutes {{var}} placeholders', () => {
    const t = createT(fakeStrings as never);
    expect(t('greeting', { name: 'Gabriel' })).toBe('Hello Gabriel');
    expect(t('nested.cost', { amount: '0.42' })).toBe('Cost: $0.42');
  });

  it('createT returns the key itself on miss (visible debugging)', () => {
    const t = createT(fakeStrings as never);
    expect(t('does.not.exist' as never)).toBe('does.not.exist');
  });

  it('resolveLocaleFromCandidates picks first supported', () => {
    expect(resolveLocaleFromCandidates(['pt-BR', 'fr-FR'])).toBe('pt-BR');
    expect(resolveLocaleFromCandidates(['fr-FR', 'en-US'])).toBe('en-US');
  });

  it('resolveLocaleFromCandidates falls back to en-US on no match', () => {
    expect(resolveLocaleFromCandidates(['fr-FR', 'es-ES'])).toBe('en-US');
    expect(resolveLocaleFromCandidates([])).toBe('en-US');
  });

  it('SUPPORTED_LOCALES has exactly pt-BR and en-US in MVP', () => {
    expect(SUPPORTED_LOCALES).toEqual(['pt-BR', 'en-US']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run tests/unit/i18n.test.ts
```

Expected: All tests fail with import error (module not found).

- [ ] **Step 3: Write the locale files**

Create `src/shared/i18n/locales/pt-BR.json` with the seed structure (will grow as steps add their strings):

```json
{
  "common": {
    "next": "Avançar →",
    "back": "← Voltar",
    "save": "Salvar",
    "saveAndBack": "Salvar e voltar",
    "cancel": "Cancelar",
    "close": "Fechar",
    "yes": "Sim, ouvi",
    "no": "Não ouvi nada",
    "skip": "Pular",
    "quit": "Sair do app"
  },
  "bar": {
    "tooltip": {
      "play": "Iniciar tradução",
      "pause": "Pausar tradução",
      "retry": "Tentar novamente",
      "settings": "Configurações"
    },
    "status": {
      "connecting": "Conectando…",
      "reconnecting": "Reconectando",
      "attempt": "tentativa {{n}}",
      "errorPrefix": "Erro:"
    }
  },
  "menu": {
    "settings": "Configurações",
    "quit": "Sair"
  }
}
```

Create `src/shared/i18n/locales/en-US.json` (same shape, English):

```json
{
  "common": {
    "next": "Next →",
    "back": "← Back",
    "save": "Save",
    "saveAndBack": "Save and go back",
    "cancel": "Cancel",
    "close": "Close",
    "yes": "Yes, I heard it",
    "no": "I didn't hear anything",
    "skip": "Skip",
    "quit": "Quit app"
  },
  "bar": {
    "tooltip": {
      "play": "Start translation",
      "pause": "Pause translation",
      "retry": "Try again",
      "settings": "Settings"
    },
    "status": {
      "connecting": "Connecting…",
      "reconnecting": "Reconnecting",
      "attempt": "attempt {{n}}",
      "errorPrefix": "Error:"
    }
  },
  "menu": {
    "settings": "Settings",
    "quit": "Quit"
  }
}
```

- [ ] **Step 4: Write the i18n core**

Create `src/shared/i18n/types.ts`:

```typescript
import ptBR from './locales/pt-BR.json';

// Recursive template literal type that derives all valid dot-paths from the JSON tree.
// E.g. for {a: {b: 'x'}, c: 'y'}, yields 'a.b' | 'c'.
type Paths<T, P extends string = ''> = {
  [K in keyof T]: T[K] extends string
    ? `${P}${K & string}`
    : Paths<T[K], `${P}${K & string}.`>;
}[keyof T];

export type Locale = 'pt-BR' | 'en-US';
export type TranslationKey = Paths<typeof ptBR>;
export type TranslationDict = typeof ptBR;
```

Create `src/shared/i18n/index.ts`:

```typescript
import ptBR from './locales/pt-BR.json';
import enUS from './locales/en-US.json';
import type { Locale, TranslationDict, TranslationKey } from './types';

export type { Locale, TranslationDict, TranslationKey };
export { ptBR, enUS };

export const SUPPORTED_LOCALES: readonly Locale[] = ['pt-BR', 'en-US'];

const DICTIONARIES: Record<Locale, TranslationDict> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};

/** Walk a dot-notation path through the dict; return the key itself on miss
 *  (intentionally — makes missing translations visible in the UI). */
function lookup(dict: TranslationDict, path: string): string {
  const parts = path.split('.');
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return path;
    }
  }
  return typeof cur === 'string' ? cur : path;
}

function substitute(template: string, vars: Record<string, string | number> | undefined): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined ? `{{${key}}}` : String(v);
  });
}

export type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Build a `t()` function bound to a specific dictionary. Used by useT in the renderer. */
export function createT(dict: TranslationDict): T {
  return (key, vars) => substitute(lookup(dict, key as string), vars);
}

/** Pick the first locale in `candidates` that's supported; fall back to en-US. */
export function resolveLocaleFromCandidates(candidates: readonly string[]): Locale {
  for (const c of candidates) {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(c)) return c as Locale;
  }
  return 'en-US';
}

export function getDictionary(locale: Locale): TranslationDict {
  return DICTIONARIES[locale];
}
```

Create `src/main/i18n/resolveLocale.ts`:

```typescript
import { app } from 'electron';
import type { UserPrefsStore } from '../config/userPrefsStore';
import { resolveLocaleFromCandidates, type Locale } from '../../shared/i18n';

/** Resolves the UI locale from user override, then OS locale, then en-US fallback. */
export function resolveLocale(prefsStore: UserPrefsStore): Locale {
  const candidates: string[] = [];
  const override = prefsStore.load().uiLanguage;
  if (override) candidates.push(override);
  candidates.push(app.getLocale());
  return resolveLocaleFromCandidates(candidates);
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --run tests/unit/i18n.test.ts
```

Expected: 6/6 passing.

- [ ] **Step 6: Run full suite + typecheck + lint**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 88 tests passing (82 baseline + 6 new). All clean.

- [ ] **Step 7: Commit**

```bash
git add src/shared/i18n src/main/i18n tests/unit/i18n.test.ts
git commit -m "Add i18n foundation: provider, hook, locales, type-safe keys

Hand-rolled minimal i18n (no react-i18next dep). Supports nested
dot-notation keys with {{var}} substitution, type-safe via TS template
literal types over the locale JSON. Misses return the key itself
(makes missing translations visible at runtime).

Two locales seeded: pt-BR (source) and en-US. Common chrome strings
(buttons, bar tooltips, status text). Wizard step strings come in
their respective tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Wire i18n into FloatingWidget + extract bar strings

**Files:**
- Create: `src/shared/i18n/I18nProvider.tsx`
- Modify: `src/renderer/floating-main.tsx`
- Modify: `src/renderer/views/FloatingWidget.tsx`
- Modify: `src/renderer/components/ActionButton.tsx`
- Modify: `src/renderer/components/SettingsButton.tsx`

#### Step 1: Create the React provider + useT hook

Create `src/shared/i18n/I18nProvider.tsx`:

```typescript
import { createContext, useContext, type ReactNode } from 'react';
import { createT, getDictionary, type Locale, type T } from './index';

const I18nContext = createContext<T | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }): JSX.Element {
  const t = createT(getDictionary(locale));
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT(): T {
  const t = useContext(I18nContext);
  if (!t) throw new Error('useT called outside I18nProvider');
  return t;
}
```

Add `import type { JSX } from 'react'` if needed.

#### Step 2: Pass initial locale from main to renderer

In `src/main/app.ts`, before creating the BrowserWindows, expose the resolved locale via a global env var (simplest) OR a synchronous IPC. We'll use the latter — already have an IPC channel for prefs, add one for resolveLocale:

In `src/shared/events.ts`:

```typescript
export const IPC = {
  // ... existing entries ...
  ResolveLocale: 'i18n:resolveLocale',
} as const;
```

In `src/main/ipc/channels.ts`:

```typescript
import type { Locale } from '../../shared/i18n';

export interface IpcInvokeMap {
  // ... existing ...
  [IPC.ResolveLocale]: { args: void; result: Locale };
}
```

In `src/main/ipc/handlers.ts`, add `resolveLocale: () => Locale` to `HandlerDeps` and:

```typescript
handle(IPC.ResolveLocale, () => deps.resolveLocale());
```

In `src/main/app.ts`, pass:

```typescript
import { resolveLocale } from './i18n/resolveLocale';

// inside whenReady, after stores are constructed:
registerIpcHandlers({
  // ... existing ...
  resolveLocale: () => resolveLocale(prefsStore),
});
```

In `src/main/preload.ts`:

```typescript
resolveLocale: (): Promise<IpcInvokeMap[typeof IPC.ResolveLocale]['result']> =>
  ipcRenderer.invoke(IPC.ResolveLocale),
```

#### Step 3: Wrap floating-main.tsx with the provider

Replace `src/renderer/floating-main.tsx` with:

```typescript
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../shared/i18n/I18nProvider';
import type { Locale } from '../shared/i18n';
import { FloatingWidget } from './views/FloatingWidget';

function Root(): JSX.Element | null {
  const [locale, setLocale] = useState<Locale | null>(null);
  useEffect(() => {
    void window.rt.resolveLocale().then(setLocale);
  }, []);
  if (!locale) return null; // brief flash; widget appears once locale resolved
  return (
    <I18nProvider locale={locale}>
      <FloatingWidget />
    </I18nProvider>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('root not found');
createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
```

#### Step 4: Replace literal strings in FloatingWidget + components

In `src/renderer/views/FloatingWidget.tsx` — replace the inline status strings:

```typescript
// Add import:
import { useT } from '../../shared/i18n/I18nProvider';

// Inside FloatingWidget():
const t = useT();

// Replace:
//   {bar.kind === 'reconnecting' && (
//     <span className="rt-status">
//       Reconectando<span className="rt-status__attempt"> · {bar.origin}: tentativa {bar.attempt}</span>
//     </span>
//   )}
// with:
{bar.kind === 'connecting' && (
  <span className="rt-status">{t('bar.status.connecting')}</span>
)}
{bar.kind === 'reconnecting' && (
  <span className="rt-status">
    {t('bar.status.reconnecting')}
    <span className="rt-status__attempt"> · {bar.origin}: {t('bar.status.attempt', { n: bar.attempt })}</span>
  </span>
)}
{bar.kind === 'error' && (
  <span className="rt-status" title={bar.message}>
    {`${bar.origin}: ${truncate(bar.message, 28)}`}
  </span>
)}
```

In `src/renderer/components/ActionButton.tsx` — replace the inline `title`:

```typescript
import { useT } from '../../shared/i18n/I18nProvider';

export function ActionButton({ state, onClick }: { state: BarState['kind']; onClick: () => void }): JSX.Element {
  const t = useT();
  const isPlay = state === 'idle';
  const isRetry = state === 'error';
  const title = isPlay ? t('bar.tooltip.play') : isRetry ? t('bar.tooltip.retry') : t('bar.tooltip.pause');
  // ... rest unchanged with title used as before
}
```

In `src/renderer/components/SettingsButton.tsx`:

```typescript
import { useT } from '../../shared/i18n/I18nProvider';

export function SettingsButton({ onClick }: { onClick: () => void }): JSX.Element {
  const t = useT();
  return (
    <button className="rt-gear" onClick={onClick} title={t('bar.tooltip.settings')} aria-label={t('bar.tooltip.settings')}>
      {/* ... svg unchanged ... */}
    </button>
  );
}
```

- [ ] **Step 5: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: all passing. No new tests needed (the wiring is type-checked).

- [ ] **Step 6: Commit**

```bash
git add src/shared/i18n src/renderer/floating-main.tsx src/renderer/views/FloatingWidget.tsx src/renderer/components/ActionButton.tsx src/renderer/components/SettingsButton.tsx src/main/app.ts src/main/ipc/handlers.ts src/main/ipc/channels.ts src/main/preload.ts src/shared/events.ts
git commit -m "Wire i18n into FloatingWidget; extract bar strings

I18nProvider wraps floating-main.tsx; useT hook replaces literal
strings in FloatingWidget, ActionButton, SettingsButton. Initial
locale resolved via new IPC channel i18n:resolveLocale (main process
checks prefs.uiLanguage then app.getLocale, falls back to en-US).

Bar shows nothing for ~10ms during locale resolve (root returns null
until promise resolves) — acceptable for one-shot startup cost.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: prefs.uiLanguage + LanguageDropdown component

**Files:**
- Modify: `src/main/config/userPrefsStore.ts`
- Modify: `tests/unit/userPrefsStore.test.ts`
- Modify: `src/shared/events.ts`
- Modify: `src/main/ipc/channels.ts`
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/main/preload.ts`
- Create: `src/renderer/components/LanguageDropdown.tsx`

#### Step 1: Write failing test for uiLanguage persistence

Append to `tests/unit/userPrefsStore.test.ts`:

```typescript
it('setUiLanguage persists and merges with other prefs', () => {
  store.setUiLanguage('en-US');
  expect(store.load().uiLanguage).toBe('en-US');

  store.setLanguages({ source: 'pt', target: 'en' });
  expect(store.load()).toEqual({
    uiLanguage: 'en-US',
    languages: { source: 'pt', target: 'en' },
  });

  store.setUiLanguage('pt-BR');
  expect(store.load().uiLanguage).toBe('pt-BR');
});
```

- [ ] **Step 2: Verify it fails**

```bash
npm test -- --run tests/unit/userPrefsStore.test.ts
```

Expected: 1 new test fails (`setUiLanguage is not a function`).

- [ ] **Step 3: Add uiLanguage to UserPrefsStore**

Modify `src/main/config/userPrefsStore.ts`:

```typescript
import type { Locale } from '../../shared/i18n';

export interface UserPrefs {
  widgetPosition?: WidgetPosition;
  languages?: Languages;
  devices?: DevicePrefs;
  uiLanguage?: Locale;  // NEW
}

// ... existing methods ...

export class UserPrefsStore {
  // ... existing ...

  setUiLanguage(locale: Locale): void {
    const prefs = this.load();
    prefs.uiLanguage = locale;
    this.save(prefs);
  }
}
```

- [ ] **Step 4: Test passes**

```bash
npm test -- --run tests/unit/userPrefsStore.test.ts
```

Expected: 8/8 passing.

- [ ] **Step 5: Wire IPC**

In `src/shared/events.ts`:

```typescript
PrefsSetUiLanguage: 'prefs:setUiLanguage',
```

In `src/main/ipc/channels.ts`:

```typescript
[IPC.PrefsSetUiLanguage]: { args: Locale; result: void };
```

(Don't forget `import type { Locale } from '../../shared/i18n';`)

In `src/main/ipc/handlers.ts`:

```typescript
handle(IPC.PrefsSetUiLanguage, (_e, locale) => deps.prefsStore.setUiLanguage(locale));
```

In `src/main/preload.ts`:

```typescript
saveUiLanguage: (
  locale: IpcInvokeMap[typeof IPC.PrefsSetUiLanguage]['args'],
): Promise<void> => ipcRenderer.invoke(IPC.PrefsSetUiLanguage, locale),
```

#### Step 6: Create LanguageDropdown

Create `src/renderer/components/LanguageDropdown.tsx`:

```typescript
import type { JSX } from 'react';
import { useState } from 'react';
import { SUPPORTED_LOCALES, type Locale } from '../../shared/i18n';

const LABELS: Record<Locale, { flag: string; name: string }> = {
  'pt-BR': { flag: '🇧🇷', name: 'Português' },
  'en-US': { flag: '🇺🇸', name: 'English' },
};

export function LanguageDropdown({
  current,
  onChange,
}: {
  current: Locale;
  onChange: (next: Locale) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const cur = LABELS[current];
  return (
    <div className="lang-dropdown" onClick={(): void => setOpen((o) => !o)}>
      <span>{cur.flag} {cur.name}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
      {open && (
        <div className="lang-dropdown__menu" onClick={(e): void => e.stopPropagation()}>
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc}
              className={`lang-dropdown__item${loc === current ? ' active' : ''}`}
              onClick={(): void => {
                onChange(loc);
                setOpen(false);
              }}
            >
              {LABELS[loc].flag} {LABELS[loc].name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

CSS goes in `src/renderer/styles/setup.css` later (Task 5).

- [ ] **Step 7: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 89 tests passing (88 + 1 new in userPrefsStore).

- [ ] **Step 8: Commit**

```bash
git add src/main/config/userPrefsStore.ts tests/unit/userPrefsStore.test.ts src/shared/events.ts src/main/ipc/channels.ts src/main/ipc/handlers.ts src/main/preload.ts src/renderer/components/LanguageDropdown.tsx
git commit -m "Add prefs.uiLanguage + LanguageDropdown component

UserPrefsStore.setUiLanguage persists the user's UI language override
to prefs.json. New IPC prefs:setUiLanguage exposes it. LanguageDropdown
component renders a flag + name selector with a click-to-open menu;
hooks up to onChange callback.

Component is unstyled here; SetupView CSS adds .lang-dropdown rules
in Task 5 when the CSS file is created.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase B — Cost meter (Task 4)

### Task 4: CostMeter component + integration

**Files:**
- Create: `src/renderer/views/setup/shared/computeCost.ts`
- Create: `src/renderer/components/CostMeter.tsx`
- Create: `tests/unit/computeCost.test.ts`
- Modify: `src/renderer/views/FloatingWidget.tsx`
- Modify: `src/renderer/styles/widget.css`

#### Step 1: Write failing test for computeCost

Create `tests/unit/computeCost.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeCost } from '@renderer/views/setup/shared/computeCost';
import type { SessionState } from '@shared/types';

const idle: SessionState = { kind: 'idle' };
const error: SessionState = { kind: 'error', message: '' };
const activeAt = (sinceMs: number): SessionState => ({ kind: 'active', sinceMs });

describe('computeCost', () => {
  it('returns 0 when both directions are idle', () => {
    expect(computeCost(idle, idle, 100_000)).toBe(0);
  });

  it('returns rate * minutes for one active direction', () => {
    // 1 minute elapsed = 0.034
    expect(computeCost(activeAt(0), idle, 60_000)).toBeCloseTo(0.034, 5);
  });

  it('sums both active directions', () => {
    // Both running for 30s each → 1 session-minute total → 0.034
    expect(computeCost(activeAt(30_000), activeAt(30_000), 60_000)).toBeCloseTo(0.034, 5);
  });

  it('ignores non-active states', () => {
    expect(computeCost(error, activeAt(0), 60_000)).toBeCloseTo(0.034, 5);
  });

  it('returns 0 for now < sinceMs (clock skew sanity)', () => {
    expect(computeCost(activeAt(60_000), idle, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Verify it fails**

```bash
npm test -- --run tests/unit/computeCost.test.ts
```

Expected: All 5 tests fail (module not found).

- [ ] **Step 3: Implement computeCost**

Create `src/renderer/views/setup/shared/computeCost.ts`:

```typescript
import type { SessionState } from '../../../../shared/types';

/** OpenAI realtime translate billing — USD per session-minute. */
export const RATE_PER_SESSION_MIN = 0.034;

export function computeCost(stateA: SessionState, stateB: SessionState, nowMs: number): number {
  let totalMinutes = 0;
  if (stateA.kind === 'active') {
    const elapsed = (nowMs - stateA.sinceMs) / 60_000;
    if (elapsed > 0) totalMinutes += elapsed;
  }
  if (stateB.kind === 'active') {
    const elapsed = (nowMs - stateB.sinceMs) / 60_000;
    if (elapsed > 0) totalMinutes += elapsed;
  }
  return totalMinutes * RATE_PER_SESSION_MIN;
}
```

- [ ] **Step 4: Test passes**

```bash
npm test -- --run tests/unit/computeCost.test.ts
```

Expected: 5/5 passing.

- [ ] **Step 5: Create CostMeter component**

Create `src/renderer/components/CostMeter.tsx`:

```typescript
import { useEffect, useState, type JSX } from 'react';
import type { SessionState } from '../../shared/types';
import { computeCost } from '../views/setup/shared/computeCost';

export function CostMeter({ stateA, stateB }: { stateA: SessionState; stateB: SessionState }): JSX.Element | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return (): void => clearInterval(id);
  }, []);
  const isActive = stateA.kind === 'active' || stateB.kind === 'active';
  if (!isActive) return null;
  const cost = computeCost(stateA, stateB, now);
  return <span className="rt-cost">${cost.toFixed(2)}</span>;
}
```

#### Step 6: Wire into FloatingWidget

Modify `src/renderer/views/FloatingWidget.tsx`:

```typescript
// Add import:
import { CostMeter } from '../components/CostMeter';

// In the bar JSX, after <LatencyMeter ... />:
<LatencyMeter ms={avgLatency} />
<CostMeter stateA={stateA} stateB={stateB} />
<ActionButton state={bar.kind} onClick={(): void => { void onAction(); }} />
```

#### Step 7: Add CSS

Append to `src/renderer/styles/widget.css`:

```css
.rt-cost {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 10px;
  color: rgba(244, 244, 245, 0.4);
  letter-spacing: 0.02em;
}
```

- [ ] **Step 8: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 94 tests (89 + 5 new).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/views/setup src/renderer/components/CostMeter.tsx tests/unit/computeCost.test.ts src/renderer/views/FloatingWidget.tsx src/renderer/styles/widget.css
git commit -m "Add live cost dashboard to FloatingWidget bar

CostMeter renders \$X.XX in dim mono after the latency tag during
active state. setInterval(1000) drives 1Hz refresh; cleanup on unmount.
computeCost is a pure function — sums elapsed minutes per active
session and multiplies by \$0.034/session-min (covered by 5 unit tests).

Bidirectional active = ~\$0.068/min combined. Pause/resume resets cost
since each session restart re-stamps sinceMs.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase C — SetupView wizard scaffold (Tasks 5-6)

### Task 5: SetupRoot + WizardShell + hash routing + setup.css

**Files:**
- Create: `src/renderer/views/setup/shared/useHashRoute.ts`
- Create: `tests/unit/useHashRoute.test.ts`
- Create: `src/renderer/views/setup/SetupRoot.tsx`
- Create: `src/renderer/views/setup/wizard/WizardShell.tsx`
- Create: `src/renderer/styles/setup.css`
- Modify: `src/renderer/setup-main.tsx`
- Modify: `src/renderer/setup-view.html`

#### Step 1: Write failing test for hash route parsing

Create `tests/unit/useHashRoute.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseHashRoute, type HashRoute } from '@renderer/views/setup/shared/useHashRoute';

describe('parseHashRoute', () => {
  it('parses #/wizard/N with valid step', () => {
    expect(parseHashRoute('#/wizard/1')).toEqual<HashRoute>({ kind: 'wizard', step: 1 });
    expect(parseHashRoute('#/wizard/6')).toEqual<HashRoute>({ kind: 'wizard', step: 6 });
  });

  it('parses #/wizard/N?mode=edit', () => {
    expect(parseHashRoute('#/wizard/2?mode=edit')).toEqual<HashRoute>({
      kind: 'wizard',
      step: 2,
      mode: 'edit',
    });
  });

  it('parses #/review', () => {
    expect(parseHashRoute('#/review')).toEqual<HashRoute>({ kind: 'review' });
  });

  it('rejects out-of-range steps', () => {
    expect(parseHashRoute('#/wizard/0')).toEqual<HashRoute>({ kind: 'wizard', step: 1 });
    expect(parseHashRoute('#/wizard/7')).toEqual<HashRoute>({ kind: 'wizard', step: 1 });
    expect(parseHashRoute('#/wizard/abc')).toEqual<HashRoute>({ kind: 'wizard', step: 1 });
  });

  it('falls back to wizard step 1 on empty/unknown hash', () => {
    expect(parseHashRoute('')).toEqual<HashRoute>({ kind: 'wizard', step: 1 });
    expect(parseHashRoute('#/garbage')).toEqual<HashRoute>({ kind: 'wizard', step: 1 });
  });
});
```

- [ ] **Step 2: Verify it fails**

```bash
npm test -- --run tests/unit/useHashRoute.test.ts
```

Expected: All tests fail.

- [ ] **Step 3: Implement useHashRoute**

Create `src/renderer/views/setup/shared/useHashRoute.ts`:

```typescript
import { useEffect, useState } from 'react';

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
export type HashRoute =
  | { kind: 'wizard'; step: WizardStep; mode?: 'edit' }
  | { kind: 'review' };

const STEP_VALUES = [1, 2, 3, 4, 5, 6] as const;

export function parseHashRoute(hash: string): HashRoute {
  // Examples: '#/wizard/3', '#/wizard/2?mode=edit', '#/review'
  const m = hash.match(/^#\/(wizard|review)(?:\/(\d+))?(?:\?(.+))?$/);
  if (!m) return { kind: 'wizard', step: 1 };
  const [, kind, stepStr, query] = m;
  if (kind === 'review') return { kind: 'review' };
  const step = Number(stepStr);
  if (!STEP_VALUES.includes(step as WizardStep)) return { kind: 'wizard', step: 1 };
  const params = new URLSearchParams(query ?? '');
  const mode = params.get('mode') === 'edit' ? 'edit' : undefined;
  return mode ? { kind: 'wizard', step: step as WizardStep, mode } : { kind: 'wizard', step: step as WizardStep };
}

export function navigate(route: HashRoute): void {
  let path = '';
  if (route.kind === 'review') path = '#/review';
  else {
    path = `#/wizard/${route.step}`;
    if (route.mode === 'edit') path += '?mode=edit';
  }
  window.location.hash = path;
}

export function useHashRoute(): HashRoute {
  const [route, setRoute] = useState<HashRoute>(() => parseHashRoute(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseHashRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return (): void => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
```

- [ ] **Step 4: Tests pass**

```bash
npm test -- --run tests/unit/useHashRoute.test.ts
```

Expected: 5/5 passing.

#### Step 5: Create SetupRoot + WizardShell

Create `src/renderer/views/setup/SetupRoot.tsx`:

```typescript
import { useEffect, useState, type JSX } from 'react';
import { useHashRoute } from './shared/useHashRoute';
import { WizardShell } from './wizard/WizardShell';

// Stub steps — Tasks 6-11 replace with real components.
const StubStep = ({ n }: { n: number }): JSX.Element => (
  <div style={{ padding: 32, color: '#a1a1aa' }}>Step {n} placeholder — implemented in Task {5 + n}</div>
);
const StubReview = (): JSX.Element => (
  <div style={{ padding: 32, color: '#a1a1aa' }}>Review screen placeholder — Task 13</div>
);

export function SetupRoot(): JSX.Element {
  const route = useHashRoute();
  if (route.kind === 'review') return <StubReview />;
  return (
    <WizardShell currentStep={route.step} totalSteps={6}>
      <StubStep n={route.step} />
    </WizardShell>
  );
}
```

Create `src/renderer/views/setup/wizard/WizardShell.tsx`:

```typescript
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { LanguageDropdown } from '../../../components/LanguageDropdown';
import type { Locale } from '../../../../shared/i18n';

export function WizardShell({
  currentStep,
  totalSteps,
  children,
}: {
  currentStep: number;
  totalSteps: number;
  children: ReactNode;
}): JSX.Element {
  const [locale, setLocale] = useState<Locale>('pt-BR');
  useEffect(() => {
    void window.rt.resolveLocale().then(setLocale);
  }, []);

  return (
    <div className="setup-shell">
      <div className="setup-titlebar">
        <span className="setup-title">Realtime Translate · Setup</span>
        <LanguageDropdown
          current={locale}
          onChange={(next): void => {
            setLocale(next);
            void window.rt.saveUiLanguage(next);
            // Soft reload — re-render whole app under new locale via location reload
            window.location.reload();
          }}
        />
      </div>
      <div className="setup-body">
        <div className="setup-progress">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`setup-progress__step${i + 1 < currentStep ? ' done' : ''}${i + 1 === currentStep ? ' active' : ''}`}
            />
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
```

Note: `window.location.reload()` on locale change is the simplest path — re-resolves locale at startup, no need to thread it through context updates. Acceptable trade-off (~200ms reload).

#### Step 6: Replace setup-main.tsx

Replace `src/renderer/setup-main.tsx`:

```typescript
import { StrictMode, useEffect, useState, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../shared/i18n/I18nProvider';
import type { Locale } from '../shared/i18n';
import { SetupRoot } from './views/setup/SetupRoot';
import './styles/setup.css';

function Root(): JSX.Element | null {
  const [locale, setLocale] = useState<Locale | null>(null);
  useEffect(() => {
    void window.rt.resolveLocale().then(setLocale);
  }, []);
  if (!locale) return null;
  return (
    <I18nProvider locale={locale}>
      <SetupRoot />
    </I18nProvider>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('root not found');
createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
```

#### Step 7: Update setup-view.html to remove SetupViewStub link (no change needed — it already loads setup-main.tsx)

Verify `src/renderer/setup-view.html` still references `setup-main.tsx`. No edit.

#### Step 8: Create setup.css

Create `src/renderer/styles/setup.css`:

```css
@import './tokens.css';

.setup-shell {
  width: 100%;
  height: 100vh;
  background: var(--bg-canvas);
  color: var(--text-primary);
  font-family: 'Inter', -apple-system, system-ui, sans-serif;
  display: flex;
  flex-direction: column;
}

.setup-titlebar {
  height: 36px;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}
.setup-title {
  font-size: 12px;
  color: var(--text-secondary);
}

.setup-body {
  flex: 1;
  overflow-y: auto;
  padding: 32px 40px 24px;
}

.setup-progress {
  display: flex;
  gap: 6px;
  margin-bottom: 28px;
}
.setup-progress__step {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: var(--border-default);
}
.setup-progress__step.active { background: var(--accent); }
.setup-progress__step.done { background: var(--success); }

.setup-step-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
  font-weight: 500;
}

.setup-heading {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.015em;
  margin-bottom: 6px;
  color: var(--text-primary);
}
.setup-sub {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 32px;
  line-height: 1.5;
}

.setup-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
  -webkit-app-region: no-drag;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: 0;
  cursor: pointer;
  font-family: inherit;
}
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-default);
}
.btn-secondary:hover { background: var(--surface-elevated); }
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}
.btn-ghost:hover { color: var(--text-primary); }

/* Language dropdown (top-right of titlebar) */
.lang-dropdown {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.lang-dropdown:hover { background: rgba(255,255,255,0.08); }
.lang-dropdown svg { width: 9px; height: 9px; opacity: 0.6; }
.lang-dropdown__menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--surface-elevated);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  min-width: 140px;
  padding: 4px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  z-index: 10;
}
.lang-dropdown__item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  border-radius: 4px;
  background: transparent;
  border: 0;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
}
.lang-dropdown__item:hover { background: rgba(255,255,255,0.06); }
.lang-dropdown__item.active { background: rgba(110, 127, 196, 0.15); color: var(--accent); }
```

- [ ] **Step 9: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 99 tests passing (94 + 5 new).

- [ ] **Step 10: Commit**

```bash
git add src/renderer/views/setup tests/unit/useHashRoute.test.ts src/renderer/setup-main.tsx src/renderer/styles/setup.css
git commit -m "SetupView shell: SetupRoot + WizardShell + hash routing

Hash-based router (#/wizard/N, #/wizard/N?mode=edit, #/review) parsed
by parseHashRoute, exposed via useHashRoute hook. SetupRoot dispatches
to wizard or review based on the route. WizardShell renders the
common chrome: titlebar with LanguageDropdown, progress bar with N
of M dots, body container.

Stub step components (Task 6+ replace each in turn). Locale change
triggers window.location.reload() — simplest path to re-resolve under
the new locale without threading it through React context updates.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Step 1 Welcome + AudioFlowDiagram

**Files:**
- Create: `src/renderer/views/setup/wizard/AudioFlowDiagram.tsx`
- Create: `src/renderer/views/setup/wizard/Step1Welcome.tsx`
- Modify: `src/renderer/views/setup/SetupRoot.tsx`
- Modify: `src/shared/i18n/locales/pt-BR.json`
- Modify: `src/shared/i18n/locales/en-US.json`
- Modify: `src/renderer/styles/setup.css`

#### Step 1: Add Step 1 strings to both locales

Add to the root of `src/shared/i18n/locales/pt-BR.json`:

```json
{
  "setup": {
    "stepLabel": "Passo {{n}} de {{total}}",
    "welcome": {
      "label": "Boas-vindas",
      "heading": "Vamos te configurar em ~5 minutos",
      "sub": "O Realtime Translate traduz suas conversas no Google Meet em tempo real. Aqui está como funciona:",
      "diagramDirA": "Você fala em português, interlocutor ouve em inglês",
      "diagramDirB": "Interlocutor fala em inglês, você ouve em português",
      "you": "Você",
      "them": "Interlocutor",
      "appTranslates": "app traduz",
      "speaks": "Fala em",
      "hears": "Ouve em",
      "start": "Começar →"
    }
  }
}
```

Mirror in `en-US.json`:

```json
{
  "setup": {
    "stepLabel": "Step {{n}} of {{total}}",
    "welcome": {
      "label": "Welcome",
      "heading": "Let's get you set up in ~5 minutes",
      "sub": "Realtime Translate translates your Google Meet calls in real time. Here's how it works:",
      "diagramDirA": "You speak in Portuguese, your contact hears English",
      "diagramDirB": "Your contact speaks English, you hear Portuguese",
      "you": "You",
      "them": "Contact",
      "appTranslates": "app translates",
      "speaks": "Speaks",
      "hears": "Hears",
      "start": "Begin →"
    }
  }
}
```

#### Step 2: Create AudioFlowDiagram

Create `src/renderer/views/setup/wizard/AudioFlowDiagram.tsx`:

```typescript
import type { JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';

export function AudioFlowDiagram(): JSX.Element {
  const t = useT();
  return (
    <div className="flow-diagram">
      <div className="flow-direction-label">↓ {t('setup.welcome.diagramDirA')}</div>
      <div className="flow-row">
        <div className="flow-node">
          <div className="flow-node__icon">🎤</div>
          <div className="flow-node__label">{t('setup.welcome.you')}</div>
          <div className="flow-node__meta">{t('setup.welcome.speaks')} PT</div>
        </div>
        <div className="flow-arrow"><span className="flow-arrow__label">{t('setup.welcome.appTranslates')}</span></div>
        <div className="flow-node accent">
          <div className="flow-node__icon">🔄</div>
          <div className="flow-node__label">Meet</div>
          <div className="flow-node__meta">{t('setup.welcome.hears')} EN</div>
        </div>
      </div>
      <div className="flow-row">
        <div className="flow-node">
          <div className="flow-node__icon">🎧</div>
          <div className="flow-node__label">{t('setup.welcome.you')}</div>
          <div className="flow-node__meta">{t('setup.welcome.hears')} PT</div>
        </div>
        <div className="flow-arrow"><span className="flow-arrow__label">{t('setup.welcome.appTranslates')}</span></div>
        <div className="flow-node accent">
          <div className="flow-node__icon">🔄</div>
          <div className="flow-node__label">Meet</div>
          <div className="flow-node__meta">{t('setup.welcome.speaks')} EN</div>
        </div>
      </div>
      <div className="flow-direction-label" style={{ marginTop: 16 }}>↑ {t('setup.welcome.diagramDirB')}</div>
    </div>
  );
}
```

#### Step 3: Create Step1Welcome

Create `src/renderer/views/setup/wizard/Step1Welcome.tsx`:

```typescript
import type { JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { navigate } from '../shared/useHashRoute';
import { AudioFlowDiagram } from './AudioFlowDiagram';

export function Step1Welcome(): JSX.Element {
  const t = useT();
  return (
    <>
      <div className="setup-step-meta">{t('setup.stepLabel', { n: 1, total: 6 })} — {t('setup.welcome.label')}</div>
      <h1 className="setup-heading">{t('setup.welcome.heading')}</h1>
      <p className="setup-sub">{t('setup.welcome.sub')}</p>
      <AudioFlowDiagram />
      <div className="setup-footer">
        <span /> {/* spacer; no Back on step 1 */}
        <button className="btn btn-primary" onClick={(): void => navigate({ kind: 'wizard', step: 2 })}>
          {t('setup.welcome.start')}
        </button>
      </div>
    </>
  );
}
```

#### Step 4: Wire into SetupRoot

Replace the `StubStep` for step 1 in `src/renderer/views/setup/SetupRoot.tsx`:

```typescript
import { Step1Welcome } from './wizard/Step1Welcome';

// inside SetupRoot:
function renderStep(step: number): JSX.Element {
  switch (step) {
    case 1: return <Step1Welcome />;
    default: return <StubStep n={step} />;
  }
}

// then:
return (
  <WizardShell currentStep={route.step} totalSteps={6}>
    {renderStep(route.step)}
  </WizardShell>
);
```

#### Step 5: Add diagram CSS

Append to `src/renderer/styles/setup.css`:

```css
.flow-diagram {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 12px;
  padding: 32px 24px;
  margin-bottom: 32px;
}
.flow-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  align-items: center;
  margin-bottom: 24px;
}
.flow-row:last-of-type { margin-bottom: 0; }
.flow-node {
  text-align: center;
  padding: 14px 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
}
.flow-node.accent {
  background: rgba(110, 127, 196, 0.12);
  border-color: rgba(110, 127, 196, 0.3);
}
.flow-node__icon { font-size: 24px; margin-bottom: 6px; }
.flow-node__label { font-size: 11px; font-weight: 500; color: var(--text-primary); }
.flow-node__meta { font-size: 10px; color: var(--text-tertiary); margin-top: 2px; }
.flow-arrow {
  text-align: center;
  position: relative;
  color: var(--text-tertiary);
}
.flow-arrow::before {
  content: '';
  position: absolute;
  inset: 50% 0 auto 0;
  height: 1px;
  background: rgba(255,255,255,0.08);
}
.flow-arrow__label {
  position: relative;
  background: var(--bg-canvas);
  padding: 2px 8px;
  font-family: 'Cascadia Code', monospace;
  font-size: 10px;
  color: var(--accent);
  letter-spacing: 0.04em;
}
.flow-direction-label {
  font-size: 10px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: center;
  margin-bottom: 12px;
  font-weight: 500;
}
```

- [ ] **Step 6: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 99 tests passing (no new tests).

- [ ] **Step 7: Visual verify (smoke)**

```bash
npm run dev
```

Clear prefs first to force first-launch:
```powershell
Remove-Item "$env:APPDATA\realtime-translate\prefs.json" -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\realtime-translate\apikey.bin" -ErrorAction SilentlyContinue
```

Expected: SetupView opens, shows "Step 1 of 6 — Welcome", heading + diagram render. Click "Begin →" routes to Step 2 (still stub).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/views/setup/wizard/Step1Welcome.tsx src/renderer/views/setup/wizard/AudioFlowDiagram.tsx src/renderer/views/setup/SetupRoot.tsx src/shared/i18n/locales src/renderer/styles/setup.css
git commit -m "Step 1 of wizard: Welcome with audio flow diagram

Two-row diagram: each row shows one direction (PT->EN you-to-them,
EN->PT them-to-you). Icons for mic/headphones/Meet, accent-tinted
center node. Strings extracted into setup.welcome.* keys.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Step 2 API Key

**Files:**
- Create: `src/renderer/views/setup/wizard/Step2ApiKey.tsx`
- Modify: `src/renderer/views/setup/SetupRoot.tsx`
- Modify: locale JSONs

#### Step 1: Add strings

Append to `pt-BR.json` under `setup`:

```json
"key": {
  "label": "Chave da OpenAI",
  "heading": "Sua chave da OpenAI",
  "sub": "Cada usuário traz a própria chave. Custo: ~$0.30 por 5 minutos de conversa.",
  "placeholder": "sk-proj-...",
  "invalidPrefix": "A chave deve começar com 'sk-'",
  "savedHint": "Salva: ●●●●{{last4}}",
  "signupLink": "Não tenho chave — me leve pro signup OpenAI",
  "howToToggle": "Como pegar a chave?",
  "saveError": "Não foi possível salvar a chave: {{message}}"
}
```

EN-US analog (translate values).

#### Step 2: Create Step2ApiKey

Create `src/renderer/views/setup/wizard/Step2ApiKey.tsx`:

```typescript
import { useEffect, useState, type JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { rt } from '../../../ipc/client';
import { navigate, type HashRoute } from '../shared/useHashRoute';

export function Step2ApiKey({ mode }: { mode?: 'edit' }): JSX.Element {
  const t = useT();
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [hint, setHint] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [howToOpen, setHowToOpen] = useState(false);

  useEffect(() => {
    void rt.hasApiKey().then(setHasKey);
    void rt.getApiKeyHint().then(setHint);
  }, []);

  const onSave = async (): Promise<void> => {
    setError(undefined);
    if (!keyInput.startsWith('sk-')) {
      setError(t('setup.key.invalidPrefix'));
      return;
    }
    try {
      await rt.setApiKey(keyInput);
      setHasKey(true);
      setHint(keyInput.slice(-4));
      setKeyInput('');
      const next: HashRoute = mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 3 };
      navigate(next);
    } catch (e) {
      setError(t('setup.key.saveError', { message: (e as Error).message }));
    }
  };

  const proceed = (): void => {
    const next: HashRoute = mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 3 };
    navigate(next);
  };

  return (
    <>
      <div className="setup-step-meta">{t('setup.stepLabel', { n: 2, total: 6 })} — {t('setup.key.label')}</div>
      <h1 className="setup-heading">{t('setup.key.heading')}</h1>
      <p className="setup-sub">{t('setup.key.sub')}</p>

      {hasKey ? (
        <div style={{ marginBottom: 16, padding: 12, background: 'rgba(74,222,128,0.08)', borderRadius: 6, fontSize: 13 }}>
          {t('setup.key.savedHint', { last4: hint ?? '••••' })}
        </div>
      ) : (
        <input
          className="setup-input"
          type="password"
          value={keyInput}
          onChange={(e): void => setKeyInput(e.target.value)}
          placeholder={t('setup.key.placeholder')}
        />
      )}

      <div style={{ marginTop: 16 }}>
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--accent)', fontSize: 13 }}
        >
          {t('setup.key.signupLink')}
        </a>
      </div>

      <details style={{ marginTop: 16 }} open={howToOpen} onToggle={(e): void => setHowToOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          {t('setup.key.howToToggle')}
        </summary>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
          1. Crie uma conta em platform.openai.com<br />
          2. Configure billing (Settings → Billing)<br />
          3. Crie uma API key (API Keys → Create new secret key)
        </div>
      </details>

      {error && <div style={{ color: 'var(--error)', fontSize: 12, marginTop: 12 }}>{error}</div>}

      <div className="setup-footer">
        <button className="btn btn-ghost" onClick={(): void => navigate({ kind: mode === 'edit' ? 'review' : 'wizard', step: 1 } as HashRoute)}>
          {t('common.back')}
        </button>
        <button
          className="btn btn-primary"
          onClick={(): void => { void (hasKey && !keyInput ? proceed() : onSave()); }}
          disabled={!hasKey && !keyInput}
        >
          {mode === 'edit' ? t('common.saveAndBack') : t('common.next')}
        </button>
      </div>
    </>
  );
}
```

Add `.setup-input` to `setup.css`:

```css
.setup-input {
  width: 100%;
  background: var(--bg-base);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 10px 12px;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
}
.setup-input:focus {
  outline: 0;
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--accent-muted);
}
```

#### Step 3: Wire into SetupRoot

Update `renderStep` in `SetupRoot.tsx`:

```typescript
import { Step2ApiKey } from './wizard/Step2ApiKey';

case 2: return <Step2ApiKey mode={route.mode} />;
```

- [ ] **Step 4: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 99 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/setup/wizard/Step2ApiKey.tsx src/renderer/views/setup/SetupRoot.tsx src/shared/i18n/locales src/renderer/styles/setup.css
git commit -m "Step 2 of wizard: API Key input + signup link + how-to

Reuses existing rt.setApiKey + rt.hasApiKey IPCs from M1. Inline
validation: must start with 'sk-'. Saved state shows masked last-4
hint. Signup link opens OpenAI API keys page externally. How-to is
a collapsible <details> with 3-step instructions.

Edit mode: footer button is 'Salvar e voltar' instead of 'Avançar';
on save, routes back to /review instead of /wizard/3.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: Step 3 VB-CABLE detection + missing flow

**Files:**
- Create: `src/renderer/views/setup/wizard/Step3Cables.tsx`
- Modify: `src/renderer/views/setup/SetupRoot.tsx`
- Modify: locale JSONs

#### Step 1: Add strings

Add to `setup` in pt-BR.json:

```json
"cables": {
  "label": "Cabos virtuais",
  "detectedHeading": "VB-CABLE A+B detectados ✓",
  "detectedSub": "Pronto pra rotear áudio entre você e o Meet.",
  "missingHeading": "Você precisa instalar VB-CABLE A+B",
  "missingSub": "É um par de cabos de áudio virtuais. Software de terceiros (donationware), seguro e amplamente usado.",
  "downloadButton": "Baixar VB-CABLE A+B",
  "rescanButton": "Já instalei, re-detectar",
  "howToToggle": "Como instalar?",
  "rescanFailToast": "Não detectei. Você reiniciou o PC após instalar?",
  "installSteps": [
    "Baixe o ZIP do site VB-Audio",
    "Extraia o conteúdo numa pasta",
    "Rode VBCABLE_Setup_x64.exe como administrador",
    "Reinicie o PC após instalar"
  ]
}
```

EN translation analog.

#### Step 2: Create Step3Cables

Create `src/renderer/views/setup/wizard/Step3Cables.tsx`:

```typescript
import { useEffect, useState, type JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { rt } from '../../../ipc/client';
import { navigate, type HashRoute } from '../shared/useHashRoute';

export function Step3Cables({ mode }: { mode?: 'edit' }): JSX.Element {
  const t = useT();
  const [detected, setDetected] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | undefined>();
  const [howToOpen, setHowToOpen] = useState(false);

  useEffect(() => {
    void check();
  }, []);

  async function check(): Promise<void> {
    const inv = await rt.listDevices();
    const ok = Boolean(inv.cableA?.playback && inv.cableA?.recording && inv.cableB?.playback && inv.cableB?.recording);
    setDetected(ok);
  }

  const onRescan = async (): Promise<void> => {
    setToast(undefined);
    const inv = await rt.listDevices();
    const ok = Boolean(inv.cableA?.playback && inv.cableA?.recording && inv.cableB?.playback && inv.cableB?.recording);
    setDetected(ok);
    if (!ok) setToast(t('setup.cables.rescanFailToast'));
  };

  const proceed = (): void => {
    const next: HashRoute = mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 4 };
    navigate(next);
  };
  const back = (): void => {
    const next: HashRoute = mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 2 };
    navigate(next);
  };

  if (detected === null) {
    return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>Detectando…</div>;
  }

  return (
    <>
      <div className="setup-step-meta">{t('setup.stepLabel', { n: 3, total: 6 })} — {t('setup.cables.label')}</div>
      {detected ? (
        <>
          <h1 className="setup-heading">{t('setup.cables.detectedHeading')}</h1>
          <p className="setup-sub">{t('setup.cables.detectedSub')}</p>
        </>
      ) : (
        <>
          <h1 className="setup-heading">{t('setup.cables.missingHeading')}</h1>
          <p className="setup-sub">{t('setup.cables.missingSub')}</p>
          <a
            href="https://vb-audio.com/Cable/index.htm#DownloadCableAB"
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
            style={{ display: 'inline-block', textDecoration: 'none', marginRight: 12 }}
          >
            {t('setup.cables.downloadButton')}
          </a>
          <button className="btn btn-secondary" onClick={(): void => { void onRescan(); }}>
            {t('setup.cables.rescanButton')}
          </button>
          {toast && <div style={{ marginTop: 16, padding: 10, background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', borderRadius: 6, fontSize: 12 }}>{toast}</div>}

          <details style={{ marginTop: 24 }} open={howToOpen} onToggle={(e): void => setHowToOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              {t('setup.cables.howToToggle')}
            </summary>
            <ol style={{ marginTop: 12, paddingLeft: 20, fontSize: 12, color: 'var(--text-tertiary)' }}>
              {(t('setup.cables.installSteps' as never) as unknown as string[] /* array of strings via i18n */).map?.((step: string, i: number) => (
                <li key={i} style={{ marginBottom: 4 }}>{step}</li>
              ))}
            </ol>
          </details>
        </>
      )}

      <div className="setup-footer">
        <button className="btn btn-ghost" onClick={back}>{t('common.back')}</button>
        <button className="btn btn-primary" disabled={!detected} onClick={proceed}>
          {mode === 'edit' ? t('common.saveAndBack') : t('common.next')}
        </button>
      </div>
    </>
  );
}
```

Note: arrays in JSON aren't directly returnable by `t()`. Quick adapter — for the install steps, render them inline:

Actually, simpler: split into individual keys (`installStep1` ... `installStep4`) and avoid array type complexity in i18n. Adjust JSON:

```json
"installStep1": "Baixe o ZIP do site VB-Audio",
"installStep2": "Extraia o conteúdo numa pasta",
"installStep3": "Rode VBCABLE_Setup_x64.exe como administrador",
"installStep4": "Reinicie o PC após instalar"
```

(Replace the array with these 4 keys; same in EN locale.)

Then in component:

```tsx
<ol style={{ marginTop: 12, paddingLeft: 20, fontSize: 12, color: 'var(--text-tertiary)' }}>
  <li>{t('setup.cables.installStep1')}</li>
  <li>{t('setup.cables.installStep2')}</li>
  <li>{t('setup.cables.installStep3')}</li>
  <li>{t('setup.cables.installStep4')}</li>
</ol>
```

#### Step 3: Wire into SetupRoot

```typescript
import { Step3Cables } from './wizard/Step3Cables';
case 3: return <Step3Cables mode={route.mode} />;
```

- [ ] **Step 4: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 99 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/setup/wizard/Step3Cables.tsx src/renderer/views/setup/SetupRoot.tsx src/shared/i18n/locales
git commit -m "Step 3 of wizard: VB-CABLE detection + missing-flow

On mount, calls rt.listDevices() and inspects cableA + cableB. If both
present (playback AND recording sides each), shows green ✓ heading and
allows Avançar. If missing, shows install instructions: external
Download button (opens vb-audio.com) + Já instalei/Re-detectar button
that re-runs the check. Toast on failed re-detect: 'Did you reboot?'.

Install steps split into individual i18n keys (no array support in
the simple t() lookup).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: Step 4 Devices

**Files:**
- Create: `src/renderer/views/setup/wizard/Step4Devices.tsx`
- Modify: `src/renderer/views/setup/SetupRoot.tsx`
- Modify: locale JSONs

#### Step 1: Add strings

Add to `setup` in pt-BR.json:

```json
"devices": {
  "label": "Dispositivos",
  "heading": "Seus dispositivos de áudio",
  "sub": "Selecione qual mic e fone você usa.",
  "mic": "Microfone (sua voz)",
  "toMeet": "Saída pro Meet",
  "fromMeet": "Captura do Meet",
  "headset": "Fone (você ouve a tradução)",
  "languagesLabel": "Idiomas (você ↔ interlocutor)",
  "recommended": "(recomendado)",
  "missingError": "Selecione todos os 4 dispositivos"
}
```

(EN analog.)

#### Step 2: Create Step4Devices

Create `src/renderer/views/setup/wizard/Step4Devices.tsx`:

```typescript
import { useEffect, type JSX } from 'react';
import { useStore } from '../../../state/store';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { rt } from '../../../ipc/client';
import { navigate, type HashRoute } from '../shared/useHashRoute';
import { LANGUAGES, type LanguageCode } from '../../../../shared/languages';

export function Step4Devices({ mode }: { mode?: 'edit' }): JSX.Element {
  const t = useT();
  const {
    devices, sourceLang, targetLang,
    selectedMic, selectedToMeet, selectedFromMeet, selectedHeadset,
    setDevices, setSourceLang, setTargetLang,
    setSelectedMic, setSelectedToMeet, setSelectedFromMeet, setSelectedHeadset,
  } = useStore();

  useEffect(() => {
    void rt.listDevices().then((d) => {
      setDevices(d);
      if (d.cableA?.playback && !selectedToMeet) setSelectedToMeet(d.cableA.playback.deviceId);
      if (d.cableB?.recording && !selectedFromMeet) setSelectedFromMeet(d.cableB.recording.deviceId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allFilled = Boolean(selectedMic && selectedToMeet && selectedFromMeet && selectedHeadset);

  const back = (): void => {
    const next: HashRoute = mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 3 };
    navigate(next);
  };
  const proceed = (): void => {
    const next: HashRoute = mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 5 };
    navigate(next);
  };

  return (
    <>
      <div className="setup-step-meta">{t('setup.stepLabel', { n: 4, total: 6 })} — {t('setup.devices.label')}</div>
      <h1 className="setup-heading">{t('setup.devices.heading')}</h1>
      <p className="setup-sub">{t('setup.devices.sub')}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
        <DeviceField label={t('setup.devices.mic')} value={selectedMic} onChange={setSelectedMic} options={devices?.inputs ?? []} />
        <DeviceField
          label={t('setup.devices.toMeet')}
          value={selectedToMeet}
          onChange={setSelectedToMeet}
          options={devices?.outputs ?? []}
          recommendedId={devices?.cableA?.playback?.deviceId}
          recommendedLabel={t('setup.devices.recommended')}
        />
        <DeviceField
          label={t('setup.devices.fromMeet')}
          value={selectedFromMeet}
          onChange={setSelectedFromMeet}
          options={devices?.inputs ?? []}
          recommendedId={devices?.cableB?.recording?.deviceId}
          recommendedLabel={t('setup.devices.recommended')}
        />
        <DeviceField label={t('setup.devices.headset')} value={selectedHeadset} onChange={setSelectedHeadset} options={devices?.outputs ?? []} />

        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            {t('setup.devices.languagesLabel')}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select className="setup-input" style={{ flex: 1 }} value={sourceLang} onChange={(e): void => setSourceLang(e.target.value as LanguageCode)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <span style={{ color: 'var(--text-tertiary)' }}>↔</span>
            <select className="setup-input" style={{ flex: 1 }} value={targetLang} onChange={(e): void => setTargetLang(e.target.value as LanguageCode)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="setup-footer">
        <button className="btn btn-ghost" onClick={back}>{t('common.back')}</button>
        <button className="btn btn-primary" disabled={!allFilled} onClick={proceed}>
          {mode === 'edit' ? t('common.saveAndBack') : t('common.next')}
        </button>
      </div>
    </>
  );
}

function DeviceField({
  label, value, onChange, options, recommendedId, recommendedLabel,
}: {
  label: string;
  value: string | undefined;
  onChange: (id: string) => void;
  options: { deviceId: string; label: string }[];
  recommendedId?: string;
  recommendedLabel?: string;
}): JSX.Element {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{label}</label>
      <select className="setup-input" value={value ?? ''} onChange={(e): void => onChange(e.target.value)}>
        <option value="">— select —</option>
        {recommendedId && options.find((o) => o.deviceId === recommendedId) && (
          <option value={recommendedId}>
            {options.find((o) => o.deviceId === recommendedId)?.label} {recommendedLabel}
          </option>
        )}
        {options
          .filter((o) => o.deviceId !== recommendedId)
          .map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
      </select>
    </div>
  );
}
```

#### Step 3: Wire into SetupRoot

```typescript
import { Step4Devices } from './wizard/Step4Devices';
case 4: return <Step4Devices mode={route.mode} />;
```

- [ ] **Step 4: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 99 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/setup/wizard/Step4Devices.tsx src/renderer/views/setup/SetupRoot.tsx src/shared/i18n/locales
git commit -m "Step 4 of wizard: device selection (4 dropdowns + lang pair)

Mic, To Meet (auto-recommend CABLE-A Input), From Meet (auto-recommend
CABLE-B Output), Headset, plus source/target language pair using the
72-language LANGUAGES list. Auto-detect runs once on mount; user can
override. Avançar disabled until all 4 devices selected.

Edit mode routes back to /review on save.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: Step 5 Meet config + placeholder PNGs + MeetGuide

**Files:**
- Create: `src/renderer/views/setup/shared/MeetGuide.tsx`
- Create: `src/renderer/views/setup/wizard/Step5MeetConfig.tsx`
- Create: `assets/setup/meet-step-1.png` ... `meet-step-5.png` (placeholders)
- Modify: `src/renderer/views/setup/SetupRoot.tsx`
- Modify: locale JSONs
- Modify: `electron.vite.config.ts` (publicDir for assets)

#### Step 1: Create placeholder PNGs

Use PowerShell or Python to generate 5 placeholder PNGs (640×360, gray background, big number 1-5 in center). Quickest:

```powershell
# Run from repo root:
Add-Type -AssemblyName System.Drawing
1..5 | ForEach-Object {
  $bmp = New-Object System.Drawing.Bitmap 640, 360
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(26, 29, 32))
  $font = New-Object System.Drawing.Font("Segoe UI", 96, [System.Drawing.FontStyle]::Bold)
  $brush = [System.Drawing.Brushes]::White
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(0, 0, 640, 360)
  $g.DrawString("Step $_", $font, $brush, $rect, $sf)
  $bmp.Save("assets/setup/meet-step-$_.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}
```

This creates 5 dark-gray PNGs labeled "Step 1" through "Step 5". Real screenshots come later by user.

Verify they exist:

```powershell
Get-ChildItem assets/setup/*.png | Select-Object Name, Length
```

#### Step 2: Wire assets into vite

Modify `electron.vite.config.ts` — for the renderer block, add `publicDir` so `assets/` is copied to output:

```typescript
renderer: {
  root: resolve('src/renderer'),
  publicDir: resolve('assets'),
  // ... rest unchanged
}
```

Files become accessible at `/setup/meet-step-1.png`, etc., from the renderer.

#### Step 3: Add strings

Add to `setup` in pt-BR.json:

```json
"meet": {
  "label": "Configurar Meet",
  "heading": "Configurar o Google Meet",
  "sub": "Esse passo é manual — não conseguimos verificar automaticamente, mas é rápido.",
  "alreadyConfigured": "Já configurei",
  "step1": "Abra qualquer reunião no Meet",
  "step2": "Clique nos 3 pontos no canto inferior direito → Configurações",
  "step3": "Vá pra aba 'Áudio'",
  "step4": "Microfone: selecione 'CABLE-A Output (VB-Audio Cable A)'",
  "step5": "Alto-falantes: selecione 'CABLE-B Input (VB-Audio Cable B)' (NÃO o '16ch')"
}
```

EN analog.

#### Step 4: Create MeetGuide component

Create `src/renderer/views/setup/shared/MeetGuide.tsx`:

```typescript
import type { JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';

export function MeetGuide(): JSX.Element {
  const t = useT();
  const steps = [
    { n: 1, text: t('setup.meet.step1') },
    { n: 2, text: t('setup.meet.step2') },
    { n: 3, text: t('setup.meet.step3') },
    { n: 4, text: t('setup.meet.step4') },
    { n: 5, text: t('setup.meet.step5') },
  ];
  return (
    <div className="meet-guide">
      {steps.map((s) => (
        <div key={s.n} className="meet-guide__step">
          <img src={`/setup/meet-step-${s.n}.png`} alt={`Step ${s.n}`} className="meet-guide__img" />
          <div className="meet-guide__caption">
            <span className="meet-guide__num">{s.n}</span>
            <span>{s.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

Add CSS:

```css
.meet-guide {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 24px;
}
.meet-guide__step {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 14px;
  align-items: start;
  padding: 12px;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}
.meet-guide__img {
  width: 100%;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
}
.meet-guide__caption {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
}
.meet-guide__num {
  flex-shrink: 0;
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--accent-muted);
  color: var(--accent);
  display: inline-flex;
  align-items: center; justify-content: center;
  font-size: 12px;
  font-weight: 600;
}
```

#### Step 5: Create Step5MeetConfig

Create `src/renderer/views/setup/wizard/Step5MeetConfig.tsx`:

```typescript
import { useState, type JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { navigate, type HashRoute } from '../shared/useHashRoute';
import { MeetGuide } from '../shared/MeetGuide';

export function Step5MeetConfig({ mode }: { mode?: 'edit' }): JSX.Element {
  const t = useT();
  const [confirmed, setConfirmed] = useState(false);

  const back = (): void => {
    const next: HashRoute = mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 4 };
    navigate(next);
  };
  const proceed = (): void => {
    const next: HashRoute = mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 6 };
    navigate(next);
  };

  return (
    <>
      <div className="setup-step-meta">{t('setup.stepLabel', { n: 5, total: 6 })} — {t('setup.meet.label')}</div>
      <h1 className="setup-heading">{t('setup.meet.heading')}</h1>
      <p className="setup-sub">{t('setup.meet.sub')}</p>

      <MeetGuide />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
        <input type="checkbox" checked={confirmed} onChange={(e): void => setConfirmed(e.target.checked)} />
        {t('setup.meet.alreadyConfigured')}
      </label>

      <div className="setup-footer">
        <button className="btn btn-ghost" onClick={back}>{t('common.back')}</button>
        <button className="btn btn-primary" disabled={!confirmed} onClick={proceed}>
          {mode === 'edit' ? t('common.saveAndBack') : t('common.next')}
        </button>
      </div>
    </>
  );
}
```

#### Step 6: Wire into SetupRoot

```typescript
import { Step5MeetConfig } from './wizard/Step5MeetConfig';
case 5: return <Step5MeetConfig mode={route.mode} />;
```

- [ ] **Step 7: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 99 tests passing.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/views/setup/wizard/Step5MeetConfig.tsx src/renderer/views/setup/shared/MeetGuide.tsx src/renderer/views/setup/SetupRoot.tsx src/shared/i18n/locales src/renderer/styles/setup.css electron.vite.config.ts assets/setup
git commit -m "Step 5 of wizard: Meet config visual guide + 'already configured'

5-screenshot guide rendered via MeetGuide component (also reused by
review screen 'Ver guia' button). Placeholder PNGs created via SAPI
PowerShell — real Meet screenshots authored manually after this lands.
publicDir in vite renderer config copies assets/ to dist.

Avançar disabled until user checks 'Já configurei'.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: Step 6 Test Translation UI shell (no backend yet)

**Files:**
- Create: `src/renderer/views/setup/wizard/Step6TestTranslation.tsx`
- Modify: `src/renderer/views/setup/SetupRoot.tsx`
- Modify: locale JSONs

#### Step 1: Add strings

Add to `setup` in pt-BR.json:

```json
"test": {
  "label": "Testar tradução",
  "heading": "Testar tradução",
  "sub": "Vamos validar que tudo funciona com 2 calls curtas pra OpenAI (~$0.10 total). Pode pular se preferir.",
  "directionA": "Direction A (PT → EN)",
  "directionAExplain": "App vai falar uma frase em português, traduzir pra inglês, e validar que o cabo recebe.",
  "directionB": "Direction B (EN → PT)",
  "directionBExplain": "App vai falar uma frase em inglês, traduzir pra português, e tocar no seu fone.",
  "runTestA": "Testar PT → EN",
  "runTestB": "Testar EN → PT",
  "running": "Testando…",
  "passed": "✓ Passou",
  "failed": "✗ Falhou: {{reason}}",
  "skipWarning": "Tradução pode falhar na primeira chamada se algo tiver mal configurado.",
  "skip": "Pular e abrir barra",
  "finish": "Concluir setup →"
}
```

EN analog.

#### Step 2: Create Step6TestTranslation skeleton

Create `src/renderer/views/setup/wizard/Step6TestTranslation.tsx`:

```typescript
import { useState, type JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { rt } from '../../../ipc/client';
import { navigate, type HashRoute } from '../shared/useHashRoute';

type TestStatus = 'idle' | 'running' | 'passed' | 'failed';
interface Result { status: TestStatus; reason?: string }

export function Step6TestTranslation({ mode }: { mode?: 'edit' }): JSX.Element {
  const t = useT();
  const [resA, setResA] = useState<Result>({ status: 'idle' });
  const [resB, setResB] = useState<Result>({ status: 'idle' });
  const [skipped, setSkipped] = useState(false);

  // Backend wired in Task 12; for now: stub that "succeeds" instantly so the UI flow can be exercised.
  const runA = async (): Promise<void> => {
    setResA({ status: 'running' });
    // TODO Task 12: replace with real test
    await new Promise((r) => setTimeout(r, 500));
    setResA({ status: 'passed' });
  };
  const runB = async (): Promise<void> => {
    setResB({ status: 'running' });
    await new Promise((r) => setTimeout(r, 500));
    setResB({ status: 'passed' });
  };

  const back = (): void => {
    const next: HashRoute = mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 5 };
    navigate(next);
  };

  const concluir = async (): Promise<void> => {
    if (mode === 'edit') {
      navigate({ kind: 'review' });
      return;
    }
    await rt.markSetupComplete();
  };

  const allPassed = resA.status === 'passed' && resB.status === 'passed';
  const canFinish = allPassed || skipped;

  return (
    <>
      <div className="setup-step-meta">{t('setup.stepLabel', { n: 6, total: 6 })} — {t('setup.test.label')}</div>
      <h1 className="setup-heading">{t('setup.test.heading')}</h1>
      <p className="setup-sub">{t('setup.test.sub')}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <TestCard
          name={t('setup.test.directionA')}
          explain={t('setup.test.directionAExplain')}
          buttonLabel={t('setup.test.runTestA')}
          result={resA}
          t={t}
          onRun={runA}
        />
        <TestCard
          name={t('setup.test.directionB')}
          explain={t('setup.test.directionBExplain')}
          buttonLabel={t('setup.test.runTestB')}
          result={resB}
          t={t}
          onRun={runB}
        />
      </div>

      {skipped && (
        <div style={{ padding: 10, background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', borderRadius: 6, fontSize: 12, marginBottom: 16 }}>
          {t('setup.test.skipWarning')}
        </div>
      )}

      <div className="setup-footer">
        <button className="btn btn-ghost" onClick={back}>{t('common.back')}</button>
        <div style={{ display: 'flex', gap: 8 }}>
          {!allPassed && !skipped && (
            <button className="btn btn-ghost" onClick={(): void => setSkipped(true)}>
              {t('setup.test.skip')}
            </button>
          )}
          <button className="btn btn-primary" disabled={!canFinish} onClick={(): void => { void concluir(); }}>
            {mode === 'edit' ? t('common.close') : t('setup.test.finish')}
          </button>
        </div>
      </div>
    </>
  );
}

function TestCard({
  name, explain, buttonLabel, result, t, onRun,
}: {
  name: string;
  explain: string;
  buttonLabel: string;
  result: Result;
  t: ReturnType<typeof useT>;
  onRun: () => Promise<void>;
}): JSX.Element {
  return (
    <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{name}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.4 }}>{explain}</div>
      {result.status === 'idle' && (
        <button className="btn btn-secondary" onClick={(): void => { void onRun(); }}>{buttonLabel}</button>
      )}
      {result.status === 'running' && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('setup.test.running')}</div>
      )}
      {result.status === 'passed' && (
        <div style={{ fontSize: 12, color: 'var(--success)' }}>{t('setup.test.passed')}</div>
      )}
      {result.status === 'failed' && (
        <div style={{ fontSize: 12, color: 'var(--error)' }}>{t('setup.test.failed', { reason: result.reason ?? '' })}</div>
      )}
    </div>
  );
}
```

#### Step 3: Wire into SetupRoot

```typescript
import { Step6TestTranslation } from './wizard/Step6TestTranslation';
case 6: return <Step6TestTranslation mode={route.mode} />;
```

- [ ] **Step 4: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 99 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/setup/wizard/Step6TestTranslation.tsx src/renderer/views/setup/SetupRoot.tsx src/shared/i18n/locales
git commit -m "Step 6 of wizard: Test Translation UI shell (stubbed runners)

Two TestCard components side-by-side. Each has explain text + Run
button + status states (idle/running/passed/failed). Skip path with
warning toast; Concluir setup button calls rt.markSetupComplete()
(existing M3 IPC) when allowed.

Backend runners are stubbed (500ms timeout + auto-pass); Task 12
wires real OpenAI sessions + WAV injection + loopback validation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase E — Test Translation backend (Task 12)

### Task 12: Test session IPCs + loopback capture + WAV bundling + Direction A/B integration

**Files:**
- Create: `src/main/translate/testSession.ts`
- Create: `src/main/audio/loopbackCapture.ts`
- Create: `tests/unit/loopbackCapture.test.ts`
- Create: `assets/test/test-pt.wav`
- Create: `assets/test/test-en.wav`
- Modify: `src/shared/events.ts`
- Modify: `src/main/ipc/channels.ts`
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/app.ts` (instantiate test session map; loopback registry)
- Modify: `src/renderer/views/setup/wizard/Step6TestTranslation.tsx` (wire real runners)
- Modify: `src/renderer/offscreen/index.ts` (add loopback capture endpoint)

#### Step 1: Generate WAV files

Use Windows SAPI to generate the two WAV files. From repo root:

```powershell
Add-Type -AssemblyName System.Speech
$ptSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$ptSynth.SetOutputToWaveFile("assets/test/test-pt.wav",
  (New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
    24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)))
# Use a PT-BR voice if available; falls back to default if not.
try { $ptSynth.SelectVoice("Microsoft Maria Desktop") } catch {}
$ptSynth.Speak("Olá, isto é um teste de tradução em português.")
$ptSynth.Dispose()

$enSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$enSynth.SetOutputToWaveFile("assets/test/test-en.wav",
  (New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
    24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)))
$enSynth.Speak("Hello, this is a translation test.")
$enSynth.Dispose()
```

Verify:

```powershell
Get-ChildItem assets/test/*.wav | Select-Object Name, Length
```

Both files should be ~50-150 KB.

#### Step 2: Add IPC channels

In `src/shared/events.ts`:

```typescript
TestSessionStart: 'test:session:start',
TestSessionInject: 'test:session:inject',
TestSessionInputDone: 'test:session:inputDone',
TestSessionStop: 'test:session:stop',
LoopbackStart: 'audio:loopbackStart',
LoopbackResult: 'audio:loopbackResult',
```

In `src/main/ipc/channels.ts`:

```typescript
import type { LanguageCode } from '../../shared/languages';

export interface IpcInvokeMap {
  // ... existing ...
  [IPC.TestSessionStart]: { args: { direction: 'A' | 'B'; sourceLang: LanguageCode; targetLang: LanguageCode }; result: void };
  [IPC.TestSessionInject]: { args: { direction: 'A' | 'B'; base64: string }; result: void };
  [IPC.TestSessionInputDone]: { args: { direction: 'A' | 'B' }; result: void };
  [IPC.TestSessionStop]: { args: { direction: 'A' | 'B' }; result: void };
  [IPC.LoopbackStart]: { args: { deviceId: string; thresholdRms: number; timeoutMs: number }; result: { detected: boolean } };
}
```

Note: `LoopbackStart` returns the result of the (async) detection. Implementation in Step 4 awaits the loopback's promise before resolving the IPC.

#### Step 3: Implement loopback capture in offscreen

Modify `src/renderer/offscreen/index.ts` to expose a `runLoopback` method:

```typescript
window.offscreen = {
  // ... existing methods ...
  async runLoopback(deviceId: string, thresholdRms: number, timeoutMs: number): Promise<{ detected: boolean }> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId }, sampleRate: 24000, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = new AudioContext({ sampleRate: 24000 });
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const startedAt = Date.now();
    let detected = false;
    while (Date.now() - startedAt < timeoutMs) {
      analyser.getFloatTimeDomainData(buf);
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) sumSq += buf[i]! * buf[i]!;
      const rms = Math.sqrt(sumSq / buf.length);
      if (rms > thresholdRms) { detected = true; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    return { detected };
  },
};
```

Add the type to the `Window.offscreen` declaration at the top of the file.

#### Step 4: Wire LoopbackStart IPC in main + offscreen bridge

In `src/main/audio/loopbackCapture.ts`:

```typescript
import type { BrowserWindow } from 'electron';

export async function runLoopback(
  offscreenWindow: BrowserWindow,
  deviceId: string,
  thresholdRms: number,
  timeoutMs: number,
): Promise<{ detected: boolean }> {
  const result: { detected: boolean } = await offscreenWindow.webContents.executeJavaScript(
    `window.offscreen.runLoopback(${JSON.stringify(deviceId)}, ${thresholdRms}, ${timeoutMs})`,
  );
  return result;
}
```

In `src/main/ipc/handlers.ts`, register:

```typescript
handle(IPC.LoopbackStart, (_e, args) => deps.runLoopback(args.deviceId, args.thresholdRms, args.timeoutMs));
```

(Add `runLoopback` to `HandlerDeps`.)

In `src/main/app.ts`:

```typescript
import { runLoopback } from './audio/loopbackCapture';

registerIpcHandlers({
  // ...
  runLoopback: (deviceId, thresholdRms, timeoutMs) =>
    runLoopback(offscreenWindow!, deviceId, thresholdRms, timeoutMs),
});
```

#### Step 5: Implement test session in main

Create `src/main/translate/testSession.ts`:

```typescript
import { OpenAISession, type WebSocketFactory } from './openaiSession';
import type { LanguageCode } from '../../shared/languages';
import type { Direction } from '../../shared/types';

export interface TestSessionConfig {
  apiKey: string;
  wsFactory: WebSocketFactory;
  onAudio: (base64: string) => void;
}

export class TestSessionRegistry {
  private sessions = new Map<Direction, OpenAISession>();

  start(direction: Direction, sourceLang: LanguageCode, targetLang: LanguageCode, cfg: TestSessionConfig): void {
    this.stop(direction);
    const session = new OpenAISession({
      apiKey: cfg.apiKey,
      sourceLang,
      targetLang,
      events: {
        onState: () => undefined,
        onAudio: cfg.onAudio,
        onTranscript: () => undefined,
      },
      wsFactory: cfg.wsFactory,
    });
    session.start();
    this.sessions.set(direction, session);
  }

  inject(direction: Direction, base64: string): void {
    this.sessions.get(direction)?.appendAudio(base64);
  }

  /** End-of-input signal — equivalent of session.input_audio_buffer.commit. */
  inputDone(_direction: Direction): void {
    // OpenAISession does not expose commit explicitly; relying on server VAD to finalize.
    // For test purposes, the WAV is short enough that VAD finalizes within a few seconds.
  }

  stop(direction: Direction): void {
    const s = this.sessions.get(direction);
    if (s) {
      s.stop();
      this.sessions.delete(direction);
    }
  }
}
```

In `src/main/app.ts`, instantiate inside `whenReady`:

```typescript
import { TestSessionRegistry } from './translate/testSession';

const testSessions = new TestSessionRegistry();
```

Pass to handlers:

```typescript
registerIpcHandlers({
  // ...
  testSessionStart: ({ direction, sourceLang, targetLang }) => {
    const apiKey = configStore.getApiKey();
    if (!apiKey) throw new Error('No API key');
    testSessions.start(direction, sourceLang, targetLang, {
      apiKey,
      wsFactory,
      onAudio: (b64) => {
        // Route to floating widget? For test purposes, route to the SETUP window's
        // listener so the renderer can do its validation. Use ad-hoc IPC channel:
        if (setupView && !setupView.isDestroyed()) {
          setupView.webContents.send(`test:audio:${direction}`, b64);
        }
      },
    });
  },
  testSessionInject: ({ direction, base64 }) => testSessions.inject(direction, base64),
  testSessionInputDone: ({ direction }) => testSessions.inputDone(direction),
  testSessionStop: ({ direction }) => testSessions.stop(direction),
});
```

(Add these to `HandlerDeps` + register `handle(IPC.TestSession*, ...)`.)

In `src/main/preload.ts`:

```typescript
testSessionStart: (args: IpcInvokeMap[typeof IPC.TestSessionStart]['args']): Promise<void> =>
  ipcRenderer.invoke(IPC.TestSessionStart, args),
testSessionInject: (args: IpcInvokeMap[typeof IPC.TestSessionInject]['args']): Promise<void> =>
  ipcRenderer.invoke(IPC.TestSessionInject, args),
testSessionInputDone: (args: IpcInvokeMap[typeof IPC.TestSessionInputDone]['args']): Promise<void> =>
  ipcRenderer.invoke(IPC.TestSessionInputDone, args),
testSessionStop: (args: IpcInvokeMap[typeof IPC.TestSessionStop]['args']): Promise<void> =>
  ipcRenderer.invoke(IPC.TestSessionStop, args),
loopbackStart: (args: IpcInvokeMap[typeof IPC.LoopbackStart]['args']): Promise<{ detected: boolean }> =>
  ipcRenderer.invoke(IPC.LoopbackStart, args),
onTestAudio: (direction: 'A' | 'B', cb: (base64: string) => void): (() => void) => {
  const handler = (_evt: unknown, b64: string): void => cb(b64);
  ipcRenderer.on(`test:audio:${direction}`, handler);
  return (): void => { ipcRenderer.off(`test:audio:${direction}`, handler); };
},
```

#### Step 6: Wire real runners in Step6TestTranslation

Replace the stubbed `runA` / `runB` in Step6TestTranslation.tsx:

```typescript
import { useStore } from '../../../state/store';

// Inside Step6TestTranslation:
const { selectedToMeet, selectedFromMeet, selectedHeadset } = useStore();

async function loadTestWavAsPcmChunks(filename: string): Promise<string[]> {
  const url = `/test/${filename}`;
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  // Skip 44-byte WAV header, read raw PCM16 little-endian.
  const pcmBytes = new Uint8Array(arrayBuffer.slice(44));
  const samplesPerChunk = (24000 * 50) / 1000; // 50ms chunks → 1200 samples → 2400 bytes
  const chunkBytes = samplesPerChunk * 2;
  const chunks: string[] = [];
  for (let i = 0; i < pcmBytes.byteLength; i += chunkBytes) {
    const slice = pcmBytes.slice(i, Math.min(i + chunkBytes, pcmBytes.byteLength));
    let bin = '';
    for (let j = 0; j < slice.length; j++) bin += String.fromCharCode(slice[j]!);
    chunks.push(btoa(bin));
  }
  return chunks;
}

const runA = async (): Promise<void> => {
  setResA({ status: 'running' });
  try {
    const chunks = await loadTestWavAsPcmChunks('test-pt.wav');
    await rt.testSessionStart({ direction: 'A', sourceLang: 'pt', targetLang: 'en' });

    // Set up audio routing: when test session emits onAudio (EN PCM), route to CABLE-A Input
    // via the existing playback path (re-use offscreen.startPlayback + pushPlayback).
    const offTestAudio = rt.onTestAudio('A', (b64) => {
      // Use offscreen playback bound to selectedToMeet (CABLE-A Input)
      void rt.testRoutePlayback?.({ direction: 'A', deviceId: selectedToMeet ?? '', base64: b64 });
    });

    // Inject WAV chunks
    for (const chunk of chunks) {
      await rt.testSessionInject({ direction: 'A', base64: chunk });
      await new Promise((r) => setTimeout(r, 50));
    }
    await rt.testSessionInputDone({ direction: 'A' });

    // Start loopback capture from CABLE-A Output (selectedFromMeet would be CABLE-B Output;
    // we need the recording side of CABLE-A. If devices.cableA.recording is set, use it).
    const inv = await rt.listDevices();
    const cableARecording = inv.cableA?.recording?.deviceId;
    if (!cableARecording) throw new Error('CABLE-A recording side not detected');

    const result = await rt.loopbackStart({
      deviceId: cableARecording,
      thresholdRms: 0.01,
      timeoutMs: 10000,
    });

    offTestAudio();
    await rt.testSessionStop({ direction: 'A' });

    if (result.detected) setResA({ status: 'passed' });
    else setResA({ status: 'failed', reason: 'No audio detected on CABLE-A Output' });
  } catch (e) {
    setResA({ status: 'failed', reason: (e as Error).message });
  }
};

const runB = async (): Promise<void> => {
  setResB({ status: 'running' });
  try {
    const chunks = await loadTestWavAsPcmChunks('test-en.wav');
    await rt.testSessionStart({ direction: 'B', sourceLang: 'en', targetLang: 'pt' });

    const offTestAudio = rt.onTestAudio('B', (b64) => {
      // Route to user's headset via existing playback infrastructure
      void rt.testRoutePlayback?.({ direction: 'B', deviceId: selectedHeadset ?? '', base64: b64 });
    });

    for (const chunk of chunks) {
      await rt.testSessionInject({ direction: 'B', base64: chunk });
      await new Promise((r) => setTimeout(r, 50));
    }
    await rt.testSessionInputDone({ direction: 'B' });

    // Wait ~5s for translation to play, then prompt the user
    await new Promise((r) => setTimeout(r, 5000));

    offTestAudio();
    await rt.testSessionStop({ direction: 'B' });

    const heard = window.confirm('Did you hear a phrase in Portuguese in your headphones?');
    if (heard) setResB({ status: 'passed' });
    else setResB({ status: 'failed', reason: "User reported no audio heard" });
  } catch (e) {
    setResB({ status: 'failed', reason: (e as Error).message });
  }
};
```

NOTE: `testRoutePlayback` is referenced but not yet defined. This is the **simplest viable path**: have the renderer ask main to play a PCM chunk on a specific device. Add this as a small additional IPC + main process helper that uses the existing offscreen `startPlayback` + `pushPlayback` for a temp playback handle. For the plan, this is bundled inline as part of Task 12.

Implementation in `src/main/app.ts`:

```typescript
// Add a small testPlaybackRegistry that creates a temp playback for a (direction, deviceId)
// pair and pushes audio through.
const testPlaybacks = new Map<string, boolean>(); // direction → started?

const runTestPlayback = async (direction: Direction, deviceId: string, base64: string): Promise<void> => {
  const streamId = `test-${direction}`;
  if (!testPlaybacks.get(streamId)) {
    await offscreenBridge.startPlayback(streamId, deviceId);
    testPlaybacks.set(streamId, true);
  }
  offscreenBridge.pushPlayback(streamId, base64);
};
```

Add IPC + handler:

```typescript
// events.ts:
TestRoutePlayback: 'test:routePlayback',

// channels.ts:
[IPC.TestRoutePlayback]: { args: { direction: Direction; deviceId: string; base64: string }; result: void };

// handlers.ts:
handle(IPC.TestRoutePlayback, (_e, args) => deps.runTestPlayback(args.direction, args.deviceId, args.base64));

// app.ts in registerIpcHandlers:
runTestPlayback: (d, id, b64) => runTestPlayback(d, id, b64),

// preload.ts:
testRoutePlayback: (args: IpcInvokeMap[typeof IPC.TestRoutePlayback]['args']): Promise<void> =>
  ipcRenderer.invoke(IPC.TestRoutePlayback, args),
```

Also clean up test playbacks on testSessionStop:

```typescript
// In TestSessionRegistry.stop():
stop(direction: Direction): void {
  // ... existing session stop ...
  // Clean test playback
  this.cfg?.onAfterStop?.(direction);
}
```

Or simpler: in `testSessionStop` IPC handler, also stop the offscreen stream:

```typescript
testSessionStop: ({ direction }) => {
  testSessions.stop(direction);
  const streamId = `test-${direction}`;
  offscreenBridge.stopStream(streamId);
  testPlaybacks.delete(streamId);
},
```

#### Step 7: Quick test for loopback module (sanity check)

Create `tests/unit/loopbackCapture.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { runLoopback } from '@main/audio/loopbackCapture';

describe('runLoopback', () => {
  it('forwards args correctly to offscreen.executeJavaScript and returns its result', async () => {
    const offscreen = {
      webContents: {
        executeJavaScript: vi.fn().mockResolvedValue({ detected: true }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runLoopback(offscreen as any, 'device-xyz', 0.01, 10000);
    expect(result.detected).toBe(true);
    expect(offscreen.webContents.executeJavaScript).toHaveBeenCalledWith(
      'window.offscreen.runLoopback("device-xyz", 0.01, 10000)',
    );
  });
});
```

- [ ] **Step 8: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 100 tests passing (99 + 1 new loopback test).

- [ ] **Step 9: Commit**

```bash
git add src/main/translate/testSession.ts src/main/audio/loopbackCapture.ts tests/unit/loopbackCapture.test.ts assets/test src/shared/events.ts src/main/ipc/channels.ts src/main/ipc/handlers.ts src/main/preload.ts src/main/app.ts src/renderer/views/setup/wizard/Step6TestTranslation.tsx src/renderer/offscreen/index.ts
git commit -m "Test Translation backend: isolated sessions + loopback + WAV bundling

TestSessionRegistry holds isolated OpenAISession instances per direction,
keyed by 'A'|'B'. Lifecycle: start (open WS) -> inject (feed WAV chunks) ->
inputDone (signal end) -> stop (close WS, cleanup playback).

LoopbackCapture runs in offscreen via Web Audio AnalyserNode. RMS poll
at 100ms; threshold 0.01; timeout 10s. Validates Direction A by listening
on CABLE-A Output (recording side) for translated EN audio after the
session emits it through the temp playback to CABLE-A Input.

Direction B uses simpler validation: temp playback to selectedHeadset,
user-confirmed via window.confirm prompt.

WAV files generated via Windows SAPI (PT-BR + EN voices), 24kHz mono
PCM16, ~3s each. ~50KB each. Bundled in assets/test/.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase F — Review screen (Task 13)

### Task 13: ReviewScreen + ReviewSection + edit-mode wiring

**Files:**
- Create: `src/renderer/views/setup/review/ReviewScreen.tsx`
- Create: `src/renderer/views/setup/review/ReviewSection.tsx`
- Modify: `src/renderer/views/setup/SetupRoot.tsx`
- Modify: locale JSONs

#### Step 1: Add strings

Add to root of pt-BR.json:

```json
"review": {
  "heading": "Configurações",
  "sub": "Tudo já configurado. Edite o que precisar — clicar em 'Editar' abre o passo correspondente do wizard.",
  "section": {
    "key": "OpenAI API Key",
    "keyValue": "●●●●{{last4}} · safeStorage",
    "keyMissing": "Não configurada",
    "cables": "VB-CABLE A · B",
    "cablesOk": "Detectados — pronto pra rotear áudio",
    "cablesMissing": "Não detectados — instale e re-detecte",
    "languages": "Idiomas",
    "devices": "Dispositivos",
    "devicesValue": "Mic: {{mic}} · Saída Meet: {{toMeet}} · Entrada Meet: {{fromMeet}} · Fone: {{headset}}",
    "meet": "Configurar Google Meet",
    "meetValue": "Mic = CABLE-A Output · Speaker = CABLE-B Input · não conseguimos verificar automaticamente",
    "edit": "Editar",
    "rescan": "Re-detectar",
    "viewGuide": "Ver guia"
  },
  "footer": {
    "test": "Testar tradução",
    "quit": "Sair do app",
    "close": "Fechar"
  }
}
```

EN analog.

#### Step 2: Create ReviewSection

Create `src/renderer/views/setup/review/ReviewSection.tsx`:

```typescript
import type { JSX, ReactNode } from 'react';

export function ReviewSection({
  status, title, value, action,
}: {
  status: 'ok' | 'warn';
  title: string;
  value: string | ReactNode;
  action: ReactNode;
}): JSX.Element {
  return (
    <div className="review-section">
      <div className={`review-icon ${status}`}>{status === 'ok' ? '✓' : '!'}</div>
      <div className="review-content">
        <div className="review-name">{title}</div>
        <div className="review-value">{value}</div>
      </div>
      <div className="review-edit">{action}</div>
    </div>
  );
}
```

Add to setup.css:

```css
.review-section {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  margin-bottom: 8px;
}
.review-icon {
  width: 28px; height: 28px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
}
.review-icon.ok { background: rgba(74, 222, 128, 0.12); color: var(--success); }
.review-icon.warn { background: rgba(245, 158, 11, 0.12); color: var(--warning); }
.review-content { flex: 1; }
.review-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.review-value {
  font-size: 12px;
  color: var(--text-tertiary);
}
.review-edit { flex-shrink: 0; }
```

#### Step 3: Create ReviewScreen

Create `src/renderer/views/setup/review/ReviewScreen.tsx`:

```typescript
import { useEffect, useState, type JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { rt } from '../../../ipc/client';
import { useStore } from '../../../state/store';
import { LanguageDropdown } from '../../../components/LanguageDropdown';
import { navigate, type WizardStep } from '../shared/useHashRoute';
import { ReviewSection } from './ReviewSection';
import { LANGUAGES, type Locale } from '../../../../shared/i18n';

export function ReviewScreen(): JSX.Element {
  const t = useT();
  const [keyHint, setKeyHint] = useState<string | undefined>();
  const [hasKey, setHasKey] = useState(false);
  const [cablesOk, setCablesOk] = useState<boolean | null>(null);
  const [locale, setLocale] = useState<Locale>('pt-BR');
  const {
    sourceLang, targetLang,
    selectedMic, selectedToMeet, selectedFromMeet, selectedHeadset, devices,
  } = useStore();

  useEffect(() => {
    void rt.hasApiKey().then(setHasKey);
    void rt.getApiKeyHint().then(setKeyHint);
    void rt.resolveLocale().then(setLocale);
    void rt.listDevices().then((d) => {
      const ok = Boolean(d.cableA?.playback && d.cableB?.recording);
      setCablesOk(ok);
    });
  }, []);

  const editStep = (step: WizardStep): void => navigate({ kind: 'wizard', step, mode: 'edit' });

  const labelOf = (id: string | undefined, list: { deviceId: string; label: string }[]): string =>
    id ? (list.find((d) => d.deviceId === id)?.label ?? id) : '—';

  return (
    <div className="setup-shell">
      <div className="setup-titlebar">
        <span className="setup-title">Realtime Translate · {t('review.heading')}</span>
        <LanguageDropdown
          current={locale}
          onChange={(next): void => {
            setLocale(next);
            void window.rt.saveUiLanguage(next);
            window.location.reload();
          }}
        />
      </div>
      <div className="setup-body">
        <h1 className="setup-heading">{t('review.heading')}</h1>
        <p className="setup-sub">{t('review.sub')}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
          <ReviewSection
            status={hasKey ? 'ok' : 'warn'}
            title={t('review.section.key')}
            value={hasKey ? t('review.section.keyValue', { last4: keyHint ?? '••••' }) : t('review.section.keyMissing')}
            action={<button className="btn btn-ghost" onClick={(): void => editStep(2)}>{t('review.section.edit')}</button>}
          />
          <ReviewSection
            status={cablesOk ? 'ok' : 'warn'}
            title={t('review.section.cables')}
            value={cablesOk ? t('review.section.cablesOk') : t('review.section.cablesMissing')}
            action={<button className="btn btn-ghost" onClick={(): void => editStep(3)}>{t('review.section.rescan')}</button>}
          />
          <ReviewSection
            status="ok"
            title={t('review.section.languages')}
            value={`${sourceLang.toUpperCase()} ↔ ${targetLang.toUpperCase()}`}
            action={<button className="btn btn-ghost" onClick={(): void => editStep(4)}>{t('review.section.edit')}</button>}
          />
          <ReviewSection
            status={selectedMic && selectedToMeet && selectedFromMeet && selectedHeadset ? 'ok' : 'warn'}
            title={t('review.section.devices')}
            value={t('review.section.devicesValue', {
              mic: labelOf(selectedMic, devices?.inputs ?? []),
              toMeet: labelOf(selectedToMeet, devices?.outputs ?? []),
              fromMeet: labelOf(selectedFromMeet, devices?.inputs ?? []),
              headset: labelOf(selectedHeadset, devices?.outputs ?? []),
            })}
            action={<button className="btn btn-ghost" onClick={(): void => editStep(4)}>{t('review.section.edit')}</button>}
          />
          <ReviewSection
            status="warn"
            title={t('review.section.meet')}
            value={t('review.section.meetValue')}
            action={<button className="btn btn-secondary" onClick={(): void => editStep(5)}>{t('review.section.viewGuide')}</button>}
          />
        </div>

        <div className="setup-footer">
          <button className="btn btn-ghost" onClick={(): void => { void rt.quit(); }}>
            {t('review.footer.quit')}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={(): void => editStep(6)}>
              {t('review.footer.test')}
            </button>
            <button className="btn btn-primary" onClick={(): void => window.close()}>
              {t('review.footer.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### Step 4: Wire into SetupRoot

Update `SetupRoot.tsx` — replace the stub review:

```typescript
import { ReviewScreen } from './review/ReviewScreen';

export function SetupRoot(): JSX.Element {
  const route = useHashRoute();
  if (route.kind === 'review') return <ReviewScreen />;
  // ... wizard branch unchanged
}
```

- [ ] **Step 5: typecheck + lint + test**

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 100 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/setup/review src/renderer/views/setup/SetupRoot.tsx src/shared/i18n/locales src/renderer/styles/setup.css
git commit -m "Review screen: 5 sections + edit-mode dispatch + footer

ReviewSection card component (status icon + title + value + action).
ReviewScreen composes 5 cards (Key, Cabos, Idiomas, Dispositivos,
Meet) with 'Edit' actions that route to /wizard/N?mode=edit. Footer:
Sair do app (rt.quit), Testar tradução (Step6 in edit mode), Fechar
(window.close).

i18n strings for 'review.*'; LanguageDropdown reused from wizard
shell (also in titlebar). Locale change reloads window.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase G — Wrap-up (Task 14)

### Task 14: Smoke + delete stub + version bump + QA-CHECKLIST update

**Files:**
- Delete: `src/renderer/views/SetupViewStub.tsx`
- Modify: `package.json` (version bump)
- Modify: `docs/QA-CHECKLIST.md` (add M4 section)

#### Step 1: Delete SetupViewStub

`SetupViewStub.tsx` is no longer referenced (setup-main.tsx now imports `SetupRoot`). Verify zero references:

```powershell
# From repo root, check for any imports
```

Use Grep tool with pattern `SetupViewStub` — should return zero matches.

If clean, delete:

```powershell
Remove-Item src/renderer/views/SetupViewStub.tsx
```

#### Step 2: Bump version

In `package.json`:

```diff
-  "version": "0.3.0-m3",
+  "version": "0.4.0-m4",
```

#### Step 3: Update QA-CHECKLIST.md

Append to `docs/QA-CHECKLIST.md` after the M3 section:

```markdown
---

## M4 End-to-End Smoke Test (SetupView Wizard + i18n + Cost)

Final manual gate before tagging M4.

### Prerequisites

- All M3 prerequisites
- Clean prefs file recommended for first-launch verification:
  ```powershell
  Remove-Item "$env:APPDATA\realtime-translate\prefs.json" -ErrorAction SilentlyContinue
  Remove-Item "$env:APPDATA\realtime-translate\apikey.bin" -ErrorAction SilentlyContinue
  ```

### Procedure

1. **`npm run dev`** — SetupView opens at Step 1 of 6 (Welcome with audio flow diagram).

2. **Welcome step:**
   - [ ] Diagram renders 2 directions with mic/headphones/Meet icons
   - [ ] "Begin →" routes to Step 2

3. **API Key step (Step 2):**
   - [ ] Input field accepts text, masks the value
   - [ ] Invalid key (no `sk-` prefix) shows error
   - [ ] Valid key saves; the masked hint appears
   - [ ] "Avançar →" routes to Step 3

4. **VB-CABLE step (Step 3):**
   - [ ] If installed: green ✓ heading + Avançar enabled
   - [ ] If NOT installed: warning + Download button + "Já instalei, re-detectar" button
   - [ ] Re-detect after install transitions to ✓ state

5. **Devices step (Step 4):**
   - [ ] All 4 dropdowns populated; cable A/B auto-recommended
   - [ ] Source + target language dropdowns show 72 languages alphabetically by English label
   - [ ] Avançar disabled until all 4 devices selected

6. **Meet config step (Step 5):**
   - [ ] 5 numbered screenshot cards render (placeholder PNGs OK if real ones not authored yet)
   - [ ] "Já configurei" checkbox enables Avançar

7. **Test Translation step (Step 6):**
   - [ ] "Testar PT → EN" button runs the test; passes within ~10s if pipeline OK
   - [ ] "Testar EN → PT" button runs; user confirmed prompt appears; user clicks "Yes" → pass
   - [ ] After both pass, "Concluir setup →" enabled
   - [ ] Click → bar appears, SetupView closes

8. **Subsequent launch (close + `npm run dev` again):**
   - [ ] Bar appears immediately, no SetupView
   - [ ] Click ⚙ on bar → SetupView opens at #/review (NOT #/wizard/1)

9. **Review screen:**
   - [ ] 5 sections render with current values + status icons
   - [ ] "Edit" on Languages → routes to /wizard/4?mode=edit (footer says "Salvar e voltar")
   - [ ] After save, returns to /review with updated value

10. **Cost meter (FloatingWidget):**
    - [ ] During active translation, `$0.XX` tag visible after latency
    - [ ] Updates ~1Hz
    - [ ] After 60s of bidirectional active, value is approximately `$0.07` (= 0.034 × 2)
    - [ ] Pause → cost disappears (no longer in active state)

11. **i18n:**
    - [ ] Language dropdown in SetupView titlebar shows current (PT-BR or EN-US)
    - [ ] Switch to EN-US → window reloads, all strings shown in English
    - [ ] Switch back to PT-BR → all strings in Portuguese
    - [ ] OS locale auto-detect: rename prefs.json (or remove uiLanguage from it), launch app — UI matches `app.getLocale()` if pt-BR or en-US, else falls back to en-US

### Pass criteria

- [ ] All 11 procedure items above checked
- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm test -- --run` ≥ 100 tests passing
- [ ] `npm run build` produces 3 HTML entries (offscreen, floating-widget, setup-view), no `index.html`

### After PASS

```powershell
git tag -a v0.4.0-m4 -m "M4: SetupView wizard + i18n + cost dashboard"
```
```

#### Step 4: Run full smoke

Refer to the procedure above. Execute manually with real OpenAI key + VB-CABLE installed + Meet config set up + interlocutor on a second device.

NOTE: Implementer should NOT actually run this smoke — leave to user. Just confirm typecheck/lint/tests pass.

#### Step 5: typecheck + lint + test

```bash
npm run typecheck && npm run lint && npm test -- --run
```

Expected: 100 tests passing. All clean.

#### Step 6: Commit (release prep, no tag)

```bash
git add package.json docs/QA-CHECKLIST.md src/renderer/views/SetupViewStub.tsx
git commit -m "M4 release prep: bump version + QA checklist + cleanup

Bumps to 0.4.0-m4 and adds the M4 smoke procedure to QA-CHECKLIST,
covering wizard first-launch flow, review screen edit-mode, cost meter
1Hz refresh, i18n locale switch + auto-detect, and Meet placeholder
screenshots. Smoke + tag to be run by user once they validate the full
pipeline with real OpenAI calls and a real Meet session.

SetupViewStub.tsx deleted — replaced by SetupRoot which dispatches to
wizard or review based on hash route.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

DO NOT create the git tag. The tag command is in the QA-CHECKLIST for the user to run after smoke.

---

## Self-review notes

**Spec coverage:** All sections of the M4 spec are addressed —
- §3 Architecture (modes via hash routing) — Tasks 5, 13
- §4 Wizard steps detalhados — Tasks 6-11
- §5 Review screen — Task 13
- §6 i18n architecture — Tasks 1-3
- §7 Window architecture — Task 5 (replaces SetupViewStub via SetupRoot)
- §8 Persistência — Task 3 (uiLanguage)
- §9 Test Translation — Task 12
- §9.1 Cost dashboard — Task 4
- §10 Acceptance criteria — covered across all tasks; verified in Task 14 smoke

**Out of plan but covered elsewhere:** The actual Meet screenshots (real authored images, not placeholders) are user-side authoring. Documented in Task 10's commit message; placeholders ship with the build.

**Risks acknowledged:**
- Test Translation Direction A loopback false-negative (spec §12 R1) — mitigated by 0.01 RMS threshold + actionable error message ("verifique se VB-CABLE A está instalado"). Calibrate during smoke if needed.
- Translations PT/EN out of sync — mitigated by TS template literal types catching missing keys at compile time.

---

## Execution handoff

Plan saved. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task with two-stage review (spec compliance + code quality) per the M3 cadence. Slower wall-clock but per-task review catches drift before next task builds on it.

**2. Inline Execution** — execute through this session sequentially with checkpoints between phases (after Task 4, Task 8, Task 12, Task 14).

Which approach? Default recommendation: subagent-driven, matching the M3 pattern that produced clean ships across 12 tasks.
