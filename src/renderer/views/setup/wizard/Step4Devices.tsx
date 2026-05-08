import { useEffect, type JSX } from 'react';
import { useStore } from '../../../state/store';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { rt } from '../../../ipc/client';
import { navigate } from '../shared/useHashRoute';
import { LANGUAGES, type LanguageCode } from '../../../../shared/languages';

export function Step4Devices({ mode }: { mode?: 'edit' | undefined }): JSX.Element {
  const t = useT();
  const {
    devices, sourceLang, targetLang,
    selectedMic, selectedToMeet, selectedFromMeet, selectedHeadset,
    setDevices, setSourceLang, setTargetLang,
    setSelectedMic, setSelectedToMeet, setSelectedFromMeet, setSelectedHeadset,
  } = useStore();

  useEffect(() => {
    rt.listDevices()
      .then((d) => {
        setDevices(d);
        if (d.cableA?.playback && !selectedToMeet) setSelectedToMeet(d.cableA.playback.deviceId);
        if (d.cableB?.recording && !selectedFromMeet) setSelectedFromMeet(d.cableB.recording.deviceId);
      })
      .catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[step4] listDevices failed', e);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allFilled = Boolean(selectedMic && selectedToMeet && selectedFromMeet && selectedHeadset);

  const back = (): void => {
    navigate(mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 3 });
  };
  const proceed = (): void => {
    navigate(mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 5 });
  };

  const placeholder = t('setup.devices.selectPlaceholder');
  const recommended = t('setup.devices.recommended');

  // deviceDetector strips virtual cables from inputs/outputs and exposes them
  // separately on cableA/cableB. Merge the cable back into the option list so
  // it's actually selectable in the dropdown — otherwise recommendedId points
  // at a deviceId that doesn't exist in `options` and the recommended row
  // never renders.
  const toMeetOptions = (() => {
    const out = devices?.outputs ?? [];
    const cable = devices?.cableA?.playback;
    if (!cable || out.some((o) => o.deviceId === cable.deviceId)) return out;
    return [cable, ...out];
  })();
  const fromMeetOptions = (() => {
    const ins = devices?.inputs ?? [];
    const cable = devices?.cableB?.recording;
    if (!cable || ins.some((o) => o.deviceId === cable.deviceId)) return ins;
    return [cable, ...ins];
  })();

  const cableAMismatch = Boolean(
    devices?.cableA?.playback &&
    selectedToMeet &&
    selectedToMeet !== devices.cableA.playback.deviceId,
  );
  const cableBMismatch = Boolean(
    devices?.cableB?.recording &&
    selectedFromMeet &&
    selectedFromMeet !== devices.cableB.recording.deviceId,
  );
  const showStaleBanner = cableAMismatch || cableBMismatch;

  const useRecommendedCables = (): void => {
    if (devices?.cableA?.playback) setSelectedToMeet(devices.cableA.playback.deviceId);
    if (devices?.cableB?.recording) setSelectedFromMeet(devices.cableB.recording.deviceId);
  };

  return (
    <>
      <div className="setup-step-meta">{t('setup.stepLabel', { n: 4, total: 6 })} — {t('setup.devices.label')}</div>
      <h1 className="setup-heading">{t('setup.devices.heading')}</h1>
      <p className="setup-sub">{t('setup.devices.sub')}</p>

      {showStaleBanner && (
        <div className="setup-stale-banner">
          <span>⚠ {t('setup.devices.staleCableWarning')}</span>
          <button type="button" className="btn btn-ghost" onClick={useRecommendedCables}>
            {t('setup.devices.useRecommended')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
        <DeviceField
          label={t('setup.devices.mic')}
          hint={t('setup.devices.micHint')}
          value={selectedMic}
          onChange={setSelectedMic}
          options={devices?.inputs ?? []}
          placeholder={placeholder}
        />
        <DeviceField
          label={t('setup.devices.toMeet')}
          hint={t('setup.devices.toMeetHint')}
          value={selectedToMeet}
          onChange={setSelectedToMeet}
          options={toMeetOptions}
          placeholder={placeholder}
          recommendedId={devices?.cableA?.playback?.deviceId}
          recommendedLabel={recommended}
        />
        <DeviceField
          label={t('setup.devices.fromMeet')}
          hint={t('setup.devices.fromMeetHint')}
          value={selectedFromMeet}
          onChange={setSelectedFromMeet}
          options={fromMeetOptions}
          placeholder={placeholder}
          recommendedId={devices?.cableB?.recording?.deviceId}
          recommendedLabel={recommended}
        />
        <DeviceField
          label={t('setup.devices.headset')}
          hint={t('setup.devices.headsetHint')}
          value={selectedHeadset}
          onChange={setSelectedHeadset}
          options={devices?.outputs ?? []}
          placeholder={placeholder}
        />

        <div>
          <label className="setup-field-label">
            {t('setup.devices.languagesLabel')}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select className="setup-input" style={{ flex: 1 }} value={sourceLang} onChange={(e): void => setSourceLang(e.target.value as LanguageCode)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <span style={{ color: 'var(--text-tertiary)' }}>↔</span>
            <select className="setup-input" style={{ flex: 1 }} value={targetLang} onChange={(e): void => setTargetLang(e.target.value as LanguageCode)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="setup-footer">
        <button className="btn btn-ghost" onClick={back}>{t('common.back')}</button>
        <button className="btn btn-primary" disabled={!allFilled} onClick={proceed}>
          {mode === 'edit' ? t('common.saveAndBack') : t('common.next')}
        </button>
      </div>
    </>
  );
}

function DeviceField({
  label, hint, value, onChange, options, placeholder, recommendedId, recommendedLabel,
}: {
  label: string;
  hint?: string;
  value: string | undefined;
  onChange: (id: string) => void;
  options: { deviceId: string; label: string }[];
  placeholder: string;
  recommendedId?: string | undefined;
  recommendedLabel?: string | undefined;
}): JSX.Element {
  const recommendedOption = recommendedId ? options.find((o) => o.deviceId === recommendedId) : undefined;
  return (
    <div>
      <label className="setup-field-label">{label}</label>
      {hint && <div className="setup-field-hint">{hint}</div>}
      <select className="setup-input" value={value ?? ''} onChange={(e): void => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {recommendedOption && (
          <option value={recommendedOption.deviceId}>
            {recommendedOption.label} {recommendedLabel ?? ''}
          </option>
        )}
        {options
          .filter((o) => o.deviceId !== recommendedId)
          .map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
      </select>
    </div>
  );
}
