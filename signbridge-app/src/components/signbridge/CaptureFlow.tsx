"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFlow } from '../providers/FlowProvider';
import { Frame, Choice, Empty, Pager, ReadText, CameraIcon, SignIcon } from './CompactUI';
import Button from '../ui/Button';
import Logo from '../layout/Logo';
import ExpressionVisual from './ExpressionVisual';
import { EXPRESSIONS, alternativeExpressions, expressionForCandidate } from '../../data/expressions';
import { recordAnswer, type FlowState } from '../../lib/consultationFlow';
import { submitPatientAnswer } from '../../lib/sessionClient';
import { assessPoseQuality, prepareRecordedFrames, preprocessPoseSequence, type RawPoseFrame } from '../../lib/landmarkPreprocessing';
import { getHolisticLandmarker, resultToRawFrame } from '../../lib/browserVision';
import { isPredictionPayload } from '../../../lib/prediction';
import type { HolisticLandmarker } from '@mediapipe/tasks-vision';

// Kamera yolundan çıkılırken hastanın düşeceği manuel ekran, akışın bağlamına göre belirlenir.
// Yanıt modunda soru tipine ait hazır seçenek ekranı, ek soru modunda soru ekranı, aksi hâlde şikayet listesi.
export function manualPathFor(state: FlowState): string {
  if (state.capture === 'answer') return state.pending ? `/patient/${state.pending.kind}` : '/manual-select';
  if (state.capture === 'followup') return '/patient/question';
  return '/manual-select';
}

export function Home() {
  const { state, start } = useFlow();
  const router = useRouter();
  const [replace, setReplace] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  // Keep the landing screen unchanged while the camera route is opening.
  const [leaving, setLeaving] = useState<boolean | null>(null);
  const active = leaving ?? state.active;
  useEffect(() => { router.prefetch('/camera'); }, [router]);
  return <Frame home allowEmpty footer={<p className="compact-home-note">Görüşme bitince bilgiler cihazdan temizlenir.</p>}>
    {replace ? <div className="compact-center"><p>Yeni görüşme başlatılsın mı?</p><Button disabled={starting} onClick={async () => { setStarting(true); setError(''); try { await start(); router.push('/camera'); } catch { setError('Görüşme başlatılamadı. Lütfen tekrar deneyin.'); setStarting(false); } }}>Yeni görüşme</Button><button className="compact-link" onClick={() => setReplace(false)}>Vazgeç</button>{error && <p className="compact-error" role="alert">{error}</p>}</div> :
      <div className="compact-home">
        <div className="compact-home-logo"><Logo size={156} /></div>
        <h1>Sign<span>Bridge</span></h1>
        <p>Sağlıkta engelsiz iletişim</p>
        <Button size="xl" disabled={starting} onClick={async () => {
          if (leaving !== null) return;
          setLeaving(state.active);
          if (state.active) router.push(state.plan.approved ? '/patient/summary' : state.pending ? '/handoff/patient' : state.expression ? '/doctor/conversation' : '/camera');
          else { setStarting(true); setError(''); try { await start(); router.push('/camera'); } catch { setLeaving(null); setStarting(false); setError('Görüşme başlatılamadı. Lütfen tekrar deneyin.'); } }
        }}>{starting ? 'Hazırlanıyor…' : active ? 'Devam et' : 'Başla'}</Button>
        {error && <p className="compact-error" role="alert">{error}</p>}
        {active && <button className="compact-link" onClick={() => setReplace(true)}>Yeni görüşme</button>}
      </div>}
  </Frame>;
}

export function Camera() {
  const { state, setState } = useFlow();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HolisticLandmarker | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const framesRef = useRef<RawPoseFrame[]>([]);
  const startedAtRef = useRef(0);
  const finishingRef = useRef(false);
  const motionThresholdRef = useRef(0.12);
  const [phase, setPhase] = useState<'idle' | 'opening' | 'ready' | 'recording' | 'processing' | 'error'>('idle');
  const [message, setMessage] = useState('Kamera henüz açılmadı.');
  const [seconds, setSeconds] = useState(0);
  const [cameraWarning, setCameraWarning] = useState('');
  const alternative = manualPathFor(state);

  const stopCamera = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };
  useEffect(() => () => stopCamera(), []);

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setPhase('error'); setMessage('Bu tarayıcı kamera erişimini desteklemiyor.'); return; }
    setPhase('opening'); setMessage('Kamera ve işaret algılama modeli hazırlanıyor…');
    try {
      const statusResponse = await fetch('/api/ai/status', { cache: 'no-store' });
      const status = await statusResponse.json() as {
        cameraAiEnabled?: unknown;
        minimumMotionScore?: unknown;
        experimental?: unknown;
        warning?: unknown;
      };
      if (!statusResponse.ok || status.cameraAiEnabled !== true) {
        router.replace('/fallback?reason=policy_disabled');
        return;
      }
      if (typeof status.minimumMotionScore === 'number' && Number.isFinite(status.minimumMotionScore) && status.minimumMotionScore >= 0) {
        motionThresholdRef.current = status.minimumMotionScore;
      }
      setCameraWarning(status.experimental === true && typeof status.warning === 'string' ? status.warning : '');
      const [stream, landmarker] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false }),
        getHolisticLandmarker(),
      ]);
      streamRef.current = stream;
      landmarkerRef.current = landmarker;
      if (!videoRef.current) throw new Error('Video alanı bulunamadı.');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setPhase('ready'); setMessage('Hazır. Elleriniz ve omuzlarınız kadrajda olsun.');
    } catch {
      stopCamera(); setPhase('error'); setMessage('Kamera açılamadı. İzni ve tarayıcı ayarlarını kontrol edin.');
    }
  };

  const finishRecording = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setPhase('processing'); setMessage('Landmark verileri hazırlanıyor ve model çalıştırılıyor…');
    const frames = prepareRecordedFrames(framesRef.current);
    const quality = assessPoseQuality(frames, 0.1, 8, 0.6, 0.5, motionThresholdRef.current);
    if (quality.status !== 'approved') {
      setState(current => ({ ...current, candidate: null }));
      stopCamera();
      router.replace(`/fallback?reason=${encodeURIComponent(quality.reason)}`);
      return;
    }
    try {
      const input = preprocessPoseSequence(frames);
      const response = await fetch(`/api/consultations/${encodeURIComponent(state.sessionId)}/prediction`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...input,
          sessionId: state.sessionId,
          recognitionContext: state.capture === 'complaint' ? 'symptom' : 'general',
        }),
      });
      const body = await response.json() as { prediction?: unknown; error?: unknown };
      if (!response.ok || !isPredictionPayload(body.prediction)) throw new Error(typeof body.error === 'string' ? body.error : 'Tahmin alınamadı.');
      const prediction = body.prediction;
      stopCamera();
      if ((prediction.isLowConfidence && prediction.forcedCandidate !== true) || !prediction.classId) {
        setState(current => ({ ...current, candidate: null }));
        router.replace(`/fallback?reason=${encodeURIComponent(prediction.rejectionReason ?? 'low_score')}&advanced=1`);
      } else {
        setState(current => ({ ...current, candidate: { text: prediction.displayText, source: 'model', prediction } }));
        router.replace('/confirm');
      }
    } catch {
      // Hastaya teknik hata metni gösterilmez; kalite reddiyle aynı biçimde
      // anlaşılır bir mesaj ve tekrar/manuel seçim yoluna yönlendirilir.
      setState(current => ({ ...current, candidate: null }));
      stopCamera();
      router.replace('/fallback?reason=service_error');
    }
  };

  const startRecording = () => {
    if (!landmarkerRef.current || !videoRef.current || phase !== 'ready') return;
    finishingRef.current = false; framesRef.current = []; startedAtRef.current = performance.now(); setSeconds(0);
    setPhase('recording'); setMessage('İşaretinizi yapın. Bitirdiğinizde kırmızı düğmeye basın.');
    const capture = () => {
      const elapsed = performance.now() - startedAtRef.current;
      setSeconds(elapsed / 1000);
      if (elapsed >= 12_000 || framesRef.current.length >= 360) { void finishRecording(); return; }
      const video = videoRef.current; const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      try { framesRef.current.push(resultToRawFrame(landmarker.detectForVideo(video, performance.now()))); }
      catch { /* Tek kare hatası tüm kaydı iptal etmez. */ }
    };
    capture(); timerRef.current = setInterval(capture, 100);
  };

  const footer = <>
    {phase === 'idle' || phase === 'error' ? <Button onClick={openCamera}>Kamerayı aç</Button> :
      phase === 'opening' || phase === 'processing' ? <Button disabled>{phase === 'opening' ? 'Hazırlanıyor…' : 'İşleniyor…'}</Button> :
      phase === 'ready' ? <button className="compact-record" onClick={startRecording} aria-label="Anlatımı başlat"><span aria-hidden="true">▶</span></button> :
      <button className="compact-record is-recording" onClick={() => void finishRecording()} aria-label="Anlatımı bitir"><span className="h-6 w-6 rounded bg-white" /></button>}
    <div className="flex justify-between"><Link href={alternative} className="compact-link">{alternativeLabel}</Link><Link href="/camera-help" className="compact-link">Yardım</Link></div>
  </>;
  return <Frame footer={<>
    {footer}
  </>}>
    {state.capture === 'answer' && <p className="text-center font-semibold">{state.pending?.text}</p>}
    {cameraWarning && <p className="compact-card border-warning-100 bg-warning-50 text-center text-caption" role="note">{cameraWarning}</p>}
    <div className="compact-camera"><video ref={videoRef} playsInline muted aria-label="Canlı kamera önizlemesi" />{phase === 'idle' || phase === 'opening' || phase === 'error' ? <CameraIcon /> : null}<span role="status">{message}</span>{phase === 'recording' && <strong className="compact-camera-timer">{seconds.toFixed(1)} sn</strong>}</div>
    <p className="text-center text-caption text-ink-muted">Elleriniz ve iki omzunuz görünsün. Önerilen kayıt süresi 2–4 saniyedir.</p>
  </Frame>;
}

export function CameraHelp() {
  const { state } = useFlow();
  const manualPath = manualPathFor(state);
  const answering = state.capture === 'answer' && !!state.pending;
  return <Frame title="Kamera açılmadı" footer={<><Button href="/camera">Tekrar dene</Button><Button href={manualPath} variant="outline">{answering ? 'Seçerek yanıtla' : 'Seçerek devam et'}</Button></>}>
    <div className="compact-center"><div className="h-20 w-20 text-brand-600"><CameraIcon /></div>
      {answering && state.pending && <div className="compact-card w-full"><p className="text-caption text-ink-muted">Doktorun sorusu</p><ReadText text={state.pending.text} /></div>}
      <p>Kamera iznini kontrol edin.</p></div>
  </Frame>;
}

export function Recognition() {
  const router = useRouter();
  useEffect(() => { router.replace('/camera'); }, [router]);
  return <Frame><div className="compact-center"><p role="status">Kamera açılıyor…</p></div></Frame>;
}

export function Confirm() {
  const { state, setState } = useFlow(); const router = useRouter();
  // Onaydan sonra sayfa değişene kadar ekranı olduğu gibi tut; boş uyarı görünmesin.
  const [leaving, setLeaving] = useState(false);
  const [shownCandidate, setShownCandidate] = useState(state.candidate);
  const candidate = state.candidate ?? (leaving ? shownCandidate : null);
  const expression = expressionForCandidate(candidate);
  const alternatives = candidate?.source === 'model' && state.capture === 'complaint' ? alternativeExpressions(candidate.prediction) : [];
  const [error, setError] = useState('');
  const manualPath = manualPathFor(state);
  // Olası diğer avatarlardan biri seçilirse elle seçim gibi onaylanır (hasta yine "Doğru" der).
  const chooseAlternative = (text: string) => {
    if (leaving) return;
    const chosen = { text, source: 'manual' as const };
    setShownCandidate(chosen);
    setState(s => ({ ...s, candidate: chosen }));
  };
  const confirm = async () => {
    if (!state.candidate || leaving) return;
    setLeaving(true);
    setError('');
    try {
      if (state.capture === 'answer' && state.candidate.source === 'manual' && state.pending) {
        await submitPatientAnswer(state.sessionId, state.pending.id, state.candidate.text);
      } else {
        const body = state.candidate.source === 'manual' ? { confirmed: true, manualSelection: state.candidate.text } : { confirmed: true };
        const response = await fetch(`/api/consultations/${encodeURIComponent(state.sessionId)}/confirm`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Onay sunucuya iletilemedi.');
      }
    } catch (cause) {
      setLeaving(false); setError(cause instanceof Error ? cause.message : 'Onay iletilemedi.'); return;
    }
    setState(s => {
      if (!s.candidate) return s;
      if (s.capture === 'answer') return recordAnswer(s, s.candidate.text, s.candidate.source);
      if (s.capture === 'followup') return { ...s, patientQuestion: s.candidate.text, patientAnswer: '', candidate: null, understood: false };
      return { ...s, expression: s.candidate.text, reviewed: false, candidate: null, plan: { ...s.plan, approved: false }, understood: false };
    });
    router.push(state.capture === 'followup' ? '/handoff/doctor?next=answer' : '/handoff/doctor');
  };
  const retry = async () => {
    if (leaving) return;
    setLeaving(true); setError('');
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(state.sessionId)}/confirm`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: false }),
      });
      if (!response.ok) throw new Error('Yeni deneme başlatılamadı.');
      setState(current => ({ ...current, candidate: null }));
      router.push('/camera');
    } catch (cause) { setLeaving(false); setError(cause instanceof Error ? cause.message : 'Yeni deneme başlatılamadı.'); }
  };
  // Düşük güvenli bir model önerisinde birincil eylem onay olamaz: hasta tek dokunuşla
  // yanlış bir ifadeyi tıbbi kayda sokabiliyordu. Bu durumda manuel seçim öne alınır.
  const lowConfidence = candidate?.source === 'model' && candidate.prediction?.isLowConfidence === true;
  return <Frame title="Doğru anladım mı?" footer={candidate && (lowConfidence ? <>
    <Button href={manualPath}>{manualLabelFor(state)}</Button>
    <div className="grid grid-cols-2"><button type="button" onClick={retry} className="compact-link">Tekrar anlat</button><button type="button" onClick={confirm} className="compact-link">Yine de doktora ilet</button></div>
  </> : <>
    <Button onClick={confirm}>Doğru, doktora ilet</Button>
    <div className="grid grid-cols-2"><button type="button" onClick={retry} className="compact-link">Tekrar anlat</button><Link href={manualPath} className="compact-link">Değiştir</Link></div>

    {!candidate ? <Empty text="Henüz bir anlatım yok." href="/camera" /> : <>
      {expression ? <><div className="compact-illustration"><div><ExpressionVisual expression={expression} /></div></div><p className="compact-sentence">{expression.sentence}</p></> : <><div className="compact-illustration"><div><SignIcon /></div></div><div className="compact-center"><ReadText text={candidate.text} /></div></>}
      {expression?.urgent && <p className="rounded-xl border border-warning-100 bg-warning-50 px-4 py-3 text-center text-caption font-semibold text-warning-700" role="alert">Acil olabilir. {candidate.prediction ? 'Bu, deneysel bir kamera önerisidir; ' : ''}belirtiler şiddetliyse hemen sağlık personeline haber verin veya 112’yi arayın.</p>}
      {lowConfidence && <p className="rounded-xl border border-warning-100 bg-warning-50 px-4 py-3 text-center text-caption font-semibold text-warning-700" role="alert">Model bu işaretten emin değil. Doğru olduğundan emin değilseniz listeden seçin.</p>}
      {alternatives.length > 0 && <div className="compact-alternatives" role="group" aria-label="Diğer olası belirtiler">
        <p>Başka bir şey mi anlattınız?</p>
        <div>{alternatives.map(item => <button key={item.id} type="button" onClick={() => chooseAlternative(item.sentence)} aria-label={`${item.label}: bunu seç`}>
          <span className="compact-alternative-art" aria-hidden="true"><ExpressionVisual expression={item} /></span><span>{item.label}</span>
        </button>)}</div>
      </div>}
      {candidate.prediction?.confidence != null && <p className="text-center text-caption text-ink-muted">Model skoru: %{(candidate.prediction.confidence * 100).toFixed(1)}{candidate.prediction.forcedCandidate ? ' · Düşük güvenli deneysel öneri' : ''} · Hasta onayı gereklidir.</p>}
      {error && <p className="compact-error" role="alert">{error}</p>}
    </>}
  </Frame>;
}

export function ManualSelect() {
  const { state, setState } = useFlow(); const router = useRouter();
  const [text, setText] = useState(''); const [page, setPage] = useState(0);
  const [writing, setWriting] = useState(state.capture !== 'complaint');
  const pending = state.capture === 'answer' ? state.pending : null;
  const send = (value: string) => { if (!value.trim()) return; setState(s => ({ ...s, candidate: { text: value.trim(), source: 'manual' } })); router.push('/confirm'); };
  return <Frame title={writing ? (pending ? 'Doktorun sorusu' : 'Ne anlatmak istersiniz?') : 'Şikayetinizi seçin'} footer={writing ? <><Button disabled={!text.trim()} onClick={() => send(text)}>Devam et</Button>{!text.trim() && <p className="text-center text-caption text-ink-muted">{pending ? 'Devam etmek için yanıtınızı yazın.' : 'Devam etmek için anlatımınızı yazın.'}</p>}<button className="compact-link" onClick={() => state.capture === 'complaint' ? setWriting(false) : router.push('/camera')}>Geri</button></> :
    <><Pager index={page} total={Math.ceil(EXPRESSIONS.length / 4)} onChange={setPage} /><button className="compact-link" onClick={() => setWriting(true)}>Başka bir şey anlatacağım</button></>}>
    {writing ? <div className="compact-form flex-1 justify-center">
      {pending && <div className="compact-card"><ReadText text={pending.text} /></div>}
      <label>{pending ? 'Yanıtınız' : 'Anlatımınız'}<textarea rows={4} maxLength={500} value={text} onChange={e => setText(e.target.value)} /></label>
      {pending && pending.kind !== 'custom' && <Link href={`/patient/${pending.kind}`} className="compact-link">Hazır yanıtlardan seçin</Link>}
    </div> :
      <div className="compact-grid my-auto">{EXPRESSIONS.slice(page * 4, page * 4 + 4).map(e => <Choice key={e.id} onClick={() => send(e.sentence)}><div className="compact-symptom-choice-art text-brand-600"><ExpressionVisual expression={e} /></div>{e.label}</Choice>)}</div>}
  </Frame>;
}

export function Fallback() {
  const { state, setState } = useFlow(); const router = useRouter();
  const query = useSearchParams();
  const reason = query.get('reason');
  const requiresServerReset = query.get('advanced') === '1';
  const manualPath = manualPathFor(state);
  const detail = reason?.includes('shoulder') ? 'İki omuz yeterince görünmedi.' : reason?.includes('hand') ? 'Eller yeterince görünmedi.' : reason?.includes('insufficient_motion') ? 'Yeterli hareket algılanmadı. İşareti yeniden yapın veya listeden seçin.' : reason === 'ambiguous_prediction' ? 'İki olası işaret birbirine çok yakındı.' : reason === 'unsupported_class' ? 'Bu işaret güvenli demo kapsamının dışında.' : reason === 'policy_disabled' ? 'Kamera tahmini güvenlik politikası nedeniyle kapalı.' : reason === 'service_error' ? 'Kamera hizmetine şu an ulaşılamıyor. Listeden seçim yaparak devam edebilirsiniz.' : reason === 'invalid_or_non_finite_frame' ? 'Kamera görüntüsü güvenli biçimde işlenemedi.' : reason === 'too_few_frames' ? 'Kayıt çok kısa sürdü.' : 'Model güvenli bir öneri üretemedi.';
  const retry = async () => {
    if (!requiresServerReset) {
      setState(current => ({ ...current, candidate: null }));
      router.push('/camera');
      return;
    }
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(state.sessionId)}/confirm`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: false }),
      });
      if (!response.ok) throw new Error();
      setState(current => ({ ...current, candidate: null })); router.push('/camera');
    } catch { router.push(manualPath); }
  };
  const answering = state.capture === 'answer' && !!state.pending;
  const hasChoices = answering && state.pending?.kind !== 'custom';
  const manualLabel = !answering ? 'Seçerek anlat' : hasChoices ? 'Seçerek yanıtla' : 'Yazarak yanıtla';
  const manualHint = !answering ? 'Tekrar deneyin veya listeden seçin.' : hasChoices ? 'Tekrar deneyin veya hazır yanıtlardan seçin.' : 'Tekrar deneyin veya yanıtınızı yazın.';
  return <Frame title="Anlaşılamadı" footer={<><Button onClick={retry}>Tekrar anlat</Button><Button href={manualPath} variant="outline">{manualLabel}</Button></>}>
    <div className="compact-center"><div className="text-6xl font-light text-brand-600" aria-hidden="true">?</div>{answering && state.pending && <div className="compact-card w-full"><p className="text-caption text-ink-muted">Doktorun sorusu</p><ReadText text={state.pending.text} /></div>}<p>{detail}</p><p className="text-caption text-ink-muted">{manualHint}</p></div>
  </Frame>;
}
