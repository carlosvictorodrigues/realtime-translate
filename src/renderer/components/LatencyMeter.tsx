import type { JSX } from 'react';

export function LatencyMeter({ ms }: { ms: number | undefined }): JSX.Element | null {
  if (ms === undefined) return null;
  const seconds = (ms / 1000).toFixed(1);
  return <span className="rt-lat">{seconds}s</span>;
}
