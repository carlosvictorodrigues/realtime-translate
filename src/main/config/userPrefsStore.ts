import type { LanguageCode } from '../../shared/languages';
import type { Locale } from '../../shared/i18n';

export interface FileSystem {
  readFile(path: string): Buffer | undefined;
  writeFile(path: string, data: Buffer): void;
  exists(path: string): boolean;
}

export interface WidgetPosition {
  x: number;
  y: number;
}

export interface DevicePrefs {
  mic?: string;
  toMeet?: string;
  fromMeet?: string;
  headset?: string;
}

export interface Languages {
  source: LanguageCode;
  target: LanguageCode;
}

export interface UserPrefs {
  widgetPosition?: WidgetPosition;
  languages?: Languages;
  devices?: DevicePrefs;
  uiLanguage?: Locale;
  meetConfirmed?: boolean;
}

export interface UserPrefsStoreDeps {
  fs: FileSystem;
  prefsPath: string;
}

export class UserPrefsStore {
  constructor(private readonly deps: UserPrefsStoreDeps) {}

  load(): UserPrefs {
    if (!this.deps.fs.exists(this.deps.prefsPath)) return {};
    const raw = this.deps.fs.readFile(this.deps.prefsPath);
    if (!raw || raw.length === 0) return {};
    try {
      return JSON.parse(raw.toString('utf8')) as UserPrefs;
    } catch {
      // Corrupt prefs — start fresh. UI must remain resilient.
      return {};
    }
  }

  save(prefs: UserPrefs): void {
    const buf = Buffer.from(JSON.stringify(prefs, null, 2), 'utf8');
    this.deps.fs.writeFile(this.deps.prefsPath, buf);
  }

  setWidgetPosition(pos: WidgetPosition): void {
    const prefs = this.load();
    prefs.widgetPosition = pos;
    this.save(prefs);
  }

  setLanguages(langs: Languages): void {
    const prefs = this.load();
    prefs.languages = langs;
    this.save(prefs);
  }

  setDevices(devices: DevicePrefs): void {
    const prefs = this.load();
    prefs.devices = devices;
    this.save(prefs);
  }

  setUiLanguage(locale: Locale): void {
    const prefs = this.load();
    prefs.uiLanguage = locale;
    this.save(prefs);
  }

  setMeetConfirmed(value: boolean): void {
    const prefs = this.load();
    prefs.meetConfirmed = value;
    this.save(prefs);
  }
}
