import { useState, type JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { rt } from '../../../ipc/client';
import { navigate } from '../shared/useHashRoute';

type TestStatus = 'idle' | 'running' | 'passed' | 'failed';
interface Result { status: TestStatus; reason?: string }

export function Step6TestTranslation({ mode }: { mode?: 'edit' | undefined }): JSX.Element {
  const t = useT();
  const [resA, setResA] = useState<Result>({ status: 'idle' });
  const [resB, setResB] = useState<Result>({ status: 'idle' });
  const [skipped, setSkipped] = useState(false);

  // Backend wired in Task 12. For now: stub that "passes" instantly so the UI flow can be exercised.
  const runA = async (): Promise<void> => {
    setResA({ status: 'running' });
    // TODO(task-12): replace with real test (TestSessionRegistry + WAV injection + loopback validation)
    await new Promise((r) => setTimeout(r, 500));
    setResA({ status: 'passed' });
  };
  const runB = async (): Promise<void> => {
    setResB({ status: 'running' });
    // TODO(task-12): replace with real test
    await new Promise((r) => setTimeout(r, 500));
    setResB({ status: 'passed' });
  };

  const back = (): void => {
    navigate(mode === 'edit' ? { kind: 'review' } : { kind: 'wizard', step: 5 });
  };

  const concluir = async (): Promise<void> => {
    if (mode === 'edit') {
      navigate({ kind: 'review' });
      return;
    }
    await rt.markSetupComplete();
  };

  const allPassed = resA.status === 'passed' && resB.status === 'passed';
  const canFinish = allPassed || skipped;

  return (
    <>
      <div className="setup-step-meta">{t('setup.stepLabel', { n: 6, total: 6 })} — {t('setup.test.label')}</div>
      <h1 className="setup-heading">{t('setup.test.heading')}</h1>
      <p className="setup-sub">{t('setup.test.sub')}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <TestCard
          name={t('setup.test.directionA')}
          explain={t('setup.test.directionAExplain')}
          buttonLabel={t('setup.test.runTestA')}
          result={resA}
          onRun={runA}
        />
        <TestCard
          name={t('setup.test.directionB')}
          explain={t('setup.test.directionBExplain')}
          buttonLabel={t('setup.test.runTestB')}
          result={resB}
          onRun={runB}
        />
      </div>

      {skipped && (
        <div style={{ padding: 10, background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', borderRadius: 6, fontSize: 12, marginBottom: 16 }}>
          {t('setup.test.skipWarning')}
        </div>
      )}

      <div className="setup-footer">
        <button className="btn btn-ghost" onClick={back}>{t('common.back')}</button>
        <div style={{ display: 'flex', gap: 8 }}>
          {!allPassed && !skipped && (
            <button className="btn btn-ghost" onClick={(): void => setSkipped(true)}>
              {t('setup.test.skip')}
            </button>
          )}
          <button className="btn btn-primary" disabled={!canFinish} onClick={(): void => { void concluir(); }}>
            {mode === 'edit' ? t('common.close') : t('setup.test.finish')}
          </button>
        </div>
      </div>
    </>
  );
}

function TestCard({
  name, explain, buttonLabel, result, onRun,
}: {
  name: string;
  explain: string;
  buttonLabel: string;
  result: Result;
  onRun: () => Promise<void>;
}): JSX.Element {
  const t = useT();
  return (
    <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{name}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.4 }}>{explain}</div>
      {result.status === 'idle' && (
        <button className="btn btn-secondary" onClick={(): void => { void onRun(); }}>{buttonLabel}</button>
      )}
      {result.status === 'running' && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('setup.test.running')}</div>
      )}
      {result.status === 'passed' && (
        <div style={{ fontSize: 12, color: 'var(--success)' }}>{t('setup.test.passed')}</div>
      )}
      {result.status === 'failed' && (
        <div style={{ fontSize: 12, color: 'var(--error)' }}>{t('setup.test.failed', { reason: result.reason ?? '' })}</div>
      )}
    </div>
  );
}
