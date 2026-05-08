import type { JSX } from 'react';
import type { LanguageCode } from '../../shared/languages';

export function LanguagePair({
  source,
  target,
  onClick,
}: {
  source: LanguageCode;
  target: LanguageCode;
  onClick: () => void;
}): JSX.Element {
  return (
    <button className="rt-pair" onClick={onClick}>
      {source.toUpperCase()}
      <span className="rt-pair__arr">↔</span>
      {target.toUpperCase()}
    </button>
  );
}
