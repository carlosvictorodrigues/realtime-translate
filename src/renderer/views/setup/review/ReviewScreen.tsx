import { useEffect, useState, type JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { rt } from '../../../ipc/client';
import { useStore } from '../../../state/store';
import { navigate, type WizardStep } from '../shared/useHashRoute';
import { SetupTitlebar } from '../shared/SetupTitlebar';
import { bothCablesPresent } from '../shared/cables';
import { ReviewSection } from './ReviewSection';

export function ReviewScreen(): JSX.Element {
  const t = useT();
  const [keyHint, setKeyHint] = useState<string | undefined>();
  const [hasKey, setHasKey] = useState(false);
  const [cablesOk, setCablesOk] = useState<boolean | null>(null);
  const {
    sourceLang, targetLang,
    selectedMic, selectedToMeet, selectedFromMeet, selectedHeadset, devices,
  } = useStore();

  useEffect(() => {
    rt.hasApiKey().then(setHasKey).catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[review] hasApiKey failed', e);
    });
    rt.getApiKeyHint().then(setKeyHint).catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[review] getApiKeyHint failed', e);
    });
    rt.listDevices()
      .then((d) => setCablesOk(bothCablesPresent(d)))
      .catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[review] listDevices failed', e);
        setCablesOk(false);
      });
  }, []);

  const editStep = (step: WizardStep): void => navigate({ kind: 'wizard', step, mode: 'edit' });

  const labelOf = (id: string | undefined, list: { deviceId: string; label: string }[]): string =>
    id ? (list.find((d) => d.deviceId === id)?.label ?? id) : '—';

  const allDevicesPicked = Boolean(selectedMic && selectedToMeet && selectedFromMeet && selectedHeadset);

  return (
    <div className="setup-shell">
      <SetupTitlebar titleSuffix={t('review.heading')} />
      <div className="setup-body">
        <h1 className="setup-heading">{t('review.heading')}</h1>
        <p className="setup-sub">{t('review.sub')}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
          <ReviewSection
            status={hasKey ? 'ok' : 'warn'}
            title={t('review.section.key')}
            value={hasKey ? t('review.section.keyValue', { last4: keyHint ?? '●●●●' }) : t('review.section.keyMissing')}
            action={<button className="btn btn-ghost" onClick={(): void => editStep(2)}>{t('review.section.edit')}</button>}
          />
          <ReviewSection
            status={cablesOk ? 'ok' : 'warn'}
            title={t('review.section.cables')}
            value={cablesOk ? t('review.section.cablesOk') : t('review.section.cablesMissing')}
            action={<button className="btn btn-ghost" onClick={(): void => editStep(3)}>{t('review.section.rescan')}</button>}
          />
          <ReviewSection
            status="ok"
            title={t('review.section.languages')}
            value={`${sourceLang.toUpperCase()} ↔ ${targetLang.toUpperCase()}`}
            action={<button className="btn btn-ghost" onClick={(): void => editStep(4)}>{t('review.section.edit')}</button>}
          />
          <ReviewSection
            status={allDevicesPicked ? 'ok' : 'warn'}
            title={t('review.section.devices')}
            value={t('review.section.devicesValue', {
              mic: labelOf(selectedMic, devices?.inputs ?? []),
              toMeet: labelOf(selectedToMeet, devices?.outputs ?? []),
              fromMeet: labelOf(selectedFromMeet, devices?.inputs ?? []),
              headset: labelOf(selectedHeadset, devices?.outputs ?? []),
            })}
            action={<button className="btn btn-ghost" onClick={(): void => editStep(4)}>{t('review.section.edit')}</button>}
          />
          {/* Meet config is manual — no auto-verify path exists, so this section is permanently 'warn'. */}
          <ReviewSection
            status="warn"
            title={t('review.section.meet')}
            value={t('review.section.meetValue')}
            action={<button className="btn btn-secondary" onClick={(): void => editStep(5)}>{t('review.section.viewGuide')}</button>}
          />
        </div>

        <div className="setup-footer">
          <button className="btn btn-ghost" onClick={(): void => { void rt.quit(); }}>
            {t('review.footer.quit')}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={(): void => editStep(6)}>
              {t('review.footer.test')}
            </button>
            <button className="btn btn-primary" onClick={(): void => window.close()}>
              {t('review.footer.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
