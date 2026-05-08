import { useState, type JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { navigate } from '../shared/useHashRoute';
import { MeetGuide } from '../shared/MeetGuide';

export function Step5MeetConfig({ mode }: { mode?: 'edit' | undefined }): JSX.Element {
  const t = useT();
  const [confirmed, setConfirmed] = useState(false);

  const back = (): void => {
    navigate(mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 4 });
  };
  const proceed = (): void => {
    navigate(mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 6 });
  };

  return (
    <>
      <div className="setup-step-meta">{t('setup.stepLabel', { n: 5, total: 6 })} — {t('setup.meet.label')}</div>
      <h1 className="setup-heading">{t('setup.meet.heading')}</h1>
      <p className="setup-sub">{t('setup.meet.sub')}</p>

      <MeetGuide />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
        <input type="checkbox" checked={confirmed} onChange={(e): void => setConfirmed(e.target.checked)} />
        {t('setup.meet.alreadyConfigured')}
      </label>

      <div className="setup-footer">
        <button className="btn btn-ghost" onClick={back}>{t('common.back')}</button>
        <button className="btn btn-primary" disabled={!confirmed} onClick={proceed}>
          {mode === 'edit' ? t('common.saveAndBack') : t('common.next')}
        </button>
      </div>
    </>
  );
}
