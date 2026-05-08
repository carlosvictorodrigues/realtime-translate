import type { JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';

export function MeetGuide(): JSX.Element {
  const t = useT();
  const steps = [
    { n: 1, text: t('setup.meet.step1') },
    { n: 2, text: t('setup.meet.step2') },
    { n: 3, text: t('setup.meet.step3') },
    { n: 4, text: t('setup.meet.step4') },
    { n: 5, text: t('setup.meet.step5') },
  ];
  return (
    <div className="meet-guide">
      {steps.map((s) => (
        <div key={s.n} className="meet-guide__step">
          {/* Relative path: production loads via file:// where leading "/" resolves
              against the URL authority (drive root on Windows), not the renderer root. */}
          <img src={`./setup/meet-step-${s.n}.png`} alt={s.text} className="meet-guide__img" />
          <div className="meet-guide__caption">
            <span className="meet-guide__num" aria-hidden="true">{s.n}</span>
            <span>{s.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
