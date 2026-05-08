import { useState, type JSX } from 'react';
import { useT } from '../../../../shared/i18n/I18nProvider';
import { rt } from '../../../ipc/client';
import { useStore } from '../../../state/store';
import { navigate } from '../shared/useHashRoute';

type TestStatus = 'idle' | 'running' | 'passed' | 'failed';
interface Result { status: TestStatus; reason?: string }

/**
 * Loads a bundled test WAV (24kHz mono PCM16) and returns 50ms PCM-only chunks
 * encoded as base64 — ready to feed straight to OpenAI's
 * `session.input_audio_buffer.append`.
 *
 * CRITICAL: relative path `./test/...`, not `/test/...`. The renderer loads
 * setup-view.html via `file://` in production where a leading `/` resolves to
 * the drive root, not the renderer's outDir. Same fix as Task 10's PNGs.
 */
async function loadTestWavAsPcmChunks(filename: string): Promise<string[]> {
  const url = `./test/${filename}`;
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  // Skip 44-byte WAV header, read raw PCM16 little-endian.
  const pcmBytes = new Uint8Array(arrayBuffer.slice(44));
  const samplesPerChunk = (24000 * 50) / 1000; // 50ms chunks → 1200 samples → 2400 bytes
  const chunkBytes = samplesPerChunk * 2;
  const chunks: string[] = [];
  for (let i = 0; i < pcmBytes.byteLength; i += chunkBytes) {
    const slice = pcmBytes.slice(i, Math.min(i + chunkBytes, pcmBytes.byteLength));
    let bin = '';
    for (let j = 0; j < slice.length; j++) {
      const byte = slice[j] ?? 0;
      bin += String.fromCharCode(byte);
    }
    chunks.push(btoa(bin));
  }
  return chunks;
}

export function Step6TestTranslation({ mode }: { mode?: 'edit' | undefined }): JSX.Element {
  const t = useT();
  const { selectedToMeet, selectedHeadset } = useStore();
  const [resA, setResA] = useState<Result>({ status: 'idle' });
  const [resB, setResB] = useState<Result>({ status: 'idle' });
  const [skipped, setSkipped] = useState(false);

  const runA = async (): Promise<void> => {
    setResA({ status: 'running' });
    try {
      if (!selectedToMeet) throw new Error('No selectedToMeet device');
      const chunks = await loadTestWavAsPcmChunks('test-pt.wav');
      await rt.testSessionStart({ direction: 'A', sourceLang: 'pt', targetLang: 'en' });

      const offTestAudio = rt.onTestAudio('A', (b64) => {
        void rt.testRoutePlayback({ direction: 'A', deviceId: selectedToMeet, base64: b64 });
      });

      for (const chunk of chunks) {
        await rt.testSessionInject({ direction: 'A', base64: chunk });
        await new Promise((r) => setTimeout(r, 50));
      }
      await rt.testSessionInputDone({ direction: 'A' });

      const inv = await rt.listDevices();
      const cableARecording = inv.cableA?.recording?.deviceId;
      if (!cableARecording) throw new Error('CABLE-A recording side not detected');

      const result = await rt.loopbackStart({
        deviceId: cableARecording,
        thresholdRms: 0.01,
        timeoutMs: 10000,
      });

      offTestAudio();
      await rt.testSessionStop({ direction: 'A' });

      if (result.detected) setResA({ status: 'passed' });
      else setResA({ status: 'failed', reason: 'No audio detected on CABLE-A Output' });
    } catch (e) {
      setResA({ status: 'failed', reason: (e as Error).message });
    }
  };

  const runB = async (): Promise<void> => {
    setResB({ status: 'running' });
    try {
      if (!selectedHeadset) throw new Error('No selectedHeadset device');
      const chunks = await loadTestWavAsPcmChunks('test-en.wav');
      await rt.testSessionStart({ direction: 'B', sourceLang: 'en', targetLang: 'pt' });

      const offTestAudio = rt.onTestAudio('B', (b64) => {
        void rt.testRoutePlayback({ direction: 'B', deviceId: selectedHeadset, base64: b64 });
      });

      for (const chunk of chunks) {
        await rt.testSessionInject({ direction: 'B', base64: chunk });
        await new Promise((r) => setTimeout(r, 50));
      }
      await rt.testSessionInputDone({ direction: 'B' });

      // Wait ~5s for translation to play.
      await new Promise((r) => setTimeout(r, 5000));

      offTestAudio();
      await rt.testSessionStop({ direction: 'B' });

      // window.confirm is the simplest path; UX-bad but plan-prescribed.
      // TODO(m5): replace with a custom in-wizard confirmation modal.
      const heard = window.confirm('Did you hear a phrase in Portuguese in your headphones?');
      if (heard) setResB({ status: 'passed' });
      else setResB({ status: 'failed', reason: 'User reported no audio heard' });
    } catch (e) {
      setResB({ status: 'failed', reason: (e as Error).message });
    }
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

      {skipped && !allPassed && (
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
