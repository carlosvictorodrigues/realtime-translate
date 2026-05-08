import { useEffect, useState, type JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { rt } from '../../../ipc/client';
import { navigate } from '../shared/useHashRoute';

export function Step2ApiKey({ mode }: { mode?: 'edit' | undefined }): JSX.Element {
  const t = useT();
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [hint, setHint] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [howToOpen, setHowToOpen] = useState(false);

  useEffect(() => {
    rt.hasApiKey().then(setHasKey).catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[step2] hasApiKey failed', e);
    });
    rt.getApiKeyHint().then(setHint).catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[step2] getApiKeyHint failed', e);
    });
  }, []);

  const goNext = (): void => {
    navigate(mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 3 });
  };

  const onSave = async (): Promise<void> => {
    setError(undefined);
    if (!keyInput.startsWith('sk-')) {
      setError(t('setup.key.invalidPrefix'));
      return;
    }
    try {
      await rt.setApiKey(keyInput);
      setHasKey(true);
      setHint(keyInput.slice(-4));
      setKeyInput('');
      goNext();
    } catch (e) {
      setError(t('setup.key.saveError', { message: (e as Error).message }));
    }
  };

  return (
    <>
      <div className="setup-step-meta">{t('setup.stepLabel', { n: 2, total: 6 })} — {t('setup.key.label')}</div>
      <h1 className="setup-heading">{t('setup.key.heading')}</h1>
      <p className="setup-sub">{t('setup.key.sub')}</p>

      {hasKey ? (
        <div style={{ marginBottom: 16, padding: 12, background: 'rgba(74,222,128,0.08)', borderRadius: 6, fontSize: 13 }}>
          {t('setup.key.savedHint', { last4: hint ?? '●●●●' })}
        </div>
      ) : (
        <input
          className="setup-input"
          type="password"
          value={keyInput}
          onChange={(e): void => setKeyInput(e.target.value)}
          placeholder={t('setup.key.placeholder')}
        />
      )}

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={(): void => {
            void rt.openExternalUrl('https://platform.openai.com/api-keys');
          }}
          style={{
            color: 'var(--accent)',
            fontSize: 13,
            background: 'transparent',
            border: 0,
            padding: 0,
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'inherit',
          }}
        >
          {t('setup.key.signupLink')}
        </button>
      </div>

      <details style={{ marginTop: 16 }} open={howToOpen} onToggle={(e): void => setHowToOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          {t('setup.key.howToToggle')}
        </summary>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
          1. {t('setup.key.howToStep1')}<br />
          2. {t('setup.key.howToStep2')}<br />
          3. {t('setup.key.howToStep3')}
        </div>
      </details>

      {error && <div style={{ color: 'var(--error)', fontSize: 12, marginTop: 12 }}>{error}</div>}

      <div className="setup-footer">
        <button
          className="btn btn-ghost"
          onClick={(): void => navigate(mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 1 })}
        >
          {t('common.back')}
        </button>
        <button
          className="btn btn-primary"
          onClick={(): void => { void (hasKey && !keyInput ? goNext() : onSave()); }}
          disabled={!hasKey && !keyInput}
        >
          {mode === 'edit' ? t('common.saveAndBack') : t('common.next')}
        </button>
      </div>
    </>
  );
}
