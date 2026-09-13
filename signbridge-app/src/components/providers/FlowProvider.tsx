"use client";
import { createContext, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { emptyFlow, type FlowState } from '../../lib/consultationFlow';
const KEY = 'signbridge-frontend-v1';
const Context = createContext<{ state: FlowState; setState: Dispatch<SetStateAction<FlowState>>; ready: boolean; storageWarning: boolean; start: () => Promise<void>; finish: () => void } | null>(null);
export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>(emptyFlow);
  const [restored, setRestored] = useState(false);
  const ready = restored;
  const [storageWarning, setWarning] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(KEY);
        if (raw) {
          const value = JSON.parse(raw);
          if (value.version === 2 && typeof value.sessionId === 'string' && typeof value.expression === 'string' && Array.isArray(value.turns) && Array.isArray(value.plan?.medications) && Array.isArray(value.followups)) setState(value);
        }
      } catch { setWarning(true); }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { if (state.active) sessionStorage.setItem(KEY, JSON.stringify(state)); else sessionStorage.removeItem(KEY); }
    catch { queueMicrotask(() => setWarning(true)); }
  }, [state, ready]);
  const clear = () => {
    try { sessionStorage.removeItem(KEY); localStorage.removeItem('signbridge-consultation'); localStorage.removeItem('signbridge-followup'); } catch { setWarning(true); }
  };
  const start = async () => {
    const response = await fetch('/api/consultations', { method: 'POST' });
    if (!response.ok) throw new Error('Görüşme başlatılamadı.');
    const session = await response.json() as { id?: unknown };
    if (typeof session.id !== 'string') throw new Error('Geçersiz oturum yanıtı.');
    clear();
    setState({ ...emptyFlow(), active: true, sessionId: session.id });
  };
  const finish = () => {
    if (state.sessionId) void fetch(`/api/consultations/${encodeURIComponent(state.sessionId)}/end`, { method: 'POST' });
    clear();
    setState(emptyFlow());
  };
  return <Context.Provider value={{ state, setState, ready, storageWarning, start, finish }}>{children}</Context.Provider>;
}
export function useFlow() { const value = useContext(Context); if (!value) throw new Error('FlowProvider gerekli'); return value; }
