"use client";
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFlow } from '../providers/FlowProvider';
import { Frame, Choice, Empty, Pager, ReadText } from './CompactUI';
import Button from '../ui/Button';
import BodyMap from './BodyMap';
import ExpressionVisual from './ExpressionVisual';
import { EXPRESSIONS } from '../../data/expressions';
import { BODY_REGIONS, MEDICATION_GROUPS } from '../../data/regions';
import { questionLabels, recordAnswer, type QuestionKind } from '../../lib/consultationFlow';

export function Conversation() {
  const { state, setState } = useFlow(); const router = useRouter();
  const [editing, setEditing] = useState(false); const [text, setText] = useState('');
  const [history, setHistory] = useState(false); const [page, setPage] = useState(0);
  const turn = state.turns[Math.min(page, state.turns.length - 1)];
  const art = EXPRESSIONS.find(e => e.sentence === state.expression);
  return <Frame title={history ? 'Soru ve yanıtlar' : 'Görüşme'} role="doktor" footer={state.expression && <>
    {editing ? <><Button disabled={!text.trim()} onClick={() => { setState(s => ({ ...s, expression: text.trim(), reviewed: true, plan: { ...s.plan, approved: false }, understood: false })); setEditing(false); }}>Onayla</Button><button className="compact-link" onClick={() => setEditing(false)}>Vazgeç</button></> :
      history ? <><Pager index={page} total={state.turns.length} onChange={setPage} label="yanıt" /><button className="compact-link" onClick={() => setHistory(false)}>Görüşmeye dön</button></> :
      state.pending ? <><Button href="/handoff/patient">Yanıtı bekle</Button><button className="compact-link" onClick={() => setState(s => ({ ...s, pending: null }))}>Soruyu iptal et</button></> :
      !state.reviewed ? <><Button onClick={() => setState(s => ({ ...s, reviewed: true }))}>Onayla, devam et</Button><button className="compact-link" onClick={() => { setText(state.expression); setEditing(true); }}>Şikayeti düzenle</button></> :
      <><Button onClick={() => router.push('/doctor/questions')}>Soru sor</Button><Button variant="outline" onClick={() => router.push('/doctor/result')}>Tedaviyi yaz</Button></>}
  </>}>
    {!state.expression ? <Empty text="Hasta henüz anlatımını onaylamadı." href="/camera" /> : editing ?
      <div className="compact-form my-auto"><label>Hastanın şikayeti<textarea rows={4} maxLength={500} value={text} onChange={e => setText(e.target.value)} /></label></div> :
      history ? turn ? <div className="compact-center items-stretch text-left"><div className="compact-card"><small>Doktor</small><ReadText text={turn.text} /></div><div className="compact-card bg-teal-50"><small>Hasta</small><ReadText text={turn.answer} /></div></div> : <div className="compact-center"><p>Henüz yanıt yok.</p></div> :
      <><div className="compact-symptom">{art && <div className="art"><ExpressionVisual expression={art} /></div>}<div className="min-w-0"><p className="text-xs font-bold text-slate-500">HASTANIN ŞİKAYETİ</p><ReadText text={state.expression} /></div></div>
      <div className="compact-center">{state.pending ? <ReadText text={state.pending.text} /> : turn ? <div className="compact-card w-full text-left"><p className="mb-2 text-sm text-slate-500">Son yanıt</p><ReadText text={turn.answer} /></div> : <p className="text-slate-500">Hastanın anlatımını inceleyin.</p>}
        {state.turns.length > 0 && <button className="compact-link" onClick={() => { setPage(state.turns.length - 1); setHistory(true); }}>Tüm yanıtlar ({state.turns.length})</button>}
        {state.reviewed && <button className="compact-link" onClick={() => { setText(state.expression); setEditing(true); }}>Şikayeti düzenle</button>}
      </div></>}
  </Frame>;
}

export function Questions() {
  const { state, setState } = useFlow(); const router = useRouter();
  const [kind, setKind] = useState<QuestionKind>('custom'); const [text, setText] = useState('');
  const [edit, setEdit] = useState(false);
  const options: [QuestionKind, string, string][] = [['duration', 'Süre / Zaman', '◷'], ['intensity', 'Şiddet derecesi', '▥'], ['location', 'Yer / Bölge', '⌖'], ['medication', 'İlaç kullanımı', '⊕']];
  const send = () => {
    if (!text.trim() || state.pending) return;
    setState(s => ({ ...s, pending: { id: crypto.randomUUID(), kind, text: text.trim() }, capture: 'answer', candidate: null }));
    router.push('/handoff/patient');
  };
  const available = state.reviewed && !state.pending;
  return <Frame title={edit ? 'Soruyu kontrol edin' : 'Ne sormak istersiniz?'} role="doktor" footer={available && (edit ?
    <><Button disabled={!text.trim()} onClick={send}>Hastaya sor</Button><button className="compact-link" onClick={() => setEdit(false)}>Geri</button></> :
    <><button className="compact-link" onClick={() => { setKind('custom'); setText(''); setEdit(true); }}>Kendi sorumu yazacağım</button><Button href="/doctor/conversation" variant="outline">Görüşmeye dön</Button></>)}>
    {!available ? <Empty text="Önce görüşme ekranındaki adımı tamamlayın." /> :
      edit ? <div className="compact-form my-auto"><label>Sorunuz<textarea rows={4} maxLength={180} value={text} onChange={e => { setText(e.target.value); setKind('custom'); }} /></label></div> :
      <div className="compact-menu my-auto">{options.map(([key, title, icon]) => <button key={key} onClick={() => { setKind(key); setText(questionLabels[key]); setEdit(true); }}>
        <span className="symbol" aria-hidden="true">{icon}</span><span><strong>{title}</strong><small>{questionLabels[key]}</small></span><span className="ml-auto text-slate-400" aria-hidden="true">›</span>
      </button>)}</div>}
  </Frame>;
}

export function PatientResponse({ kind }: { kind: QuestionKind }) {
  const { state, setState } = useFlow(); const router = useRouter();
  const [selected, setSelected] = useState(''); const [detail, setDetail] = useState(''); const [groups, setGroups] = useState<string[]>([]);
  const [stage, setStage] = useState<'choice' | 'groups' | 'name'>('choice');
  const pending = state.pending;
  const ready = pending?.kind === kind;
  const titles = { duration: 'Ne zamandır?', intensity: 'Ne kadar şiddetli?', location: 'Ağrı neresinde?', medication: stage === 'groups' ? 'Hangi ilaçları kullanıyorsunuz?' : stage === 'name' ? 'İlacın adı ne?' : 'İlaç kullanıyor musunuz?', custom: 'Doktorun sorusu' };
  const answer = kind === 'medication' && selected === 'Evet' ? `Düzenli ilaç kullanıyorum: ${[...groups.filter(g => g !== 'Başka bir ilaç'), groups.includes('Başka bir ilaç') ? detail.trim() : ''].filter(Boolean).join(', ')}` : kind === 'medication' && selected === 'Hayır' ? 'Düzenli ilaç kullanmıyorum' : kind === 'custom' ? detail.trim() : selected;
  const valid = kind === 'medication' && selected === 'Evet' ? groups.length > 0 && (!groups.includes('Başka bir ilaç') || !!detail.trim()) : !!answer.trim();
  const send = () => { if (!valid || !ready) return; setState(s => recordAnswer(s, answer, 'manual')); router.push('/handoff/doctor'); };
  const next = () => {
    if (kind === 'medication' && selected === 'Evet') {
      if (stage === 'choice') { setStage('groups'); return; }
      if (stage === 'groups' && groups.includes('Başka bir ilaç')) { setStage('name'); return; }
    }
    send();
  };
  const canContinue = kind === 'medication' && selected === 'Evet' ? stage === 'choice' || (stage === 'groups' ? groups.length > 0 : !!detail.trim()) : valid;
  return <Frame title={titles[kind]} footer={ready && <>
    <Button disabled={!canContinue} onClick={next}>{kind === 'medication' && selected === 'Evet' && (stage === 'choice' || (stage === 'groups' && groups.includes('Başka bir ilaç'))) ? 'Devam et' : 'Doktora ilet'}</Button>
    {stage !== 'choice' ? <button className="compact-link" onClick={() => setStage(stage === 'name' ? 'groups' : 'choice')}>Geri</button> :
      <button className="compact-link" onClick={() => { setState(s => ({ ...s, capture: 'answer', candidate: null })); router.push('/camera'); }}>İşaret diliyle yanıtla</button>}
  </>}>
    {!pending ? <Empty text="Yanıt bekleyen soru yok." /> : !ready ? <Empty text="Diğer soruya devam edin." href={`/patient/${pending.kind}`} /> :
      kind === 'custom' ? <><div className="compact-card"><ReadText text={pending.text} /></div><div className="compact-form flex-1 justify-center"><label>Yanıtınız<textarea maxLength={500} rows={4} value={detail} onChange={e => setDetail(e.target.value)} /></label></div></> :
      kind === 'duration' ? <div className="my-auto"><div className="compact-grid">{['Bugün', 'Birkaç gün', '1 hafta', 'Daha uzun'].map(v => <Choice key={v} selected={selected === v} onClick={() => setSelected(v)}>{v}</Choice>)}</div><button className="compact-link mt-3 w-full" aria-pressed={selected === 'Hatırlamıyorum'} onClick={() => setSelected('Hatırlamıyorum')}>{selected === 'Hatırlamıyorum' ? '✓ ' : ''}Hatırlamıyorum</button></div> :
      kind === 'intensity' ? <div className="compact-center"><div className="grid w-full grid-cols-5 gap-2">{['Çok hafif', 'Hafif', 'Orta', 'Şiddetli', 'Çok şiddetli'].map((label, i) => <Choice key={label} selected={selected === `${i + 1} / 5 — ${label}`} onClick={() => setSelected(`${i + 1} / 5 — ${label}`)}><span className="text-xl">{i + 1}</span></Choice>)}</div><p className="text-center text-xl font-semibold text-teal-800">{selected ? selected.split('—')[1] : 'Size uygun olanı seçin'}</p><div className="flex w-full justify-between text-sm text-slate-500"><span>Çok hafif</span><span>Çok şiddetli</span></div></div> :
      kind === 'location' ? <><div className="min-h-0 flex-1 flex items-center justify-center"><BodyMap selectedId={BODY_REGIONS.find(r => r.sentence === selected)?.id} onSelect={r => setSelected(r.sentence)} className="h-full max-h-[240px] w-[120px]" /></div><div className="compact-grid">{BODY_REGIONS.map(r => <Choice key={r.id} selected={selected === r.sentence} onClick={() => setSelected(r.sentence)}>{r.label}</Choice>)}</div></> :
      stage === 'choice' ? <div className="compact-center w-full"><div className="compact-grid w-full">{['Evet', 'Hayır'].map(v => <Choice key={v} selected={selected === v} onClick={() => setSelected(v)}>{v}</Choice>)}</div><button className="compact-link" aria-pressed={selected === 'Bilmiyorum'} onClick={() => setSelected('Bilmiyorum')}>{selected === 'Bilmiyorum' ? '✓ ' : ''}Bilmiyorum</button></div> :
      stage === 'name' ? <div className="compact-form my-auto"><label>İlacın adı<input maxLength={100} value={detail} onChange={e => setDetail(e.target.value)} /></label></div> :
      <div className="my-auto"><div className="compact-grid">{MEDICATION_GROUPS.map(g => <Choice key={g.id} selected={groups.includes(g.label)} onClick={() => setGroups(current => current.includes(g.label) ? current.filter(v => v !== g.label) : [...current, g.label])}>{g.label}</Choice>)}</div><button className="compact-link mt-3 w-full" onClick={() => { setState(s => recordAnswer(s, 'İlaç kullanıyorum, adını bilmiyorum', 'manual')); router.push('/handoff/doctor'); }}>Adını bilmiyorum</button></div>}
  </Frame>;
}

export function Handoff({ to }: { to: 'doctor' | 'patient' }) {
  const { state } = useFlow(); const query = useSearchParams(); const next = query.get('next');
  const path = to === 'doctor' ? next === 'answer' ? '/doctor/answer' : '/doctor/conversation' : next === 'answer' ? '/patient/answer' : next === 'summary' || query.get('question') === 'summary' ? '/patient/summary' : state.pending ? `/patient/${state.pending.kind}` : '/doctor/conversation';
  return <Frame role={to === 'doctor' ? 'doktor' : 'hasta'} footer={<Button href={path}>Devam et</Button>}>
    <div className="compact-center"><svg className="h-28 w-28 text-teal-700" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><rect x="33" y="15" width="34" height="70" rx="7"/><path d="M44 23h12M46 77h8M8 45h18m-7-7 7 7-7 7M92 55H74m7-7-7 7 7 7"/></svg><h1 className="compact-title">{to === 'doctor' ? 'Cihazı doktora verin' : 'Cihazı hastaya verin'}</h1></div>
  </Frame>;
}
