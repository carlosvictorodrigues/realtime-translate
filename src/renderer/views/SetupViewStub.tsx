import type { JSX } from 'react';

/**
 * Placeholder until the full SetupView spec lands. Reuses BidirectionalTestRig
 * to keep the user productive (set API key, pick devices, smoke test).
 */
import { BidirectionalTestRig } from './BidirectionalTestRig';

export function SetupViewStub(): JSX.Element {
  return <BidirectionalTestRig />;
}
