import type { JSX } from 'react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { rt } from '../ipc/client';
import { LANGUAGES, type LanguageCode } from '../../shared/languages';
import type { SessionState } from '../../shared/types';

export function BidirectionalTestRig(): JSX.Element {
  const {
    hasApiKey,
    apiKeyHint,
    devices,
    sourceLang,
    targetLang,
    selectedMic,
    selectedToMeet,
    selectedFromMeet,
    selectedHeadset,
    stateA,
    stateB,
    setHasApiKey,
    setApiKeyHint,
    setDevices,
    setSourceLang,
    setTargetLang,
    setSelectedMic,
    setSelectedToMeet,
    setSelectedFromMeet,
    setSelectedHeadset,
    setDirectionState,
  } = useStore();

  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    rt.hasApiKey().then(setHasApiKey);
    rt.getApiKeyHint().then(setApiKeyHint);
    rt.listDevices().then((d) => {
      setDevices(d);
      // Auto-select cable A and B if detected.
      if (d.cableA?.playback && !selectedToMeet) setSelectedToMeet(d.cableA.playback.deviceId);
      if (d.cableB?.recording && !selectedFromMeet)
        setSelectedFromMeet(d.cableB.recording.deviceId);
    });
    const off = rt.onDirectionalState(({ direction, state }) =>
      setDirectionState(direction, state),
    );
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSaveKey = async (): Promise<void> => {
    setError(undefined);
    if (!keyInput.startsWith('sk-')) {
      setError('Key must start with sk-');
      return;
    }
    try {
      await rt.setApiKey(keyInput);
    } catch (e) {
      setError(`Could not save key: ${(e as Error).message}`);
      return;
    }
    setHasApiKey(true);
    setApiKeyHint(keyInput.length > 4 ? keyInput.slice(-4) : undefined);
    setKeyInput('');
  };

  const onStart = async (): Promise<void> => {
    setError(undefined);
    if (!selectedMic || !selectedToMeet || !selectedFromMeet || !selectedHeadset) {
      setError('Pick all four devices: mic, to-meet, from-meet, headset');
      return;
    }
    try {
      await rt.startTranslation({
        sourceLang,
        targetLang,
        micDeviceId: selectedMic,
        toMeetDeviceId: selectedToMeet,
        fromMeetDeviceId: selectedFromMeet,
        headsetDeviceId: selectedHeadset,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onStop = async (): Promise<void> => {
    setError(undefined);
    try {
      await rt.stopTranslation();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const isAnyActive = stateA.kind === 'active' || stateB.kind === 'active';
  const isConnecting = stateA.kind === 'connecting' || stateB.kind === 'connecting';

  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)' };
  const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ marginBottom: 4 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-tertiary)',
          }}
        >
          M2 Bidirectional
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Realtime Translate</h1>
      </header>

      <ConnectionBanner stateA={stateA} stateB={stateB} />

      <section style={sectionStyle}>
        <label style={labelStyle}>OpenAI API Key</label>
        {hasApiKey ? (
          <div
            style={{
              fontSize: 13,
              padding: '8px 10px',
              background: 'var(--surface)',
              borderRadius: 6,
            }}
          >
            ●●●●●●●●{apiKeyHint ?? '••••'}{' '}
            <button
              onClick={(): void => {
                void (async (): Promise<void> => {
                  await rt.clearApiKey();
                  setHasApiKey(false);
                  setApiKeyHint(undefined);
                })();
              }}
              style={{
                marginLeft: 8,
                fontSize: 11,
                background: 'none',
                color: 'var(--text-tertiary)',
                border: 0,
              }}
            >
              clear
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={keyInput}
              onChange={(e): void => setKeyInput(e.target.value)}
              placeholder="sk-proj-..."
              style={{
                flex: 1,
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                padding: '7px 10px',
                fontFamily: 'inherit',
                fontSize: 13,
              }}
            />
            <button
              onClick={(): void => {
                void onSaveKey();
              }}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 0,
                borderRadius: 6,
                padding: '7px 14px',
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              Save
            </button>
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <label style={labelStyle}>Languages (you ↔ them)</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={sourceLang}
            onChange={(e): void => setSourceLang(e.target.value as LanguageCode)}
            style={selectStyle}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <span style={{ color: 'var(--text-tertiary)' }}>↔</span>
          <select
            value={targetLang}
            onChange={(e): void => setTargetLang(e.target.value as LanguageCode)}
            style={selectStyle}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section style={sectionStyle}>
        <label style={labelStyle}>Microphone (you speak)</label>
        <select
          value={selectedMic ?? ''}
          onChange={(e): void => setSelectedMic(e.target.value)}
          style={selectStyle}
        >
          <option value="">— select —</option>
          {devices?.inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </section>

      <section style={sectionStyle}>
        <label style={labelStyle}>To Meet (CABLE-A Input — Direction A output)</label>
        <select
          value={selectedToMeet ?? ''}
          onChange={(e): void => setSelectedToMeet(e.target.value)}
          style={selectStyle}
        >
          <option value="">— select —</option>
          {devices?.cableA?.playback && (
            <option value={devices.cableA.playback.deviceId}>
              {devices.cableA.playback.label} (recommended)
            </option>
          )}
          {devices?.outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </section>

      <section style={sectionStyle}>
        <label style={labelStyle}>From Meet (CABLE-B Output — Direction B input)</label>
        <select
          value={selectedFromMeet ?? ''}
          onChange={(e): void => setSelectedFromMeet(e.target.value)}
          style={selectStyle}
        >
          <option value="">— select —</option>
          {devices?.cableB?.recording && (
            <option value={devices.cableB.recording.deviceId}>
              {devices.cableB.recording.label} (recommended)
            </option>
          )}
          {devices?.inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </section>

      <section style={sectionStyle}>
        <label style={labelStyle}>Headset (you hear translation)</label>
        <select
          value={selectedHeadset ?? ''}
          onChange={(e): void => setSelectedHeadset(e.target.value)}
          style={selectStyle}
        >
          <option value="">— select —</option>
          {devices?.outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </section>

      <section style={{ marginTop: 4 }}>
        <button
          onClick={(): void => {
            void (isAnyActive ? onStop() : onStart());
          }}
          disabled={!hasApiKey || isConnecting}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 6,
            border: 0,
            background: isAnyActive ? 'transparent' : 'var(--accent)',
            color: isAnyActive ? 'var(--text-primary)' : '#fff',
            outline: isAnyActive ? '1px solid var(--border-default)' : undefined,
            opacity: !hasApiKey || isConnecting ? 0.5 : 1,
          }}
        >
          {isAnyActive ? 'Stop' : isConnecting ? 'Connecting…' : 'Start translation'}
        </button>
      </section>

      <section style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        <div>
          A ({sourceLang} → {targetLang}):{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{stateA.kind}</strong>
          {stateA.kind === 'error' && (
            <span style={{ color: 'var(--error)' }}> — {stateA.message}</span>
          )}
        </div>
        <div>
          B ({targetLang} → {sourceLang}):{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{stateB.kind}</strong>
          {stateB.kind === 'error' && (
            <span style={{ color: 'var(--error)' }}> — {stateB.message}</span>
          )}
        </div>
      </section>

      {error && <div style={{ color: 'var(--error)', fontSize: 12 }}>{error}</div>}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
};

/**
 * Surfaces non-active session states (reconnecting / error) with a banner
 * loud enough that the user notices a brief drop. Spec §7 requires this
 * because real-time translation has no fallback — silence is meaningless
 * unless the user knows the cause.
 */
function ConnectionBanner({
  stateA,
  stateB,
}: {
  stateA: SessionState;
  stateB: SessionState;
}): JSX.Element | null {
  const hasError = stateA.kind === 'error' || stateB.kind === 'error';
  const isReconnecting = stateA.kind === 'reconnecting' || stateB.kind === 'reconnecting';
  if (!hasError && !isReconnecting) return null;

  const color = hasError ? 'var(--error)' : 'var(--warning)';
  const bg = hasError ? 'rgba(248, 113, 113, 0.12)' : 'rgba(245, 158, 11, 0.12)';
  const border = hasError ? 'rgba(248, 113, 113, 0.32)' : 'rgba(245, 158, 11, 0.32)';
  const headline = hasError ? 'Erro de conexão' : 'Conexão instável — reconectando';

  const describe = (s: SessionState, label: string): string | undefined => {
    if (s.kind === 'reconnecting') return `${label}: tentativa ${s.attempt}`;
    if (s.kind === 'error') return `${label}: ${s.message}`;
    return undefined;
  };
  const lines = [describe(stateA, 'A'), describe(stateB, 'B')].filter(
    (x): x is string => x !== undefined,
  );

  return (
    <div
      role="alert"
      style={{
        padding: '10px 12px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 6,
        fontSize: 12,
        color,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
        {headline}
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ paddingLeft: 14, color: 'var(--text-secondary)' }}>
          {l}
        </div>
      ))}
    </div>
  );
}
