import { describe, it, expect } from 'vitest';
import { bothCablesPresent } from '@renderer/views/setup/shared/cables';
import type { DeviceInventory } from '@shared/types';

const dummy = { deviceId: 'x', label: 'X', kind: 'audioinput' as const };
const dummyOut = { deviceId: 'y', label: 'Y', kind: 'audiooutput' as const };

const baseInv: DeviceInventory = { inputs: [], outputs: [] };

describe('bothCablesPresent', () => {
  it('returns true when both cables have both sides', () => {
    expect(bothCablesPresent({
      ...baseInv,
      cableA: { playback: dummyOut, recording: dummy },
      cableB: { playback: dummyOut, recording: dummy },
    })).toBe(true);
  });

  it('returns false when only cable A is present', () => {
    expect(bothCablesPresent({
      ...baseInv,
      cableA: { playback: dummyOut, recording: dummy },
    })).toBe(false);
  });

  it('returns false when only cable B is present', () => {
    expect(bothCablesPresent({
      ...baseInv,
      cableB: { playback: dummyOut, recording: dummy },
    })).toBe(false);
  });

  it('returns false when both cables exist but one side is missing', () => {
    expect(bothCablesPresent({
      ...baseInv,
      cableA: { playback: dummyOut },
      cableB: { playback: dummyOut, recording: dummy },
    })).toBe(false);
  });

  it('returns false on empty inventory', () => {
    expect(bothCablesPresent(baseInv)).toBe(false);
  });
});
