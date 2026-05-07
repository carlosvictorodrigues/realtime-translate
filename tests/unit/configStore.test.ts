import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigStore, type SafeStorage, type FileSystem } from '@main/config/configStore';

class FakeSafeStorage implements SafeStorage {
  isEncryptionAvailable() {
    return true;
  }
  encryptString(value: string): Buffer {
    return Buffer.from(`enc:${value}`);
  }
  decryptString(buf: Buffer): string {
    const s = buf.toString('utf8');
    if (!s.startsWith('enc:')) throw new Error('bad ciphertext');
    return s.slice(4);
  }
}

class FakeFs implements FileSystem {
  files = new Map<string, Buffer>();
  readFile(path: string): Buffer | undefined {
    return this.files.get(path);
  }
  writeFile(path: string, data: Buffer): void {
    this.files.set(path, data);
  }
  exists(path: string): boolean {
    return this.files.has(path);
  }
}

describe('ConfigStore', () => {
  let safe: FakeSafeStorage;
  let fs: FakeFs;
  let store: ConfigStore;

  beforeEach(() => {
    safe = new FakeSafeStorage();
    fs = new FakeFs();
    store = new ConfigStore({ safeStorage: safe, fs, configPath: 'C:/test/config.bin', envApiKey: undefined });
  });

  it('returns undefined when no key is stored and env empty', () => {
    expect(store.getApiKey()).toBeUndefined();
  });

  it('saves and retrieves API key encrypted', () => {
    store.setApiKey('sk-proj-abc123');
    expect(store.getApiKey()).toBe('sk-proj-abc123');
    // verify it's actually encrypted on disk
    const raw = fs.readFile('C:/test/config.bin')!;
    expect(raw.toString('utf8').startsWith('enc:')).toBe(true);
  });

  it('persists across instances (reads from disk)', () => {
    store.setApiKey('sk-proj-xyz');
    const store2 = new ConfigStore({ safeStorage: safe, fs, configPath: 'C:/test/config.bin', envApiKey: undefined });
    expect(store2.getApiKey()).toBe('sk-proj-xyz');
  });

  it('falls back to env var when nothing stored', () => {
    const store2 = new ConfigStore({ safeStorage: safe, fs, configPath: 'C:/test/c.bin', envApiKey: 'sk-env-fallback' });
    expect(store2.getApiKey()).toBe('sk-env-fallback');
  });

  it('stored key takes precedence over env var', () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    store.setApiKey('sk-stored');
    expect(store.getApiKey()).toBe('sk-stored');
  });

  it('clearApiKey removes stored key', () => {
    store.setApiKey('sk-stored');
    store.clearApiKey();
    expect(store.getApiKey()).toBeUndefined();
  });
});
