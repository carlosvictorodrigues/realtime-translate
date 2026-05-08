import { describe, it, expect, vi } from 'vitest';
import { runLoopback } from '@main/audio/loopbackCapture';

describe('runLoopback', () => {
  it('forwards args correctly to offscreen.executeJavaScript and returns its result', async () => {
    const offscreen = {
      webContents: {
        executeJavaScript: vi.fn().mockResolvedValue({ detected: true }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runLoopback(offscreen as any, 'device-xyz', 0.01, 10000);
    expect(result.detected).toBe(true);
    expect(offscreen.webContents.executeJavaScript).toHaveBeenCalledWith(
      'window.offscreen.runLoopback("device-xyz", 0.01, 10000)',
    );
  });
});
