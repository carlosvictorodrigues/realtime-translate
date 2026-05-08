import { useEffect, type JSX } from 'react';
import { useStore } from '../state/store';
import { rt } from '../ipc/client';
import { selectAggregateState } from '../state/aggregateState';
import { Orb } from '../components/Orb';
import { Waveform } from '../components/Waveform';
import { LanguagePair } from '../components/LanguagePair';
import { LatencyMeter } from '../components/LatencyMeter';
import { ActionButton } from '../components/ActionButton';
import { SettingsButton } from '../components/SettingsButton';

export function FloatingWidget(): JSX.Element {
  const {
    sourceLang, targetLang,
    selectedMic, selectedToMeet, selectedFromMeet, selectedHeadset,
    stateA, stateB, latencyMs,
    setDirectionState, setLatency, hydrate,
  } = useStore();

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

  const bar = selectAggregateState(stateA, stateB);
  const avgLatency = bar.kind === 'active'
    ? avgDefined(latencyMs.A, latencyMs.B)
    : undefined;

  const onAction = async (): Promise<void> => {
    if (bar.kind === 'idle') {
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
    } else if (bar.kind === 'error') {
      await rt.startTranslation({
        sourceLang, targetLang,
        micDeviceId: selectedMic ?? '',
        toMeetDeviceId: selectedToMeet ?? '',
        fromMeetDeviceId: selectedFromMeet ?? '',
        headsetDeviceId: selectedHeadset ?? '',
      });
    } else {
      await rt.stopTranslation();
    }
  };

  return (
    <div className={`rt-bar rt-bar--${bar.kind}`} role="status">
      <Orb state={bar.kind} />
      {bar.kind === 'active' && <Waveform />}
      {(bar.kind === 'idle' || bar.kind === 'active' || bar.kind === 'connecting') && (
        <LanguagePair
          source={sourceLang}
          target={targetLang}
          onClick={(): void => { void rt.openSetupView(); }}
        />
      )}
      {bar.kind === 'reconnecting' && (
        <span className="rt-status">
          Reconectando<span className="rt-status__attempt"> · {bar.origin}: tentativa {bar.attempt}</span>
        </span>
      )}
      {bar.kind === 'error' && (
        <span className="rt-status" title={bar.message}>
          {`${bar.origin}: ${truncate(bar.message, 28)}`}
        </span>
      )}
      <LatencyMeter ms={avgLatency} />
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
