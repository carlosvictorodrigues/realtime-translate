export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

const LEVEL_NAME: Record<LogLevel, string> = {
  [LogLevel.Debug]: 'debug',
  [LogLevel.Info]: 'info',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Error]: 'error',
};

export interface LogSink {
  write(line: string): void;
  /** Async flush of any buffered writes. Optional — sinks may write synchronously. */
  flush?(): Promise<void>;
  /** Best-effort teardown; called from app.before-quit. */
  close?(): Promise<void>;
}

export interface LoggerConfig {
  source: string;
  sink: LogSink;
  minLevel?: LogLevel;
}

export interface Logger {
  debug(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
}

const REDACTED_FIELDS = new Set(['audio', 'audio_delta', 'transcript', 'transcript_delta', 'delta']);
const MAX_DEPTH = 8;

function sanitize(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return '[max-depth]';
  if (value === null || typeof value !== 'object') return value;
  // Circular guard.
  if (seen.has(value as object)) return '[circular]';
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_FIELDS.has(k)) continue;
    out[k] = sanitize(v, depth + 1, seen);
  }
  return out;
}

function sanitizeData(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data) return undefined;
  return sanitize(data, 0, new WeakSet()) as Record<string, unknown>;
}

export function createLogger(config: LoggerConfig): Logger {
  const minLevel = config.minLevel ?? LogLevel.Debug;
  function emit(level: LogLevel, event: string, data?: Record<string, unknown>): void {
    if (level < minLevel) return;
    const payload = {
      ts: Date.now(),
      level: LEVEL_NAME[level],
      source: config.source,
      event,
      data: sanitizeData(data),
    };
    config.sink.write(JSON.stringify(payload));
  }
  return {
    debug: (e, d) => emit(LogLevel.Debug, e, d),
    info: (e, d) => emit(LogLevel.Info, e, d),
    warn: (e, d) => emit(LogLevel.Warn, e, d),
    error: (e, d) => emit(LogLevel.Error, e, d),
  };
}
