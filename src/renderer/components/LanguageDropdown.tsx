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
  const cur = LABELS[current] ?? LABELS['en-US']; // defensive: fall back if a stray locale slips into prefs
  return (
    <div className="lang-dropdown">
      <button
        type="button"
        className="lang-dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(): void => setOpen((o) => !o)}
      >
        <span>{cur.flag} {cur.name}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="lang-dropdown__menu" role="listbox">
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc}
              type="button"
              role="option"
              aria-selected={loc === current}
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
