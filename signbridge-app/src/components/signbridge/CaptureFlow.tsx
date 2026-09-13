"use client";
import Link from "next/link";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFlow } from '../providers/FlowProvider';
import { Frame, Choice, Empty, Pager, ReadText, CameraIcon } from './CompactUI';
import Button from '../ui/Button';
import Logo from '../layout/Logo';
import ExpressionVisual from './ExpressionVisual';
import { EXPRESSIONS } from '../../data/expressions';
import { recordAnswer } from '../../lib/consultationFlow';
import { recognitionPreview } from '../../lib/recognitionPreview';

export function Home() {
  const { state, start } = useFlow();
  const router = useRouter();
  const [replace, setReplace] = useState(false);
  // Keep the landing screen unchanged while the camera route is opening.
  const [leaving, setLeaving] = useState<boolean | null>(null);
  const active = leaving ?? state.active;
  useEffect(() => { router.prefetch('/camera'); }, [router]);
  return <Frame home allowEmpty footer={<p className="compact-home-note">Görüşme bitince bilgiler cihazdan temizlenir.</p>}>
    {replace ? <div className="compact-center"><p>Yeni görüşme başlatılsın mı?</p><Button onClick={() => { start(); router.push('/camera'); }}>Yeni görüşme</Button><button className="compact-link" onClick={() => setReplace(false)}>Vazgeç</button></div> :
      <div className="compact-home">
        <div className="compact-home-logo"><Logo size={156} /></div>
        <h1>Sign<span>Bridge</span></h1>
        <p>Sağlıkta engelsiz iletişim</p>
        <Button size="xl" onClick={() => {
          if (leaving !== null) return;
          setLeaving(state.active);
          if (state.active) router.push(state.plan.approved ? '/patient/summary' : state.pending ? '/handoff/patient' : state.expression ? '/doctor/conversation' : '/camera');
          else { start(); router.push('/camera'); }
        }}>{active ? 'Devam et' : 'Başla'}</Button>
        {active && <button className="compact-link" onClick={() => setReplace(true)}>Yeni görüşme</button>}
      </div>}
  </Frame>;
}

export function Camera() {
  const { state } = useFlow();
  const alternative = state.capture === 'answer' ? `/patient/${state.pending?.kind || 'custom'}` : state.capture === 'followup' ? '/patient/question' : '/manual-select';
  return <Frame footer={<>
    <Button href="/recognition" className="compact-record" fullWidth={false} aria-label="Anlatımı başlat"><span aria-hidden="true">▶</span></Button>
    <div className="flex justify-between"><Link href={alternative} className="compact-link">Seçerek anlat</Link><Link href="/camera-help" className="compact-link">Yardım</Link></div>
  </>}>
    {state.capture === 'answer' && <p className="text-center font-semibold">{state.pending?.text}</p>}
    <div className="compact-camera"><CameraIcon /><span>Kamera alanı</span></div>
    <p className="text-center text-caption text-ink-muted">Elleriniz ve yüzünüz görünsün.</p>
  </Frame>;
}

export function CameraHelp() {
  return <Frame title="Kamera açılmadı" footer={<><Button href="/camera">Tekrar dene</Button><Button href="/manual-select" variant="outline">Seçerek devam et</Button></>}>
    <div className="compact-center"><div className="h-20 w-20 text-brand-600"><CameraIcon /></div><p>Kamera iznini kontrol edin.</p></div>
  </Frame>;
}

export function Recognition() {
  const { state, setState } = useFlow(); const router = useRouter();
  const [phase, setPhase] = useState<'recording' | 'processing'>('recording');
  useEffect(() => {
    if (phase !== 'processing' || !state.active) return;
    const timer = setTimeout(() => {
      const candidate = recognitionPreview(state.capture, state.pending?.kind);
      setState(s => ({ ...s, candidate }));
      router.replace(candidate ? '/confirm' : '/fallback');
    }, 450);
    return () => clearTimeout(timer);
  }, [phase, state.active, state.capture, state.pending?.kind, setState, router]);
  return <Frame footer={phase === 'recording' ? <>
    <button className="compact-record" onClick={() => setPhase('processing')} aria-label="Anlatımı bitir"><span className="h-6 w-6 rounded bg-white" /></button><p className="text-center font-semibold text-brand-700">Bitir</p>
  </> : undefined}>
    <div className="compact-camera"><CameraIcon /><span role="status">{phase === 'processing' ? 'Hazırlanıyor…' : 'Anlatımınızı tamamlayın'}</span></div>
  </Frame>;
}

export function Confirm() {
  const { state, setState } = useFlow(); const router = useRouter();
  // Onaydan sonra sayfa değişene kadar ekranı olduğu gibi tut; boş uyarı görünmesin.
  const [leaving, setLeaving] = useState(false);
  const [initialCandidate] = useState(state.candidate);
  const candidate = state.candidate ?? (leaving ? initialCandidate : null);
  const expression = EXPRESSIONS.find(e => e.sentence === candidate?.text);
  const confirm = () => {
    if (!state.candidate || leaving) return;
    setLeaving(true);
    setState(s => {
      if (!s.candidate) return s;
      if (s.capture === 'answer') return recordAnswer(s, s.candidate.text, s.candidate.source);
      if (s.capture === 'followup') return { ...s, patientQuestion: s.candidate.text, patientAnswer: '', candidate: null, understood: false };
      return { ...s, expression: s.candidate.text, reviewed: false, candidate: null, plan: { ...s.plan, approved: false }, understood: false };
    });
    router.push(state.capture === 'followup' ? '/handoff/doctor?next=answer' : '/handoff/doctor');
  };
  return <Frame title="Doğru anladım mı?" footer={candidate && <>
    <Button onClick={confirm}>Doğru, doktora ilet</Button>
    <div className="grid grid-cols-2"><Link href="/camera" className="compact-link">Tekrar anlat</Link><Link href="/manual-select" className="compact-link">Değiştir</Link></div>
  </>}>
    {!candidate ? <Empty text="Henüz bir anlatım yok." href="/camera" /> : <>
      {expression ? <><div className="compact-illustration"><div><ExpressionVisual expression={expression} /></div></div><p className="compact-sentence">{expression.sentence}</p></> : <div className="compact-center"><ReadText text={candidate.text} /></div>}
    </>}
  </Frame>;
}

export function ManualSelect() {
  const { state, setState } = useFlow(); const router = useRouter();
  const [text, setText] = useState(''); const [page, setPage] = useState(0);
  const [writing, setWriting] = useState(state.capture !== 'complaint');
  const send = (value: string) => { if (!value.trim()) return; setState(s => ({ ...s, candidate: { text: value.trim(), source: 'manual' } })); router.push('/confirm'); };
  return <Frame title={writing ? 'Ne anlatmak istersiniz?' : 'Şikayetinizi seçin'} footer={writing ? <><Button disabled={!text.trim()} onClick={() => send(text)}>Devam et</Button><button className="compact-link" onClick={() => state.capture === 'complaint' ? setWriting(false) : router.push('/camera')}>Geri</button></> :
    <><Pager index={page} total={Math.ceil(EXPRESSIONS.length / 4)} onChange={setPage} /><button className="compact-link" onClick={() => setWriting(true)}>Başka bir şey anlatacağım</button></>}>
    {writing ? <div className="compact-form flex-1 justify-center"><label>Anlatımınız<textarea rows={4} maxLength={500} value={text} onChange={e => setText(e.target.value)} /></label></div> :
      <div className="compact-grid my-auto">{EXPRESSIONS.slice(page * 4, page * 4 + 4).map(e => <Choice key={e.id} onClick={() => send(e.sentence)}><div className="compact-symptom-choice-art text-brand-600"><ExpressionVisual expression={e} /></div>{e.label}</Choice>)}</div>}
  </Frame>;
}

export function Fallback() {
  return <Frame title="Anlaşılamadı" footer={<><Button href="/camera">Tekrar anlat</Button><Button href="/manual-select" variant="outline">Seçerek anlat</Button></>}>
    <div className="compact-center"><div className="text-6xl font-light text-brand-600" aria-hidden="true">?</div><p>Tekrar deneyin veya seçin.</p></div>
  </Frame>;
}
