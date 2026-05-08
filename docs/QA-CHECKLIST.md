# QA Checklist — Realtime Translate

## M1 End-to-End Smoke Test

This is the final manual gate before tagging an M1 release. Run on a clean Windows machine with **VB-CABLE installed** (basic version is enough for M1; A+B is required for bidirectional in M2).

### Prerequisites

- Windows 10 or 11
- Node.js >= 20
- VB-CABLE installed: https://vb-audio.com/Cable/ (reboot after install)
- An OpenAI API key with access to `gpt-realtime-translate` model
- Working microphone and headphones

### Setup (one-time)

1. **Configure CABLE Output monitoring** (so you can hear what the app sends to the cable):
   - Win+R → `mmsys.cpl` → Recording tab
   - Right-click **CABLE Output** → Properties → Listen tab
   - Check "Listen to this device", choose your real headset, click OK

### Procedure

1. **Build and launch:**
   ```powershell
   npm install
   npm run dev
   ```
   Wait for the Electron window to open.

2. **Save API key:**
   - In the M1 Test Rig window, paste your OpenAI API key in the input
   - Click Save
   - Confirm the input is replaced by a masked display ending in your key's last 4 chars

3. **Pick devices:**
   - Microphone: select your real headset mic
   - Output: select **CABLE Input (VB-Audio Virtual Cable)** — should show `(recommended)` if detected

4. **Start translation:**
   - Click `Start translation (PT → EN)`
   - Status line should change: `idle` → `connecting` → `active`

5. **Speak Portuguese for 5–10 seconds:**
   - Suggested phrase: "Olá, meu nome é Gabriel. Estou testando o aplicativo de tradução em tempo real."

6. **Verify English output:**
   - You should hear English coming back through your headset (via the CABLE Output monitoring you configured)
   - Latency: typically 1–3 seconds between when you finish speaking and when the English starts

7. **Stop:**
   - Click `Stop`
   - Status returns to `idle`

8. **Close the app cleanly** (X button or Alt+F4).

### Pass criteria

- [ ] App launches without crash
- [ ] API key save round-trips (close + reopen → still saved)
- [ ] Devices listed in dropdowns (mic + CABLE Input visible)
- [ ] Status transitions cleanly idle → connecting → active
- [ ] English audio is audible through headset within ~3 seconds of speaking PT
- [ ] Stop returns to idle without crash
- [ ] App closes cleanly

### Common failures

- **Status stays "connecting":** check API key validity, check network, check console output for errors
- **No English audio heard:** verify CABLE Output monitoring is enabled and routing to headset (`mmsys.cpl` → Recording → CABLE Output Properties → Listen)
- **Mic not capturing:** check Windows mic permissions for the app (Settings → Privacy → Microphone)
- **Empty device dropdowns:** the offscreen window may have failed to enumerate. Check console output. Restart the app.

### After PASS

Update `docs/superpowers/spikes/2026-05-07-setsinkid-spike.md`'s "M1 end-to-end smoke" section with date, hardware, and result. Then tag the release:

```powershell
git tag -a v0.1.0-m1 -m "M1: foundation + unidirectional PT->EN through CABLE"
```

### After FAIL

Capture the exact error in console output and surfaces in the UI. Open an issue or share the log so a follow-up can investigate.

---

## M2 End-to-End Smoke Test (Bidirectional)

Final manual gate before tagging M2.

### Prerequisites

- All M1 prerequisites
- **VB-CABLE A+B** installed (separate from basic VB-CABLE): https://vb-audio.com/Cable/ (donationware variant; reboot after install). M1 used the basic cable; M2 needs both A and B for proper isolation.
- A second device (phone, tablet, second laptop) with Google Meet to act as the remote participant
- Both directions of audio routing tested and working

### Setup (one-time, but **DIFFERENT from M1**)

> ⚠️ **DO NOT enable "Listen to this device" on CABLE-A Output or CABLE-B Output for M2.** That M1 debugging affordance creates an acoustic feedback loop in M2: the app plays the EN translation through your headset (via the M1 monitoring), the headset mic picks it up, the app captures it as new "PT speech", queues it for translation, and latency balloons to 30+ seconds. M2's UI plays Direction B's translation directly to your headset via `setSinkId` — no monitoring needed.
>
> If you set up M1 monitoring before, **disable it now**: `mmsys.cpl` → Recording → right-click `CABLE-A Output`/`CABLE-B Output` → Properties → Listen → uncheck "Listen to this device".

1. **Configure Google Meet on your PC:**
   - Open a test meeting (or any meeting where you control both ends)
   - Settings → Audio → **Microphone** = `CABLE-A Output`
   - Settings → Audio → **Speaker** = `CABLE-B Input`

2. **Configure your second device** (the "remote participant"):
   - Join the same Meet call from your phone/tablet/second laptop
   - Use its built-in mic and speaker (not routed through any cable)

### Procedure

1. **Build and launch:**
   ```powershell
   npm run dev
   ```

2. **Save API key** (or confirm `●●●●●●●●xxxx` shows last 4 chars).

3. **Pick devices:**
   - Microphone: your real headset mic
   - To Meet: `CABLE-A Input (VB-Audio Cable A)` — should auto-select with `(recommended)`
   - From Meet: `CABLE-B Output (VB-Audio Cable B)` — should auto-select with `(recommended)`
   - Headset: your real headphones (where Direction B's PT translation plays)

4. **Languages:** PT ↔ EN (default).

5. **Start translation.** Both status lines should show:
   - `A (pt → en): active`
   - `B (en → pt): active`
   Transitions: `idle → connecting → active`. If either stays in `connecting` for >10s, something is wrong.

6. **Test Direction A (you → them):** speak Portuguese into your headset mic. Within ~3 seconds, your second device (the Meet participant) should hear English audio. Sample phrase: _"Olá, tudo bem? Estou testando a tradução em tempo real."_

7. **Test Direction B (them → you):** speak English into your second device's mic (or have someone else do it). Within ~3 seconds, you should hear Portuguese in your PC headset. Sample phrase: _"Hello, can you hear me? This is a translation test."_

8. **Stop translation.** Both directions return to `idle`. Close cleanly.

### Pass criteria

- [ ] App launches without crash
- [ ] Both `cableA.playback` and `cableB.recording` auto-detected as `(recommended)`
- [ ] Both directions show `active` after Start
- [ ] PT→EN audible at the second device (latency ~1-3s)
- [ ] EN→PT audible in your headset (latency ~1-3s)
- [ ] No 30+ second latency (if so, see the warning above about Listen-to-this-device)
- [ ] Stop returns both directions to idle without crash
- [ ] App closes cleanly

### Degraded mode test (optional)

To verify spec §7 "modos degradados":
1. With both directions active, briefly disable Wi-Fi.
2. Both directions should transition to `reconnecting`.
3. Re-enable Wi-Fi. Both should return to `active`.
4. Alternatively, kill one cable (e.g., disable CABLE-B in Sound settings) and verify the other direction continues.

### Common failures

- **30+ second latency:** acoustic feedback loop. Disable "Listen to this device" on CABLE-A Output AND CABLE-B Output (see Setup warning above). Restart the app and retest.
- **Direction B silent:** check that your PC's Meet speaker is set to `CABLE-B Input` (not your real headset). The translation flow needs Meet to play into the cable, not directly to your ears.
- **Direction A silent (second device hears nothing):** check that your PC's Meet mic is set to `CABLE-A Output`. The app sends translated EN to the cable; Meet must read from there.
- **Echo/loop on Direction A:** if your second device's speaker is loud and near your headset mic, the EN it plays gets re-captured. Mute the second device's speaker, or use earbuds/headphones on it.
- **Same as M1 failures** (status stays connecting, mic permission, etc.) apply here too.

### After PASS

Update `docs/superpowers/spikes/2026-05-07-setsinkid-spike.md` with M2 smoke result. Tag the release:

```powershell
git tag -a v0.2.0-m2 -m "M2: bidirectional PT<->EN translation"
```

---

## M3 End-to-End Smoke Test (FloatingWidget UI)

Final manual gate before tagging M3. Exercises the new shipping UI: a transparent always-on-top floating bar that replaces the M2 BidirectionalTestRig, plus the SetupView one-time wizard, prefs persistence, and the reconnecting/error visualizations.

### Prerequisites

- All M2 prerequisites (VB-CABLE A+B, second-device Meet participant, no "Listen to this device" on cable outputs)
- A clean prefs file recommended for first-launch path verification:
  ```powershell
  Remove-Item "$env:APPDATA\realtime-translate\prefs.json" -ErrorAction SilentlyContinue
  Remove-Item "$env:APPDATA\realtime-translate\apikey.bin" -ErrorAction SilentlyContinue
  ```

### First-launch flow

1. **Build and launch:**
   ```powershell
   npm run dev
   ```
   Expected: SetupView window opens. The floating bar is NOT visible because the API key + 4 devices haven't been configured yet.

2. **Save API key in SetupView:** paste your OpenAI key, click Save. Confirm the input is replaced by a masked display ending in your key's last 4 chars.

3. **Pick all 4 devices** (mic, to-Meet = `CABLE-A Input`, from-Meet = `CABLE-B Output`, headset) per the M2 procedure. Confirm `(recommended)` shows for the cable entries.

4. **Click "Concluir setup → abrir barra".** Expected: the floating bar appears (centered above the taskbar, ~480×40, transparent, always-on-top), and the SetupView window closes.

5. **Verify devices/lang persisted:** close the app entirely (Alt+F4 on the bar). Run `npm run dev` again. Expected: bar appears immediately, SetupView is NOT shown — setup is remembered.

### Bar workflow

6. **Initial state** (after subsequent launches): bar shows orb (idle/grey), `PT ↔ EN` lang pair, ▶ play action button, ⚙ gear. Width ~150px.

7. **Click ▶ play.** Bar transitions: orb pulses accent → "Conectando…" status text → orb pulses accent + waveform animates + latency tag appears + ⏸ pause button. Width grows to ~290px.

8. **Test Direction A (you → them):** speak Portuguese for 5–10 seconds into your headset mic. Within ~3 seconds your second device should hear English. The latency tag updates to reflect the t1−t0 moving average.

9. **Test Direction B (them → you):** speak English on your second device. Within ~3 seconds you should hear Portuguese in your headset.

10. **Click ⏸ pause.** Bar returns to idle (orb grey, no waveform, ▶ play restored, lang pair visible). Devices stay selected.

11. **Click ▶ resume.** Reconnects within ~1-2s, no need to reselect devices/languages. Latency tag clears briefly then resumes.

12. **Drag the bar.** Move it to a different screen position. Close the app. Run `npm run dev` again. Expected: bar reappears at the dragged position.

13. **Click ⚙ gear.** Expected: SetupView window opens (with current devices/key already populated). Close it via the window X.

### Reconnecting / error states

14. **Reconnecting smoke (optional, real network):** with translation active, briefly disable Wi-Fi for 3-5 seconds. Expected: bar background tinges yellow, orb turns yellow and pulses fast, lang pair is replaced by `Reconectando · {origin}: tentativa N`, ⏸ pause stays visible. Re-enable Wi-Fi. Bar returns to active.

15. **Error smoke (optional, deliberate):** stop translation. Open SetupView via ⚙, replace the API key with an invalid value, save. Click ▶ on the bar. Expected: bar background tinges red, orb turns red, status shows the truncated error message (28 chars + ellipsis), action button becomes ↻ retry. Click ⚙ to reopen SetupView and restore the valid key.

### Pass criteria

- [ ] First-launch routes to SetupView; bar does not appear pre-setup
- [ ] "Concluir setup" button enabled only when all 4 devices + key are present
- [ ] After Concluir setup, bar appears and SetupView closes
- [ ] Subsequent launches show the bar immediately (no SetupView)
- [ ] Bar shows the correct icon for each state (▶ idle, ⏸ active, ↻ error)
- [ ] Active state shows waveform + latency tag
- [ ] Pause/resume works without device reselection
- [ ] Drag persists across restarts
- [ ] Reconnecting state visually distinct (yellow tint + pulsing orb + status text)
- [ ] Error state visually distinct (red tint + retry button + truncated message)
- [ ] ⚙ opens SetupView; lang pair click also opens it
- [ ] Production build (`npm run build`) emits 3 HTML entries (offscreen, floating-widget, setup-view) and no `index.html`

### Common failures

- **Bar invisible after Concluir setup:** check that prefs.json got written (`$env:APPDATA\realtime-translate\prefs.json`). If empty, the IPC handler probably failed — check console output.
- **Bar appears but click-through is broken:** the floating window has `setIgnoreMouseEvents` toggled per pointer region. If clicks fall through everywhere, the pointer-region forwarding regressed.
- **SetupView opens after every launch:** prefs aren't being read on startup, or the "all 4 devices + key present" gate is too strict. Check `selectIsSetupComplete` and the bootstrap flow.
- **Reconnecting tint never appears:** the bar reads from the bidirectional store; check that `cableA`/`cableB` status events propagate to the floating widget renderer.
- **Same as M1/M2 failures** (status stays connecting, mic permission, etc.) apply here too.

### After PASS

Update `docs/superpowers/spikes/2026-05-07-setsinkid-spike.md` with the M3 smoke result mirroring the M1/M2 entries. Then tag:

```powershell
git tag -a v0.3.0-m3 -m "M3: FloatingWidget UI + prefs persistence + backend follow-ups"
```
