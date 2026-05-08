import { writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { LogSink } from './logger';

export interface JsonlSinkConfig {
  /** Directory holding session JSONL files (e.g., %APPDATA%/realtime-translate/logs). */
  logsDir: string;
  /** Session id — file name is `<sessionId>.jsonl`. Stable for app lifetime. */
  sessionId: string;
  /** Files older than this many days are deleted on construction. Default: 7. */
  retentionDays?: number;
}

/**
 * JSONL log sink — appends one JSON object per line to a session file.
 * Synchronous writes (like console.log); flush is a no-op since each
 * write hits disk immediately. close() removes anything older than
 * retentionDays.
 */
export class JsonlSink implements LogSink {
  private readonly filePath: string;
  private closed = false;

  constructor(private readonly cfg: JsonlSinkConfig) {
    if (!existsSync(cfg.logsDir)) mkdirSync(cfg.logsDir, { recursive: true });
    this.filePath = join(cfg.logsDir, `${cfg.sessionId}.jsonl`);
    // Touch the file so first write doesn't race with rotation.
    if (!existsSync(this.filePath)) writeFileSync(this.filePath, '');
    this.rotate(cfg.retentionDays ?? 7);
  }

  write(line: string): void {
    if (this.closed) return;
    appendFileSync(this.filePath, line + '\n');
  }

  async flush(): Promise<void> {
    /* synchronous appends — no buffer */
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  /** Delete files in logsDir older than `days`.
   *  Best-effort across the board — readdirSync itself can throw on Windows
   *  if the dir is briefly locked by AV/OneDrive/indexer. Silently bailing
   *  is preferable to taking down app startup. */
  private rotate(days: number): void {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let names: string[];
    try {
      names = readdirSync(this.cfg.logsDir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      const full = join(this.cfg.logsDir, name);
      if (full === this.filePath) continue; // never delete our active file
      try {
        if (statSync(full).mtimeMs < cutoff) unlinkSync(full);
      } catch {
        // best-effort
      }
    }
  }
}
