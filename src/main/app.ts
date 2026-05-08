import { app, BrowserWindow, ipcMain, Menu, safeStorage, screen, session } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { registerIpcHandlers } from './ipc/handlers';
import { type WebSocketLike, type WebSocketFactory } from './translate/openaiSession';
import { type OffscreenController } from './translate/audioPipeline';
import { SessionManager } from './translate/sessionManager';
import { TestSessionRegistry } from './translate/testSession';
import { runLoopback } from './audio/loopbackCapture';
import { detectVirtualCables, type DeviceInfo } from './audio/deviceDetector';
import { createLogger, LogLevel } from './util/logger';
import { JsonlSink } from './util/jsonlSink';
import { ConfigStore } from './config/configStore';
import { UserPrefsStore } from './config/userPrefsStore';
import { readEnvApiKey } from './config/envFallback';
import { resolveLocale } from './i18n/resolveLocale';
import { IPC } from '../shared/events';
import type {
  DeviceInventory,
  DeviceSummary,
  Direction,
  DirectionalState,
} from '../shared/types';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEV_BASE = process.env.ELECTRON_RENDERER_URL;
const FLOATING_WIDGET_URL = DEV_BASE
  ? `${DEV_BASE.replace(/\/$/, '')}/floating-widget.html`
  : `file://${resolve(__dirname, '../renderer/floating-widget.html')}`;
const SETUP_VIEW_URL = DEV_BASE
  ? `${DEV_BASE.replace(/\/$/, '')}/setup-view.html`
  : `file://${resolve(__dirname, '../renderer/setup-view.html')}`;
const OFFSCREEN_URL = DEV_BASE
  ? `${DEV_BASE.replace(/\/$/, '')}/offscreen.html`
  : `file://${resolve(__dirname, '../renderer/offscreen.html')}`;

let floatingWidget: BrowserWindow | null = null;
let setupView: BrowserWindow | null = null;
let offscreenWindow: BrowserWindow | null = null;
let logSink: JsonlSink | undefined;

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
  private pcmCallbacks = new Map<string, (b64: string) => void>();

  constructor(private readonly window: BrowserWindow) {
    ipcMain.on('offscreen:pcm', (_e, payload: { streamId: string; base64: string }) => {
      this.pcmCallbacks.get(payload.streamId)?.(payload.base64);
    });
  }

  private isAlive(): boolean {
    return !this.window.isDestroyed() && !this.window.webContents.isDestroyed();
  }

  async startCapture(
    streamId: string,
    deviceId: string,
    onPcm: (b64: string) => void,
  ): Promise<void> {
    this.pcmCallbacks.set(streamId, onPcm);
    if (!this.isAlive()) return;
    await this.window.webContents.executeJavaScript(
      `window.offscreen.startCapture(${JSON.stringify(streamId)}, ${JSON.stringify(deviceId)})`,
    );
  }
  async startPlayback(streamId: string, deviceId: string): Promise<void> {
    if (!this.isAlive()) return;
    await this.window.webContents.executeJavaScript(
      `window.offscreen.startPlayback(${JSON.stringify(streamId)}, ${JSON.stringify(deviceId)})`,
    );
  }
  pushPlayback(streamId: string, b64: string): void {
    if (!this.isAlive()) return;
    this.window.webContents.send('offscreen:pushPlayback', { streamId, base64: b64 });
  }
  stopStream(streamId: string): void {
    this.pcmCallbacks.delete(streamId);
    if (!this.isAlive()) return;
    this.window.webContents
      .executeJavaScript(`window.offscreen.stopStream(${JSON.stringify(streamId)})`)
      .catch(() => undefined);
  }
  stopAll(): void {
    this.pcmCallbacks.clear();
    if (!this.isAlive()) return;
    this.window.webContents
      .executeJavaScript('window.offscreen.stopAll()')
      .catch(() => undefined);
  }
}

function toDeviceSummary(d: DeviceInfo): DeviceSummary {
  return { deviceId: d.deviceId, label: d.label, kind: d.kind };
}

async function buildDeviceInventory(window: BrowserWindow): Promise<DeviceInventory> {
  const raw: { deviceId: string; label: string; kind: string }[] =
    await window.webContents.executeJavaScript('window.offscreen.listDevices()');
  const typed: DeviceInfo[] = raw.map((d) => ({
    deviceId: d.deviceId,
    label: d.label,
    kind: d.kind as 'audioinput' | 'audiooutput',
  }));
  const detection = detectVirtualCables(typed);
  const inventory: DeviceInventory = {
    inputs: detection.realDevices.inputs.map(toDeviceSummary),
    outputs: detection.realDevices.outputs.map(toDeviceSummary),
  };
  if (detection.cableA) {
    inventory.cableA = {
      ...(detection.cableA.playback ? { playback: toDeviceSummary(detection.cableA.playback) } : {}),
      ...(detection.cableA.recording ? { recording: toDeviceSummary(detection.cableA.recording) } : {}),
    };
  }
  if (detection.cableB) {
    inventory.cableB = {
      ...(detection.cableB.playback ? { playback: toDeviceSummary(detection.cableB.playback) } : {}),
      ...(detection.cableB.recording ? { recording: toDeviceSummary(detection.cableB.recording) } : {}),
    };
  }
  return inventory;
}

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

function isSetupComplete(configStore: ConfigStore, prefsStore: UserPrefsStore): boolean {
  // Setup is complete iff API key is stored AND all 4 devices are remembered.
  const hasKey = configStore.getApiKey() !== undefined;
  if (!hasKey) return false;
  const prefs = prefsStore.load();
  const d = prefs.devices;
  return Boolean(d?.mic && d?.toMeet && d?.fromMeet && d?.headset);
}

async function createFloatingWidget(prefsStore: UserPrefsStore): Promise<BrowserWindow> {
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
    const pos = win.getPosition();
    const x = pos[0];
    const y = pos[1];
    if (x === undefined || y === undefined) return;
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => prefsStore.setWidgetPosition({ x, y }), 300);
  });
  win.on('closed', () => {
    if (moveTimer) clearTimeout(moveTimer);
    floatingWidget = null;
  });

  // Assign before awaiting loadURL so a concurrent call (e.g. double-click on
  // "Concluir setup") sees the in-flight window and short-circuits via the
  // guard above instead of constructing a second BrowserWindow. Mirrors the
  // synchronous-assignment pattern in createSetupView.
  floatingWidget = win;
  await win.loadURL(FLOATING_WIDGET_URL);
  return win;
}

async function createWindows(configStore: ConfigStore, prefsStore: UserPrefsStore): Promise<void> {
  offscreenWindow = new BrowserWindow({
    width: 1, height: 1, show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/offscreenPreload.cjs'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  await offscreenWindow.loadURL(OFFSCREEN_URL);

  if (isSetupComplete(configStore, prefsStore)) {
    await createFloatingWidget(prefsStore);
  } else {
    await createSetupView();
  }
}

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
  setupView.on('closed', () => {
    setupView = null;
  });
  await setupView.loadURL(SETUP_VIEW_URL);
  return setupView;
}

app.whenReady().then(async () => {
  // Auto-grant `media` permission so the offscreen window can call
  // navigator.mediaDevices.getUserMedia and enumerateDevices without a prompt.
  // BYOK desktop app — the user already trusts this binary to access the mic.
  // Other permissions (camera, notifications, etc.) are denied by default.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });

  // Stores must be constructed AFTER app is ready (uses app.getPath).
  // Lifted from handlers.ts so createWindows() can use prefsStore for initial
  // position BEFORE the IPC layer is set up.
  const apiKeyPath = join(app.getPath('userData'), 'apikey.bin');
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
    configPath: apiKeyPath,
    envApiKey: readEnvApiKey(),
  });

  const prefsPath = join(app.getPath('userData'), 'prefs.json');
  const prefsStore = new UserPrefsStore({
    fs: {
      readFile: (p) => (existsSync(p) ? readFileSync(p) : undefined),
      writeFile: (p, d) => writeFileSync(p, d),
      exists: (p) => existsSync(p),
    },
    prefsPath,
  });

  await createWindows(configStore, prefsStore);
  if (!offscreenWindow) throw new Error('offscreen window not created');

  const logsDir = join(app.getPath('userData'), 'logs');
  const sessionId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  logSink = new JsonlSink({ logsDir, sessionId });
  const logger = createLogger({ source: 'main', sink: logSink, minLevel: LogLevel.Info });

  const offscreenBridge = new OffscreenBridge(offscreenWindow);

  // Both the FloatingWidget and SetupView (when open) want session state +
  // latency so their UIs reflect what's happening. The TestRig stub leans on
  // this during first-launch (before the bar exists), and the gear-opened
  // SetupView would otherwise show stale "idle" mid-session. Fan out to all
  // alive UI windows; offscreen never subscribes.
  const broadcast = <T,>(channel: string, payload: T): void => {
    for (const win of [floatingWidget, setupView]) {
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  };
  const emitDirectionalState = (s: DirectionalState): void => {
    broadcast(IPC.DirectionalStateChanged, s);
  };
  const emitTranscript = (t: {
    direction: 'A' | 'B';
    kind: 'input' | 'output';
    text: string;
  }): void => {
    broadcast(IPC.TranscriptDelta, t);
  };
  const emitLatency = (m: { direction: Direction; averageMs: number; sampleCount: number }): void => {
    broadcast(IPC.LatencyMeasured, m);
  };

  // `manager` is reassigned on each Start (after teardown of any prior session).
  // eslint can't see the closure-mutation pattern, so we suppress prefer-const.
  // eslint-disable-next-line prefer-const
  let manager: SessionManager | undefined;

  // Test Translation (M4 Phase E). Each direction is an independent OpenAISession
  // started with its own source/target language pair; translated audio is forwarded
  // to setupView (via dynamic `test:audio:${direction}` channel) so the renderer can
  // route it to the desired playback device. Playback streams are reused across
  // chunks of a single test run and torn down on stop.
  const testSessions = new TestSessionRegistry();
  const testPlaybacks = new Map<string, boolean>();

  const runTestPlayback = async (
    direction: Direction,
    deviceId: string,
    base64: string,
  ): Promise<void> => {
    const streamId = `test-${direction}`;
    if (!testPlaybacks.get(streamId)) {
      await offscreenBridge.startPlayback(streamId, deviceId);
      testPlaybacks.set(streamId, true);
    }
    offscreenBridge.pushPlayback(streamId, base64);
  };

  registerIpcHandlers({
    configStore,
    prefsStore,
    onStart: async (args) => {
      // If a previous session is still running (e.g., user clicked Start twice), tear it
      // down first so we don't leak resources or double-bind IPC channels.
      if (manager) {
        await manager.stop();
        manager = undefined;
      }
      const apiKey = configStore.getApiKey();
      if (!apiKey) {
        const message = 'No API key configured';
        emitDirectionalState({ direction: 'A', state: { kind: 'error', message } });
        emitDirectionalState({ direction: 'B', state: { kind: 'error', message } });
        throw new Error(message);
      }
      manager = new SessionManager({
        apiKey,
        sourceLang: args.sourceLang,
        targetLang: args.targetLang,
        micDeviceId: args.micDeviceId,
        toMeetDeviceId: args.toMeetDeviceId,
        fromMeetDeviceId: args.fromMeetDeviceId,
        headsetDeviceId: args.headsetDeviceId,
        offscreen: offscreenBridge,
        wsFactory,
        onDirectionalState: emitDirectionalState,
        onTranscript: emitTranscript,
        onLatencyMeasured: emitLatency,
        logger,
      });
      try {
        await manager.start();
      } catch (err) {
        // Per SessionManager contract: rejection means surviving direction may still be
        // running. Tear it down before letting the error propagate. Wrap stop() so a
        // secondary failure during cleanup doesn't mask the original start error.
        try {
          await manager.stop();
        } catch (stopErr) {
          logger.error('session_manager_stop_failed', {
            message: stopErr instanceof Error ? stopErr.message : String(stopErr),
          });
        }
        manager = undefined;
        throw err;
      }
    },
    onStop: async () => {
      if (!manager) return;
      await manager.stop();
      manager = undefined;
    },
    listDevices: () => buildDeviceInventory(offscreenWindow!),
    openSetupView: async () => {
      await createSetupView();
    },
    onSetupComplete: async () => {
      await createFloatingWidget(prefsStore);
      if (setupView && !setupView.isDestroyed()) setupView.close();
    },
    showBarMenu: (sender) => {
      const win = BrowserWindow.fromWebContents(sender);
      if (!win) return;
      const menu = Menu.buildFromTemplate([
        { label: 'Configurações', click: () => { void createSetupView(); } },
        { type: 'separator' },
        { label: 'Sair', accelerator: 'Alt+F4', click: () => app.quit() },
      ]);
      menu.popup({ window: win });
    },
    quitApp: () => app.quit(),
    resolveLocale: () => resolveLocale(prefsStore),
    testSessionStart: ({ direction, sourceLang, targetLang }) => {
      const apiKey = configStore.getApiKey();
      if (!apiKey) throw new Error('No API key');
      testSessions.start(direction, sourceLang, targetLang, {
        apiKey,
        wsFactory,
        onAudio: (b64) => {
          if (setupView && !setupView.isDestroyed()) {
            setupView.webContents.send(`test:audio:${direction}`, b64);
          }
        },
      });
    },
    testSessionInject: ({ direction, base64 }) => testSessions.inject(direction, base64),
    testSessionInputDone: ({ direction }) => testSessions.inputDone(direction),
    testSessionStop: ({ direction }) => {
      testSessions.stop(direction);
      const streamId = `test-${direction}`;
      offscreenBridge.stopStream(streamId);
      testPlaybacks.delete(streamId);
    },
    runLoopback: (deviceId, thresholdRms, timeoutMs) =>
      runLoopback(offscreenWindow!, deviceId, thresholdRms, timeoutMs),
    runTestPlayback: (direction, deviceId, base64) =>
      runTestPlayback(direction, deviceId, base64),
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await logSink?.close();
});
