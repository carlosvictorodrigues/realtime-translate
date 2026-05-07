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

(Fill in after running)

- [ ] PASS - tone audible on CABLE-A Output via Windows monitoring
- [ ] FAIL - describe what happened: (e.g., "setSinkId threw NotFoundError", "tone played to default speakers instead", etc.)

## If FAIL

Pivot to `naudiodon`:
- `npm i naudiodon`
- Implement playback in main process via PortAudio bindings instead of Web Audio
- Update `src/offscreen/webAudioBridge.ts`: remove `setSinkId` path; either delegate playback to main via IPC or load native module via Electron sandbox-friendly path
- Update Tasks 12-14 plan accordingly

## M1 end-to-end smoke (filled later)

(Reserved for Task 16 result.)
