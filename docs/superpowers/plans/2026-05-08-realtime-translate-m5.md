# M5 Implementation Plan: Distribution + UX leftovers + Auto-update

**Spec:** [`../specs/2026-05-08-realtime-translate-m5-distribution.md`](../specs/2026-05-08-realtime-translate-m5-distribution.md)
**Predecessor:** M4 (`v0.4.0-m4`)
**Target:** `v0.5.0-m5`
**Branch:** `main`
**Cadence:** subagent-driven, per-task review (spec compliance + code quality), single commit per task

## Task summary

| # | Phase | Task | New tests |
|---|---|---|---|
| 1 | A | electron-builder install + config | 0 |
| 2 | A | App icon (.ico) | 0 |
| 3 | A | First installer build + manual smoke | 0 |
| 4 | B | shell.openExternal IPC + replace anchor links | 1 |
| 5 | B | ConfirmModal component (replaces window.confirm) | 0 |
| 6 | C | electron-updater install + integrate | 1 |
| 7 | C | Update notification UI on bar | 0 |
| 8 | D | GitHub Actions release workflow | 0 |
| 9 | E | Persist meetConfirmed + extract SetupTitlebar | 0 |
| 10 | E | Extract bothCablesPresent + stale-cable banner | 1 |
| 11 | E | Right-click menu i18n + bar click-through | 0 |
| 12 | F | Smoke + version bump + QA-CHECKLIST | 0 |

Estimated new tests: 3. Final count target: ~103 local.

---

## Phase A — Packaging core (Tasks 1-3)

### Task 1: electron-builder install + config

**Files:**
- Modify: `package.json` (add devDependency, `build` config block, `dist` script)
- Modify: `.gitignore` (add `release/`)
- Create: `build/installer.nsh` (optional NSIS customizations — keep minimal for v0.5.0)

**Steps:**

1. `npm install --save-dev electron-builder@^25` (latest stable)
2. Add `"dist": "electron-vite build && electron-builder"` to scripts
3. Add `build` config to package.json:
   ```json
   "build": {
     "appId": "com.carlosvictorodrigues.realtime-translate",
     "productName": "Realtime Translate",
     "copyright": "Copyright © 2026 Carlos Victor Rodrigues",
     "asar": true,
     "directories": {
       "buildResources": "build",
       "output": "release"
     },
     "files": [
       "out/**/*",
       "package.json"
     ],
     "extraResources": [
       { "from": "assets/setup", "to": "setup" },
       { "from": "assets/test", "to": "test" }
     ],
     "win": {
       "target": [
         { "target": "nsis", "arch": ["x64"] },
         { "target": "portable", "arch": ["x64"] }
       ],
       "icon": "build/icon.ico"
     },
     "nsis": {
       "oneClick": false,
       "perMachine": false,
       "allowToChangeInstallationDirectory": true,
       "createDesktopShortcut": true,
       "createStartMenuShortcut": true,
       "shortcutName": "Realtime Translate"
     },
     "publish": [
       { "provider": "github", "owner": "carlosvictorodrigues", "repo": "realtime-translate" }
     ]
   }
   ```
4. Add `release/` to `.gitignore`
5. Add `out/renderer/setup/*.jpg` and `out/renderer/test/*.wav` paths — verify the renderer's `publicDir: assets` from M4 is producing them. If not, the `extraResources` block above also covers it.
6. Run `npm run typecheck && npm run lint` (config changes shouldn't affect either, but verify)
7. Skip `npm run dist` until Task 2 lands the icon (electron-builder errors without one)
8. Commit

### Task 2: App icon (.ico)

**Files:**
- Create: `build/icon.ico` (multi-resolution: 16, 32, 48, 64, 128, 256)
- Create: `build/icon.png` (256×256, source for the .ico)

**Approach options:**

A. **User provides PNG** — drop a 256×256 (or larger) PNG at `build/icon.png` and a script converts to .ico via `png-to-ico` package.

B. **AI-generated** — use the existing nano banana 2 / Imagen workflow. Suggested prompt:
> "App icon for a real-time voice translation desktop app. A small floating bar shape with a speech bubble suggestion in the foreground. Two-tone color palette: deep navy (#08090a) background, soft accent purple (#6e7fc4) highlight. Minimalist, premium, Linear/Raycast-inspired. Centered subject with padding. Square 1024×1024 transparent background."

**Steps:**

1. Decide: user-provided or AI-generated. If AI, generate via the same flow used for Meet screenshots; user picks the best of N.
2. Convert to .ico:
   ```bash
   npx png-to-ico build/icon.png > build/icon.ico
   ```
   (or use ImageMagick / online tool)
3. Verify the .ico contains all required sizes (16, 32, 48, 64, 128, 256):
   ```powershell
   Get-Item build/icon.ico | Format-List
   ```
4. Reference in `build.win.icon` (already set in Task 1 config).

### Task 3: First installer build + manual smoke

**Steps:**

1. `npm run dist` — should produce:
   - `release/Realtime Translate Setup 0.5.0.exe` (NSIS installer, ~100 MB)
   - `release/Realtime Translate 0.5.0.exe` (portable, ~100 MB)
   - `release/latest.yml` (auto-update metadata)
   - `release/builder-effective-config.yaml` (electron-builder dump for debugging)
2. Inspect the installer in Explorer; verify icon rendered correctly
3. **Manual smoke** (user's job — not the implementer):
   - Run installer on the dev machine (or a fresh Windows VM)
   - Verify install location is `%LOCALAPPDATA%\Programs\Realtime Translate` (per-user, no admin)
   - Verify Start menu + Desktop shortcuts created
   - Launch installed app; wizard should open at Step 1
   - Verify `app.getVersion()` returns `0.5.0` (check window title or DevTools)
   - Run wizard end-to-end with real OpenAI key + VB-CABLE
   - Uninstall via Settings → Apps; verify clean removal
4. Document the smoke in QA-CHECKLIST.md (deferred to Task 12)

**No commit for the manual smoke per se** — Task 1+2 land the build infrastructure; Task 3 is verification with optional config tweaks (e.g., installer artwork, license file path) commit if needed.

---

## Phase B — UX leftovers (Tasks 4-5)

### Task 4: shell.openExternal IPC + replace anchor links

**Files:**
- Modify: `src/shared/events.ts` (add `OpenExternalUrl` channel)
- Modify: `src/main/ipc/channels.ts` (add IpcInvokeMap entry)
- Modify: `src/main/ipc/handlers.ts` (add HandlerDeps field + handle call)
- Modify: `src/main/preload.ts` (add wrapper)
- Modify: `src/main/app.ts` (wire dep + add `setWindowOpenHandler` on setupView)
- Modify: `src/renderer/views/setup/wizard/Step2ApiKey.tsx` (replace `<a target="_blank">` with button → IPC; remove the TODO comment)
- Modify: `src/renderer/views/setup/wizard/Step3Cables.tsx` (same)
- Create: `tests/unit/openExternalUrl.test.ts` (URL allowlist validation — ensure only http/https URLs accepted, block file://, javascript:, etc.)

**Steps:**

1. Add IPC channel + types
2. Implement handler with allowlist:
   ```typescript
   import { shell } from 'electron';
   const ALLOWED_PROTOCOLS = ['http:', 'https:'];

   handle(IPC.OpenExternalUrl, (_e, args) => {
     const url = new URL(args.url); // throws on malformed
     if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
       throw new Error(`Blocked protocol: ${url.protocol}`);
     }
     return shell.openExternal(url.toString());
   });
   ```
3. Add `setupView.webContents.setWindowOpenHandler` to deny `_blank` opens and call the same path
4. Renderer-side: replace `<a href="..." target="_blank">` with `<button onClick={() => rt.openExternalUrl({ url: '...' })}>` in Step2 + Step3
5. Style the button to look like the existing link (text-only, accent color, underline on hover) so the visual UX doesn't change
6. Unit test the URL allowlist (5 cases: http OK, https OK, file: blocked, javascript: blocked, malformed throws)
7. typecheck + lint + test
8. Commit

### Task 5: ConfirmModal component (replaces window.confirm)

**Files:**
- Create: `src/renderer/components/ConfirmModal.tsx`
- Modify: `src/renderer/styles/setup.css` (modal styles: backdrop, dialog, buttons)
- Modify: `src/renderer/views/setup/wizard/Step6TestTranslation.tsx` (replace `window.confirm` with `<ConfirmModal />`)
- Modify: locale JSONs (button labels — reuse `common.yes`, `common.no`)

**Component API:**

```typescript
function ConfirmModal({
  open, message, confirmLabel, cancelLabel, onConfirm, onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element | null;
```

**Behavior:**
- Renders nothing when `open === false`
- Backdrop is dimmed (rgba(0,0,0,0.6)), modal is centered card with the project's design tokens
- Escape key calls `onCancel`
- Click on backdrop calls `onCancel`
- Click on modal body does NOT close (event stop)
- Focus traps to the modal while open (basic implementation: focus the confirm button on mount)

**Step6 integration:**

Replace:
```typescript
const heard = window.confirm(t('setup.test.confirmHeardPt'));
if (heard) setResB({ status: 'passed' });
else setResB({ status: 'failed', reason: t('setup.test.userNoAudio') });
```

With state-driven modal:
```typescript
const [confirmOpen, setConfirmOpen] = useState(false);
// ... after the 5s wait:
setConfirmOpen(true);
// Modal renders below, captures user choice via callbacks
```

Move `testSessionStop` cleanup out of the `try/finally` and into the modal callbacks (the test path now spans an async user interaction).

**Steps:**

1. Create ConfirmModal component
2. Add CSS (rough sketch):
   ```css
   .confirm-modal__backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
   .confirm-modal__dialog { background: var(--surface-elevated); border: 1px solid var(--border-default); border-radius: 12px; padding: 24px; min-width: 320px; max-width: 480px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
   .confirm-modal__message { font-size: 14px; color: var(--text-primary); margin-bottom: 24px; line-height: 1.5; }
   .confirm-modal__actions { display: flex; gap: 8px; justify-content: flex-end; }
   ```
3. Refactor Step6TestTranslation to use the modal — runB now sets state, modal callbacks finalize the session and result
4. Remove the TODO(m5) comment about window.confirm
5. typecheck + lint + test
6. Commit

---

## Phase C — Auto-update (Tasks 6-7)

### Task 6: electron-updater install + integrate

**Files:**
- Modify: `package.json` (add `electron-updater` dependency — note: NOT devDependency; runtime needed)
- Create: `src/main/updater.ts` (wrapper around autoUpdater)
- Modify: `src/main/app.ts` (call updater on app ready, after windows created)
- Modify: `src/shared/events.ts` (add `UpdateAvailable`, `UpdateDownloaded` send channels)
- Modify: `src/main/ipc/channels.ts` (add IpcSendMap entries)
- Modify: `src/main/preload.ts` (add `onUpdateAvailable`, `onUpdateDownloaded` listeners; add `applyUpdate` invoke)
- Create: `tests/unit/updater.test.ts` (mock `autoUpdater`, verify wrapper logic)

**Steps:**

1. `npm install electron-updater@^6`
2. Wrapper module:
   ```typescript
   import { autoUpdater } from 'electron-updater';
   import type { Logger } from 'electron-updater';

   export function setupAutoUpdate(opts: {
     onAvailable: (version: string) => void;
     onDownloaded: (version: string) => void;
     logger?: Logger;
   }): { checkNow: () => Promise<void>; quitAndInstall: () => void } {
     autoUpdater.autoDownload = true;
     autoUpdater.autoInstallOnAppQuit = true;
     if (opts.logger) autoUpdater.logger = opts.logger;
     autoUpdater.on('update-available', (info) => opts.onAvailable(info.version));
     autoUpdater.on('update-downloaded', (info) => opts.onDownloaded(info.version));
     return {
       checkNow: () => autoUpdater.checkForUpdatesAndNotify().then(() => undefined),
       quitAndInstall: () => autoUpdater.quitAndInstall(),
     };
   }
   ```
3. In app.ts, call `setupAutoUpdate(...)` 5 seconds after app ready (don't compete with wizard startup)
4. Wire IPC events to broadcast to renderers
5. Add `applyUpdate` invoke that calls `quitAndInstall`
6. Skip auto-update in dev mode (autoUpdater throws in unsigned dev environments)
7. Unit test the wrapper (mock autoUpdater, verify event hookup + quitAndInstall pass-through)
8. typecheck + lint + test
9. Commit

### Task 7: Update notification UI on bar

**Files:**
- Modify: `src/renderer/views/FloatingWidget.tsx` (subscribe to update events; render badge)
- Modify: `src/renderer/state/store.ts` (add `updateAvailable: { version, ready: boolean } | null` slice)
- Modify: `src/renderer/styles/widget.css` (add `.rt-update-badge` styles)
- Modify: locale JSONs (add `update.available`, `update.ready`, `update.restart` keys)

**UX:**
- When `update-available`: small dim badge with version: `↑ v0.5.1` (no action yet — just a hint that download is in progress)
- When `update-downloaded`: badge becomes clickable: `↑ Restart to update v0.5.1`. Click → calls `rt.applyUpdate()` → app restarts, applies, relaunches.
- Badge sits to the right of the cost meter, before the action button.
- Accent color, dim by default; brighter when downloaded + clickable.

**Steps:**

1. Add zustand slice
2. Subscribe to `rt.onUpdateAvailable` / `rt.onUpdateDownloaded` in FloatingWidget useEffect
3. Render badge conditionally
4. Wire click → `rt.applyUpdate()`
5. Add CSS
6. Add 3 i18n keys per locale
7. typecheck + lint + test
8. Commit

---

## Phase D — Release pipeline (Task 8)

### Task 8: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`
- (Optional) Create: `.github/workflows/ci.yml` for non-tag pushes — defer if time-tight

**release.yml:**

```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test -- --run
      - run: npm run build
      - name: Build distributables and publish
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npm run dist -- --publish always
```

The `--publish always` flag tells electron-builder to upload the artifacts (`.exe`, `latest.yml`, `.blockmap`) to the GitHub Release matching the tag — auto-creates the release if missing.

**Steps:**

1. Add the workflow file
2. Push to main (workflow is dormant until a tag triggers it)
3. Verify in Actions tab that the workflow appears (without a tag, it won't run yet — verification happens at Task 12)
4. Commit

---

## Phase E — M4 cleanup (Tasks 9-11)

### Task 9: Persist meetConfirmed + extract SetupTitlebar

**Files:**
- Modify: `src/renderer/state/store.ts` (add `meetConfirmed: boolean` + setter; persist)
- Modify: `src/main/config/userPrefsStore.ts` (add field)
- Modify: `src/renderer/views/setup/wizard/Step5MeetConfig.tsx` (read/write store instead of local useState; remove TODO comment)
- Create: `src/renderer/views/setup/shared/SetupTitlebar.tsx` (extract from WizardShell + ReviewScreen)
- Modify: `src/renderer/views/setup/wizard/WizardShell.tsx` (use SetupTitlebar)
- Modify: `src/renderer/views/setup/review/ReviewScreen.tsx` (use SetupTitlebar; remove TODO comment)

**SetupTitlebar API:**

```typescript
function SetupTitlebar({ titleSuffix }: { titleSuffix: string }): JSX.Element;
```

Owns the locale state, dropdown render, save-then-reload chain, and the `.catch()` resilience pattern. The two callers pass different title suffixes:

- WizardShell: `t('setup.title.suffix')` → "Setup"
- ReviewScreen: `t('review.heading')` → "Configurações"

Add `setup.title.suffix` key to locales: `"Setup"` (pt-BR + en-US — same word; no translation needed but the key keeps the string out of JSX).

### Task 10: Extract bothCablesPresent + stale-cable banner

**Files:**
- Create: `src/renderer/views/setup/shared/cables.ts` (export `bothCablesPresent`)
- Modify: `src/renderer/views/setup/wizard/Step3Cables.tsx` (import from shared; remove duplicate)
- Modify: `src/renderer/views/setup/review/ReviewScreen.tsx` (import from shared; remove TODO comment + duplicate)
- Modify: `src/renderer/views/setup/wizard/Step4Devices.tsx` (add stale-cable banner logic)
- Create: `tests/unit/cables.test.ts` (4 cases: both present, A only, B only, neither)
- Modify: locale JSONs (add `setup.devices.staleCableWarning` + `setup.devices.useRecommended` keys)

**Stale-cable banner logic in Step4Devices:**

After useEffect fires and `devices` is set, compute:

```typescript
const cableAMismatch = Boolean(
  devices?.cableA?.playback &&
  selectedToMeet &&
  selectedToMeet !== devices.cableA.playback.deviceId
);
const cableBMismatch = Boolean(
  devices?.cableB?.recording &&
  selectedFromMeet &&
  selectedFromMeet !== devices.cableB.recording.deviceId
);
const showStaleCableBanner = cableAMismatch || cableBMismatch;
```

Render a small warning banner above the dropdowns (only when `showStaleCableBanner === true`):

> ⚠ Sua seleção atual para "Saída pro Meet" / "Captura do Meet" não é o cabo recomendado. [Use recommended ↻]

Click the button → call `setSelectedToMeet(devices.cableA.playback.deviceId)` and same for B. Banner disappears.

### Task 11: Right-click menu i18n + bar click-through

**Files:**
- Modify: `src/main/app.ts` (`showBarMenu` handler — use locale to render menu strings)
- Modify: `src/renderer/views/FloatingWidget.tsx` (add pointer-region click-through)
- Modify: `src/renderer/styles/widget.css` (CSS `pointer-events: none` on transparent margins)

**Right-click menu i18n:**

Currently:
```typescript
const menu = Menu.buildFromTemplate([
  { label: 'Configurações', click: () => { void createSetupView('#/review'); } },
  { type: 'separator' },
  { label: 'Sair', accelerator: 'Alt+F4', click: () => app.quit() },
]);
```

The locale is resolved per call:

```typescript
showBarMenu: (sender) => {
  const locale = resolveLocale(prefsStore);
  const dict = getDictionary(locale);
  const t = createT(dict);
  const win = BrowserWindow.fromWebContents(sender);
  if (!win) return;
  const menu = Menu.buildFromTemplate([
    { label: t('menu.settings'), click: () => { void createSetupView('#/review'); } },
    { type: 'separator' },
    { label: t('menu.quit'), accelerator: 'Alt+F4', click: () => app.quit() },
  ]);
  menu.popup({ window: win });
},
```

Keys `menu.settings` and `menu.quit` already exist in locales — no JSON changes needed.

**Bar click-through:**

The FloatingWidget BrowserWindow is a fixed-size 480×40 frameless transparent window. The visible bar inside is `width: auto` (~150-340 px depending on state). The transparent margins around the visible bar still capture clicks even though they're invisible — annoying when the user clicks "through" the bar to focus an underlying app.

Fix using Electron's `setIgnoreMouseEvents(true, { forward: true })` + a renderer-side handler that toggles the value based on which DOM region is under the cursor.

Sketch:
```typescript
// renderer side, in FloatingWidget
useEffect(() => {
  const onMove = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    const isOnBar = target.closest('.rt-bar') !== null;
    void rt.setBarMouseEvents({ ignore: !isOnBar });
  };
  window.addEventListener('mousemove', onMove);
  return () => window.removeEventListener('mousemove', onMove);
}, []);
```

Add IPC `SetBarMouseEvents` for the renderer to ask main to toggle `setIgnoreMouseEvents`. Main calls `floatingWidget?.setIgnoreMouseEvents(args.ignore, { forward: true })`.

**Steps:**

1. Implement i18n menu (~10 lines)
2. Implement click-through IPC + renderer hook
3. Smoke test: open the bar, hover over visible region (clicks captured), hover over transparent margin (clicks pass through to underlying window)
4. Commit

---

## Phase F — Wrap-up (Task 12)

### Task 12: Smoke + version bump + QA-CHECKLIST

**Files:**
- Modify: `package.json` (version: `0.4.0-m4` → `0.5.0-m5`)
- Modify: `docs/QA-CHECKLIST.md` (append M5 smoke procedure)
- Modify: `README.md` (update Status badge, add "Releases" section pointing to GitHub Releases page)

**M5 smoke procedure (full flow):**

1. `npm run dist` succeeds locally
2. Install `release/Realtime Translate Setup 0.5.0.exe` on a clean Windows VM
3. Verify Start menu + Desktop shortcuts; launch app
4. Wizard opens at Step 1; flow through to Step 6 successfully (need real OpenAI key, real Meet, VB-CABLE A+B)
5. Open Settings → Apps & features; verify "Realtime Translate" appears with version 0.5.0
6. Step 2 (API key): click "Não tenho chave" link → opens OpenAI signup in default browser, NOT in app
7. Step 3 (cables): click "Baixar VB-CABLE A+B" → opens vb-audio.com in default browser
8. Step 6 Direction B: clicking "I heard" responds via in-wizard modal (NOT system confirm dialog)
9. After "Concluir setup", bar appears; right-click bar → menu items in locale-correct strings
10. Tag + push: `git tag -a v0.5.0-m5 -m "M5: Distribution + auto-update + UX polish" && git push origin v0.5.0-m5`
11. GitHub Actions workflow runs on `windows-latest`; verify in Actions tab; should complete in 5-10 min
12. GitHub Release auto-created with `.exe` + `latest.yml` attached
13. Synthetic auto-update test: install `0.5.0` somewhere, then publish a synthetic `0.5.1` release with a small change. Wait 5s after launching `0.5.0`; bar should show `↑ v0.5.1` badge. Wait for download (~30s). Click badge to restart. Verify `0.5.1` running.

**QA-CHECKLIST.md M5 append:**

Mirror the M4 section structure — Prerequisites + numbered procedure + Pass criteria + After-PASS instructions.

**Steps:**

1. Bump version
2. Append to QA-CHECKLIST
3. Update README badge ("M4 preview" → "v0.5.0 stable")
4. typecheck + lint + test
5. Commit
6. Final code review on the full M5 range (single subagent dispatch over `v0.4.0-m4..HEAD`)

---

## Self-review notes

**Spec coverage:**
- §3.1 (electron-builder) — Task 1
- §3.2 (auto-update) — Tasks 6+7
- §3.3 (CI/CD) — Task 8
- §3.4 (external links) — Task 4
- §3.5 (custom modal) — Task 5
- §4 (M4 cleanup) — Tasks 9-11
- §5 (acceptance criteria) — verified in Task 12 smoke

**Risks acknowledged:**
- Code signing absent — Windows SmartScreen warning. Documented in README + QA. Acceptable for v0.5.0.
- electron-updater dev-mode error — guarded with `if (!app.isPackaged) return;` in Task 6.
- GitHub Actions Windows runner cost — 5-10 min/build × few releases/month = well under free tier.

**Out of plan but flagged:**
- Code signing certificate decision (M6+)
- macOS / Linux packaging (M6+)
- Telemetry / crash reporting (separate design)

---

## Execution handoff

Same cadence as M4: subagent-driven per-task with two-stage review. Tasks 1-3 are sequentially dependent (config → icon → build); Tasks 4-7 can run mostly independently; Task 8 depends on the build pipeline working; Tasks 9-11 are pure cleanup, can run in any order; Task 12 is wrap-up.

Start with Task 1.
