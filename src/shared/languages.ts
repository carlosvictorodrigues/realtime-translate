export type LanguageCode = 'pt' | 'en' | 'es' | 'fr' | 'de' | 'it' | 'ja' | 'zh';

export interface Language {
  code: LanguageCode;
  label: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'pt', label: 'Português' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
];

export function languageByCode(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

export function isLanguageCode(code: string): code is LanguageCode {
  return LANGUAGES.some((l) => l.code === code);
}
