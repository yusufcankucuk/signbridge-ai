"use client";
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFlow } from '../providers/FlowProvider';
import { Frame, Empty, Choice } from './CompactUI';
import Button from '../ui/Button';
import { AnswerCheck, CameraFirstQuestion, QuestionHeader, useModeParam } from './DurationAnswer';
import { MEDICATION_GROUPS } from '../../data/regions';
import { MEDICATION_NONE, QUESTION_AVATARS, answerAvatar, medicationAnswer } from '../../data/answers';
import { recordAnswer, type Source } from '../../lib/consultationFlow';
import { submitPatientAnswer } from '../../lib/sessionClient';

type Stage = 'camera' | 'choice' | 'groups' | 'name';

/**
 * "İlaç kullanıyor musunuz?" yanıt ekranı. Birincil yol kamera (evet / hayır / ilaç).
 * "Hayır" doğrudan doktora gider; "Evet" ya da "İlaç" ilaç grubu seçimine geçer.
 */
export default function MedicationAnswer() {
  const { state, setState } = useFlow(); const router = useRouter();
  // ?mode=manual → Evet/Hayır seçimi; ?mode=groups → kamerada "Evet/İlaç" onaylandı, ilaç grubu seçilir.
  const modeParam = useModeParam();
  const [stage, setStage] = useState<Stage>(modeParam === 'groups' ? 'groups' : modeParam === 'manual' ? 'choice' : 'camera');
  const fromCamera = modeParam === 'groups';
  const [groups, setGroups] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [initialPending] = useState(state.pending);
  const pending = state.pending ?? (leaving ? initialPending : null);
  const ready = pending?.kind === 'medication';

  const signAnswer = () => { setState(s => ({ ...s, capture: 'answer', candidate: null })); router.push('/camera'); };
  const send = async (value: string, source: Source = fromCamera ? 'model' : 'manual') => {
    if (!value || !pending || leaving) return;
    setLeaving(true); setError('');
    try { await submitPatientAnswer(state.sessionId, pending.id, value); }
    catch { setLeaving(false); setError('Yanıt doktora iletilemedi. Lütfen tekrar deneyin.'); return; }
    setState(s => recordAnswer(s, value, source));
    router.push('/handoff/doctor');
  };
  const toggle = (label: string) => setGroups(current => current.includes(label) ? current.filter(v => v !== label) : [...current, label]);
  const answer = medicationAnswer(groups, other);

  if (!pending) return <Frame><Empty text="Yanıt bekleyen soru yok." /></Frame>;
  if (!ready) return <Frame><Empty text="Diğer soruya devam edin." href={`/patient/${pending.kind}`} /></Frame>;

  if (stage === 'camera') return <CameraFirstQuestion avatar={QUESTION_AVATARS.medication} title="İlaç kullanıyor musunuz?" text={pending.text}
    hint="Evet, hayır ya da ilaç işaretleyin" leaving={leaving} onCamera={signAnswer} onManual={() => setStage('choice')} />;

  if (stage === 'choice') return <Frame footer={<>
    <button type="button" className="compact-link" onClick={() => void send('Bilmiyorum', 'manual')}>Bilmiyorum</button>
    <button type="button" className="compact-link" onClick={() => setStage('camera')}>Kameraya dön</button>
  </>}>
    <QuestionHeader avatar={QUESTION_AVATARS.medication} title="İlaç kullanıyor musunuz?" compact />
    {error && <p className="compact-error" role="alert">{error}</p>}
    <div className="answer-yesno-cards" role="group" aria-label="İlaç kullanıyor musunuz?">
      <button type="button" disabled={leaving} onClick={() => setStage('groups')}>
        <Image src={answerAvatar('evet')!} alt="" width={120} height={120} /><span>Evet</span>
      </button>
      <button type="button" disabled={leaving} onClick={() => void send(MEDICATION_NONE, 'manual')}>
        <Image src={answerAvatar('hayir')!} alt="" width={120} height={120} /><span>Hayır</span>
      </button>
    </div>
  </Frame>;

  if (stage === 'name') return <Frame title="İlacın adı ne?" footer={<>
    <Button disabled={!answer || leaving} onClick={() => void send(answer)}>Doktora ilet</Button>
    <button type="button" className="compact-link" onClick={() => setStage('groups')}>Geri</button>
  </>}>
    {error && <p className="compact-error" role="alert">{error}</p>}
    <div className="compact-form my-auto"><label>İlacın adı<input maxLength={100} value={other} onChange={e => setOther(e.target.value)} /></label></div>
  </Frame>;

  const needsName = groups.includes('Başka bir ilaç');
  return <Frame footer={<>
    <Button disabled={!groups.length || leaving} onClick={() => needsName ? setStage('name') : void send(answer)}>{needsName ? 'Devam et' : 'Doktora ilet'}</Button>
    {!groups.length && !leaving && <p className="text-center text-caption text-ink-muted">En az bir ilaç grubu seçin.</p>}
    <div className="grid grid-cols-2">
      <button type="button" className="compact-link" onClick={() => setStage(fromCamera ? 'camera' : 'choice')}>Geri</button>
      <button type="button" className="compact-link" onClick={() => void send('İlaç kullanıyorum, adını bilmiyorum')}>Adını bilmiyorum</button>
    </div>
  </>}>
    <div className="answer-question is-compact">
      <Image src={answerAvatar('ilac')!} alt="" width={48} height={48} />
      <div className="min-w-0"><h1 className="compact-title">Hangi ilaçları kullanıyorsunuz?</h1></div>
    </div>
    {error && <p className="compact-error" role="alert">{error}</p>}
    <div className="compact-grid my-auto">{MEDICATION_GROUPS.map(g => <Choice key={g.id} selected={groups.includes(g.label)} onClick={() => toggle(g.label)}>{g.label}</Choice>)}</div>
  </Frame>;
}

/**
 * Kamerayla tanınan ilaç yanıtının onayı: avatar + Evet / Hayır.
 * "Hayır" işareti onaylanırsa doğrudan doktora gider; "Evet" / "İlaç" ilaç grubu seçimine geçer.
 */
export function MedicationConfirm({ classId, lowConfidence, onRetry, manualPath, retryError }: {
  classId: string; lowConfidence: boolean; onRetry: () => void; manualPath: string; retryError: string;
}) {
  const { state, setState } = useFlow(); const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const yes = async () => {
    if (!state.pending || leaving) return;
    if (classId !== 'hayir') { router.push('/patient/medication?mode=groups'); return; }
    setLeaving(true); setError('');
    try { await submitPatientAnswer(state.sessionId, state.pending.id, MEDICATION_NONE); }
    catch { setLeaving(false); setError('Yanıt doktora iletilemedi. Lütfen tekrar deneyin.'); return; }
    setState(s => recordAnswer(s, MEDICATION_NONE, 'model'));
    router.push('/handoff/doctor');
  };
  return <AnswerCheck classId={classId} caption={null} lowConfidence={lowConfidence}
    onYes={() => void yes()} onNo={onRetry} manualPath={manualPath} error={error || retryError} busy={leaving} />;
}
