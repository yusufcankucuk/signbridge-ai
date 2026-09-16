"use client";
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { HolisticLandmarker } from '@mediapipe/tasks-vision';
import ExpressionVisual from './ExpressionVisual';
import { EXPRESSIONS, expressionForCandidate } from '../../data/expressions';
import { assessPoseQuality, preprocessPoseSequence, type QualityResult, type RawPoseFrame } from '../../lib/landmarkPreprocessing';
import { getHolisticLandmarker, resultToRawFrame } from '../../lib/browserVision';
import { isPredictionPayload } from '../../../lib/prediction';
import {
  buildTrialPlan, normalizeParticipant, summarizeTrials, toCsv, trialRow, trialTargetsFor, type PlannedTrial, type TrialRow,
} from '../../lib/cameraTrials';

/**
 * Kamera deneme ekranı: servis sözlüğüne göre 11 veya 15 belirti × tekrar sayısı.
 * Canlı akışla aynı çıkarıcı, kalite kapısı ve `recognitionContext=symptom` isteği kullanılır.
 * Görüntü veya landmark saklanmaz; yalnız deneme sonuç satırları CSV olarak indirilir.
 */

const now = () => performance.now();
type Phase = 'idle' | 'opening' | 'ready' | 'countdown' | 'recording' | 'processing' | 'answer' | 'error';

interface Pending {
  row: TrialRow;
  quality: QualityResult;
  text: string | null;
}

export function CameraTrials() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HolisticLandmarker | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const framesRef = useRef<RawPoseFrame[]>([]);
  const startedAtRef = useRef(0);
  const motionThresholdRef = useRef(0.12);
  const [participant, setParticipant] = useState('yunus');
  const [repeats, setRepeats] = useState(5);
  const [duration, setDuration] = useState(3);
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [exported, setExported] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('Kamerayı açın.');
  const [countdown, setCountdown] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [status, setStatus] = useState<{ modelVersion?: string | null; vocabularyVersion?: string | null; cameraAiEnabled?: boolean; versionMismatch?: boolean } | null>(null);

  const code = normalizeParticipant(participant);
  const targets = useMemo(() => trialTargetsFor(status?.vocabularyVersion), [status?.vocabularyVersion]);
  const plan = useMemo<PlannedTrial[]>(() => (code ? buildTrialPlan(code, repeats, targets) : []), [code, repeats, targets]);
  const trial = plan[index];
  const target = trial ? EXPRESSIONS.find(item => item.id === trial.target.expressionId) : undefined;
  const summary = useMemo(() => summarizeTrials(rows, plan.length, targets), [rows, plan.length, targets]);
  const unsaved = rows.length - exported;
  const started = rows.length > 0 || phase === 'answer';

  const clearTimer = () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; };
  useEffect(() => {
    const timer = timerRef; const stream = streamRef;
    return () => {
      if (timer.current) clearInterval(timer.current);
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);
  useEffect(() => {
    if (unsaved <= 0) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setPhase('error'); setMessage('Bu tarayıcı kamera erişimini desteklemiyor.'); return; }
    setPhase('opening'); setMessage('Kamera ve işaret algılama modeli hazırlanıyor…');
    try {
      const body = await (await fetch('/api/ai/status', { cache: 'no-store' })).json() as {
        minimumMotionScore?: unknown; modelVersion?: string | null; vocabularyVersion?: string | null;
        cameraAiEnabled?: boolean; versionMismatch?: boolean;
      };
      setStatus(body);
      if (typeof body.minimumMotionScore === 'number' && Number.isFinite(body.minimumMotionScore) && body.minimumMotionScore >= 0) {
        motionThresholdRef.current = body.minimumMotionScore;
      }
      const [stream, landmarker] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false }),
        getHolisticLandmarker(),
      ]);
      streamRef.current = stream; landmarkerRef.current = landmarker;
      if (!videoRef.current) throw new Error('Video alanı yok.');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setPhase('ready'); setMessage('Hazır. Elleriniz ve iki omzunuz kadrajda olsun.');
    } catch {
      clearTimer(); streamRef.current?.getTracks().forEach(track => track.stop());
      setPhase('error'); setMessage('Kamera açılamadı. İzni ve tarayıcı ayarlarını kontrol edin.');
    }
  };

  const finish = async (current: PlannedTrial, currentAttempt: number) => {
    clearTimer();
    setPhase('processing'); setMessage('Tahmin alınıyor…');
    const frames = framesRef.current;
    const durationMs = now() - startedAtRef.current;
    const recordedAt = new Date();
    const quality = assessPoseQuality(frames, 0.1, 8, 0.6, 0.5, motionThresholdRef.current);
    const base = { trial: current, attempt: currentAttempt, recordedAt, frames: frames.length, durationMs, quality };
    if (quality.status !== 'approved') {
      // Kalite kapısını geçmeyen kayıt için aday üretilmez; deneme aynı hedefle tekrarlanır.
      setRows(list => [...list, trialRow(base)]);
      setAttempt(value => value + 1);
      setPhase('ready'); setMessage(`Kayıt reddedildi (${quality.reason}). Aynı denemeyi tekrar yapın.`);
      return;
    }
    const started = now();
    try {
      const response = await fetch('/api/ai/predict', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...preprocessPoseSequence(frames), recognitionContext: 'symptom' }),
      });
      const body = await response.json() as unknown;
      const latencyMs = now() - started;
      if (!response.ok || !isPredictionPayload(body)) {
        const error = typeof (body as { error?: unknown })?.error === 'string' ? String((body as { error: string }).error) : 'Tahmin alınamadı.';
        setPending({ row: trialRow({ ...base, latencyMs, error }), quality, text: null });
      } else {
        const text = body.classId ? body.displayText : null;
        const shown = text ? expressionForCandidate({ text, prediction: body })?.id ?? null : null;
        setPending({ row: trialRow({ ...base, prediction: body, shownAvatar: shown, latencyMs }), quality, text });
      }
    } catch {
      setPending({ row: trialRow({ ...base, error: 'Servise ulaşılamadı.' }), quality, text: null });
    }
    setPhase('answer'); setMessage('Sonucu değerlendirin.');
  };

  const begin = () => {
    if (!trial || !landmarkerRef.current || !videoRef.current) return;
    const current = trial; const currentAttempt = attempt;
    setPhase('countdown');
    let remaining = 3; setCountdown(remaining); setMessage('Eller aşağıda, hazırlanın…');
    timerRef.current = setInterval(() => {
      remaining -= 1; setCountdown(remaining);
      if (remaining > 0) return;
      clearTimer();
      const video = videoRef.current; const landmarker = landmarkerRef.current;
      if (!video || !landmarker) return;
      framesRef.current = []; startedAtRef.current = now();
      setPhase('recording'); setMessage('İşareti şimdi yapın…');
      const capture = () => {
        if (now() - startedAtRef.current >= duration * 1000) { void finish(current, currentAttempt); return; }
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
        try { framesRef.current.push(resultToRawFrame(landmarker.detectForVideo(video, now()))); }
        catch { /* Tek kare hatası denemeyi iptal etmez. */ }
      };
      capture(); timerRef.current = setInterval(capture, 100);
    }, 700);
  };

  const answer = (confirmed: boolean) => {
    if (!pending) return;
    setRows(list => [...list, { ...pending.row, user_confirmed: confirmed }]);
    setPending(null);
    setIndex(value => value + 1);
    setAttempt(1);
    setPhase('ready'); setMessage('Hazır.');
  };

  const download = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `symptom-camera-trials-${code || 'katilimci'}-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(rows.length);
  };

  const shownExpression = pending?.row.shown_avatar ? EXPRESSIONS.find(item => item.id === pending.row.shown_avatar) : undefined;
  const busy = phase === 'countdown' || phase === 'recording' || phase === 'processing' || phase === 'opening';

  return <div className="min-h-[100dvh] bg-surface-canvas px-4 py-6 text-ink sm:px-8">
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Belirti kamera denemeleri</h1>
          <p className="text-caption text-ink-muted">{targets.length} belirti × {repeats} tekrar. Sonuçlar eğitim veya eşik ayarı için kullanılmaz; yalnız CSV olarak indirilir.</p>
          {status && <p className="text-caption text-ink-muted">Model: <code>{status.modelVersion ?? '—'}</code> · Sözlük: <code>{status.vocabularyVersion ?? '—'}</code>{status.versionMismatch ? ' · SÜRÜM UYUMSUZ' : ''}{status.cameraAiEnabled === false ? ' · kamera tahmini kapalı' : ''}</p>}
        </div>
        <Link href="/" className="compact-link">Uygulamaya dön</Link>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-3">
          <div className="compact-camera" style={{ minHeight: 360 }}>
            <video ref={videoRef} playsInline muted aria-label="Canlı kamera önizlemesi" />
            <span role="status">{phase === 'countdown' ? `${countdown}…` : message}</span>
            {phase === 'recording' && <strong className="compact-camera-timer">● KAYIT</strong>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {phase === 'idle' || phase === 'error' || phase === 'opening'
              ? <button className="rounded-lg bg-brand-500 px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={phase === 'opening' || !code} onClick={openCamera}>{phase === 'opening' ? 'Hazırlanıyor…' : 'Kamerayı aç'}</button>
              : <button className="rounded-lg bg-brand-500 px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={busy || phase === 'answer' || !trial} onClick={begin}>{trial ? `Denemeyi başlat (${index + 1}/${plan.length})` : 'Tüm denemeler bitti'}</button>}
          </div>

          {pending && <div className="compact-card flex flex-col gap-3" role="region" aria-label="Deneme sonucu">
            <strong>Model sonucu</strong>
            {pending.text ? <div className="flex items-center gap-4">
              {shownExpression && <div className="h-24 w-24 shrink-0 text-brand-600"><ExpressionVisual expression={shownExpression} /></div>}
              <div>
                <p className="text-lg font-semibold">{pending.text}</p>
                <p className="text-caption text-ink-muted">sınıf <code>{String(pending.row.predicted_class_id)}</code> → avatar <code>{String(pending.row.shown_avatar ?? '—')}</code> · skor {pending.row.confidence == null ? '—' : Number(pending.row.confidence).toFixed(3)}{pending.row.forced_candidate ? ' · düşük güvenli deneysel öneri' : ''}</p>
                <p className="text-caption text-ink-muted">İlk üç: {[pending.row.top1, pending.row.top2, pending.row.top3].filter(Boolean).join(', ')} · gecikme {String(pending.row.latency_ms)} ms · hareket {Number(pending.row.motion_score).toFixed(2)}</p>
              </div>
            </div> : <p>Aday üretilmedi: {String(pending.row.display_text ?? pending.row.rejection_reason ?? '')}</p>}
            <p className="font-semibold">Hasta onayı: Bu, yapmak istediğiniz işaret mi?</p>
            <div className="flex gap-3">
              <button className="rounded-lg bg-brand-500 px-4 py-2 font-semibold text-white" onClick={() => answer(true)}>Evet, doğru</button>
              <button className="rounded-lg border border-line-strong px-4 py-2 font-semibold" onClick={() => answer(false)}>Hayır</button>
            </div>
          </div>}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="compact-card grid grid-cols-3 gap-3 text-caption">
            <label className="flex flex-col gap-1">Katılımcı<input className="rounded border border-line px-2 py-1" value={participant} disabled={started} onChange={event => setParticipant(event.target.value)} /></label>
            <label className="flex flex-col gap-1">Tekrar<input type="number" min={1} max={10} className="rounded border border-line px-2 py-1" value={repeats} disabled={started} onChange={event => setRepeats(Math.max(1, Math.min(10, Number(event.target.value) || 5)))} /></label>
            <label className="flex flex-col gap-1">Süre (sn)<input type="number" min={2} max={6} step={0.5} className="rounded border border-line px-2 py-1" value={duration} disabled={busy} onChange={event => setDuration(Math.max(2, Math.min(6, Number(event.target.value) || 3)))} /></label>
          </div>

          {trial && target && <div className="compact-card flex flex-col gap-2">
            <p className="text-caption text-ink-muted">Deneme {index + 1}/{plan.length} · tekrar {trial.repeat} · girişim {attempt}</p>
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 shrink-0 text-brand-600"><ExpressionVisual expression={target} /></div>
              <div><strong>{target.label}</strong><p className="text-caption">“{target.sentence}”</p></div>
            </div>
            {trial.target.referenceVideo
              ? <><video key={trial.target.referenceVideo} src={`/reference/meb/${trial.target.referenceVideo}`} className="max-h-48 w-full rounded-lg bg-black object-contain" autoPlay loop muted playsInline controls />
                <p className="text-caption text-ink-muted">Referans video yoksa: <code>node scripts/copy-meb-references.mjs &lt;MEB klasörü&gt;</code></p></>
              : <p className="text-caption text-ink-muted">Bu belirti için MEB referansı yok; eğitimde kullanılan harici sözlük videosundaki biçimi uygulayın.</p>}
          </div>}

          <div className="compact-card flex flex-col gap-2 text-caption">
            <p>Tamamlanan: <strong>{summary.completed}/{summary.planned}</strong> · doğru: <strong>{summary.correct}</strong> · kalite reddi: {summary.qualityRejected} · doğru tanınan belirti: <strong>{summary.classesWithCorrect}/{targets.length}</strong></p>
            <table className="w-full text-left">
              <thead><tr><th>Belirti</th><th>Deneme</th><th>Doğru</th></tr></thead>
              <tbody>{Object.entries(summary.perClass).map(([id, item]) => <tr key={id}><td>{EXPRESSIONS.find(e => e.id === id)?.label ?? id}</td><td>{item.trials}</td><td>{item.correct}</td></tr>)}</tbody>
            </table>
            <button className="rounded-lg bg-ink px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={!rows.length || busy} onClick={download}>CSV indir ({rows.length} satır)</button>
            {unsaved > 0 && <p className="text-warning-700">{unsaved} satır henüz indirilmedi.</p>}
            <p className="text-ink-muted">Özet rapor: <code>python -m src.summarize_symptom_trials &lt;csv&gt;</code></p>
          </div>
        </aside>
      </section>
    </div>
  </div>;
}
