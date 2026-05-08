import { describe, it, expect, beforeEach } from 'vitest';
import {
  UserPrefsStore,
  type FileSystem,
} from '@main/config/userPrefsStore';

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

describe('UserPrefsStore', () => {
  let fs: FakeFs;
  let store: UserPrefsStore;
  const path = 'C:/test/prefs.json';

  beforeEach(() => {
    fs = new FakeFs();
    store = new UserPrefsStore({ fs, prefsPath: path });
  });

  it('load() returns empty object when file does not exist', () => {
    expect(store.load()).toEqual({});
  });

  it('save and load() round-trips a partial prefs object', () => {
    store.save({ widgetPosition: { x: 100, y: 200 } });
    expect(store.load()).toEqual({ widgetPosition: { x: 100, y: 200 } });
  });

  it('save serializes as pretty JSON (human-readable)', () => {
    store.save({ widgetPosition: { x: 1, y: 2 } });
    const raw = fs.readFile(path)!.toString('utf8');
    expect(raw).toContain('\n'); // multi-line
    expect(raw).toContain('"widgetPosition"');
  });

  it('setWidgetPosition merges into existing prefs without losing other fields', () => {
    store.save({ languages: { source: 'pt', target: 'en' } });
    store.setWidgetPosition({ x: 50, y: 60 });
    expect(store.load()).toEqual({
      languages: { source: 'pt', target: 'en' },
      widgetPosition: { x: 50, y: 60 },
    });
  });

  it('setLanguages and setDevices merge similarly', () => {
    store.setWidgetPosition({ x: 10, y: 20 });
    store.setLanguages({ source: 'pt', target: 'en' });
    store.setDevices({ mic: 'mic-id', toMeet: 'a-id' });
    expect(store.load()).toEqual({
      widgetPosition: { x: 10, y: 20 },
      languages: { source: 'pt', target: 'en' },
      devices: { mic: 'mic-id', toMeet: 'a-id' },
    });
  });

  it('load() returns empty object when file is corrupt JSON (no throw)', () => {
    fs.writeFile(path, Buffer.from('{not valid json', 'utf8'));
    expect(store.load()).toEqual({});
  });

  it('load() returns empty object for empty file', () => {
    fs.writeFile(path, Buffer.alloc(0));
    expect(store.load()).toEqual({});
  });

  it('setUiLanguage persists and merges with other prefs', () => {
    store.setUiLanguage('en-US');
    expect(store.load().uiLanguage).toBe('en-US');

    store.setLanguages({ source: 'pt', target: 'en' });
    expect(store.load()).toEqual({
      uiLanguage: 'en-US',
      languages: { source: 'pt', target: 'en' },
    });

    store.setUiLanguage('pt-BR');
    expect(store.load().uiLanguage).toBe('pt-BR');
  });
});
