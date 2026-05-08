// electron-updater is CommonJS — Node's ESM loader can't statically resolve
// named exports off it, so `import { autoUpdater }` throws "Named export
// 'autoUpdater' not found" at app start. Default-import the module then
// destructure. Type-only import for Logger is erased at runtime so it stays
// a separate `import type` (no CJS interop concerns there).
import electronUpdater from 'electron-updater';
import type { Logger } from 'electron-updater';
import { app } from 'electron';

const { autoUpdater } = electronUpdater;

export interface AutoUpdateHandle {
  /** Trigger a check + auto-download if newer version exists. Errors are logged via the wrapper's logger and never thrown. */
  checkNow: () => Promise<void>;
  /** Quit the app and apply the downloaded update. Caller verifies download is ready first. */
  quitAndInstall: () => void;
}

export interface AutoUpdateOptions {
  onAvailable: (version: string) => void;
  onDownloaded: (version: string) => void;
  logger?: Logger;
}

export function setupAutoUpdate(opts: AutoUpdateOptions): AutoUpdateHandle {
  // Skip in dev mode — autoUpdater requires a packaged app and signed metadata.
  // Without this, the dev console gets ~5 ENOENT errors at startup as it
  // looks for app-update.yml that doesn't exist.
  if (!app.isPackaged) {
    return {
      checkNow: async () => undefined,
      quitAndInstall: () => undefined,
    };
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  if (opts.logger) autoUpdater.logger = opts.logger;

  autoUpdater.on('update-available', (info) => {
    opts.onAvailable(info.version);
  });
  autoUpdater.on('update-downloaded', (info) => {
    opts.onDownloaded(info.version);
  });
  autoUpdater.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[updater] error', err.message);
  });

  return {
    checkNow: async () => {
      try {
        await autoUpdater.checkForUpdates();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[updater] checkForUpdates failed', err);
      }
    },
    quitAndInstall: () => {
      autoUpdater.quitAndInstall();
    },
  };
}
