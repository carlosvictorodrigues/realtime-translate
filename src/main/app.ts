import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { registerIpcHandlers } from './ipc/handlers';
import {
  OpenAISession,
  type WebSocketLike,
  type WebSocketFactory,
} from './translate/openaiSession';
import { AudioPipeline, type OffscreenController } from './translate/audioPipeline';
import { detectVirtualCables, type DeviceInfo } from './audio/deviceDetector';
import { IPC } from '../shared/events';
import type {
  DeviceInventory,
  DeviceSummary,
  SessionState,
  StartTranslationArgs,
} from '../shared/types';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEV_BASE = process.env.ELECTRON_RENDERER_URL;
const RENDERER_URL = DEV_BASE
  ? `${DEV_BASE.replace(/\/$/, '')}/index.html`
  : `file://${resolve(__dirname, '../renderer/index.html')}`;
const OFFSCREEN_URL = DEV_BASE
  ? `${DEV_BASE.replace(/\/$/, '')}/offscreen.html`
  : `file://${resolve(__dirname, '../renderer/offscreen.html')}`;

let mainWindow: BrowserWindow | null = null;
let offscreenWindow: BrowserWindow | null = null;

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
  private pcmCallback: ((b64: string) => void) | undefined;

  constructor(private readonly window: BrowserWindow) {
    ipcMain.on('offscreen:pcm', (_e, b64: string) => this.pcmCallback?.(b64));
  }

  private isAlive(): boolean {
    return !this.window.isDestroyed() && !this.window.webContents.isDestroyed();
  }

  async startCapture(deviceId: string, onPcm: (b64: string) => void): Promise<void> {
    this.pcmCallback = onPcm;
    if (!this.isAlive()) return;
    await this.window.webContents.executeJavaScript(
      `window.offscreen.startCapture(${JSON.stringify(deviceId)})`,
    );
  }
  async startPlayback(deviceId: string): Promise<void> {
    if (!this.isAlive()) return;
    await this.window.webContents.executeJavaScript(
      `window.offscreen.startPlayback(${JSON.stringify(deviceId)})`,
    );
  }
  pushPlayback(b64: string): void {
    if (!this.isAlive()) return;
    this.window.webContents.send('offscreen:pushPlayback', b64);
  }
  stopAll(): void {
    // Clear callback BEFORE telling offscreen to stop, so any in-flight PCM
    // chunks already past the renderer can't reach a now-stale session.
    this.pcmCallback = undefined;
    if (!this.isAlive()) return;
    this.window.webContents
      .executeJavaScript('window.offscreen.stopAll()')
      .catch(() => undefined);
  }
}

class SessionRunner {
  private session: OpenAISession | undefined;
  private pipeline: AudioPipeline | undefined;

  constructor(
    private readonly getApiKey: () => string | undefined,
    private readonly offscreen: OffscreenController,
    private readonly emitState: (s: SessionState) => void,
    private readonly emitTranscript: (t: { kind: 'input' | 'output'; text: string }) => void,
  ) {}

  async start(args: StartTranslationArgs): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      const message = 'No API key configured';
      this.emitState({ kind: 'error', message });
      throw new Error(message);
    }
    this.session = new OpenAISession({
      apiKey,
      sourceLang: args.sourceLang,
      targetLang: args.targetLang,
      events: {
        onState: (s) => this.emitState(s),
        onAudio: (b64) => this.pipeline?.handleSessionAudio(b64),
        onTranscript: (t) => this.emitTranscript(t),
      },
      wsFactory,
    });
    this.pipeline = new AudioPipeline({
      offscreen: this.offscreen,
      session: this.session,
      micDeviceId: args.micDeviceId,
      outputDeviceId: args.outputDeviceId,
    });
    try {
      await this.pipeline.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitState({ kind: 'error', message });
      this.session = undefined;
      this.pipeline = undefined;
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.pipeline?.stop();
    this.pipeline = undefined;
    this.session = undefined;
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

  mainWindow = new BrowserWindow({
    width: 360,
    height: 520,
    backgroundColor: '#08090a',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await mainWindow.loadURL(RENDERER_URL);
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
  if (!offscreenWindow || !mainWindow) throw new Error('windows not created');

  const offscreenBridge = new OffscreenBridge(offscreenWindow);

  const emitState = (s: SessionState): void => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(IPC.SessionStateChanged, s);
    }
  };
  const emitTranscript = (t: { kind: 'input' | 'output'; text: string }): void => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(IPC.TranscriptDelta, t);
    }
  };

  // Forward declaration: handlers need runner, runner needs configStore. Use a holder pattern.
  // The `let` is intentional — `runner` is reassigned below after `registerIpcHandlers` returns
  // configStore. eslint can't see the closure pattern, so we suppress the warning here.
  // eslint-disable-next-line prefer-const
  let runner: SessionRunner | undefined;

  const { configStore } = registerIpcHandlers({
    onStart: async (args) => {
      if (!runner) throw new Error('runner not initialized');
      await runner.start(args);
    },
    onStop: async () => {
      if (!runner) return;
      await runner.stop();
    },
    listDevices: () => buildDeviceInventory(offscreenWindow!),
  });

  runner = new SessionRunner(
    () => configStore.getApiKey(),
    offscreenBridge,
    emitState,
    emitTranscript,
  );
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
