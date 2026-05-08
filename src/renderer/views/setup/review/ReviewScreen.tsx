import { useEffect, useState, type JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { rt } from '../../../ipc/client';
import { useStore } from '../../../state/store';
import { LanguageDropdown } from '../../../components/LanguageDropdown';
import { navigate, type WizardStep } from '../shared/useHashRoute';
import { ReviewSection } from './ReviewSection';
import type { Locale } from '../../../../shared/i18n';
import type { DeviceInventory } from '../../../../shared/types';

function bothCablesPresent(inv: DeviceInventory): boolean {
  return Boolean(
    inv.cableA?.playback && inv.cableA?.recording &&
    inv.cableB?.playback && inv.cableB?.recording,
  );
}

export function ReviewScreen(): JSX.Element {
  const t = useT();
  const [keyHint, setKeyHint] = useState<string | undefined>();
  const [hasKey, setHasKey] = useState(false);
  const [cablesOk, setCablesOk] = useState<boolean | null>(null);
  const [locale, setLocale] = useState<Locale>('pt-BR');
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
    rt.resolveLocale().then(setLocale).catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[review] resolveLocale failed, keeping pt-BR default', e);
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
      <div className="setup-titlebar">
        <span className="setup-title">Realtime Translate · {t('review.heading')}</span>
        <LanguageDropdown
          current={locale}
          onChange={(next): void => {
            // Wait for prefs write before reloading — otherwise reload pre-empts the IPC
            // and resolveLocale() reads the stale value on next mount (Task 5 review fix).
            void window.rt.saveUiLanguage(next).then(() => window.location.reload());
          }}
        />
      </div>
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
