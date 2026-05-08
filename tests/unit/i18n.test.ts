import { describe, it, expect } from 'vitest';
import { createT, resolveLocaleFromCandidates, SUPPORTED_LOCALES } from '@shared/i18n';

const fakeStrings = {
  greeting: 'Hello {{name}}',
  nested: {
    welcome: 'Welcome',
    cost: 'Cost: ${{amount}}',
  },
};

describe('i18n', () => {
  it('createT looks up nested keys with dot notation', () => {
    const t = createT(fakeStrings as never);
    expect(t('nested.welcome')).toBe('Welcome');
  });

  it('createT substitutes {{var}} placeholders', () => {
    const t = createT(fakeStrings as never);
    expect(t('greeting', { name: 'Gabriel' })).toBe('Hello Gabriel');
    expect(t('nested.cost', { amount: '0.42' })).toBe('Cost: $0.42');
  });

  it('createT returns the key itself on miss (visible debugging)', () => {
    const t = createT(fakeStrings as never);
    expect(t('does.not.exist' as never)).toBe('does.not.exist');
  });

  it('resolveLocaleFromCandidates picks first supported', () => {
    expect(resolveLocaleFromCandidates(['pt-BR', 'fr-FR'])).toBe('pt-BR');
    expect(resolveLocaleFromCandidates(['fr-FR', 'en-US'])).toBe('en-US');
  });

  it('resolveLocaleFromCandidates falls back to en-US on no match', () => {
    expect(resolveLocaleFromCandidates(['fr-FR', 'es-ES'])).toBe('en-US');
    expect(resolveLocaleFromCandidates([])).toBe('en-US');
  });

  it('SUPPORTED_LOCALES has exactly pt-BR and en-US in MVP', () => {
    expect(SUPPORTED_LOCALES).toEqual(['pt-BR', 'en-US']);
  });
});
