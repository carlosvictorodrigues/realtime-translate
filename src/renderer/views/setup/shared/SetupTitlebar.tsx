import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { LanguageDropdown } from '../../../components/LanguageDropdown';
import type { Locale } from '../../../../shared/i18n';

export function SetupTitlebar({ titleSuffix }: { titleSuffix: string }): JSX.Element {
  const [locale, setLocale] = useState<Locale>('pt-BR');

  useEffect(() => {
    window.rt
      .resolveLocale()
      .then(setLocale)
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[i18n] resolveLocale failed, keeping pt-BR default', err);
      });
  }, []);

  return (
    <div className="setup-titlebar">
      <span className="setup-title">Realtime Translate · {titleSuffix}</span>
      <LanguageDropdown
        current={locale}
        onChange={(next): void => {
          // Wait for prefs write before reloading — otherwise reload pre-empts
          // the IPC and resolveLocale() reads the stale value on next mount.
          void window.rt.saveUiLanguage(next).then(() => window.location.reload());
        }}
      />
    </div>
  );
}
