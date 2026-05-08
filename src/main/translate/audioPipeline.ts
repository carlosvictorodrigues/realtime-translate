export interface OffscreenController {
  startCapture(streamId: string, deviceId: string, onPcm: (b64: string) => void): Promise<void>;
  startPlayback(streamId: string, deviceId: string): Promise<void>;
  pushPlayback(streamId: string, b64: string): void;
  /** Stops capture + playback for one stream. Use this on per-direction stop. */
  stopStream(streamId: string): void;
  /** Stops all streams and releases the offscreen window's audio resources. App-shutdown only. */
  stopAll(): void;
}

/** Narrow session interface — pipeline only uses these three methods. */
export interface SessionLike {
  start(): void;
  appendAudio(base64: string): void;
  stop(): void;
}

export interface AudioPipelineConfig {
  streamId: string;
  offscreen: OffscreenController;
  session: SessionLike;
  micDeviceId: string;
  outputDeviceId: string;
}

export class AudioPipeline {
  constructor(private readonly cfg: AudioPipelineConfig) {}

  async start(): Promise<void> {
    await this.cfg.offscreen.startPlayback(this.cfg.streamId, this.cfg.outputDeviceId);
    try {
      await this.cfg.offscreen.startCapture(this.cfg.streamId, this.cfg.micDeviceId, (b64) =>
        this.cfg.session.appendAudio(b64),
      );
    } catch (err) {
      this.cfg.offscreen.stopStream(this.cfg.streamId);
      throw err;
    }
    this.cfg.session.start();
  }

  handleSessionAudio(base64: string): void {
    this.cfg.offscreen.pushPlayback(this.cfg.streamId, base64);
  }

  stop(): void {
    this.cfg.session.stop();
    this.cfg.offscreen.stopStream(this.cfg.streamId);
  }
}
