import ptBR from './locales/pt-BR.json';

// Recursive template literal type that derives all valid dot-paths from the JSON tree.
// E.g. for {a: {b: 'x'}, c: 'y'}, yields 'a.b' | 'c'.
type Paths<T, P extends string = ''> = {
  [K in keyof T]: T[K] extends string
    ? `${P}${K & string}`
    : Paths<T[K], `${P}${K & string}.`>;
}[keyof T];

export type Locale = 'pt-BR' | 'en-US';
export type TranslationKey = Paths<typeof ptBR>;
export type TranslationDict = typeof ptBR;
