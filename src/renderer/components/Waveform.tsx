import type { JSX } from 'react';

export function Waveform(): JSX.Element {
  return (
    <div className="rt-wf">
      <div className="rt-wf__bar" />
      <div className="rt-wf__bar" />
      <div className="rt-wf__bar" />
      <div className="rt-wf__bar" />
      <div className="rt-wf__bar" />
    </div>
  );
}
