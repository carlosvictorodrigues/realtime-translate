export interface OffscreenController {
  startCapture(deviceId: string, onPcm: (b64: string) => void): Promise<void>;
  startPlayback(deviceId: string): Promise<void>;
  pushPlayback(b64: string): void;
  stopAll(): void;
}

/** Narrow session interface — pipeline only uses these three methods. */
export interface SessionLike {
  start(): void;
  appendAudio(base64: string): void;
  stop(): void;
}

export interface AudioPipelineConfig {
  offscreen: OffscreenController;
  session: SessionLike;
  micDeviceId: string;
  outputDeviceId: string;
}

export class AudioPipeline {
  constructor(private readonly cfg: AudioPipelineConfig) {}

  async start(): Promise<void> {
    await this.cfg.offscreen.startPlayback(this.cfg.outputDeviceId);
    try {
      await this.cfg.offscreen.startCapture(this.cfg.micDeviceId, (b64) =>
        this.cfg.session.appendAudio(b64),
      );
    } catch (err) {
      // Capture init failed after playback was set up — rollback the offscreen
      // resources so we don't leak an idle AudioContext + sinkId binding.
      this.cfg.offscreen.stopAll();
      throw err;
    }
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
