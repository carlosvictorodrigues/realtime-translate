import type { JSX, ReactNode } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { SetupTitlebar } from '../shared/SetupTitlebar';

export function WizardShell({
  currentStep,
  totalSteps,
  children,
}: {
  currentStep: number;
  totalSteps: number;
  children: ReactNode;
}): JSX.Element {
  const t = useT();

  return (
    <div className="setup-shell">
      <SetupTitlebar titleSuffix={t('setup.title.suffix')} />
      <div className="setup-body">
        <div className="setup-progress">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`setup-progress__step${i + 1 < currentStep ? ' done' : ''}${i + 1 === currentStep ? ' active' : ''}`}
            />
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
