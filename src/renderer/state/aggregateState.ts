import type { Direction, SessionState } from '../../shared/types';

export type BarState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'active' }
  | { kind: 'reconnecting'; attempt: number; origin: Direction }
  | { kind: 'error'; message: string; origin: Direction };

/** Hierarchy: error > reconnecting > connecting > active > idle.
 *  Mixed states (one active, one connecting) → take the worse one. */
export function selectAggregateState(a: SessionState, b: SessionState): BarState {
  // 1. Error wins.
  if (a.kind === 'error') return { kind: 'error', message: a.message, origin: 'A' };
  if (b.kind === 'error') return { kind: 'error', message: b.message, origin: 'B' };

  // 2. Reconnecting wins next; pick the worse (higher attempt count).
  if (a.kind === 'reconnecting' && b.kind === 'reconnecting') {
    return a.attempt >= b.attempt
      ? { kind: 'reconnecting', attempt: a.attempt, origin: 'A' }
      : { kind: 'reconnecting', attempt: b.attempt, origin: 'B' };
  }
  if (a.kind === 'reconnecting') return { kind: 'reconnecting', attempt: a.attempt, origin: 'A' };
  if (b.kind === 'reconnecting') return { kind: 'reconnecting', attempt: b.attempt, origin: 'B' };

  // 3. Connecting next.
  if (a.kind === 'connecting' || b.kind === 'connecting') return { kind: 'connecting' };

  // 4. Active if either is active.
  if (a.kind === 'active' || b.kind === 'active') return { kind: 'active' };

  // 5. Both idle.
  return { kind: 'idle' };
}
