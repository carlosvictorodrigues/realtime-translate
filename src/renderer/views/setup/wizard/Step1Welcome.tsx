import type { JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { navigate } from '../shared/useHashRoute';
import { AudioFlowDiagram } from './AudioFlowDiagram';

export function Step1Welcome(): JSX.Element {
  const t = useT();
  return (
    <>
      <div className="setup-step-meta">{t('setup.stepLabel', { n: 1, total: 6 })} — {t('setup.welcome.label')}</div>
      <h1 className="setup-heading">{t('setup.welcome.heading')}</h1>
      <p className="setup-sub">{t('setup.welcome.sub')}</p>
      <AudioFlowDiagram />
      <div className="setup-footer">
        <span /> {/* spacer; no Back on step 1 */}
        <button className="btn btn-primary" onClick={(): void => navigate({ kind: 'wizard', step: 2 })}>
          {t('setup.welcome.start')}
        </button>
      </div>
    </>
  );
}
