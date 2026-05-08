import type { JSX } from 'react';
import { useState } from 'react';
import { SUPPORTED_LOCALES, type Locale } from '../../shared/i18n';

const LABELS: Record<Locale, { flag: string; name: string }> = {
  'pt-BR': { flag: '🇧🇷', name: 'Português' },
  'en-US': { flag: '🇺🇸', name: 'English' },
};

export function LanguageDropdown({
  current,
  onChange,
}: {
  current: Locale;
  onChange: (next: Locale) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const cur = LABELS[current];
  return (
    <div className="lang-dropdown" onClick={(): void => setOpen((o) => !o)}>
      <span>{cur.flag} {cur.name}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
      {open && (
        <div className="lang-dropdown__menu" onClick={(e): void => e.stopPropagation()}>
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc}
              className={`lang-dropdown__item${loc === current ? ' active' : ''}`}
              onClick={(): void => {
                onChange(loc);
                setOpen(false);
              }}
            >
              {LABELS[loc].flag} {LABELS[loc].name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
