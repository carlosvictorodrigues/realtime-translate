export interface DeviceInfo {
  kind: 'audioinput' | 'audiooutput';
  label: string;
  deviceId: string;
}

export interface CablePair {
  playback?: DeviceInfo;
  recording?: DeviceInfo;
}

export interface DetectionResult {
  cableA?: CablePair;
  cableB?: CablePair;
  realDevices: { inputs: DeviceInfo[]; outputs: DeviceInfo[] };
}

const A_PLAYBACK = /CABLE[-\s]?A.*Input|VB-?Audio.*Cable[-\s]?A.*Input/i;
const A_RECORDING = /CABLE[-\s]?A.*Output|VB-?Audio.*Cable[-\s]?A.*Output/i;
const B_PLAYBACK = /CABLE[-\s]?B.*Input|VB-?Audio.*Cable[-\s]?B.*Input/i;
const B_RECORDING = /CABLE[-\s]?B.*Output|VB-?Audio.*Cable[-\s]?B.*Output/i;
// Basic VB-CABLE (single cable, no A/B suffix). Fills cableA slot when A+B not detected.
const PLAIN_PLAYBACK = /^CABLE\s+Input\s*\(VB-?Audio/i;
const PLAIN_RECORDING = /^CABLE\s+Output\s*\(VB-?Audio/i;
const ANY_VIRTUAL = /CABLE[-\s]?[AB]|VB-?Audio.*Cable|^CABLE\s+(Input|Output)/i;

export function detectVirtualCables(devices: DeviceInfo[]): DetectionResult {
  const findOne = (kind: 'audioinput' | 'audiooutput', re: RegExp): DeviceInfo | undefined =>
    devices.find((d) => d.kind === kind && re.test(d.label));

  let cableAPlayback = findOne('audiooutput', A_PLAYBACK);
  let cableARecording = findOne('audioinput', A_RECORDING);
  const cableBPlayback = findOne('audiooutput', B_PLAYBACK);
  const cableBRecording = findOne('audioinput', B_RECORDING);

  // Fallback: if neither CABLE-A nor CABLE-B variants found, look for the basic
  // single-cable VB-CABLE and use it as cableA. M1 (unidirectional) needs only one cable.
  if (!cableAPlayback && !cableARecording) {
    cableAPlayback = findOne('audiooutput', PLAIN_PLAYBACK);
    cableARecording = findOne('audioinput', PLAIN_RECORDING);
  }

  const buildPair = (
    playback: DeviceInfo | undefined,
    recording: DeviceInfo | undefined,
  ): CablePair | undefined => {
    if (!playback && !recording) return undefined;
    return {
      ...(playback ? { playback } : {}),
      ...(recording ? { recording } : {}),
    };
  };

  const cableA = buildPair(cableAPlayback, cableARecording);
  const cableB = buildPair(cableBPlayback, cableBRecording);

  const inputs = devices.filter((d) => d.kind === 'audioinput' && !ANY_VIRTUAL.test(d.label));
  const outputs = devices.filter((d) => d.kind === 'audiooutput' && !ANY_VIRTUAL.test(d.label));

  const result: DetectionResult = { realDevices: { inputs, outputs } };
  if (cableA) result.cableA = cableA;
  if (cableB) result.cableB = cableB;
  return result;
}
