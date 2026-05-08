import { ipcMain, safeStorage, app, type IpcMainInvokeEvent } from 'electron';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { IPC } from '../../shared/events';
import type { IpcInvokeMap } from './channels';
import { ConfigStore } from '../config/configStore';
import { readEnvApiKey } from '../config/envFallback';
import type { BidirectionalArgs, DeviceInventory } from '../../shared/types';

interface HandlerDeps {
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
}

type InvokeHandler<K extends keyof IpcInvokeMap> = (
  e: IpcMainInvokeEvent,
  args: IpcInvokeMap[K]['args'],
) => Promise<IpcInvokeMap[K]['result']> | IpcInvokeMap[K]['result'];

function handle<K extends keyof IpcInvokeMap>(channel: K, handler: InvokeHandler<K>): void {
  // Cast: ipcMain.handle's signature is too loose to express our typed map.
  ipcMain.handle(channel, handler as (e: IpcMainInvokeEvent, ...args: unknown[]) => unknown);
}

export function registerIpcHandlers(deps: HandlerDeps): { configStore: ConfigStore } {
  const configPath = join(app.getPath('userData'), 'apikey.bin');

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
    configPath,
    envApiKey: readEnvApiKey(),
  });

  handle(IPC.GetApiKeyStatus, () => configStore.getApiKey() !== undefined);
  handle(IPC.GetApiKeyHint, () => {
    const key = configStore.getApiKey();
    return key && key.length > 4 ? key.slice(-4) : undefined;
  });
  handle(IPC.SetApiKey, (_e, args) => configStore.setApiKey(args.value));
  handle(IPC.ClearApiKey, () => configStore.clearApiKey());
  handle(IPC.ListDevices, () => deps.listDevices());
  handle(IPC.StartTranslation, (_e, args) => deps.onStart(args));
  handle(IPC.StopTranslation, () => deps.onStop());

  return { configStore };
}
