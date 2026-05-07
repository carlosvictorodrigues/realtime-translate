import type { OpenAISession } from './openaiSession';

export interface OffscreenController {
  startCapture(deviceId: string, onPcm: (b64: string) => void): Promise<void>;
  startPlayback(deviceId: string): Promise<void>;
  pushPlayback(b64: string): void;
  stopAll(): void;
}

export interface AudioPipelineConfig {
  offscreen: OffscreenController;
  session: OpenAISession;
  micDeviceId: string;
  outputDeviceId: string;
}

export class AudioPipeline {
  constructor(private readonly cfg: AudioPipelineConfig) {}

  async start(): Promise<void> {
    await this.cfg.offscreen.startPlayback(this.cfg.outputDeviceId);
    await this.cfg.offscreen.startCapture(this.cfg.micDeviceId, (b64) =>
      this.cfg.session.appendAudio(b64),
    );
    this.cfg.session.start();
  }

  handleSessionAudio(base64: string): void {
    this.cfg.offscreen.pushPlayback(base64);
  }

  stop(): void {
    this.cfg.session.stop();
    this.cfg.offscreen.stopAll();
  }
}
