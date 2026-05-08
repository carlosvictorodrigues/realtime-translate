import { StrictMode, useEffect, useState, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../shared/i18n/I18nProvider';
import type { Locale } from '../shared/i18n';
import { FloatingWidget } from './views/FloatingWidget';

function Root(): JSX.Element | null {
  const [locale, setLocale] = useState<Locale | null>(null);
  useEffect(() => {
    window.rt
      .resolveLocale()
      .then(setLocale)
      .catch((err: unknown) => {
        // If the IPC fails (main not ready yet, transient exception), don't
        // leave the bar blank forever — fall back to en-US so the widget
        // becomes visible. Translations will be wrong for non-English users
        // but the alternative is no UI at all.
        // eslint-disable-next-line no-console
        console.error('[i18n] resolveLocale failed, falling back to en-US', err);
        setLocale('en-US');
      });
  }, []);
  if (!locale) return null; // ~10ms flash during normal startup; widget appears once locale resolved
  return (
    <I18nProvider locale={locale}>
      <FloatingWidget />
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
