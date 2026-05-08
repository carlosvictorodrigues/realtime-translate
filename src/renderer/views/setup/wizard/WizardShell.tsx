import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { LanguageDropdown } from '../../../components/LanguageDropdown';
import type { Locale } from '../../../../shared/i18n';

export function WizardShell({
  currentStep,
  totalSteps,
  children,
}: {
  currentStep: number;
  totalSteps: number;
  children: ReactNode;
}): JSX.Element {
  const [locale, setLocale] = useState<Locale>('pt-BR');
  useEffect(() => {
    void window.rt.resolveLocale().then(setLocale);
  }, []);

  return (
    <div className="setup-shell">
      <div className="setup-titlebar">
        <span className="setup-title">Realtime Translate · Setup</span>
        <LanguageDropdown
          current={locale}
          onChange={(next): void => {
            setLocale(next);
            void window.rt.saveUiLanguage(next);
            // Soft reload — re-render whole app under new locale via location reload
            window.location.reload();
          }}
        />
      </div>
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
