import { describe, it, expect } from 'vitest';
import { ExponentialBackoff } from '@main/util/retryPolicy';

describe('ExponentialBackoff', () => {
  it('produces sequence with doubling delays', () => {
    const backoff = new ExponentialBackoff({ baseMs: 1000, maxMs: 30000, maxAttempts: 5 });
    const delays: number[] = [];
    while (backoff.hasNext()) {
      delays.push(backoff.next());
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('caps delay at maxMs', () => {
    const backoff = new ExponentialBackoff({ baseMs: 1000, maxMs: 5000, maxAttempts: 10 });
    const delays: number[] = [];
    while (backoff.hasNext()) {
      delays.push(backoff.next());
    }
    expect(delays.every((d) => d <= 5000)).toBe(true);
    expect(delays.filter((d) => d === 5000).length).toBeGreaterThan(0);
  });

  it('reset() restarts from baseMs', () => {
    const backoff = new ExponentialBackoff({ baseMs: 100, maxMs: 1000, maxAttempts: 3 });
    backoff.next();
    backoff.next();
    backoff.reset();
    expect(backoff.next()).toBe(100);
  });

  it('hasNext returns false after maxAttempts', () => {
    const backoff = new ExponentialBackoff({ baseMs: 100, maxMs: 1000, maxAttempts: 2 });
    backoff.next();
    backoff.next();
    expect(backoff.hasNext()).toBe(false);
  });

  it('throws if next() called past maxAttempts', () => {
    const backoff = new ExponentialBackoff({ baseMs: 100, maxMs: 1000, maxAttempts: 1 });
    backoff.next();
    expect(() => backoff.next()).toThrow();
  });
});
