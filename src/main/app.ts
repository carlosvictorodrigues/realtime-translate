import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { registerIpcHandlers } from './ipc/handlers';
import { type WebSocketLike, type WebSocketFactory } from './translate/openaiSession';
import { type OffscreenController } from './translate/audioPipeline';
import { SessionManager } from './translate/sessionManager';
import { detectVirtualCables, type DeviceInfo } from './audio/deviceDetector';
import { createLogger, LogLevel } from './util/logger';
import { JsonlSink } from './util/jsonlSink';
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

async function createWindows(): Promise<void> {
  offscreenWindow = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/offscreenPreload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await offscreenWindow.loadURL(OFFSCREEN_URL);

  floatingWidget = new BrowserWindow({
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
  floatingWidget.setAlwaysOnTop(true, 'screen-saver');
  await floatingWidget.loadURL(FLOATING_WIDGET_URL);
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

  await createWindows();
  if (!offscreenWindow || !floatingWidget) throw new Error('windows not created');

  const logsDir = join(app.getPath('userData'), 'logs');
  const sessionId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  logSink = new JsonlSink({ logsDir, sessionId });
  const logger = createLogger({ source: 'main', sink: logSink, minLevel: LogLevel.Info });

  const offscreenBridge = new OffscreenBridge(offscreenWindow);

  const emitDirectionalState = (s: DirectionalState): void => {
    if (floatingWidget && !floatingWidget.isDestroyed() && !floatingWidget.webContents.isDestroyed()) {
      floatingWidget.webContents.send(IPC.DirectionalStateChanged, s);
    }
  };
  const emitTranscript = (t: {
    direction: 'A' | 'B';
    kind: 'input' | 'output';
    text: string;
  }): void => {
    if (floatingWidget && !floatingWidget.isDestroyed() && !floatingWidget.webContents.isDestroyed()) {
      floatingWidget.webContents.send(IPC.TranscriptDelta, t);
    }
  };
  const emitLatency = (m: { direction: Direction; averageMs: number; sampleCount: number }): void => {
    if (floatingWidget && !floatingWidget.isDestroyed() && !floatingWidget.webContents.isDestroyed()) {
      floatingWidget.webContents.send(IPC.LatencyMeasured, m);
    }
  };

  // `manager` is reassigned on each Start (after teardown of any prior session).
  // eslint can't see the closure-mutation pattern, so we suppress prefer-const.
  // eslint-disable-next-line prefer-const
  let manager: SessionManager | undefined;

  const { configStore, prefsStore } = registerIpcHandlers({
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
  });
  // prefsStore is referenced in Tasks 10/11; destructure now to expose it.
  void prefsStore;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await logSink?.close();
});
