import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAISession, type SessionEvents, type WebSocketLike, type WebSocketFactory } from '@main/translate/openaiSession';

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  readyState = 0; // CONNECTING
  sent: string[] = [];
  closed = false;
  onopen?: () => void;
  onclose?: (code: number, reason: string) => void;
  onmessage?: (data: string) => void;
  onerror?: (err: Error) => void;

  constructor(public url: string, public headers: Record<string, string>) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.onclose?.(code ?? 1000, reason ?? '');
  }
  // helpers for tests
  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
  simulateMessage(payload: object) {
    this.onmessage?.(JSON.stringify(payload));
  }
  simulateError(err: Error) {
    this.onerror?.(err);
  }
}

const fakeFactory: WebSocketFactory = (url, headers) => new FakeWebSocket(url, headers);

const fakeLogger = (): { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe('OpenAISession', () => {
  let events: SessionEvents;
  let onState: ReturnType<typeof vi.fn>;
  let onAudio: ReturnType<typeof vi.fn>;
  let onTranscript: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    onState = vi.fn();
    onAudio = vi.fn();
    onTranscript = vi.fn();
    events = { onState, onAudio, onTranscript };
  });

  it('opens connection with correct URL and headers, then sends session.update', async () => {
    const session = new OpenAISession({
      apiKey: 'sk-test',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();

    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe('wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate');
    expect(ws.headers.Authorization).toBe('Bearer sk-test');

    ws.simulateOpen();

    expect(ws.sent).toHaveLength(1);
    const config = JSON.parse(ws.sent[0]!);
    expect(config.type).toBe('session.update');
    expect(config.session.audio.output.language).toBe('en');
    // The /v1/realtime/translations endpoint does NOT accept input_audio_format
    // or output_audio_format — those belong to the conversational /v1/realtime
    // endpoint. Translation format is implicitly PCM16 24kHz mono.
    expect(config.session.input_audio_format).toBeUndefined();
    expect(config.session.output_audio_format).toBeUndefined();
  });

  it('emits state transitions: connecting -> active', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    expect(onState).toHaveBeenCalledWith({ kind: 'connecting' });
    FakeWebSocket.instances[0]!.simulateOpen();
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'active' }));
  });

  it('appendAudio sends input_audio_buffer.append', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.sent = []; // reset

    session.appendAudio('base64audiochunk');
    const msg = JSON.parse(ws.sent[0]!);
    expect(msg.type).toBe('session.input_audio_buffer.append');
    expect(msg.audio).toBe('base64audiochunk');
  });

  it('emits audio delta events', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ type: 'session.output_audio.delta', delta: 'b64chunk' });
    expect(onAudio).toHaveBeenCalledWith('b64chunk');
  });

  it('emits transcript deltas', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ type: 'session.input_transcript.delta', delta: 'olá' });
    ws.simulateMessage({ type: 'session.output_transcript.delta', delta: 'hello' });
    expect(onTranscript).toHaveBeenCalledWith({ kind: 'input', text: 'olá' });
    expect(onTranscript).toHaveBeenCalledWith({ kind: 'output', text: 'hello' });
  });

  it('stop() closes the socket and emits idle state', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    session.stop();
    expect(ws.closed).toBe(true);
    expect(onState).toHaveBeenLastCalledWith({ kind: 'idle' });
  });

  it('appendAudio before open is silently buffered until open', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    session.appendAudio('chunk1');
    session.appendAudio('chunk2');
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.sent).toHaveLength(0);
    ws.simulateOpen();
    // After open: session.update + 2 buffered chunks
    expect(ws.sent).toHaveLength(3);
    expect(JSON.parse(ws.sent[1]!).audio).toBe('chunk1');
    expect(JSON.parse(ws.sent[2]!).audio).toBe('chunk2');
  });

  // ---------- Task 9b: reconnect + cleanup ----------

  it('unexpected close schedules reconnect with delay (emits reconnecting)', () => {
    vi.useFakeTimers();
    try {
      const session = new OpenAISession({
        apiKey: 'sk',
        sourceLang: 'pt',
        targetLang: 'en',
        events,
        wsFactory: fakeFactory,
        backoff: { baseMs: 100, maxMs: 1000, maxAttempts: 5 },
      });
      session.start();
      const ws1 = FakeWebSocket.instances[0]!;
      ws1.simulateOpen();

      // Simulate unexpected close (server side) — readyState->3, onclose fires.
      ws1.close(1006, 'abnormal');

      // Should have emitted 'reconnecting' with attempt 1.
      expect(onState).toHaveBeenCalledWith({ kind: 'reconnecting', attempt: 1 });

      // No new socket yet — still waiting on the timer.
      expect(FakeWebSocket.instances).toHaveLength(1);

      // Advance time past first delay (100ms).
      vi.advanceTimersByTime(100);

      // Reconnect attempted: a new socket exists.
      expect(FakeWebSocket.instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconnect success restores active state and resets backoff', () => {
    vi.useFakeTimers();
    try {
      const session = new OpenAISession({
        apiKey: 'sk',
        sourceLang: 'pt',
        targetLang: 'en',
        events,
        wsFactory: fakeFactory,
        backoff: { baseMs: 100, maxMs: 1000, maxAttempts: 5 },
      });
      session.start();
      const ws1 = FakeWebSocket.instances[0]!;
      ws1.simulateOpen();
      ws1.close(1006, 'abnormal');
      vi.advanceTimersByTime(100);

      const ws2 = FakeWebSocket.instances[1]!;
      ws2.simulateOpen();

      // Last state should be active again.
      expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'active' }));

      // After reconnect success, drop ws2 unexpectedly. Backoff should have reset
      // so the next attempt counter starts at 1 again.
      onState.mockClear();
      ws2.close(1006, 'abnormal');
      expect(onState).toHaveBeenCalledWith({ kind: 'reconnecting', attempt: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop() while reconnecting cancels the pending timer', () => {
    vi.useFakeTimers();
    try {
      const session = new OpenAISession({
        apiKey: 'sk',
        sourceLang: 'pt',
        targetLang: 'en',
        events,
        wsFactory: fakeFactory,
        backoff: { baseMs: 100, maxMs: 1000, maxAttempts: 5 },
      });
      session.start();
      const ws1 = FakeWebSocket.instances[0]!;
      ws1.simulateOpen();
      ws1.close(1006, 'abnormal');
      // We are now in 'reconnecting' state with a pending timer.
      expect(onState).toHaveBeenCalledWith({ kind: 'reconnecting', attempt: 1 });

      // User stops the session before reconnect timer fires.
      session.stop();

      // Advance past delay — no new socket should be created.
      vi.advanceTimersByTime(500);
      expect(FakeWebSocket.instances).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconnect attempts exhausted emits final error', () => {
    vi.useFakeTimers();
    try {
      const session = new OpenAISession({
        apiKey: 'sk',
        sourceLang: 'pt',
        targetLang: 'en',
        events,
        wsFactory: fakeFactory,
        backoff: { baseMs: 10, maxMs: 100, maxAttempts: 2 },
      });
      session.start();

      // Open succeeds once, then a close-without-reopen sequence drains all
      // reconnect attempts. We do NOT call simulateOpen between retries —
      // a successful open would reset backoff and defeat the test.
      const ws1 = FakeWebSocket.instances[0]!;
      ws1.simulateOpen();
      ws1.close(1006, 'abnormal'); // attempt 1 scheduled
      vi.advanceTimersByTime(10);

      const ws2 = FakeWebSocket.instances[1]!;
      // Don't open ws2 — close it while still connecting, simulating a failed retry.
      ws2.close(1006, 'abnormal'); // attempt 2 scheduled
      vi.advanceTimersByTime(20);

      const ws3 = FakeWebSocket.instances[2]!;
      ws3.close(1006, 'abnormal'); // attempts exhausted

      expect(onState).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'error', message: expect.stringMatching(/reconnect attempts exhausted/i) })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('routes server-side {type:"error"} events to error state without reconnect', () => {
    vi.useFakeTimers();
    try {
      const session = new OpenAISession({
        apiKey: 'sk',
        sourceLang: 'pt',
        targetLang: 'en',
        events,
        wsFactory: fakeFactory,
        backoff: { baseMs: 50, maxMs: 500, maxAttempts: 5 },
      });
      session.start();
      const ws = FakeWebSocket.instances[0]!;
      ws.simulateOpen();

      ws.simulateMessage({ type: 'error', error: { message: 'invalid_session_config' } });
      expect(onState).toHaveBeenCalledWith({ kind: 'error', message: 'invalid_session_config' });

      // Even if the socket then closes, no reconnect is attempted.
      onState.mockClear();
      ws.close(1006, 'abnormal');
      vi.advanceTimersByTime(2000);
      // No second socket spun up.
      expect(FakeWebSocket.instances).toHaveLength(1);
      // No 'reconnecting' state emitted.
      expect(onState).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'reconnecting' }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop() clears pendingAudio so stale chunks do not leak across sessions', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    // Buffer some audio before open.
    session.appendAudio('stale-1');
    session.appendAudio('stale-2');
    // Stop before connection ever opens.
    session.stop();

    // Now start a fresh session.
    session.start();
    const ws2 = FakeWebSocket.instances[1]!;
    ws2.simulateOpen();
    // Only session.update should have been sent — no leaked stale chunks.
    expect(ws2.sent).toHaveLength(1);
    expect(JSON.parse(ws2.sent[0]!).type).toBe('session.update');
  });

  it('pendingAudio is bounded — drops oldest after cap', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    // Push 205 chunks before open. Cap is 200.
    for (let i = 0; i < 205; i++) {
      session.appendAudio(`chunk-${i}`);
    }
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    // session.update + 200 buffered chunks (oldest 5 dropped).
    expect(ws.sent).toHaveLength(1 + 200);
    // First buffered chunk should be chunk-5 (chunk-0..chunk-4 dropped).
    expect(JSON.parse(ws.sent[1]!).audio).toBe('chunk-5');
    expect(JSON.parse(ws.sent[200]!).audio).toBe('chunk-204');
  });

  it('reconnect discards stale pending audio (live > stale for real-time translation)', () => {
    // Replaying buffered audio on reconnect shifts OpenAI's input pipeline
    // permanently behind real-time, compounding latency. Drop instead.
    vi.useFakeTimers();
    try {
      const session = new OpenAISession({
        apiKey: 'sk',
        sourceLang: 'pt',
        targetLang: 'en',
        events,
        wsFactory: fakeFactory,
        backoff: { baseMs: 100, maxMs: 1000, maxAttempts: 5 },
      });
      session.start();
      const ws1 = FakeWebSocket.instances[0]!;
      ws1.simulateOpen();
      // First connect already happened; clear the session.update that landed on ws1.
      ws1.close(1006, 'abnormal');

      // Mic continues capturing during the reconnect window — feed stale chunks.
      for (let i = 0; i < 50; i++) {
        session.appendAudio(`stale-${i}`);
      }

      // Reconnect succeeds.
      vi.advanceTimersByTime(100);
      const ws2 = FakeWebSocket.instances[1]!;
      ws2.simulateOpen();

      // ws2 should have ONLY session.update — stale audio is discarded.
      expect(ws2.sent).toHaveLength(1);
      expect(JSON.parse(ws2.sent[0]!).type).toBe('session.update');
    } finally {
      vi.useRealTimers();
    }
  });

  it('overflow log fires once per overflow event, not per chunk', () => {
    const logger = fakeLogger();
    const session = new OpenAISession({
      apiKey: 'sk', sourceLang: 'pt', targetLang: 'en', events,
      wsFactory: fakeFactory, logger,
    });
    session.start();
    for (let i = 0; i < 205; i++) session.appendAudio(`chunk-${i}`);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('pending_audio_overflow');
  });

  it('warns on malformed JSON messages instead of silently dropping', () => {
    const logger = fakeLogger();
    const session = new OpenAISession({
      apiKey: 'sk', sourceLang: 'pt', targetLang: 'en', events,
      wsFactory: fakeFactory, logger,
    });
    session.start();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.onmessage?.('not-valid-json{{{');
    expect(logger.warn).toHaveBeenCalledWith('malformed_message_ignored');
  });

  it('does not emit active when onopen fires late after stop()', () => {
    const session = new OpenAISession({
      apiKey: 'sk',
      sourceLang: 'pt',
      targetLang: 'en',
      events,
      wsFactory: fakeFactory,
    });
    session.start();
    // Don't call simulateOpen yet — connection still pending
    session.stop();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen(); // late onopen, after stop()
    // Last state must be idle (from stop), not active
    expect(onState).toHaveBeenLastCalledWith({ kind: 'idle' });
  });
});
