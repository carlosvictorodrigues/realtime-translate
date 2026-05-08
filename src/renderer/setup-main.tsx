import { StrictMode, useEffect, useState, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../shared/i18n/I18nProvider';
import type { Locale } from '../shared/i18n';
import { SetupRoot } from './views/setup/SetupRoot';
import { useStore } from './state/store';
import './styles/setup.css';

function Root(): JSX.Element | null {
  const [locale, setLocale] = useState<Locale | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    window.rt
      .resolveLocale()
      .then(setLocale)
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[i18n] resolveLocale failed, falling back to en-US', err);
        setLocale('en-US');
      });
    // SetupView lives in its own renderer process with a fresh zustand store —
    // hydrate from prefs so ReviewScreen + Step4Devices see saved selections
    // (selectedMic, languages, etc.) instead of empty defaults. ~10ms file read.
    useStore.getState().hydrate().catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[setup] hydrate failed, continuing with empty store', err);
    }).finally(() => setHydrated(true));
  }, []);
  if (!locale || !hydrated) return null;
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
