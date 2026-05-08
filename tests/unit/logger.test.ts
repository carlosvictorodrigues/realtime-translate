import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger, LogLevel, type LogSink } from '@main/util/logger';

class CapturingSink implements LogSink {
  lines: string[] = [];
  write(line: string): void {
    this.lines.push(line);
  }
}

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

  it('redacts top-level sensitive fields', () => {
    const localSink = new CapturingSink();
    const log = createLogger({ source: 'test', sink: localSink });
    log.info('msg', { audio: 'big-base64', other: 'fine' });
    const parsed = JSON.parse(localSink.lines[0]!);
    expect(parsed.data.audio).toBeUndefined();
    expect(parsed.data.other).toBe('fine');
  });

  it('redacts nested sensitive fields recursively', () => {
    const localSink = new CapturingSink();
    const log = createLogger({ source: 'test', sink: localSink });
    log.info('msg', { event: { type: 'delta', audio: 'leak-me' } });
    const parsed = JSON.parse(localSink.lines[0]!);
    expect(parsed.data.event.audio).toBeUndefined();
    expect(parsed.data.event.type).toBe('delta');
  });

  it('redacts sensitive fields inside arrays', () => {
    const localSink = new CapturingSink();
    const log = createLogger({ source: 'test', sink: localSink });
    log.info('msg', { events: [{ audio: 'a' }, { audio: 'b' }] });
    const parsed = JSON.parse(localSink.lines[0]!);
    expect(parsed.data.events[0].audio).toBeUndefined();
    expect(parsed.data.events[1].audio).toBeUndefined();
  });

  it('handles circular references without throwing', () => {
    const localSink = new CapturingSink();
    const log = createLogger({ source: 'test', sink: localSink });
    const obj: Record<string, unknown> = { name: 'cycle' };
    obj.self = obj;
    expect(() => log.info('msg', { obj })).not.toThrow();
    const parsed = JSON.parse(localSink.lines[0]!);
    expect(parsed.data.obj.name).toBe('cycle');
    expect(parsed.data.obj.self).toBe('[circular]');
  });

  it('caps depth at 8 with [max-depth] placeholder', () => {
    const localSink = new CapturingSink();
    const log = createLogger({ source: 'test', sink: localSink });
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let deep: any = { value: 'leaf' };
    for (let i = 0; i < 12; i++) deep = { nested: deep };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    log.info('msg', { deep });
    const parsed = JSON.parse(localSink.lines[0]!);
    const stringified = JSON.stringify(parsed);
    expect(stringified).toContain('[max-depth]');
  });
});
