import { describe, it, expect } from 'vitest';
import { detectVirtualCables, type DeviceInfo } from '@main/audio/deviceDetector';

const dev = (kind: 'audioinput' | 'audiooutput', label: string, deviceId = label): DeviceInfo => ({
  kind,
  label,
  deviceId,
});

describe('detectVirtualCables', () => {
  it('finds VB-CABLE A input/output', () => {
    const devices: DeviceInfo[] = [
      dev('audiooutput', 'CABLE-A Input (VB-Audio Cable A)'),
      dev('audioinput', 'CABLE-A Output (VB-Audio Cable A)'),
      dev('audiooutput', 'Speakers (Realtek)'),
      dev('audioinput', 'Mic (USB)'),
    ];
    const result = detectVirtualCables(devices);
    expect(result.cableA?.playback?.label).toContain('CABLE-A Input');
    expect(result.cableA?.recording?.label).toContain('CABLE-A Output');
  });

  it('finds VB-CABLE B input/output', () => {
    const devices: DeviceInfo[] = [
      dev('audiooutput', 'CABLE-B Input (VB-Audio Cable B)'),
      dev('audioinput', 'CABLE-B Output (VB-Audio Cable B)'),
    ];
    const result = detectVirtualCables(devices);
    expect(result.cableB?.playback?.label).toContain('CABLE-B Input');
    expect(result.cableB?.recording?.label).toContain('CABLE-B Output');
  });

  it('handles alternate label formats', () => {
    const devices: DeviceInfo[] = [
      dev('audiooutput', 'VB-Audio Cable A Input'),
      dev('audioinput', 'VB-Audio Cable A Output'),
    ];
    const result = detectVirtualCables(devices);
    expect(result.cableA?.playback).toBeDefined();
    expect(result.cableA?.recording).toBeDefined();
  });

  it('returns undefined for missing cables', () => {
    const devices: DeviceInfo[] = [
      dev('audioinput', 'Mic'),
      dev('audiooutput', 'Speakers'),
    ];
    const result = detectVirtualCables(devices);
    expect(result.cableA).toBeUndefined();
    expect(result.cableB).toBeUndefined();
  });

  it('listRealDevices excludes virtual cables', () => {
    const devices: DeviceInfo[] = [
      dev('audioinput', 'Mic (USB)'),
      dev('audioinput', 'CABLE-A Output'),
      dev('audiooutput', 'Speakers'),
      dev('audiooutput', 'CABLE-B Input'),
    ];
    const real = detectVirtualCables(devices).realDevices;
    expect(real.inputs.map((d) => d.label)).toEqual(['Mic (USB)']);
    expect(real.outputs.map((d) => d.label)).toEqual(['Speakers']);
  });
});
