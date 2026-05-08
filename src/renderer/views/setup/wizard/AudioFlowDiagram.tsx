import type { JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';

export function AudioFlowDiagram(): JSX.Element {
  const t = useT();
  return (
    <div className="flow-diagram">
      <div className="flow-direction-label">↓ {t('setup.welcome.diagramDirA')}</div>
      <div className="flow-row">
        <div className="flow-node">
          <div className="flow-node__icon">🎤</div>
          <div className="flow-node__label">{t('setup.welcome.you')}</div>
          <div className="flow-node__meta">{t('setup.welcome.speaks')} PT</div>
        </div>
        <div className="flow-arrow"><span className="flow-arrow__label">{t('setup.welcome.appTranslates')}</span></div>
        <div className="flow-node accent">
          <div className="flow-node__icon">🔄</div>
          <div className="flow-node__label">Meet</div>
          <div className="flow-node__meta">{t('setup.welcome.hears')} EN</div>
        </div>
      </div>
      <div className="flow-row">
        <div className="flow-node">
          <div className="flow-node__icon">🎧</div>
          <div className="flow-node__label">{t('setup.welcome.you')}</div>
          <div className="flow-node__meta">{t('setup.welcome.hears')} PT</div>
        </div>
        <div className="flow-arrow"><span className="flow-arrow__label">{t('setup.welcome.appTranslates')}</span></div>
        <div className="flow-node accent">
          <div className="flow-node__icon">🔄</div>
          <div className="flow-node__label">Meet</div>
          <div className="flow-node__meta">{t('setup.welcome.speaks')} EN</div>
        </div>
      </div>
      <div className="flow-direction-label" style={{ marginTop: 16 }}>↑ {t('setup.welcome.diagramDirB')}</div>
    </div>
  );
}
