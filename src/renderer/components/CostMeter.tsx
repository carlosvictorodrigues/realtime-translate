import { useEffect, useState, type JSX } from 'react';
import type { SessionState } from '../../shared/types';
import { computeCost } from '../views/setup/shared/computeCost';

export function CostMeter({ stateA, stateB }: { stateA: SessionState; stateB: SessionState }): JSX.Element | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return (): void => clearInterval(id);
  }, []);
  const isActive = stateA.kind === 'active' || stateB.kind === 'active';
  if (!isActive) return null;
  const cost = computeCost(stateA, stateB, now);
  return <span className="rt-cost">${cost.toFixed(2)}</span>;
}
