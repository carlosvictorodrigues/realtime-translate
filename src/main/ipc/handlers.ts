import { ipcMain, safeStorage, app } from 'electron';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { IPC } from '../../shared/events';
import { ConfigStore } from '../config/configStore';
import { readEnvApiKey } from '../config/envFallback';
import type { DeviceInventory, StartTranslationArgs } from '../../shared/types';

interface HandlerDeps {
  onStart: (args: StartTranslationArgs) => Promise<void>;
  onStop: () => Promise<void>;
  listDevices: () => Promise<DeviceInventory>;
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

  ipcMain.handle(IPC.GetApiKey, () => configStore.getApiKey());
  ipcMain.handle(IPC.SetApiKey, (_e, args: { value: string }) => configStore.setApiKey(args.value));
  ipcMain.handle(IPC.ClearApiKey, () => configStore.clearApiKey());
  ipcMain.handle(IPC.ListDevices, () => deps.listDevices());
  ipcMain.handle(IPC.StartTranslation, (_e, args: StartTranslationArgs) => deps.onStart(args));
  ipcMain.handle(IPC.StopTranslation, () => deps.onStop());

  return { configStore };
}
