import type { BrowserWindow } from 'electron';

/**
 * Bridge from main process to offscreen renderer's loopback detector.
 * The offscreen runs Web Audio AnalyserNode on the given input device for up
 * to `timeoutMs`, polling RMS at 100ms; resolves with `{ detected: true }` as
 * soon as RMS exceeds `thresholdRms`, or `{ detected: false }` on timeout.
 */
export async function runLoopback(
  offscreenWindow: BrowserWindow,
  deviceId: string,
  thresholdRms: number,
  timeoutMs: number,
): Promise<{ detected: boolean }> {
  const result: { detected: boolean } = await offscreenWindow.webContents.executeJavaScript(
    `window.offscreen.runLoopback(${JSON.stringify(deviceId)}, ${thresholdRms}, ${timeoutMs})`,
  );
  return result;
}
