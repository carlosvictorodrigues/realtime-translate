import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useStore } from '../state/store';
import { rt } from '../ipc/client';

export function M1TestRig(): JSX.Element {
  const {
    hasApiKey,
    apiKeyHint,
    devices,
    selectedMic,
    setHasApiKey,
    setApiKeyHint,
    setDevices,
    setSelectedMic,
  } = useStore();

  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    rt.hasApiKey().then(setHasApiKey);
    rt.getApiKeyHint().then(setApiKeyHint);
    rt.listDevices().then(setDevices);
    return undefined;
  }, [setHasApiKey, setApiKeyHint, setDevices]);

  const onSaveKey = async (): Promise<void> => {
    setError(undefined);
    if (!keyInput.startsWith('sk-')) {
      setError('Key must start with sk-');
      return;
    }
    await rt.setApiKey(keyInput);
    setHasApiKey(true);
    setApiKeyHint(keyInput.length > 4 ? keyInput.slice(-4) : undefined);
    setKeyInput('');
  };

  const onStart = async (): Promise<void> => {
    setError('Start button is wired in Task 7 (BidirectionalTestRig)');
  };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ marginBottom: 8 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-tertiary)',
          }}
        >
          M1 Test Rig
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Realtime Translate</h1>
      </header>

      <section>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>OpenAI API Key</label>
        {hasApiKey ? (
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-primary)',
              padding: '8px 10px',
              background: 'var(--surface)',
              borderRadius: 6,
              marginTop: 4,
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
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
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

      <section>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Microphone</label>
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

      <section>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Output (wired in Task 7)
        </label>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            padding: '7px 10px',
            background: 'var(--surface)',
            borderRadius: 6,
            marginTop: 4,
          }}
        >
          Bidirectional output selectors land in Task 7 (BidirectionalTestRig)
        </div>
      </section>

      <section style={{ marginTop: 8 }}>
        <button
          onClick={(): void => {
            void onStart();
          }}
          disabled={!hasApiKey}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 6,
            border: 0,
            background: 'var(--accent)',
            color: '#fff',
            opacity: !hasApiKey ? 0.5 : 1,
          }}
        >
          Start translation (PT → EN)
        </button>
      </section>

      <section style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        Status: <strong style={{ color: 'var(--text-primary)' }}>idle</strong>
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
  marginTop: 4,
};
