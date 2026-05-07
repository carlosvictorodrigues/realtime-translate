# Spike: AudioContext.setSinkId to VB-CABLE A

**Question:** Can an Electron renderer (Web Audio API, Chromium-based) route output to VB-CABLE A virtual playback device using `AudioContext.setSinkId`?

**Why it matters:** Our entire audio output path depends on this working. If it doesn't, we pivot to `naudiodon` (Node-PortAudio bindings) for direct main-process playback.

## Setup

- VB-CABLE A+B installed (https://vb-audio.com/Cable/)
- Electron version: 42.x
- Spike script: `scripts/spike-setSinkId.ts`

## Method

1. From `C:\dev\realtime-translate`, run:
   ```
   npm run spike
   ```
2. App opens with a dropdown listing output devices.
3. Select **CABLE-A Input (VB-Audio Cable A)**.
4. Click "Play 440 Hz tone".
5. To listen for the tone: open Windows Sound settings -> Recording tab -> right-click **CABLE-A Output** -> Properties -> Listen tab -> check "Listen to this device", choose your real headset, click OK. You should hear the tone for 1 second.

## Result

**Run date:** 2026-05-07
**Run by:** Gabriel
**Hardware/OS:** Windows 11, VB-CABLE basic (single cable, not A+B variant)

- [x] **PASS** — tone audible on CABLE Output via Windows monitoring
- [ ] FAIL

### Notes

- Tested with the basic VB-CABLE (single cable named "CABLE Input"/"CABLE Output"), not the A+B variant. The single cable was sufficient to validate that `AudioContext.setSinkId()` accepts a virtual cable's `deviceId` and routes audio through it.
- For full M1 (bidirectional), VB-CABLE A+B will need to be installed (donationware). The spike does not block on that — the Web Audio API behavior is identical for any virtual playback device.

### Issues encountered during spike scaffold (now fixed)

1. **`type: module` in root package.json** caused tsc's CommonJS output (`exports.X = ...`) to fail to load as ESM. **Fix:** wrapper script `scripts/run-spike.cjs` renames the compiled output to `.cjs` so Node forces CommonJS regardless of the parent `package.json`.
2. **`data:` URLs are not a secure context** in Electron, which strips `navigator.mediaDevices` (yielding `undefined`). **Fix:** spike now writes its HTML to a temp file and loads it via `loadFile()` for a proper `file://` origin.
3. **Default `setPermissionRequestHandler`** suppressed media permission. **Fix:** spike installs a handler that auto-grants `media` so device labels are populated without a popup.

## If FAIL

Pivot to `naudiodon`:
- `npm i naudiodon`
- Implement playback in main process via PortAudio bindings instead of Web Audio
- Update `src/offscreen/webAudioBridge.ts`: remove `setSinkId` path; either delegate playback to main via IPC or load native module via Electron sandbox-friendly path
- Update Tasks 12-14 plan accordingly

## M1 end-to-end smoke (filled later)

(Reserved for Task 16 result.)
