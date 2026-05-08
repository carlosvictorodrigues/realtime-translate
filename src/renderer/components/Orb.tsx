import type { JSX } from 'react';
import type { BarState } from '../state/aggregateState';

export function Orb({ state }: { state: BarState['kind'] }): JSX.Element {
  return <div className={`rt-orb rt-orb--${state}`} />;
}
