import { describe, it, expect } from 'vitest';
import { validateExternalUrl } from '@main/ipc/openExternalUrl';

describe('validateExternalUrl', () => {
  it('accepts https URLs', () => {
    const u = validateExternalUrl('https://platform.openai.com/api-keys');
    expect(u.protocol).toBe('https:');
    expect(u.host).toBe('platform.openai.com');
  });

  it('accepts http URLs', () => {
    const u = validateExternalUrl('http://example.com');
    expect(u.protocol).toBe('http:');
  });

  it('rejects file: URLs', () => {
    expect(() => validateExternalUrl('file:///C:/Windows/System32/cmd.exe')).toThrow(/Blocked protocol/);
  });

  it('rejects javascript: URLs', () => {
    expect(() => validateExternalUrl('javascript:alert(1)')).toThrow(/Blocked protocol/);
  });

  it('rejects malformed URLs', () => {
    expect(() => validateExternalUrl('not-a-url')).toThrow(/Invalid URL/);
  });
});
