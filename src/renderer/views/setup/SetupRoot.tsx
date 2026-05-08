import type { JSX } from 'react';
import { useHashRoute } from './shared/useHashRoute';
import { WizardShell } from './wizard/WizardShell';

// Stub steps — Tasks 6-11 replace with real components.
const StubStep = ({ n }: { n: number }): JSX.Element => (
  <div style={{ padding: 32, color: '#a1a1aa' }}>Step {n} placeholder — implemented in Task {5 + n}</div>
);
const StubReview = (): JSX.Element => (
  <div style={{ padding: 32, color: '#a1a1aa' }}>Review screen placeholder — Task 13</div>
);

export function SetupRoot(): JSX.Element {
  const route = useHashRoute();
  if (route.kind === 'review') return <StubReview />;
  return (
    <WizardShell currentStep={route.step} totalSteps={6}>
      <StubStep n={route.step} />
    </WizardShell>
  );
}
