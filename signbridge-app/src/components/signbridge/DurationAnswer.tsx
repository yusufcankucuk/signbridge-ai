"use client";
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFlow } from '../providers/FlowProvider';
import { Frame, Empty, CameraIcon } from './CompactUI';
import Button from '../ui/Button';
import {
  ANSWER_LABELS, ANSWER_NUMBERS, DURATION_NUMBER_CLASSES, durationAnswer, DURATION_QUICK_ANSWERS, DURATION_UNITS,
  DURATION_UNIT_AVATARS, QUESTION_AVATARS, answerAvatar, answerText, durationFromNumber, type DurationUnit,
  type AnswerContext,
} from '../../data/answers';
import { recordAnswer } from '../../lib/consultationFlow';
import { submitPatientAnswer } from '../../lib/sessionClient';

/** Soru ekranının üstü: soru avatarı + başlık + doktorun sorusu. */
export function QuestionHeader({ avatar, title, text, compact = false }: { avatar?: string; title: string; text?: string; compact?: boolean }) {
  return <div className={`answer-question ${compact ? 'is-compact' : ''}`}>
    {avatar && <Image src={avatar} alt="" width={compact ? 48 : 72} height={compact ? 48 : 72} priority />}
    <div className="min-w-0">
      <h1 className="compact-title">{title}</h1>
      {text && !compact && <p>{text}</p>}
    </div>
  </div>;
}

/** Kamera öncelikli soru ekranı: soru başlığı + dokunulabilir kamera alanı + iki eylem. */
export function CameraFirstQuestion({ avatar, title, text, hint, leaving, onCamera, onManual }: {
  avatar?: string; title: string; text: string; hint: string; leaving: boolean; onCamera: () => void; onManual: () => void;
}) {
  return <Frame footer={<>
    <Button size="xl" icon={<span className="h-6 w-6"><CameraIcon /></span>} disabled={leaving} onClick={onCamera}>İşaret diliyle yanıtla</Button>
    <Button variant="outline" onClick={onManual}>Seçerek yanıtla</Button>
  </>}>
    <QuestionHeader avatar={avatar} title={title} text={text} />
    <button type="button" className="compact-camera answer-camera-preview" onClick={onCamera} aria-label="Kamerayı aç ve işaret diliyle yanıtla">
      <CameraIcon /><span>{hint}</span>
    </button>
  </Frame>;
}

/**
 * Kamera/onay ekranındaki "Seçerek yanıtla" bağlantısı (?mode=manual) doğrudan seçenek görünümünü açar.
 * useSearchParams kullanılır: istemci içi geçişte window.location henüz güncellenmemiş olabilir.
 */
export function useModeParam(): string | null {
  return useSearchParams().get('mode');
}

export function UnitPicker({ value, onChange }: { value: string | null; onChange: (unit: DurationUnit) => void }) {
  return <div className="answer-units" role="group" aria-label="Süre birimi">
    {DURATION_UNITS.map(unit => <button key={unit} type="button" aria-pressed={value === unit} onClick={() => onChange(unit)}>
      <Image src={DURATION_UNIT_AVATARS[unit]} alt="" width={48} height={48} />
      <span>{unit.charAt(0).toLocaleUpperCase('tr') + unit.slice(1)}</span>
    </button>)}
  </div>;
}

/**
 * Avatarlar hastanın taklit edeceği işaret değil, anlamı gösteren görseldir: yalnız onay ve
 * seçim adımlarında çıkar, kamera kaydında gösterilmez.
 *
 * "Ne zamandır?" yanıt ekranı. Birincil yol kamera: hasta sayıyı işaretler, birimi onay
 * ekranında dokunarak seçer. "Seçerek yanıtla" aynı ekranda hazır seçeneklere geçer.
 */
export default function DurationAnswer() {
  const { state, setState } = useFlow(); const router = useRouter();
  const modeParam = useModeParam();
  const [mode, setMode] = useState<'camera' | 'manual'>(modeParam === 'manual' ? 'manual' : 'camera');
  const [quick, setQuick] = useState<string | null>(null);
  const [numberClass, setNumberClass] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [unit, setUnit] = useState<DurationUnit | null>(null);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [initialPending] = useState(state.pending);
  const pending = state.pending ?? (leaving ? initialPending : null);
  const ready = pending?.kind === 'duration';

  const number = typing ? Number.parseInt(typed, 10) : numberClass ? ANSWER_NUMBERS[numberClass] : NaN;
  const answer = quick ?? (unit ? durationFromNumber(number, unit) : '');

  const signAnswer = () => { setState(s => ({ ...s, capture: 'answer', candidate: null })); router.push('/camera'); };
  const send = async () => {
    if (!answer || !pending || leaving) return;
    setLeaving(true); setError('');
    try { await submitPatientAnswer(state.sessionId, pending.id, answer); }
    catch { setLeaving(false); setError('Yanıt doktora iletilemedi. Lütfen tekrar deneyin.'); return; }
    setState(s => recordAnswer(s, answer, 'manual'));
    router.push('/handoff/doctor');
  };
  const pickQuick = (label: string) => { setQuick(label); setNumberClass(null); setTyping(false); setUnit(null); };
  const pickNumber = (classId: string) => { setQuick(null); setTyping(false); setNumberClass(classId); };
  const pickUnit = (value: DurationUnit) => { setQuick(null); setUnit(value); };

  if (!pending) return <Frame><Empty text="Yanıt bekleyen soru yok." /></Frame>;
  if (!ready) return <Frame><Empty text="Diğer soruya devam edin." href={`/patient/${pending.kind}`} /></Frame>;

  if (mode === 'camera') return <CameraFirstQuestion avatar={QUESTION_AVATARS.duration} title="Ne zamandır?" text={pending.text}
    hint="Kaç gün, hafta, ay…? Sayıyı işaretleyin, birimi sonra seçeceksiniz" leaving={leaving} onCamera={signAnswer} onManual={() => setMode('manual')} />;

  const missing = !quick && !unit ? (Number.isFinite(number) ? 'Birimi seçin.' : 'Bir seçenek ya da sayı ve birim seçin.')
    : !quick && !Number.isFinite(number) ? 'Sayıyı seçin.' : !answer ? 'Geçerli bir sayı girin.' : '';
  return <Frame footer={<>
    <Button disabled={!answer || leaving} onClick={() => void send()}>Doktora ilet</Button>
    {missing && !leaving && <p className="text-center text-caption text-ink-muted">{missing}</p>}
    <div className="grid grid-cols-2">
      <button type="button" className="compact-link" onClick={() => setMode('camera')}>Kameraya dön</button>
      <button type="button" className="compact-link" aria-pressed={quick === 'Hatırlamıyorum'} onClick={() => pickQuick('Hatırlamıyorum')}>{quick === 'Hatırlamıyorum' ? '✓ ' : ''}Hatırlamıyorum</button>
    </div>
  </>}>
    <QuestionHeader avatar={QUESTION_AVATARS.duration} title="Ne zamandır?" compact />
    {error && <p className="compact-error" role="alert">{error}</p>}
    <div className="answer-scroll">
      <div className="answer-quick" role="group" aria-label="Hızlı yanıtlar">
        {DURATION_QUICK_ANSWERS.map(item => <button key={item.label} type="button" aria-pressed={quick === item.label} onClick={() => pickQuick(item.label)}>
          <Image src={item.avatar} alt="" width={64} height={64} /><span>{item.label}</span>
        </button>)}
      </div>
      <p className="answer-divider">ya da sayı ve birim</p>
      <div className="answer-numbers" role="group" aria-label="Sayı">
        {DURATION_NUMBER_CLASSES.map(classId => <button key={classId} type="button" aria-pressed={!typing && numberClass === classId} onClick={() => pickNumber(classId)} aria-label={`${ANSWER_NUMBERS[classId]}`}>
          <Image src={answerAvatar(classId)!} alt="" width={56} height={56} />
        </button>)}
      </div>
      {typing
        ? <label className="answer-typed">Sayı<input inputMode="numeric" pattern="[0-9]*" maxLength={3} autoFocus value={typed} onChange={e => { setQuick(null); setTyped(e.target.value.replace(/\D/g, '')); }} /></label>
        : <button type="button" className="answer-more" onClick={() => { setQuick(null); setNumberClass(null); setTyping(true); }}>Başka sayı yaz (11–29, 30’dan fazla)</button>}
      <UnitPicker value={quick ? null : unit} onChange={pickUnit} />
    </div>
    <div className="answer-summary" aria-live="polite"><span>Doktora gidecek</span><strong>{answer || '—'}</strong></div>
  </Frame>;
}

/**
 * Kamerayla tanınan yanıtın onayı: büyük avatar + "Doğru anladım mı?" + Evet / Hayır.
 * Alternatif aday gösterilmez; kaydırmasız tek ekran. Hayır → hasta tekrar işaretler.
 */
export function AnswerCheck({ classId, caption, lowConfidence, onYes, onNo, manualPath, error, busy = false }: {
  classId: string; caption: string | null; lowConfidence: boolean; onYes: () => void; onNo: () => void;
  manualPath: string; error: string; busy?: boolean;
}) {
  const avatar = answerAvatar(classId);
  return <Frame title="Doğru anladım mı?" footer={<>
    <div className="answer-yesno">
      <Button disabled={busy} onClick={onYes}>✓ Evet</Button>
      <Button variant="outline" disabled={busy} onClick={onNo}>✕ Hayır</Button>
    </div>
    <Link href={manualPath} className="compact-link">Seçerek yanıtla</Link>
  </>}>
    <div className="answer-hero is-large" aria-live="polite">
      {avatar && <Image src={avatar} alt="" width={220} height={220} priority />}
      <strong>{ANSWER_LABELS[classId]}</strong>
      {caption && <span>{caption}</span>}
    </div>
    {lowConfidence && <p className="rounded-xl border border-warning-100 bg-warning-50 px-4 py-3 text-center text-caption font-semibold text-warning-700" role="alert">Model bu işaretten emin değil.</p>}
    {error && <p className="compact-error" role="alert">{error}</p>}
  </Frame>;
}

/**
 * Kamerayla tanınan sayının onayı: önce "Doğru mu?" (Evet / Hayır), sonra birim seçimi.
 * Alternatif aday gösterilmez; iki adım da kaydırmasız tek ekrana sığar.
 */
export function DurationConfirm({ classId, lowConfidence, onRetry, manualPath, retryError }: {
  classId: string; lowConfidence: boolean; onRetry: () => void; manualPath: string; retryError: string;
}) {
  const { state, setState } = useFlow(); const router = useRouter();
  const [step, setStep] = useState<'check' | 'unit'>('check');
  const [unit, setUnit] = useState<DurationUnit | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const answer = unit ? durationAnswer(classId, unit) : '';
  const send = async () => {
    if (!answer || !state.pending || leaving) return;
    setLeaving(true); setError('');
    try { await submitPatientAnswer(state.sessionId, state.pending.id, answer); }
    catch { setLeaving(false); setError('Yanıt doktora iletilemedi. Lütfen tekrar deneyin.'); return; }
    setState(s => recordAnswer(s, answer, 'model'));
    router.push('/handoff/doctor');
  };
  const avatar = answerAvatar(classId);

  if (step === 'check') return <AnswerCheck classId={classId} caption={null} lowConfidence={lowConfidence} onYes={() => setStep('unit')}
    onNo={onRetry} manualPath={manualPath} error={error || retryError} />;

  return <Frame title="Ne kadar süredir?" footer={<>
    <Button disabled={!answer || leaving} onClick={() => void send()}>Doktora ilet</Button>
    <button type="button" className="compact-link" onClick={() => setStep('check')}>Geri</button>
  </>}>
    <div className="answer-unit-screen">
      <div className="answer-picked">
        {avatar && <Image src={avatar} alt="" width={72} height={72} />}
        <strong>{ANSWER_NUMBERS[classId]}</strong>
        <span>…ne?</span>
      </div>
      <div className="answer-units is-large" role="group" aria-label="Süre birimi">
        {DURATION_UNITS.map(item => <button key={item} type="button" aria-pressed={unit === item} onClick={() => setUnit(item)}>
          <Image src={DURATION_UNIT_AVATARS[item]} alt="" width={64} height={64} />
          <span>{item.charAt(0).toLocaleUpperCase('tr') + item.slice(1)}</span>
        </button>)}
      </div>
      <div className="answer-summary" aria-live="polite"><span>Doktora gidecek</span><strong>{answer || '—'}</strong></div>
      {error && <p className="compact-error" role="alert">{error}</p>}
    </div>
  </Frame>;
}

/**
 * Tek parçalı yanıtların (şiddet, yer) kamera onayı: avatar + Evet / Hayır.
 * Evet → yanıt doğrudan doktora iletilir; Hayır → hasta tekrar işaretler.
 */
export function SingleAnswerConfirm({ context, classId, lowConfidence, onRetry, manualPath, retryError }: {
  context: AnswerContext; classId: string; lowConfidence: boolean; onRetry: () => void; manualPath: string; retryError: string;
}) {
  const { state, setState } = useFlow(); const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const answer = answerText(context, classId);
  const send = async () => {
    if (!state.pending || leaving) return;
    setLeaving(true); setError('');
    try { await submitPatientAnswer(state.sessionId, state.pending.id, answer); }
    catch { setLeaving(false); setError('Yanıt doktora iletilemedi. Lütfen tekrar deneyin.'); return; }
    setState(s => recordAnswer(s, answer, 'model'));
    router.push('/handoff/doctor');
  };
  return <AnswerCheck classId={classId} caption={answer !== ANSWER_LABELS[classId] ? answer : null} lowConfidence={lowConfidence}
    onYes={() => void send()} onNo={onRetry} manualPath={manualPath} error={error || retryError} busy={leaving} />;
}
