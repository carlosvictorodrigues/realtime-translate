import { describe, it, expect } from 'vitest';
import { parseHashRoute, type HashRoute } from '@renderer/views/setup/shared/useHashRoute';

describe('parseHashRoute', () => {
  it('parses #/wizard/N with valid step', () => {
    expect(parseHashRoute('#/wizard/1')).toEqual<HashRoute>({ kind: 'wizard', step: 1 });
    expect(parseHashRoute('#/wizard/6')).toEqual<HashRoute>({ kind: 'wizard', step: 6 });
  });

  it('parses #/wizard/N?mode=edit', () => {
    expect(parseHashRoute('#/wizard/2?mode=edit')).toEqual<HashRoute>({
      kind: 'wizard',
      step: 2,
      mode: 'edit',
    });
  });

  it('parses #/review', () => {
    expect(parseHashRoute('#/review')).toEqual<HashRoute>({ kind: 'review' });
  });

  it('rejects out-of-range steps', () => {
    expect(parseHashRoute('#/wizard/0')).toEqual<HashRoute>({ kind: 'wizard', step: 1 });
    expect(parseHashRoute('#/wizard/7')).toEqual<HashRoute>({ kind: 'wizard', step: 1 });
    expect(parseHashRoute('#/wizard/abc')).toEqual<HashRoute>({ kind: 'wizard', step: 1 });
  });

  it('falls back to wizard step 1 on empty/unknown hash', () => {
    expect(parseHashRoute('')).toEqual<HashRoute>({ kind: 'wizard', step: 1 });
    expect(parseHashRoute('#/garbage')).toEqual<HashRoute>({ kind: 'wizard', step: 1 });
  });
});
