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

  // Main → Renderer (send)
  DirectionalStateChanged: 'session:directionalStateChanged',
  TranscriptDelta: 'transcript:delta',
  LatencyMeasured: 'session:latencyMeasured',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
