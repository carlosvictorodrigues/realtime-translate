import { useEffect, type JSX } from 'react';
import { useStore } from '../state/store';
import { rt } from '../ipc/client';
import { selectAggregateState } from '../state/aggregateState';
import { Orb } from '../components/Orb';
import { Waveform } from '../components/Waveform';
import { LanguagePair } from '../components/LanguagePair';
import { LatencyMeter } from '../components/LatencyMeter';
import { CostMeter } from '../components/CostMeter';
import { ActionButton } from '../components/ActionButton';
import { SettingsButton } from '../components/SettingsButton';
import { useT } from '../../shared/i18n/I18nProvider';

export function FloatingWidget(): JSX.Element {
  const {
    sourceLang, targetLang,
    selectedMic, selectedToMeet, selectedFromMeet, selectedHeadset,
    stateA, stateB, latencyMs,
    update,
    setDirectionState, setLatency, setUpdateAvailable, setUpdateReady, hydrate,
  } = useStore();
  const t = useT();

  useEffect(() => {
    void hydrate();
    const offState = rt.onDirectionalState(({ direction, state }) =>
      setDirectionState(direction, state),
    );
    const offLat = rt.onLatency(({ direction, averageMs }) =>
      setLatency(direction, averageMs),
    );
    return (): void => {
      offState();
      offLat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const offAvail = rt.onUpdateAvailable((info) => setUpdateAvailable(info));
    const offDl = rt.onUpdateDownloaded((info) => setUpdateReady(info));
    return (): void => {
      offAvail();
      offDl();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click-through on the BrowserWindow's transparent margins. The window is
  // fixed 480x40 but the visible bar is width: auto (~150-340px). Pixels
  // outside .rt-bar should pass clicks through to whatever app is below.
  // Toggles ignoreMouseEvents based on which DOM region is under the cursor;
  // forward: true keeps mousemove flowing so we can detect re-entry. Initial
  // state is ignore=true so the bar doesn't grab clicks until the user moves
  // over it.
  useEffect(() => {
    let isOnBar = false;
    const update = (e: MouseEvent): void => {
      const target = e.target as Element | null;
      const onBar = !!target?.closest?.('.rt-bar');
      if (onBar !== isOnBar) {
        isOnBar = onBar;
        void rt.setBarMouseEvents({ ignore: !onBar });
      }
    };
    const onLeave = (): void => {
      if (isOnBar) {
        isOnBar = false;
        void rt.setBarMouseEvents({ ignore: true });
      }
    };
    document.addEventListener('mousemove', update);
    document.addEventListener('mouseleave', onLeave);
    void rt.setBarMouseEvents({ ignore: true });
    return (): void => {
      document.removeEventListener('mousemove', update);
      document.removeEventListener('mouseleave', onLeave);
      void rt.setBarMouseEvents({ ignore: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bar = selectAggregateState(stateA, stateB);
  const avgLatency = bar.kind === 'active'
    ? avgDefined(latencyMs.A, latencyMs.B)
    : undefined;

  const onAction = async (): Promise<void> => {
    if (bar.kind === 'idle' || bar.kind === 'error') {
      // Both Start and Retry need full device selection. If devices are
      // missing (e.g., user cleared prefs, devices unplugged), redirect to
      // SetupView instead of passing empty strings down to the audio pipeline.
      if (!selectedMic || !selectedToMeet || !selectedFromMeet || !selectedHeadset) {
        await rt.openSetupView();
        return;
      }
      await rt.startTranslation({
        sourceLang, targetLang,
        micDeviceId: selectedMic,
        toMeetDeviceId: selectedToMeet,
        fromMeetDeviceId: selectedFromMeet,
        headsetDeviceId: selectedHeadset,
      });
    } else {
      await rt.stopTranslation();
    }
  };

  return (
    <div
      className={`rt-bar rt-bar--${bar.kind}`}
      role="status"
      onContextMenu={(e): void => {
        e.preventDefault();
        void rt.showBarMenu();
      }}
    >
      <Orb state={bar.kind} />
      {bar.kind === 'active' && <Waveform />}
      {(bar.kind === 'idle' || bar.kind === 'active') && (
        <LanguagePair
          source={sourceLang}
          target={targetLang}
          onClick={(): void => { void rt.openSetupView(); }}
        />
      )}
      {bar.kind === 'connecting' && (
        <span className="rt-status">{t('bar.status.connecting')}</span>
      )}
      {bar.kind === 'reconnecting' && (
        <span className="rt-status">
          {t('bar.status.reconnecting')}
          <span className="rt-status__attempt"> · {bar.origin}: {t('bar.status.attempt', { n: bar.attempt })}</span>
        </span>
      )}
      {bar.kind === 'error' && (
        <span className="rt-status" title={bar.message}>
          {`${bar.origin}: ${truncate(bar.message, 28)}`}
        </span>
      )}
      <LatencyMeter ms={avgLatency} />
      <CostMeter stateA={stateA} stateB={stateB} />
      {update.ready ? (
        <button
          type="button"
          className="rt-update-badge rt-update-badge--ready"
          onClick={(): void => { void rt.applyUpdate(); }}
          title={t('update.tooltipReady')}
        >
          ↑ {t('update.ready', { version: update.ready.version })}
        </button>
      ) : update.available ? (
        <span
          className="rt-update-badge rt-update-badge--downloading"
          title={t('update.tooltipAvailable', { version: update.available.version })}
        >
          ↑ {t('update.available', { version: update.available.version })}
        </span>
      ) : null}
      <ActionButton state={bar.kind} onClick={(): void => { void onAction(); }} />
      <SettingsButton onClick={(): void => { void rt.openSetupView(); }} />
    </div>
  );
}

function avgDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a !== undefined && b !== undefined) return Math.round((a + b) / 2);
  return a ?? b;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
