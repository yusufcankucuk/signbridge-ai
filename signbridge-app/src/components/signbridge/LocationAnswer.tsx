"use client";
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFlow } from '../providers/FlowProvider';
import { Frame, Empty } from './CompactUI';
import Button from '../ui/Button';
import { CameraFirstQuestion, QuestionHeader, useModeParam } from './DurationAnswer';
import {
  ANSWER_LABELS, LOCATION_DIRECTIONS, LOCATION_REGIONS, QUESTION_AVATARS, answerAvatar, locationAnswer,
} from '../../data/answers';
import { recordAnswer } from '../../lib/consultationFlow';
import { submitPatientAnswer } from '../../lib/sessionClient';

/**
 * "Nereniz ağrıyor?" yanıt ekranı. Birincil yol kamera (17 vücut bölgesi + ön/arka/yukarı/aşağı);
 * onayı Evet / Hayır ile `SingleAnswerConfirm` yapar. "Seçerek yanıtla" bölge avatarları + isteğe bağlı yön.
 */
export default function LocationAnswer() {
  const { state, setState } = useFlow(); const router = useRouter();
  const modeParam = useModeParam();
  const [mode, setMode] = useState<'camera' | 'manual'>(modeParam === 'manual' ? 'manual' : 'camera');
  const [region, setRegion] = useState<string | null>(null);
  const [direction, setDirection] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [initialPending] = useState(state.pending);
  const pending = state.pending ?? (leaving ? initialPending : null);
  const ready = pending?.kind === 'location';
  const answer = region ? locationAnswer(region, direction) : '';

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

  if (mode === 'camera') return <CameraFirstQuestion avatar={QUESTION_AVATARS.location} title="Nereniz ağrıyor?" text={pending.text}
    hint="Ağrıyan yeri işaretleyin: baş, karın, sırt, diz…" leaving={leaving} onCamera={signAnswer} onManual={() => setMode('manual')} />;

  return <Frame footer={<>
    <Button disabled={!answer || leaving} onClick={() => void send()}>Doktora ilet</Button>
    {!answer && !leaving && <p className="text-center text-caption text-ink-muted">Ağrıyan yeri seçin.</p>}
    <button type="button" className="compact-link" onClick={() => setMode('camera')}>Kameraya dön</button>
  </>}>
    <QuestionHeader avatar={QUESTION_AVATARS.location} title="Nereniz ağrıyor?" compact />
    {error && <p className="compact-error" role="alert">{error}</p>}
    <div className="answer-scroll">
      <div className="answer-regions" role="group" aria-label="Vücut bölgesi">
        {LOCATION_REGIONS.map(classId => <button key={classId} type="button" aria-pressed={region === classId} onClick={() => setRegion(classId)}>
          <Image src={answerAvatar(classId)!} alt="" width={56} height={56} /><span>{ANSWER_LABELS[classId]}</span>
        </button>)}
      </div>
      <p className="answer-divider">isterseniz yön</p>
      <div className="answer-regions" role="group" aria-label="Yön (isteğe bağlı)">
        {LOCATION_DIRECTIONS.map(classId => <button key={classId} type="button" aria-pressed={direction === classId}
          onClick={() => setDirection(current => current === classId ? null : classId)}>
          <Image src={answerAvatar(classId)!} alt="" width={56} height={56} /><span>{ANSWER_LABELS[classId]}</span>
        </button>)}
      </div>
    </div>
    <div className="answer-summary" aria-live="polite"><span>Doktora gidecek</span><strong>{answer || '—'}</strong></div>
  </Frame>;
}
