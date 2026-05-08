import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonlSink } from '@main/util/jsonlSink';

describe('JsonlSink', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rt-jsonl-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes lines as JSONL appended to the session file', () => {
    const sink = new JsonlSink({ logsDir: dir, sessionId: 'sess-1' });
    sink.write('{"a":1}');
    sink.write('{"b":2}');
    const content = readFileSync(join(dir, 'sess-1.jsonl'), 'utf8');
    expect(content).toBe('{"a":1}\n{"b":2}\n');
  });

  it('rotates files older than retentionDays', () => {
    const stale = join(dir, 'old-session.jsonl');
    writeFileSync(stale, '{"old":true}\n');
    // Force mtime to 10 days ago.
    const tenDaysAgo = (Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(stale, tenDaysAgo, tenDaysAgo);

    new JsonlSink({ logsDir: dir, sessionId: 'sess-new', retentionDays: 7 });

    expect(() => statSync(stale)).toThrow(); // deleted
    expect(() => statSync(join(dir, 'sess-new.jsonl'))).not.toThrow(); // current alive
  });

  it('does not rotate the active session file', () => {
    const sink = new JsonlSink({ logsDir: dir, sessionId: 'sess-now', retentionDays: 0 });
    sink.write('{"a":1}');
    expect(() => statSync(join(dir, 'sess-now.jsonl'))).not.toThrow();
  });

  it('write after close is a no-op', async () => {
    const sink = new JsonlSink({ logsDir: dir, sessionId: 's' });
    await sink.close();
    sink.write('{"x":1}');
    const content = readFileSync(join(dir, 's.jsonl'), 'utf8');
    expect(content).toBe('');
  });
});
