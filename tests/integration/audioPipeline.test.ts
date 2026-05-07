import { describe, it, expect, beforeEach } from 'vitest';
import { AudioPipeline, type OffscreenController } from '@main/translate/audioPipeline';
import type { OpenAISession } from '@main/translate/openaiSession';

class FakeOffscreen implements OffscreenController {
  startCaptureCalled = '';
  startPlaybackCalled = '';
  pushedAudio: string[] = [];
  pcmCallback?: (b64: string) => void;
  stopped = false;

  async startCapture(deviceId: string, onPcm: (b64: string) => void): Promise<void> {
    this.startCaptureCalled = deviceId;
    this.pcmCallback = onPcm;
  }
  async startPlayback(deviceId: string): Promise<void> {
    this.startPlaybackCalled = deviceId;
  }
  pushPlayback(b64: string): void {
    this.pushedAudio.push(b64);
  }
  stopAll(): void {
    this.stopped = true;
  }
}

class FakeSession {
  appendCalls: string[] = [];
  startCalled = false;
  stopCalled = false;
  start() {
    this.startCalled = true;
  }
  appendAudio(b64: string) {
    this.appendCalls.push(b64);
  }
  stop() {
    this.stopCalled = true;
  }
}

describe('AudioPipeline', () => {
  let offscreen: FakeOffscreen;
  let session: FakeSession;
  let pipeline: AudioPipeline;

  beforeEach(() => {
    offscreen = new FakeOffscreen();
    session = new FakeSession();
    pipeline = new AudioPipeline({
      offscreen,
      session: session as unknown as OpenAISession,
      micDeviceId: 'mic-123',
      outputDeviceId: 'cable-a-456',
    });
  });

  it('start() initializes capture, playback, and the session', async () => {
    await pipeline.start();
    expect(offscreen.startCaptureCalled).toBe('mic-123');
    expect(offscreen.startPlaybackCalled).toBe('cable-a-456');
    expect(session.startCalled).toBe(true);
  });

  it('forwards captured PCM chunks to session.appendAudio', async () => {
    await pipeline.start();
    offscreen.pcmCallback?.('chunk1');
    offscreen.pcmCallback?.('chunk2');
    expect(session.appendCalls).toEqual(['chunk1', 'chunk2']);
  });

  it('forwards session audio deltas to offscreen playback', async () => {
    await pipeline.start();
    pipeline.handleSessionAudio('output-chunk-1');
    pipeline.handleSessionAudio('output-chunk-2');
    expect(offscreen.pushedAudio).toEqual(['output-chunk-1', 'output-chunk-2']);
  });

  it('stop() cleans up everything', async () => {
    await pipeline.start();
    pipeline.stop();
    expect(session.stopCalled).toBe(true);
    expect(offscreen.stopped).toBe(true);
  });
});
