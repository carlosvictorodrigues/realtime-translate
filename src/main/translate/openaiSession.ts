import type { SessionState } from '../../shared/types';
import type { LanguageCode } from '../../shared/languages';
import { ExponentialBackoff, type BackoffConfig } from '../util/retryPolicy';

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen?: () => void;
  onclose?: (code: number, reason: string) => void;
  onmessage?: (data: string) => void;
  onerror?: (err: Error) => void;
}

export type WebSocketFactory = (url: string, headers: Record<string, string>) => WebSocketLike;

export interface SessionEvents {
  onState: (s: SessionState) => void;
  onAudio: (base64: string) => void;
  onTranscript: (t: { kind: 'input' | 'output'; text: string }) => void;
}

export interface OpenAISessionConfig {
  apiKey: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  events: SessionEvents;
  wsFactory: WebSocketFactory;
  voice?: string;
  /** Reconnect policy (spec §7). Default: 1s base / 30s cap / 5 attempts. */
  backoff?: BackoffConfig;
}

const ENDPOINT = 'wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate';
const DEFAULT_BACKOFF: BackoffConfig = { baseMs: 1000, maxMs: 30000, maxAttempts: 5 };
/** Cap on pre-connect audio buffer (~10s @ 50ms framing). */
const MAX_PENDING_AUDIO = 200;

export class OpenAISession {
  private ws?: WebSocketLike;
  private isOpen = false;
  private pendingAudio: string[] = [];
  private readonly backoff: ExponentialBackoff;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  /** True between user-initiated stop() and the next user-initiated start(). */
  private userStopped = false;
  /** True after a server-side {type:'error'} — disables reconnect on subsequent close. */
  private serverError = false;
  /** User-visible reconnect attempt counter. Resets on successful (re)open and on start(). */
  private attemptCount = 0;
  /** False before the first successful open after start(); true thereafter. Distinguishes
   * startup-buffer flush (legitimate) from reconnect-buffer replay (compounds latency). */
  private hasOpenedOnce = false;
  /** True while we're in an overflow event — gates the warn log to once per event. Reset
   * on successful (re)open. */
  private hasLoggedOverflow = false;

  constructor(private readonly cfg: OpenAISessionConfig) {
    this.backoff = new ExponentialBackoff(cfg.backoff ?? DEFAULT_BACKOFF);
  }

  /**
   * User-initiated session start. Resets reconnect state and opens a fresh socket.
   * Internal reconnects use {@link connect} directly to preserve backoff progression.
   */
  start(): void {
    this.userStopped = false;
    this.serverError = false;
    this.hasOpenedOnce = false;
    this.hasLoggedOverflow = false;
    this.backoff.reset();
    this.attemptCount = 0;
    this.connect();
  }

  appendAudio(base64: string): void {
    if (!this.isOpen) {
      // Bound the pre-connect buffer — drop oldest on overflow (M1).
      if (this.pendingAudio.length >= MAX_PENDING_AUDIO) {
        this.pendingAudio.shift();
        // Throttle: log once per overflow event, not per chunk. A multi-second
        // disconnect would otherwise produce hundreds of identical warnings.
        if (!this.hasLoggedOverflow) {
          this.hasLoggedOverflow = true;
          // TODO(Task 14): replace with structured logger
          // eslint-disable-next-line no-console
          console.warn('OpenAISession: pending audio buffer overflow, dropping oldest');
        }
      }
      this.pendingAudio.push(base64);
      return;
    }
    this.sendRaw({ type: 'session.input_audio_buffer.append', audio: base64 });
  }

  stop(): void {
    this.userStopped = true;
    // Cancel any pending reconnect (I1 + cancellation correctness).
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    // Drop any buffered audio so a future start() doesn't replay stale chunks (I1).
    this.pendingAudio = [];
    if (this.ws && !this.isClosed()) {
      this.ws.close(1000, 'client stop');
    }
    this.cfg.events.onState({ kind: 'idle' });
  }

  /** Open a WebSocket without resetting reconnect state. Used by start() and reconnect. */
  private connect(): void {
    this.cfg.events.onState({ kind: 'connecting' });
    this.ws = this.cfg.wsFactory(ENDPOINT, {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      'OpenAI-Safety-Identifier': 'realtime-translate-client',
    });
    this.ws.onopen = () => this.handleOpen();
    this.ws.onmessage = (data) => this.handleMessage(data);
    this.ws.onclose = (code, reason) => this.handleClose(code, reason);
    this.ws.onerror = (err) => this.handleError(err);
  }

  private handleOpen(): void {
    // Guard against late-fire: if user called stop() or server sent an error
    // while the WebSocket was still in CONNECTING state, the onopen callback
    // can still fire. Bail out before emitting active state.
    if (this.userStopped || this.serverError) return;
    this.isOpen = true;
    // Successful (re)connect — reset backoff so next failure starts fresh.
    this.backoff.reset();
    this.attemptCount = 0;
    // The /v1/realtime/translations endpoint accepts only audio.output.language
    // (and optionally voice). Format is implicitly PCM16 24kHz mono per OpenAI docs.
    // Do NOT send input_audio_format / output_audio_format — those belong to the
    // /v1/realtime conversational endpoint and cause "Unknown parameter" errors here.
    this.sendRaw({
      type: 'session.update',
      session: {
        audio: {
          output: {
            language: this.cfg.targetLang,
            ...(this.cfg.voice ? { voice: this.cfg.voice } : {}),
          },
        },
      },
    });
    if (!this.hasOpenedOnce) {
      // First open after start(): flush audio captured between start() and WS open.
      // This is the legitimate startup window — typically 1-3s of buffered audio.
      for (const chunk of this.pendingAudio) {
        this.sendRaw({ type: 'session.input_audio_buffer.append', audio: chunk });
      }
      this.hasOpenedOnce = true;
    }
    // On reconnect (hasOpenedOnce was already true), pendingAudio is intentionally
    // discarded. Replaying it would shift OpenAI's input pipeline permanently behind
    // real-time — for translation, live audio is more valuable than stale audio.
    this.pendingAudio = [];
    this.hasLoggedOverflow = false;
    this.cfg.events.onState({ kind: 'active', sinceMs: Date.now() });
  }

  private handleMessage(raw: string): void {
    let event: { type: string; delta?: string };
    try {
      event = JSON.parse(raw);
    } catch {
      // M4: best-effort warning. Don't include the raw payload — could leak transcript.
      // TODO(Task 14): replace with structured logger
      // eslint-disable-next-line no-console
      console.warn('OpenAISession: malformed message ignored');
      return;
    }
    if (event.type === 'session.output_audio.delta' && event.delta) {
      this.cfg.events.onAudio(event.delta);
    } else if (event.type === 'session.input_transcript.delta' && event.delta) {
      this.cfg.events.onTranscript({ kind: 'input', text: event.delta });
    } else if (event.type === 'session.output_transcript.delta' && event.delta) {
      this.cfg.events.onTranscript({ kind: 'output', text: event.delta });
    } else if (event.type === 'error') {
      // I2: server-side fatal. Don't reconnect — server explicitly rejected.
      const msg =
        (event as { error?: { message?: string } }).error?.message ?? 'OpenAI server error';
      this.serverError = true;
      this.cfg.events.onState({ kind: 'error', message: msg });
    }
  }

  private handleClose(_code: number, _reason: string): void {
    this.isOpen = false;
    // User-initiated stop or server-rejected session: do not reconnect.
    if (this.userStopped || this.serverError) return;
    this.scheduleReconnect();
  }

  private handleError(err: Error): void {
    this.cfg.events.onState({ kind: 'error', message: err.message });
  }

  private scheduleReconnect(): void {
    if (!this.backoff.hasNext()) {
      this.cfg.events.onState({ kind: 'error', message: 'reconnect attempts exhausted' });
      return;
    }
    const delay = this.backoff.next();
    this.attemptCount += 1;
    this.cfg.events.onState({ kind: 'reconnecting', attempt: this.attemptCount });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      // Re-check stop flag at fire time in case stop() raced past the check above.
      if (this.userStopped || this.serverError) return;
      this.connect();
    }, delay);
  }

  private sendRaw(payload: object): void {
    this.ws?.send(JSON.stringify(payload));
  }

  private isClosed(): boolean {
    return !this.ws || this.ws.readyState === 3;
  }
}
