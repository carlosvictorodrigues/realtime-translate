import type { SessionState } from '../../shared/types';
import type { LanguageCode } from '../../shared/languages';

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
}

const ENDPOINT = 'wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate';

export class OpenAISession {
  private ws?: WebSocketLike;
  private isOpen = false;
  private pendingAudio: string[] = [];

  constructor(private readonly cfg: OpenAISessionConfig) {}

  start(): void {
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

  appendAudio(base64: string): void {
    if (!this.isOpen) {
      this.pendingAudio.push(base64);
      return;
    }
    this.sendRaw({ type: 'session.input_audio_buffer.append', audio: base64 });
  }

  stop(): void {
    if (this.ws && !this.isClosed()) {
      this.ws.close(1000, 'client stop');
    }
    this.cfg.events.onState({ kind: 'idle' });
  }

  private handleOpen(): void {
    this.isOpen = true;
    this.sendRaw({
      type: 'session.update',
      session: {
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        audio: {
          output: {
            language: this.cfg.targetLang,
            ...(this.cfg.voice ? { voice: this.cfg.voice } : {}),
          },
        },
      },
    });
    for (const chunk of this.pendingAudio) {
      this.sendRaw({ type: 'session.input_audio_buffer.append', audio: chunk });
    }
    this.pendingAudio = [];
    this.cfg.events.onState({ kind: 'active', sinceMs: Date.now() });
  }

  private handleMessage(raw: string): void {
    let event: { type: string; delta?: string };
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    if (event.type === 'session.output_audio.delta' && event.delta) {
      this.cfg.events.onAudio(event.delta);
    } else if (event.type === 'session.input_transcript.delta' && event.delta) {
      this.cfg.events.onTranscript({ kind: 'input', text: event.delta });
    } else if (event.type === 'session.output_transcript.delta' && event.delta) {
      this.cfg.events.onTranscript({ kind: 'output', text: event.delta });
    }
  }

  private handleClose(_code: number, _reason: string): void {
    this.isOpen = false;
  }

  private handleError(err: Error): void {
    this.cfg.events.onState({ kind: 'error', message: err.message });
  }

  private sendRaw(payload: object): void {
    this.ws?.send(JSON.stringify(payload));
  }

  private isClosed(): boolean {
    return !this.ws || this.ws.readyState === 3;
  }
}
