import type { SessionState } from '../../../../shared/types';

/** OpenAI realtime translate billing — USD per session-minute. */
export const RATE_PER_SESSION_MIN = 0.034;

export function computeCost(stateA: SessionState, stateB: SessionState, nowMs: number): number {
  let totalMinutes = 0;
  if (stateA.kind === 'active') {
    const elapsed = (nowMs - stateA.sinceMs) / 60_000;
    if (elapsed > 0) totalMinutes += elapsed;
  }
  if (stateB.kind === 'active') {
    const elapsed = (nowMs - stateB.sinceMs) / 60_000;
    if (elapsed > 0) totalMinutes += elapsed;
  }
  return totalMinutes * RATE_PER_SESSION_MIN;
}
