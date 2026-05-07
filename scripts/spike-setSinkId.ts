// Standalone HTML spike runner — opens an Electron window that lists output
// devices, plays a 1-second 440 Hz tone, and pipes it to a chosen device via setSinkId.
//
// Run via: npm run spike
//
// This script intentionally bootstraps a minimal BrowserWindow without any of the
// app code, to isolate whether setSinkId works in our Electron version.

import { app, BrowserWindow } from 'electron';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 480,
    height: 360,
    title: 'setSinkId spike',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const html = `
    <!doctype html>
    <html><body style="font-family: system-ui; padding: 20px; background: #111; color: #eee;">
      <h2>setSinkId spike</h2>
      <p style="opacity: 0.7;">1. Pick CABLE-A Input below. 2. Click Play. 3. Verify tone is heard via Windows monitoring on CABLE-A Output.</p>
      <select id="dev" style="width: 100%; padding: 8px; margin-bottom: 8px; background: #222; color: #eee; border: 1px solid #444;"></select>
      <button id="play" style="padding: 8px 16px; background: #6e7fc4; color: #fff; border: 0; border-radius: 4px; cursor: pointer;">Play 440 Hz tone (1s)</button>
      <pre id="log" style="margin-top: 16px; padding: 12px; background: #0a0a0a; border: 1px solid #2a2a2a; min-height: 80px;"></pre>
      <script>
        const log = (m) => { document.getElementById('log').textContent += m + '\\n'; };
        async function init() {
          try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (e) {
            log('mic permission failed: ' + e.message + ' (proceeding — outputs should still be listed)');
          }
          const all = await navigator.mediaDevices.enumerateDevices();
          const outs = all.filter(d => d.kind === 'audiooutput');
          const sel = document.getElementById('dev');
          sel.innerHTML = '';
          for (const d of outs) {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || '(' + d.deviceId.slice(0, 16) + ')';
            sel.appendChild(opt);
          }
          log('found ' + outs.length + ' output devices');
          if (outs.some(d => /CABLE.*A.*Input/i.test(d.label))) {
            log('VB-CABLE A detected ✓');
          } else {
            log('VB-CABLE A NOT detected — install from https://vb-audio.com/Cable/ before testing routing');
          }
        }
        async function play() {
          const id = document.getElementById('dev').value;
          if (!id) { log('no device selected'); return; }
          const ctx = new AudioContext();
          if (typeof ctx.setSinkId !== 'function') {
            log('AudioContext.setSinkId NOT supported in this Electron build — SPIKE FAILED');
            return;
          }
          try {
            await ctx.setSinkId(id);
            log('setSinkId OK: routing output to ' + id.slice(0, 16) + '...');
          } catch (e) {
            log('setSinkId failed: ' + e.message + ' — SPIKE FAILED');
            return;
          }
          const osc = ctx.createOscillator();
          osc.frequency.value = 440;
          osc.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 1.0);
          log('tone playing for 1s — listen via Windows monitoring on CABLE-A Output');
        }
        document.getElementById('play').addEventListener('click', play);
        init();
      </script>
    </body></html>
  `;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});

app.on('window-all-closed', () => app.quit());
