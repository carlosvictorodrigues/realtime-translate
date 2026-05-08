import type { OffscreenController } from './audioPipeline';
import { AudioPipeline } from './audioPipeline';
import { OpenAISession, type WebSocketFactory } from './openaiSession';
import type { Direction, SessionState } from '../../shared/types';
import type { LanguageCode } from '../../shared/languages';

export interface SessionManagerConfig {
  apiKey: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  micDeviceId: string;
  toMeetDeviceId: string;
  fromMeetDeviceId: string;
  headsetDeviceId: string;
  offscreen: OffscreenController;
  wsFactory: WebSocketFactory;
  onDirectionalState: (s: { direction: Direction; state: SessionState }) => void;
  onTranscript: (t: { direction: Direction; kind: 'input' | 'output'; text: string }) => void;
}

interface DirectionContext {
  session: OpenAISession;
  pipeline: AudioPipeline;
}

export class SessionManager {
  private a: DirectionContext | undefined;
  private b: DirectionContext | undefined;

  constructor(private readonly cfg: SessionManagerConfig) {}

  async start(): Promise<void> {
    this.a = this.buildDirection(
      'A',
      this.cfg.sourceLang,
      this.cfg.targetLang,
      this.cfg.micDeviceId,
      this.cfg.toMeetDeviceId,
    );
    this.b = this.buildDirection(
      'B',
      this.cfg.targetLang,
      this.cfg.sourceLang,
      this.cfg.fromMeetDeviceId,
      this.cfg.headsetDeviceId,
    );

    // Start both pipelines in parallel; if one fails, surface its error via state and rethrow.
    // The other pipeline's state is independent — no automatic teardown of the surviving direction.
    const results = await Promise.allSettled([
      this.startDirection('A', this.a.pipeline),
      this.startDirection('B', this.b.pipeline),
    ]);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length > 0) {
      throw failures[0]!.reason;
    }
  }

  private async startDirection(direction: Direction, pipeline: AudioPipeline): Promise<void> {
    try {
      await pipeline.start();
    } catch (err) {
      // Pipeline init failed before session.start() — emit an error state so the UI can
      // reflect this direction's failure (degraded mode, spec §7).
      const message = err instanceof Error ? err.message : String(err);
      this.cfg.onDirectionalState({ direction, state: { kind: 'error', message } });
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.a?.pipeline.stop();
    this.b?.pipeline.stop();
    this.a = undefined;
    this.b = undefined;
  }

  private buildDirection(
    direction: Direction,
    source: LanguageCode,
    target: LanguageCode,
    micDeviceId: string,
    outputDeviceId: string,
  ): DirectionContext {
    let pipelineRef: AudioPipeline | undefined;
    const session = new OpenAISession({
      apiKey: this.cfg.apiKey,
      sourceLang: source,
      targetLang: target,
      events: {
        onState: (s) => this.cfg.onDirectionalState({ direction, state: s }),
        onAudio: (b64) => pipelineRef?.handleSessionAudio(b64),
        onTranscript: (t) =>
          this.cfg.onTranscript({ direction, kind: t.kind, text: t.text }),
      },
      wsFactory: this.cfg.wsFactory,
    });
    const pipeline = new AudioPipeline({
      streamId: direction,
      offscreen: this.cfg.offscreen,
      session,
      micDeviceId,
      outputDeviceId,
    });
    pipelineRef = pipeline;
    return { session, pipeline };
  }
}
