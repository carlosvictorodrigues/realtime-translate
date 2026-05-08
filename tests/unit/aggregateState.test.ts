import { describe, it, expect } from 'vitest';
import { selectAggregateState, type BarState } from '@renderer/state/aggregateState';
import type { SessionState } from '@shared/types';

const idle: SessionState = { kind: 'idle' };
const connecting: SessionState = { kind: 'connecting' };
const active: SessionState = { kind: 'active', sinceMs: 0 };
const reconnecting1: SessionState = { kind: 'reconnecting', attempt: 1 };
const reconnecting2: SessionState = { kind: 'reconnecting', attempt: 2 };
const error: SessionState = { kind: 'error', message: 'bad' };

describe('selectAggregateState', () => {
  it('both idle → idle', () => {
    expect(selectAggregateState(idle, idle)).toEqual<BarState>({ kind: 'idle' });
  });

  it('any error → error (carries message from first error direction)', () => {
    expect(selectAggregateState(error, active)).toEqual<BarState>({
      kind: 'error',
      message: 'bad',
      origin: 'A',
    });
    expect(selectAggregateState(active, error)).toEqual<BarState>({
      kind: 'error',
      message: 'bad',
      origin: 'B',
    });
  });

  it('any reconnecting (without error) → reconnecting (carries attempt + origin of the worst direction)', () => {
    expect(selectAggregateState(reconnecting1, active)).toEqual<BarState>({
      kind: 'reconnecting',
      attempt: 1,
      origin: 'A',
    });
    expect(selectAggregateState(active, reconnecting2)).toEqual<BarState>({
      kind: 'reconnecting',
      attempt: 2,
      origin: 'B',
    });
    // Both reconnecting → pick the one with higher attempt count (worst).
    expect(selectAggregateState(reconnecting1, reconnecting2)).toEqual<BarState>({
      kind: 'reconnecting',
      attempt: 2,
      origin: 'B',
    });
  });

  it('connecting + idle/active → connecting', () => {
    expect(selectAggregateState(connecting, idle)).toEqual<BarState>({ kind: 'connecting' });
    expect(selectAggregateState(active, connecting)).toEqual<BarState>({ kind: 'connecting' });
  });

  it('both active → active', () => {
    expect(selectAggregateState(active, active)).toEqual<BarState>({ kind: 'active' });
  });

  it('idle + active → active (one direction running is enough)', () => {
    expect(selectAggregateState(idle, active)).toEqual<BarState>({ kind: 'active' });
    expect(selectAggregateState(active, idle)).toEqual<BarState>({ kind: 'active' });
  });
});
