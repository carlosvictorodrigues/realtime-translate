export const IPC = {
  // Renderer → Main (invoke)
  GetApiKey: 'config:getApiKey',
  SetApiKey: 'config:setApiKey',
  ClearApiKey: 'config:clearApiKey',
  ListDevices: 'audio:listDevices',
  StartTranslation: 'translation:start',
  StopTranslation: 'translation:stop',

  // Main → Renderer (send)
  SessionStateChanged: 'session:stateChanged',
  TranscriptDelta: 'transcript:delta',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
