import { StrictMode, useEffect, useState, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../shared/i18n/I18nProvider';
import type { Locale } from '../shared/i18n';
import { SetupRoot } from './views/setup/SetupRoot';
import './styles/setup.css';

function Root(): JSX.Element | null {
  const [locale, setLocale] = useState<Locale | null>(null);
  useEffect(() => {
    void window.rt.resolveLocale().then(setLocale);
  }, []);
  if (!locale) return null;
  return (
    <I18nProvider locale={locale}>
      <SetupRoot />
    </I18nProvider>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('root not found');
createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
