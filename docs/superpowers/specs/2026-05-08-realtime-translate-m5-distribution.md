# M5 Spec: Distribution + UX leftovers + Auto-update

**Date:** 2026-05-08
**Branch:** `main` (single-developer ship)
**Target version:** `v0.5.0-m5`
**Predecessor:** M4 (`v0.4.0-m4`) — SetupView wizard + i18n + cost dashboard

## §1 Goal

Make the app installable as a `.exe` for non-technical Windows users, add the UX leftovers from M4 (external link routing, custom modal), wire automatic updates, and stand up a CI/CD release pipeline so future versions ship via tag push.

## §2 Non-goals

- **Code signing** — needs paid certificate ($100-400/year). Ship unsigned with documented SmartScreen workaround. Decision deferred to user.
- **macOS / Linux** support — engine already works cross-platform but packaging + audio routing differ; out of M5 scope.
- **Telemetry / crash reporting** — privacy-preserving telemetry is a separate design discussion.
- **Multi-language test harness** for the wizard's Step 6 — sticks with PT/EN sample WAVs.

## §3 Architecture

### §3.1 Packaging — electron-builder

Use [electron-builder](https://www.electron.build/) (industry standard for Electron distribution). Config lives in `package.json` under `build` key (could move to `electron-builder.yml` later if it grows).

Targets:

- **NSIS installer** (`.exe`) — Windows 64-bit, allows install to user dir without admin, configurable shortcuts, uninstaller registered with Windows.
- **Portable** (`.exe`) — single-file, no install, runs from anywhere. Useful for restricted environments.

Build artifacts land in `release/` (gitignored). The installer bundles:

- Renderer + main bundles from `electron-vite build`
- `assets/setup/*.jpg` (Meet config screenshots, ~2.5 MB)
- `assets/test/*.wav` (test translation samples, ~400 KB)
- App icon (multi-resolution `.ico`)
- All node_modules (electron-builder strips dev dependencies automatically)

Estimated installer size: 80-150 MB (Electron runtime is ~80 MB compressed).

### §3.2 Auto-update — electron-updater

Companion library to electron-builder. On app start (after a 5s delay so we don't compete with the wizard mounting):

1. Check GitHub Releases for the latest tag matching `v*`.
2. Compare against current `app.getVersion()`.
3. If newer, download in background.
4. Surface a small notification on the bar: "Update available — restart to apply".
5. Apply on next quit (or user clicks "Restart now").

Updates are served from GitHub Releases by reading a `latest.yml` artifact uploaded alongside the `.exe`. electron-updater handles delta updates via `.blockmap`.

**Without code signing**, Windows SmartScreen will show a warning on first install and possibly on each update. The user has to click "More info → Run anyway". Acceptable trade-off for v0.5.0; revisit when a signing cert lands.

### §3.3 CI/CD — GitHub Actions

`.github/workflows/release.yml`:

- **Trigger:** `push: tags: ['v*']`
- **Runner:** `windows-latest` (only target platform for now)
- **Steps:**
  1. Checkout
  2. Setup Node 20
  3. `npm ci`
  4. `npm run typecheck`
  5. `npm run lint`
  6. `npm test -- --run`
  7. `npm run build` (electron-vite)
  8. `npm run dist` (electron-builder)
  9. Upload `release/*.exe` + `release/latest.yml` to the GitHub Release matching the pushed tag (auto-created by electron-builder's `--publish always` flag against `GH_TOKEN`)

Optional `.github/workflows/ci.yml` for non-tag pushes (typecheck + lint + test only) — fast feedback for daily commits. Out of M5 scope unless trivial.

### §3.4 External link routing

Replace renderer-side `<a target="_blank">` with click handlers that invoke a new IPC `OpenExternalUrl`. Main process handler calls `shell.openExternal(url)` from Electron, which opens the user's default browser.

Also wire `setupView.webContents.setWindowOpenHandler` to deny `_blank` window opens and instead pipe the URL to `shell.openExternal` — defense-in-depth for any links we miss.

Replaces the M4 TODOs in Step2ApiKey (OpenAI signup) and Step3Cables (vb-audio.com download) hand-rolled comments.

### §3.5 Custom ConfirmModal

Replace `window.confirm()` in Step6TestTranslation Direction B with a React component. Modal renders inside the wizard, overlays the body, has Cancel/OK buttons styled with the project design tokens, and closes on Escape or backdrop click.

Reusable for future modal needs (M6 might need confirmation for "Reset all settings", "Delete API key", etc.).

## §4 M4 cleanup (bundled into M5)

Tracked as TODOs in code from M4 reviews:

| TODO | File | Fix |
|---|---|---|
| Persist `meetConfirmed` across nav | Step5MeetConfig.tsx | Add to `useStore`; restore from prefs |
| Extract `<SetupTitlebar />` | WizardShell + ReviewScreen | Shared component owns locale + dropdown |
| Extract `bothCablesPresent` | Step3Cables + ReviewScreen | Move to `views/setup/shared/cables.ts` |
| Banner for stale cable selection | Step4Devices | Detect mismatch, render hint with "Use recommended" CTA |
| Right-click menu i18n | app.ts (showBarMenu) | Use `t('menu.settings')`, `t('menu.quit')` — keys already exist |
| Click-through on bar transparent margins | FloatingWidget | `setIgnoreMouseEvents` per pointer region (M3-deferred) |

## §5 Acceptance criteria

- [ ] `npm run dist` succeeds locally and produces `release/realtime-translate-Setup-0.5.0.exe` (NSIS) + `release/realtime-translate-0.5.0-portable.exe`
- [ ] Installer runs on a clean Windows 11 VM (or fresh user account), creates Start menu shortcut, app launches and opens the wizard
- [ ] Installed app shows correct name + version in Settings → Apps & features
- [ ] App icon renders correctly in: taskbar, Start menu, title bar, installer wizard
- [ ] `setup.welcome.signupLink` and `setup.cables.downloadButton` (Step 2 + 3 external links) open in user's default browser, not in-app
- [ ] Step 6 Direction B uses the in-wizard modal, not `window.confirm`
- [ ] Tag push (e.g., `git push origin v0.5.0-m5`) triggers GitHub Actions build that uploads `.exe` + `latest.yml` to the matching Release
- [ ] App started with v0.5.0 detects v0.5.1 release (synthetic test) and downloads + applies on restart
- [ ] All 6 M4 cleanup items resolved
- [ ] typecheck + lint clean; tests still passing (≥100)
- [ ] M5 section appended to `docs/QA-CHECKLIST.md` with smoke procedure

## §6 Risks

- **NSIS install on Windows ARM/older Win10** — only target x64 modern. Document.
- **electron-updater without signing** — SmartScreen warnings on each update. Document workaround in README + QA checklist.
- **First-run icon caching** — Windows caches taskbar icons aggressively; testers may need to clear `%LOCALAPPDATA%\IconCache.db`. Document.
- **GitHub Actions Windows runner cost** — minutes are billed; full release build is ~5-10 min. Personal projects on free tier get 2000 min/month — fine for now.
- **VB-CABLE drivers can't be bundled** — third-party redistribution license differs; user still installs separately via Step 3. Wizard flow unchanged.

## §7 Out-of-scope items kept on roadmap

- Code signing (M6+)
- Auto-update without GitHub (private update server, S3, etc.)
- macOS .dmg + Linux AppImage
- App-level telemetry (opt-in error reports)
- Differential updates beyond electron-updater's built-in `.blockmap`
- "Update available" badge styled animation / dismissal behavior beyond MVP
