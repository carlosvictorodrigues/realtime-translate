import { useEffect, useState } from 'react';

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
export type HashRoute =
  | { kind: 'wizard'; step: WizardStep; mode?: 'edit' }
  | { kind: 'review' };

export type WizardRoute = Extract<HashRoute, { kind: 'wizard' }>;

const STEP_VALUES = [1, 2, 3, 4, 5, 6] as const;

export function parseHashRoute(hash: string): HashRoute {
  // Examples: '#/wizard/3', '#/wizard/2?mode=edit', '#/review'
  const m = hash.match(/^#\/(wizard|review)(?:\/(\d+))?(?:\?(.+))?$/);
  if (!m) return { kind: 'wizard', step: 1 };
  const [, kind, stepStr, query] = m;
  if (kind === 'review') return { kind: 'review' };
  const step = Number(stepStr);
  if (!STEP_VALUES.includes(step as WizardStep)) return { kind: 'wizard', step: 1 };
  const params = new URLSearchParams(query ?? '');
  const mode = params.get('mode') === 'edit' ? 'edit' : undefined;
  return mode ? { kind: 'wizard', step: step as WizardStep, mode } : { kind: 'wizard', step: step as WizardStep };
}

export function navigate(route: HashRoute): void {
  let path = '';
  if (route.kind === 'review') path = '#/review';
  else {
    path = `#/wizard/${route.step}`;
    if (route.mode === 'edit') path += '?mode=edit';
  }
  window.location.hash = path;
}

export function useHashRoute(): HashRoute {
  const [route, setRoute] = useState<HashRoute>(() => parseHashRoute(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseHashRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return (): void => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
