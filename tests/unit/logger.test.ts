import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger, LogLevel, type LogSink } from '@main/util/logger';

describe('logger', () => {
  let captured: string[] = [];
  const sink: LogSink = { write: (line) => captured.push(line) };

  beforeEach(() => {
    captured = [];
  });

  it('emits JSONL with required fields', () => {
    const log = createLogger({ source: 'test', sink });
    log.info('something happened', { foo: 'bar' });
    expect(captured).toHaveLength(1);
    const parsed = JSON.parse(captured[0]!);
    expect(parsed.level).toBe('info');
    expect(parsed.source).toBe('test');
    expect(parsed.event).toBe('something happened');
    expect(parsed.data).toEqual({ foo: 'bar' });
    expect(typeof parsed.ts).toBe('number');
  });

  it('respects minimum level', () => {
    const log = createLogger({ source: 'test', sink, minLevel: LogLevel.Warn });
    log.debug('debug msg');
    log.info('info msg');
    log.warn('warn msg');
    log.error('error msg');
    expect(captured).toHaveLength(2);
    expect(JSON.parse(captured[0]!).level).toBe('warn');
    expect(JSON.parse(captured[1]!).level).toBe('error');
  });

  it('does not log audio or transcript fields by default', () => {
    const log = createLogger({ source: 'audio', sink });
    log.info('chunk received', { audio: 'base64data...', size: 4096 });
    const parsed = JSON.parse(captured[0]!);
    expect(parsed.data.audio).toBeUndefined();
    expect(parsed.data.size).toBe(4096);
  });

  it('redacts transcript fields', () => {
    const log = createLogger({ source: 'session', sink });
    log.info('delta', { transcript: 'sensitive content', kind: 'output' });
    const parsed = JSON.parse(captured[0]!);
    expect(parsed.data.transcript).toBeUndefined();
    expect(parsed.data.kind).toBe('output');
  });
});
