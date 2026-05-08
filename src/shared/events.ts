export const IPC = {
  // Renderer → Main (invoke)
  GetApiKeyStatus: 'config:getApiKeyStatus',
  GetApiKeyHint: 'config:getApiKeyHint',
  SetApiKey: 'config:setApiKey',
  ClearApiKey: 'config:clearApiKey',
  ListDevices: 'audio:listDevices',
  StartTranslation: 'translation:start',
  StopTranslation: 'translation:stop',

  // Prefs (Renderer → Main, invoke)
  PrefsLoad: 'prefs:load',
  PrefsSetWidgetPosition: 'prefs:setWidgetPosition',
  PrefsSetLanguages: 'prefs:setLanguages',
  PrefsSetDevices: 'prefs:setDevices',
  PrefsSetUiLanguage: 'prefs:setUiLanguage',

  // Window management (Renderer → Main, invoke)
  OpenSetupView: 'window:openSetupView',
  SetupComplete: 'setup:complete',
  ShowBarMenu: 'window:showBarMenu',
  AppQuit: 'app:quit',
  OpenExternalUrl: 'app:openExternalUrl',

  // i18n (Renderer → Main, invoke)
  ResolveLocale: 'i18n:resolveLocale',

  // Test Translation wizard step (Renderer → Main, invoke) — M4 Phase E
  TestSessionStart: 'test:session:start',
  TestSessionInject: 'test:session:inject',
  TestSessionInputDone: 'test:session:inputDone',
  TestSessionStop: 'test:session:stop',
  LoopbackStart: 'audio:loopbackStart',
  TestRoutePlayback: 'test:routePlayback',

  // Auto-update (Renderer → Main, invoke)
  ApplyUpdate: 'app:applyUpdate',

  // Main → Renderer (send)
  DirectionalStateChanged: 'session:directionalStateChanged',
  TranscriptDelta: 'transcript:delta',
  LatencyMeasured: 'session:latencyMeasured',
  UpdateAvailable: 'app:updateAvailable',
  UpdateDownloaded: 'app:updateDownloaded',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
