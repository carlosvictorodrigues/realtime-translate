import type { JSX } from 'react';
import type { BarState } from '../state/aggregateState';

export function ActionButton({
  state,
  onClick,
}: {
  state: BarState['kind'];
  onClick: () => void;
}): JSX.Element {
  // ▶ for idle, ⏸ for active/connecting/reconnecting, ↻ for error.
  const isPlay = state === 'idle';
  const isRetry = state === 'error';
  const title = isPlay ? 'Iniciar' : isRetry ? 'Tentar novamente' : 'Pausar';
  return (
    <button
      className={`rt-action${isRetry ? ' rt-action--retry' : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {isPlay && (
        <svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4" /></svg>
      )}
      {!isPlay && !isRetry && (
        <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
      )}
      {isRetry && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      )}
    </button>
  );
}
