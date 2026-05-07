export interface SafeStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(buf: Buffer): string;
}

export interface FileSystem {
  readFile(path: string): Buffer | undefined;
  writeFile(path: string, data: Buffer): void;
  exists(path: string): boolean;
}

export interface ConfigStoreDeps {
  safeStorage: SafeStorage;
  fs: FileSystem;
  configPath: string;
  /** Snapshot of OPENAI_API_KEY at app startup; not re-read after construction. */
  envApiKey: string | undefined;
}

export class ConfigStore {
  constructor(private readonly deps: ConfigStoreDeps) {}

  getApiKey(): string | undefined {
    if (this.deps.fs.exists(this.deps.configPath)) {
      const ciphertext = this.deps.fs.readFile(this.deps.configPath);
      if (ciphertext && ciphertext.length > 0 && this.deps.safeStorage.isEncryptionAvailable()) {
        try {
          return this.deps.safeStorage.decryptString(ciphertext);
        } catch {
          /* fall through */
        }
      }
    }
    return this.deps.envApiKey;
  }

  setApiKey(value: string): void {
    if (!this.deps.safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage encryption not available on this platform');
    }
    const ciphertext = this.deps.safeStorage.encryptString(value);
    this.deps.fs.writeFile(this.deps.configPath, ciphertext);
  }

  clearApiKey(): void {
    // Truncate file to zero bytes; DPAPI ciphertext slack is meaningless without user creds.
    this.deps.fs.writeFile(this.deps.configPath, Buffer.alloc(0));
  }
}
