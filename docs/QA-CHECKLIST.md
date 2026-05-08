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
