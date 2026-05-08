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

  it('rejects empty string', () => {
    expect(() => validateExternalUrl('')).toThrow(/Invalid URL/);
  });

  it('rejects data: URLs', () => {
    expect(() => validateExternalUrl('data:text/html,<script>alert(1)</script>')).toThrow(/Blocked protocol/);
  });

  it('rejects custom protocols (vscode:, etc.)', () => {
    expect(() => validateExternalUrl('vscode://settings')).toThrow(/Blocked protocol/);
  });

  it('trims whitespace before parsing', () => {
    const u = validateExternalUrl('  https://example.com  ');
    expect(u.protocol).toBe('https:');
    expect(u.host).toBe('example.com');
  });

  it('rejects non-string input (defense against raw ipcRenderer.invoke)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateExternalUrl(null as any)).toThrow(/not a string/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateExternalUrl(123 as any)).toThrow(/not a string/);
  });
});
