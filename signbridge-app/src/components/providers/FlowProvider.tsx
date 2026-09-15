"use client";
import { createContext, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { emptyFlow, type FlowState } from '../../lib/consultationFlow';
const KEY = 'signbridge-frontend-v1';
const Context = createContext<{ state: FlowState; setState: Dispatch<SetStateAction<FlowState>>; ready: boolean; storageWarning: boolean; start: () => Promise<void>; finish: () => Promise<void> } | null>(null);
export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>(emptyFlow);
  const [restored, setRestored] = useState(false);
  const ready = restored;
  const [storageWarning, setWarning] = useState(false);
  const clear = () => {
    try { sessionStorage.removeItem(KEY); localStorage.removeItem('signbridge-consultation'); localStorage.removeItem('signbridge-followup'); } catch { setWarning(true); }
  };
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const raw = sessionStorage.getItem(KEY);
        if (raw) {
          const value = JSON.parse(raw);
          if (value.version === 2 && typeof value.sessionId === 'string' && typeof value.expression === 'string' && Array.isArray(value.turns) && Array.isArray(value.plan?.medications) && Array.isArray(value.followups)) {
            const response = await fetch(`/api/consultations/${encodeURIComponent(value.sessionId)}`, { cache: 'no-store' });
            if (response.status === 404) {
              clear();
            } else if (response.ok) {
              const snapshot = await response.json() as { expression?: unknown; pending?: unknown; turns?: unknown; plan?: unknown };
              if (!cancelled) setState({
                ...value,
                expression: typeof snapshot.expression === 'string' && snapshot.expression ? snapshot.expression : value.expression,
                pending: snapshot.pending ?? value.pending,
                turns: Array.isArray(snapshot.turns) && snapshot.turns.length >= value.turns.length ? snapshot.turns : value.turns,
                plan: snapshot.plan && typeof snapshot.plan === 'object' ? snapshot.plan : value.plan,
              });
            } else if (!cancelled) {
              setState(value); setWarning(true);
            }
          }
        }
      } catch { setWarning(true); }
      if (!cancelled) setRestored(true);
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { if (state.active) sessionStorage.setItem(KEY, JSON.stringify(state)); else sessionStorage.removeItem(KEY); }
    catch { queueMicrotask(() => setWarning(true)); }
  }, [state, ready]);
  const start = async () => {
    const response = await fetch('/api/consultations', { method: 'POST' });
    if (!response.ok) throw new Error('Görüşme başlatılamadı.');
    const session = await response.json() as { id?: unknown };
    if (typeof session.id !== 'string') throw new Error('Geçersiz oturum yanıtı.');
    clear();
    setState({ ...emptyFlow(), active: true, sessionId: session.id });
  };
  const finish = async () => {
    if (state.sessionId) {
      const response = await fetch(`/api/consultations/${encodeURIComponent(state.sessionId)}/end`, { method: 'POST' });
      if (!response.ok && response.status !== 404) throw new Error('Görüşme sunucuda sonlandırılamadı.');
    }
    clear();
    setState(emptyFlow());
  };
  return <Context.Provider value={{ state, setState, ready, storageWarning, start, finish }}>{children}</Context.Provider>;
}
export function useFlow() { const value = useContext(Context); if (!value) throw new Error('FlowProvider gerekli'); return value; }
