"use client";
import Link from "next/link";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFlow } from '../providers/FlowProvider';
import { Frame, Empty, textPages } from './CompactUI';
import Button from '../ui/Button';
import { localDateValue, planErrors, type Plan, type Medication, type Turn } from '../../lib/consultationFlow';
import { submitTreatmentPlan } from '../../lib/sessionClient';
import { DiagnosisVisual, MedicineVisual, AdviceVisual, CalendarVisual, MedRowIcon } from './PlanVisuals';

type SlideVisual = 'diagnosis' | 'medicine' | 'advice' | 'date';
type SlideDate = { day: string; month: string; year: string; weekday: string };
type Slide = { title: string; text?: string; rows?: [string, string, string][]; visual?: SlideVisual; date?: SlideDate; medIndex?: number };
type Step = 'diagnosis' | 'medicine' | 'usage' | 'advice' | 'followup' | 'review';

function followupParts(value: string): SlideDate | undefined {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return {
    day: date.toLocaleDateString('tr-TR', { day: 'numeric' }),
    month: date.toLocaleDateString('tr-TR', { month: 'long' }),
    year: date.toLocaleDateString('tr-TR', { year: 'numeric' }),
    weekday: date.toLocaleDateString('tr-TR', { weekday: 'long' }),
  };
}

export function planSlides(plan: Plan): Slide[] {
  const slides: Slide[] = [];
  for (const text of textPages(plan.diagnosis + '\n\n' + plan.explanation)) slides.push({ title: 'Doktorun yazdıkları', text, visual: 'diagnosis' });
  if (!plan.noMedication) plan.medications.forEach((m, i) => {
    const rows: [string, string, string][] = [['İlaç', m.name, 'name'], ['Doz', m.dose, 'dose'], ['Sıklık', m.frequency, 'frequency'], ['Yemek / Kullanım', m.meal, 'meal'], ['Süre', m.duration, 'duration']];
    if (rows.some(row => row[1].length > 38)) {
      rows.forEach(([label, value, icon]) => textPages(value, 150).forEach(text => slides.push({ title: `İlaç ${i + 1} • ${label}`, rows: [[label, text, icon]], visual: 'medicine', medIndex: i })));
    } else if (rows.some(row => row[1].length > 28) || rows.reduce((sum, row) => sum + row[1].length, 0) > 95) {
      slides.push({ title: `İlaç ${i + 1}`, rows: rows.slice(0, 3), visual: 'medicine', medIndex: i });
      slides.push({ title: `İlaç ${i + 1} • Kullanım`, rows: rows.slice(3), visual: 'medicine', medIndex: i });
    } else slides.push({ title: plan.diagnosis.length <= 38 ? plan.diagnosis : `İlaç ${i + 1}`, rows, visual: 'medicine', medIndex: i });
  });
  if (plan.noMedication || plan.advice) textPages(plan.advice || 'İlaç yazılmadı.').forEach(text => slides.push({ title: plan.noMedication ? 'İlaçsız tedavi' : 'Dikkat edeceklerim', text, visual: 'advice' }));
  const parts = plan.noFollowup ? undefined : followupParts(plan.followupDate);
  slides.push({ title: 'Kontrol tarihi', visual: 'date', date: parts, text: parts ? `${parts.day} ${parts.month} ${parts.year}, ${parts.weekday}` : 'Kontrol tarihi planlanmadı.' });
  return slides;
}

export function summarySlides(expression: string, turns: Turn[], plan: Plan): Slide[] {
  const slides: Slide[] = [{ title: 'Onaylanan şikâyet', text: expression, visual: 'diagnosis' }];
  turns.forEach((turn, index) => slides.push({
    title: `Soru ve yanıt ${index + 1}`,
    text: `Doktor: ${turn.text}\n\nHasta: ${turn.answer}`,
    visual: 'diagnosis',
  }));
  return [...slides, ...planSlides(plan)];
}

function SlideArt({ slide }: { slide: Slide }) {
  return <span className="art">{slide.visual === 'medicine' ? <MedicineVisual /> :
    slide.visual === 'advice' ? <AdviceVisual /> :
    slide.visual === 'date' ? <CalendarVisual {...(slide.date ?? {})} /> : <DiagnosisVisual />}</span>;
}

function SlideCard({ slide }: { slide: Slide }) {
  return slide.rows ? <div className="compact-medication my-auto"><div className="diagnosis"><SlideArt slide={slide} /><div className="min-w-0"><p>Tedavim</p><h2>{slide.title}</h2></div></div><dl>{slide.rows.map(([label, value, icon]) => <div key={label}><span className="med-icon" aria-hidden="true"><MedRowIcon name={icon} /></span><div className="min-w-0"><dt>{label}</dt><dd>{value}</dd></div></div>)}</dl></div> :
    <div className="compact-plan-slide my-auto"><SlideArt slide={slide} /><h2>{slide.title}</h2><p className="compact-read-text">{slide.text}</p></div>;
}
export function PlanCards({ plan }: { plan: Plan }) {
  return <div>{planSlides(plan).map((slide, index) => <section key={index} className="mb-4"><SlideCard slide={slide} /></section>)}</div>;
}
function SlideNavigation({ page, total, onBack }: { page: number; total: number; onBack: () => void }) {
  return <div className="compact-pager"><button onClick={onBack} disabled={page === 0}>‹ Geri</button><span aria-live="polite">{page + 1} / {total}</span><span className="w-14" /></div>;
}

export function Treatment() {
  const { state, setState } = useFlow(); const router = useRouter(); const plan = state.plan;
  const [step, setStep] = useState<Step>('diagnosis');
  const [medicineIndex, setMedicineIndex] = useState(0); const [page, setPage] = useState(0); const [error, setError] = useState('');
  const [medicationDone, setMedicationDone] = useState(false); const [saving, setSaving] = useState(false);
  const current = plan.medications[medicineIndex];
  const update = (patch: Partial<Plan>) => setState(s => ({ ...s, plan: { ...s.plan, ...patch, approved: false }, understood: false }));
  const updateMedicine = (key: keyof Medication, value: string) => update({ medications: plan.medications.map((m, index) => index === medicineIndex ? { ...m, [key]: value } : m) });
  const addMedicine = () => { update({ noMedication: false, medications: [...plan.medications, { id: crypto.randomUUID(), name: '', dose: '', frequency: '', meal: '', duration: '' }] }); setMedicineIndex(plan.medications.length); setMedicationDone(false); setStep('medicine'); setError(''); };
  const go = (next: Step) => { setStep(next); setError(''); };
  // Önizlemede "Düzenle", sihirbazı baştan açmak yerine o slayta karşılık gelen adımı açar.
  const editSlide = (slide: Slide) => {
    if (slide.visual === 'medicine') { setMedicineIndex(slide.medIndex ?? 0); setMedicationDone(false); go('medicine'); return; }
    if (slide.visual === 'advice') { go('advice'); return; }
    if (slide.visual === 'date') { go('followup'); return; }
    go('diagnosis');
  };
  const next = () => {
    if (step === 'diagnosis') {
      if (!plan.diagnosis.trim() || !plan.explanation.trim()) { setError('Tanı ve açıklamayı tamamlayın.'); return; }
      go('medicine');
    } else if (step === 'medicine') {
      if (plan.noMedication || medicationDone) { go('advice'); return; }
      if (!current?.name.trim() || !current.dose.trim()) { setError('İlaç adını ve dozu yazın.'); return; }
      go('usage');
    } else if (step === 'usage') {
      if (!current || ![current.frequency, current.meal, current.duration].every(v => v.trim())) { setError('Kullanım bilgilerini tamamlayın.'); return; }
      if (medicineIndex < plan.medications.length - 1) { setMedicineIndex(medicineIndex + 1); go('medicine'); }
      else { setMedicationDone(true); go('medicine'); }
    } else if (step === 'advice') {
      if (plan.noMedication && !plan.advice.trim()) { setError('İlaçsız tedaviyi açıklayın.'); return; }
      go('followup');
    } else if (step === 'followup') {
      const errors = planErrors(plan);
      if (errors.length) { setError(errors[0]); return; }
      setPage(0); go('review');
    }
  };
  const back = () => {
    if (step === 'usage') go('medicine');
    else if (step === 'medicine') { setMedicationDone(false); go('diagnosis'); }
    else if (step === 'advice') go('medicine');
    else if (step === 'followup') go('advice');
    else if (step === 'review') go('followup');
    else router.push('/doctor/conversation');
  };
  const valid = state.reviewed && !state.pending;
  const slides = planSlides(plan); const slide = slides[Math.min(page, slides.length - 1)];
  const titles = { diagnosis: 'Görüşme sonucu', medicine: 'İlaç', usage: 'Nasıl kullanılacak?', advice: 'Ek açıklama', followup: 'Kontrol tarihi', review: 'Hastaya gösterilecekler' };
  return <Frame title={titles[step]} role="doktor" footer={valid && <>
    {error && <p className="compact-error" role="alert">{error}</p>}
    {step === 'review' ? <>
      <SlideNavigation page={page} total={slides.length} onBack={() => setPage(page - 1)} />
      <Button disabled={saving} onClick={async () => {
        if (page < slides.length - 1) { setPage(page + 1); return; }
        if (planErrors(plan).length) { go('diagnosis'); return; }
        setSaving(true); setError('');
        try { await submitTreatmentPlan(state.sessionId, plan); }
        catch { setSaving(false); setError('Tedavi planı kaydedilemedi. Lütfen tekrar deneyin.'); return; }
        setState(s => ({ ...s, plan: { ...s.plan, medications: s.plan.noMedication ? [] : s.plan.medications, followupDate: s.plan.noFollowup ? '' : s.plan.followupDate, approved: true }, understood: false }));
        router.push('/handoff/patient?next=summary');
      }}>{page < slides.length - 1 ? 'Devam et' : 'Onayla, hastaya göster'}</Button><button className="compact-link" onClick={() => editSlide(slide)}>Düzenle</button>
    </> : <><Button onClick={next} disabled={step === 'medicine' && !plan.noMedication && !current && !medicationDone}>Devam et</Button><button className="compact-link" onClick={back}>Geri</button></>}
  </>}>
    {!valid ? <Empty text="Önce görüşmeyi tamamlayın." /> :
      step === 'review' ? <SlideCard slide={slide} /> :
      <div className="compact-form my-auto">
        {step === 'diagnosis' && <><label>Tanı / değerlendirme<input maxLength={100} value={plan.diagnosis} onChange={e => update({ diagnosis: e.target.value })} /></label><label>Hasta için kısa açıklama<textarea rows={3} maxLength={500} value={plan.explanation} onChange={e => update({ explanation: e.target.value })} /></label></>}
        {step === 'medicine' && <>
          {medicationDone && !plan.noMedication ? <><p className="text-lead font-semibold text-brand-700">{plan.medications.length} ilaç eklendi.</p><Button variant="outline" onClick={addMedicine}>Başka ilaç ekle</Button><button className="compact-link" onClick={() => { setMedicineIndex(0); setMedicationDone(false); }}>İlaçları düzenle</button></> :
            <><label className="compact-check"><input type="checkbox" checked={plan.noMedication} onChange={e => update({ noMedication: e.target.checked })} />İlaçsız tedavi</label>
            {!plan.noMedication && (current ? <><p className="text-caption text-ink-muted">İlaç {medicineIndex + 1} / {plan.medications.length}</p><label>İlaç adı ve gücü<input maxLength={100} value={current.name} onChange={e => updateMedicine('name', e.target.value)} /></label><label>Doz<input maxLength={80} value={current.dose} onChange={e => updateMedicine('dose', e.target.value)} /></label><button className="compact-link" onClick={() => { update({ medications: plan.medications.filter((_, i) => i !== medicineIndex) }); setMedicineIndex(Math.max(0, medicineIndex - 1)); }}>Bu ilacı kaldır</button></> : <Button variant="outline" onClick={addMedicine}>İlaç ekle</Button>)}</>}
        </>}
        {step === 'usage' && current && <><p className="font-semibold text-brand-700">{current.name}</p><label>Sıklık<input maxLength={80} placeholder="Günde kaç kez?" value={current.frequency} onChange={e => updateMedicine('frequency', e.target.value)} /></label><label>Kullanım<input maxLength={100} placeholder="Nasıl alınacak?" value={current.meal} onChange={e => updateMedicine('meal', e.target.value)} /></label><label>Süre<input maxLength={80} placeholder="Kaç gün?" value={current.duration} onChange={e => updateMedicine('duration', e.target.value)} /></label></>}
        {step === 'advice' && <label>{plan.noMedication ? 'İlaçsız tedavi açıklaması' : 'Öneriler (isteğe bağlı)'}<textarea rows={4} maxLength={500} value={plan.advice} onChange={e => update({ advice: e.target.value })} /></label>}
        {step === 'followup' && <><label className="compact-check"><input type="checkbox" checked={plan.noFollowup} onChange={e => update({ noFollowup: e.target.checked })} />Kontrol planlanmadı</label>{!plan.noFollowup && <label>Kontrol tarihi<input type="date" min={localDateValue()} value={plan.followupDate} onInput={e => update({ followupDate: e.currentTarget.value })} onChange={e => update({ followupDate: e.target.value })} /></label>}</>}
      </div>}
  </Frame>;
}

export function Summary() {
  const { state, setState } = useFlow(); const router = useRouter(); const [page, setPage] = useState(0);
  const slides = summarySlides(state.expression, state.turns, state.plan); const index = Math.min(page, slides.length - 1);
  return <Frame title="Doktorun yazdıkları" footer={state.plan.approved && <>
    <SlideNavigation page={index} total={slides.length} onBack={() => setPage(index - 1)} />
    <Button onClick={() => { if (index < slides.length - 1) setPage(index + 1); else { setState(s => ({ ...s, understood: true })); router.push('/print'); } }}>{index < slides.length - 1 ? 'Devam et' : 'Anladım'}</Button>
    <Link className="compact-link" href="/patient/question">Anlamadım, tekrar sor</Link>
  </>}>
    {!state.plan.approved ? <Empty text="Doktor henüz tedaviyi onaylamadı." href="/handoff/doctor" /> : <SlideCard slide={slides[index]} />}
  </Frame>;
}

export function PrintSummary() {
  const { state, finish } = useFlow(); const router = useRouter(); const [closing, setClosing] = useState(false);
  const [finishing, setFinishing] = useState(false); const [finishError, setFinishError] = useState('');
  const valid = state.plan.approved && state.understood;
  return <Frame title={closing ? 'Görüşme bitsin mi?' : 'Özetiniz hazır'} footer={valid && (closing ?
    <><Button disabled={finishing} onClick={async () => { setFinishing(true); setFinishError(''); try { await finish(); router.replace('/complete'); } catch { setFinishing(false); setFinishError('Görüşme bitirilemedi. Lütfen tekrar deneyin.'); } }}>Bitir</Button><button className="compact-link" onClick={() => setClosing(false)}>Geri dön</button></> :
    <><Button onClick={() => window.print()}>Özeti yazdır</Button><Button variant="outline" onClick={() => setClosing(true)}>Görüşmeyi bitir</Button><Link href="/patient/summary" className="compact-link">Özete dön</Link></>)}>
    {!valid ? <Empty text="Önce tedavi özetini inceleyin." href="/patient/summary" /> :
      <><div className="compact-center"><svg className="h-24 w-24 text-brand-600" viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M22 8h36v21H22zM22 52H12V28h56v24H58M22 42h36v30H22zM29 51h22M29 59h16"/></svg><p>{closing ? 'Görüşme bilgileri cihazdan temizlenecek.' : 'Tedavi bilgilerinizi yanınıza alın.'}</p></div>
      {finishError && <p className="compact-error" role="alert">{finishError}</p>}<div id="print-document" className="compact-document"><h1>SignBridge • Görüşme özeti</h1><p>Resmî reçete değildir.</p><PlanCards plan={state.plan} /><h2>Görüşme bilgileri</h2><p>Şikayet: {state.expression}</p>{state.turns.map(t => <section key={t.id}><p>Soru: {t.text}</p><p>Yanıt: {t.answer}</p></section>)}{state.followups.map((f, i) => <section key={i}><p>Hasta sorusu: {f.question}</p><p>Doktor açıklaması: {f.answer}</p></section>)}</div></>}
  </Frame>;
}
export function Complete() {
  const { state } = useFlow();
  return <Frame allowEmpty footer={!state.active && <Button href="/">Yeni görüşme</Button>}>
    {state.active ? <Empty text="Görüşmeniz devam ediyor." href="/patient/summary" /> : <div className="compact-center"><div className="text-6xl text-brand-600" aria-hidden="true">✓</div><h1 className="compact-title">Görüşme tamamlandı</h1></div>}
  </Frame>;
}
