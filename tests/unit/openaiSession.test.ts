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
    expect(config.session.input_audio_format).toBe('pcm16');
    expect(config.session.output_audio_format).toBe('pcm16');
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
});
