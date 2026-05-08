import type { JSX } from 'react';
import { useHashRoute, type WizardRoute } from './shared/useHashRoute';
import { WizardShell } from './wizard/WizardShell';
import { Step1Welcome } from './wizard/Step1Welcome';
import { Step2ApiKey } from './wizard/Step2ApiKey';
import { Step3Cables } from './wizard/Step3Cables';
import { Step4Devices } from './wizard/Step4Devices';
import { Step5MeetConfig } from './wizard/Step5MeetConfig';
import { Step6TestTranslation } from './wizard/Step6TestTranslation';

// Stub steps — Tasks 8-11 replace with real components.
const StubStep = ({ n }: { n: number }): JSX.Element => (
  <div style={{ padding: 32, color: '#a1a1aa' }}>Step {n} placeholder — implemented in Task {5 + n}</div>
);
const StubReview = (): JSX.Element => (
  <div style={{ padding: 32, color: '#a1a1aa' }}>Review screen placeholder — Task 13</div>
);

function renderStep(route: WizardRoute): JSX.Element {
  switch (route.step) {
    case 1: return <Step1Welcome />;
    case 2: return <Step2ApiKey mode={route.mode} />;
    case 3: return <Step3Cables mode={route.mode} />;
    case 4: return <Step4Devices mode={route.mode} />;
    case 5: return <Step5MeetConfig mode={route.mode} />;
    case 6: return <Step6TestTranslation mode={route.mode} />;
    default: return <StubStep n={route.step} />;
  }
}

export function SetupRoot(): JSX.Element {
  const route = useHashRoute();
  if (route.kind === 'review') return <StubReview />;
  return (
    <WizardShell currentStep={route.step} totalSteps={6}>
      {renderStep(route)}
    </WizardShell>
  );
}
