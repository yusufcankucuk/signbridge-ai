"use client";
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFlow } from '../providers/FlowProvider';
import { Frame, Empty } from './CompactUI';
import Button from '../ui/Button';
import { CameraFirstQuestion, QuestionHeader, useModeParam } from './DurationAnswer';
import { INTENSITY_MOODS, INTENSITY_SCALE, QUESTION_AVATARS, intensityScaleAnswer } from '../../data/answers';
import { recordAnswer } from '../../lib/consultationFlow';
import { submitPatientAnswer } from '../../lib/sessionClient';

/**
 * "Ne kadar şiddetli?" yanıt ekranı. Birincil yol kamera (1–5, az/hafif/çok/ağır, iyi/kötü);
 * "Seçerek yanıtla" 5 basamaklı ölçek + İyi/Kötü gösterir. Avatarlar yalnız seçim ve onayda çıkar.
 */
export default function IntensityAnswer() {
  const { state, setState } = useFlow(); const router = useRouter();
  const modeParam = useModeParam();
  const [mode, setMode] = useState<'camera' | 'manual'>(modeParam === 'manual' ? 'manual' : 'camera');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [initialPending] = useState(state.pending);
  const pending = state.pending ?? (leaving ? initialPending : null);
  const ready = pending?.kind === 'intensity';

  const signAnswer = () => { setState(s => ({ ...s, capture: 'answer', candidate: null })); router.push('/camera'); };
  const send = async () => {
    if (!answer || !pending || leaving) return;
    setLeaving(true); setError('');
    try { await submitPatientAnswer(state.sessionId, pending.id, answer); }
    catch { setLeaving(false); setError('Yanıt doktora iletilemedi. Lütfen tekrar deneyin.'); return; }
    setState(s => recordAnswer(s, answer, 'manual'));
    router.push('/handoff/doctor');
  };

  if (!pending) return <Frame><Empty text="Yanıt bekleyen soru yok." /></Frame>;
  if (!ready) return <Frame><Empty text="Diğer soruya devam edin." href={`/patient/${pending.kind}`} /></Frame>;

  if (mode === 'camera') return <CameraFirstQuestion avatar={QUESTION_AVATARS.intensity} title="Ne kadar şiddetli?" text={pending.text}
    hint="1–5 arası bir sayı ya da az, hafif, çok, ağır işaretleyin" leaving={leaving} onCamera={signAnswer} onManual={() => setMode('manual')} />;

  return <Frame footer={<>
    <Button disabled={!answer || leaving} onClick={() => void send()}>Doktora ilet</Button>
    {!answer && !leaving && <p className="text-center text-caption text-ink-muted">Size uygun olanı seçin.</p>}
    <button type="button" className="compact-link" onClick={() => setMode('camera')}>Kameraya dön</button>
  </>}>
    <QuestionHeader avatar={QUESTION_AVATARS.intensity} title="Ne kadar şiddetli?" compact />
    {error && <p className="compact-error" role="alert">{error}</p>}
    <div className="answer-scroll">
      <div className="answer-scale" role="group" aria-label="Şiddet derecesi, 1 en hafif, 5 en ağır">
        {INTENSITY_SCALE.map(step => {
          const value = intensityScaleAnswer(step.value, step.label);
          return <button key={step.value} type="button" aria-pressed={answer === value} aria-label={value} onClick={() => setAnswer(value)}>
            <Image src={step.avatar} alt="" width={56} height={56} />
            <strong>{step.value}</strong><span>{step.label}</span>
          </button>;
        })}
      </div>
      <div className="flex justify-between text-caption text-ink-muted" aria-hidden="true"><span>En hafif</span><span>En ağır</span></div>
      <p className="answer-divider">ya da genel durum</p>
      <div className="answer-quick answer-moods" role="group" aria-label="Genel durum">
        {INTENSITY_MOODS.map(item => <button key={item.label} type="button" aria-pressed={answer === item.label} onClick={() => setAnswer(item.label)}>
          <Image src={item.avatar} alt="" width={64} height={64} /><span>{item.label}</span>
        </button>)}
      </div>
    </div>
    <div className="answer-summary" aria-live="polite"><span>Doktora gidecek</span><strong>{answer || '—'}</strong></div>
  </Frame>;
}
