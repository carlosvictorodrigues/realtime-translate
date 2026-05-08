import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC } from '../../shared/events';
import type { IpcInvokeMap } from './channels';
import { ConfigStore } from '../config/configStore';
import { UserPrefsStore } from '../config/userPrefsStore';
import type { BidirectionalArgs, DeviceInventory, Direction } from '../../shared/types';
import type { Locale } from '../../shared/i18n';
import type { LanguageCode } from '../../shared/languages';

interface HandlerDeps {
  configStore: ConfigStore;
  prefsStore: UserPrefsStore;
  /**
   * Translation start. The implementation in SessionManager (src/main/translate/sessionManager.ts)
   * is responsible for emitting `{ direction, state: { kind: 'error' } }` via the
   * DirectionalStateChanged channel BEFORE rejecting this promise. The IPC layer just rethrows.
   *
   * Per SessionManager contract: if start() rejects, the surviving direction may still be
   * running — caller must invoke onStop() to clean up. The wiring in app.ts handles this.
   */
  onStart: (args: BidirectionalArgs) => Promise<void>;
  onStop: () => Promise<void>;
  listDevices: () => Promise<DeviceInventory>;
  openSetupView: () => Promise<void>;
  onSetupComplete: () => Promise<void>;
  showBarMenu: (sender: Electron.WebContents) => void;
  quitApp: () => void;
  openExternalUrl: (url: string) => Promise<void>;
  resolveLocale: () => Locale;
  // Test Translation (M4 Phase E) — see TestSessionRegistry + loopbackCapture.
  testSessionStart: (args: {
    direction: Direction;
    sourceLang: LanguageCode;
    targetLang: LanguageCode;
  }) => void;
  testSessionInject: (args: { direction: Direction; base64: string }) => void;
  testSessionInputDone: (args: { direction: Direction }) => void;
  testSessionStop: (args: { direction: Direction }) => void;
  runLoopback: (
    deviceId: string,
    thresholdRms: number,
    timeoutMs: number,
  ) => Promise<{ detected: boolean }>;
  runTestPlayback: (direction: Direction, deviceId: string, base64: string) => Promise<void>;
}

type InvokeHandler<K extends keyof IpcInvokeMap> = (
  e: IpcMainInvokeEvent,
  args: IpcInvokeMap[K]['args'],
) => Promise<IpcInvokeMap[K]['result']> | IpcInvokeMap[K]['result'];

function handle<K extends keyof IpcInvokeMap>(channel: K, handler: InvokeHandler<K>): void {
  // Cast: ipcMain.handle's signature is too loose to express our typed map.
  ipcMain.handle(channel, handler as (e: IpcMainInvokeEvent, ...args: unknown[]) => unknown);
}

export function registerIpcHandlers(deps: HandlerDeps): void {
  handle(IPC.PrefsLoad, () => deps.prefsStore.load());
  handle(IPC.PrefsSetWidgetPosition, (_e, pos) => deps.prefsStore.setWidgetPosition(pos));
  handle(IPC.PrefsSetLanguages, (_e, langs) => deps.prefsStore.setLanguages(langs));
  handle(IPC.PrefsSetDevices, (_e, devices) => deps.prefsStore.setDevices(devices));
  handle(IPC.PrefsSetUiLanguage, (_e, locale) => deps.prefsStore.setUiLanguage(locale));

  handle(IPC.GetApiKeyStatus, () => deps.configStore.getApiKey() !== undefined);
  handle(IPC.GetApiKeyHint, () => {
    const key = deps.configStore.getApiKey();
    return key && key.length > 4 ? key.slice(-4) : undefined;
  });
  handle(IPC.SetApiKey, (_e, args) => deps.configStore.setApiKey(args.value));
  handle(IPC.ClearApiKey, () => deps.configStore.clearApiKey());
  handle(IPC.ListDevices, () => deps.listDevices());
  handle(IPC.StartTranslation, (_e, args) => deps.onStart(args));
  handle(IPC.StopTranslation, () => deps.onStop());
  handle(IPC.OpenSetupView, () => deps.openSetupView());
  handle(IPC.SetupComplete, () => deps.onSetupComplete());
  handle(IPC.ShowBarMenu, (e) => deps.showBarMenu(e.sender));
  handle(IPC.AppQuit, () => deps.quitApp());
  handle(IPC.OpenExternalUrl, (_e, args) => deps.openExternalUrl(args.url));
  handle(IPC.ResolveLocale, () => deps.resolveLocale());

  handle(IPC.TestSessionStart, (_e, args) => deps.testSessionStart(args));
  handle(IPC.TestSessionInject, (_e, args) => deps.testSessionInject(args));
  handle(IPC.TestSessionInputDone, (_e, args) => deps.testSessionInputDone(args));
  handle(IPC.TestSessionStop, (_e, args) => deps.testSessionStop(args));
  handle(IPC.LoopbackStart, (_e, args) =>
    deps.runLoopback(args.deviceId, args.thresholdRms, args.timeoutMs),
  );
  handle(IPC.TestRoutePlayback, (_e, args) =>
    deps.runTestPlayback(args.direction, args.deviceId, args.base64),
  );
}
