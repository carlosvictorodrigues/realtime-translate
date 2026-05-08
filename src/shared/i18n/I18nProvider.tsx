import { createContext, useContext, useMemo, type JSX, type ReactNode } from 'react';
import { createT, getDictionary, type Locale, type T } from './index';

const I18nContext = createContext<T | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }): JSX.Element {
  // useMemo keeps `t` referentially stable across re-renders that don't change locale.
  // Without this, every parent re-render would create a new `t` and bust React.memo
  // boundaries downstream.
  const t = useMemo(() => createT(getDictionary(locale)), [locale]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT(): T {
  const t = useContext(I18nContext);
  if (!t) throw new Error('useT called outside I18nProvider');
  return t;
}
