import ptBR from './locales/pt-BR.json';
import enUS from './locales/en-US.json';
import type { Locale, TranslationDict, TranslationKey } from './types';

export type { Locale, TranslationDict, TranslationKey };
export { ptBR, enUS };

export const SUPPORTED_LOCALES: readonly Locale[] = ['pt-BR', 'en-US'];

const DICTIONARIES: Record<Locale, TranslationDict> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};

/** Walk a dot-notation path through the dict; return the key itself on miss
 *  (intentionally — makes missing translations visible in the UI). */
function lookup(dict: TranslationDict, path: string): string {
  const parts = path.split('.');
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return path;
    }
  }
  return typeof cur === 'string' ? cur : path;
}

function substitute(template: string, vars: Record<string, string | number> | undefined): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined ? `{{${key}}}` : String(v);
  });
}

export type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Build a `t()` function bound to a specific dictionary. Used by useT in the renderer. */
export function createT(dict: TranslationDict): T {
  return (key, vars) => substitute(lookup(dict, key as string), vars);
}

/** Pick the first locale in `candidates` that's supported; fall back to en-US. */
export function resolveLocaleFromCandidates(candidates: readonly string[]): Locale {
  for (const c of candidates) {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(c)) return c as Locale;
  }
  return 'en-US';
}

export function getDictionary(locale: Locale): TranslationDict {
  return DICTIONARIES[locale];
}
