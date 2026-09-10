"use client";
import Link from "next/link";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFlow } from '../providers/FlowProvider';
import { Frame, Choice, Empty, ReadText, Pager, textPages } from './CompactUI';
import Button from '../ui/Button';
import { PATIENT_FOLLOWUP_GROUPS } from '../../data/questions';

export function PatientQuestion() {
  const { state, setState } = useFlow(); const router = useRouter();
  const [question, setQuestion] = useState(''); const [group, setGroup] = useState(0);
  const [writing, setWriting] = useState(false);
  const send = () => { if (!question.trim()) return; setState(s => ({ ...s, patientQuestion: question.trim(), patientAnswer: '', understood: false })); router.push('/handoff/doctor?next=answer'); };
  return <Frame title="Neyi tekrar sormak istiyorsunuz?" footer={state.plan.approved && <>
    <Button disabled={!question.trim()} onClick={send}>Doktora ilet</Button>
    {writing ? <button className="compact-link" onClick={() => { setWriting(false); setQuestion(''); }}>Seçeneklere dön</button> : <Link className="compact-link" href="/patient/summary">Özete dön</Link>}
  </>}>
    {!state.plan.approved ? <Empty text="Önce tedavi planı tamamlanmalı." /> :
      writing ? <div className="compact-form my-auto"><label>Sorunuz<textarea rows={4} maxLength={300} value={question} onChange={e => setQuestion(e.target.value)} /></label><button className="compact-link" onClick={() => { setState(s => ({ ...s, capture: 'followup', candidate: null })); router.push('/camera'); }}>İşaret diliyle anlat</button></div> :
      <><div className="compact-tabs" role="tablist" aria-label="Soru konusu">{PATIENT_FOLLOWUP_GROUPS.map((g, i) => <button role="tab" aria-selected={group === i} key={g.id} onClick={() => { setGroup(i); setQuestion(''); }}>{g.title}</button>)}</div>
      <div className="my-auto"><div className="compact-grid">{PATIENT_FOLLOWUP_GROUPS[group].items.map(item => <Choice key={item.id} selected={question === item.label} onClick={() => setQuestion(item.label)}>{item.label}</Choice>)}</div>
      <div className="mt-3"><Choice selected={question === 'Hepsini tekrar anlatın'} onClick={() => setQuestion('Hepsini tekrar anlatın')}>Hepsini tekrar anlatın</Choice></div>
      <button className="compact-link mt-3 w-full" onClick={() => { setWriting(true); setQuestion(''); }}>Başka bir soru soracağım</button></div></>}
  </Frame>;
}

export function DoctorAnswer() {
  const { state, setState } = useFlow(); const router = useRouter(); const [answer, setAnswer] = useState('');
  return <Frame title="Hastanın sorusu" role="doktor" footer={state.patientQuestion && <>
    <Button disabled={!answer.trim() || !state.plan.approved} onClick={() => { setState(s => ({ ...s, patientAnswer: answer.trim(), followups: [...s.followups, { question: s.patientQuestion, answer: answer.trim() }] })); router.push('/handoff/patient?next=answer'); }}>Hastaya göster</Button>
    <Link className="compact-link" href="/doctor/result">Tedaviyi düzenle</Link>
  </>}>
    {!state.patientQuestion ? <Empty text="Bekleyen soru yok." /> : <><div className="compact-card"><ReadText text={state.patientQuestion} /></div><div className="compact-form flex-1 justify-center"><label>Yanıtınız<textarea rows={3} maxLength={800} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Kısa ve sade cümlelerle yazın." /></label></div>{!state.plan.approved && <p className="compact-error">Güncel tedaviyi önce onaylayın.</p>}</>}
  </Frame>;
}

export function PatientAnswer() {
  const { state, setState } = useFlow(); const router = useRouter(); const [page, setPage] = useState(0);
  const pages = textPages(state.patientAnswer);
  return <Frame title="Doktorun yanıtı" footer={state.patientAnswer && <>
    {pages.length > 1 && <Pager index={page} total={pages.length} onChange={setPage} label="yanıt" />}
    <Button onClick={() => { if (page < pages.length - 1) setPage(page + 1); else { setState(s => ({ ...s, patientQuestion: '', patientAnswer: '' })); router.push('/patient/summary'); } }}>{page < pages.length - 1 ? 'Devam et' : 'Anladım'}</Button>
    <Link className="compact-link" href="/patient/question">Tekrar sor</Link>
  </>}>
    {!state.patientAnswer ? <Empty text="Doktorun yanıtı bekleniyor." href="/handoff/doctor?next=answer" /> : <div className="compact-card my-auto"><p className="compact-read-text">{pages[page]}</p></div>}
  </Frame>;
}
