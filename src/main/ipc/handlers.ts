import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC } from '../../shared/events';
import type { IpcInvokeMap } from './channels';
import { ConfigStore } from '../config/configStore';
import { UserPrefsStore } from '../config/userPrefsStore';
import type { BidirectionalArgs, DeviceInventory } from '../../shared/types';

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
}
