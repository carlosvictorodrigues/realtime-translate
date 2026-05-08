import { describe, it, expect } from 'vitest';
import { computeCost } from '@renderer/views/setup/shared/computeCost';
import type { SessionState } from '@shared/types';

const idle: SessionState = { kind: 'idle' };
const error: SessionState = { kind: 'error', message: '' };
const activeAt = (sinceMs: number): SessionState => ({ kind: 'active', sinceMs });

describe('computeCost', () => {
  it('returns 0 when both directions are idle', () => {
    expect(computeCost(idle, idle, 100_000)).toBe(0);
  });

  it('returns rate * minutes for one active direction', () => {
    // 1 minute elapsed = 0.034
    expect(computeCost(activeAt(0), idle, 60_000)).toBeCloseTo(0.034, 5);
  });

  it('sums both active directions', () => {
    // Both running for 30s each → 1 session-minute total → 0.034
    expect(computeCost(activeAt(30_000), activeAt(30_000), 60_000)).toBeCloseTo(0.034, 5);
  });

  it('ignores non-active states', () => {
    expect(computeCost(error, activeAt(0), 60_000)).toBeCloseTo(0.034, 5);
  });

  it('returns 0 for now < sinceMs (clock skew sanity)', () => {
    expect(computeCost(activeAt(60_000), idle, 0)).toBe(0);
  });
});
