import { OpenAISession, type WebSocketFactory } from './openaiSession';
import type { LanguageCode } from '../../shared/languages';
import type { Direction } from '../../shared/types';

export interface TestSessionConfig {
  apiKey: string;
  wsFactory: WebSocketFactory;
  onAudio: (base64: string) => void;
}

/**
 * Holds isolated OpenAISession instances per direction (A/B) for the Test
 * Translation wizard step. Each direction is fully independent: starting a
 * second session for the same direction tears down the first.
 *
 * Lifecycle:
 *   start(direction, ...)   → opens WebSocket, ready for inject()
 *   inject(direction, b64)  → forwards a 50ms PCM16 chunk to OpenAI
 *   inputDone(direction)    → no-op; relies on server VAD (see note below)
 *   stop(direction)         → closes WebSocket, cleans up
 */
export class TestSessionRegistry {
  private sessions = new Map<Direction, OpenAISession>();

  start(
    direction: Direction,
    sourceLang: LanguageCode,
    targetLang: LanguageCode,
    cfg: TestSessionConfig,
  ): void {
    this.stop(direction);
    const session = new OpenAISession({
      apiKey: cfg.apiKey,
      sourceLang,
      targetLang,
      events: {
        onState: () => undefined,
        onAudio: cfg.onAudio,
        onTranscript: () => undefined,
      },
      wsFactory: cfg.wsFactory,
    });
    session.start();
    this.sessions.set(direction, session);
  }

  inject(direction: Direction, base64: string): void {
    this.sessions.get(direction)?.appendAudio(base64);
  }

  /**
   * End-of-input signal — relies on server VAD to finalize since OpenAISession
   * does not expose an explicit commit method. Test WAVs are short enough
   * (~3s) that VAD finalizes within seconds.
   */
  inputDone(_direction: Direction): void {
    // Intentional no-op for now.
  }

  stop(direction: Direction): void {
    const s = this.sessions.get(direction);
    if (s) {
      s.stop();
      this.sessions.delete(direction);
    }
  }
}
