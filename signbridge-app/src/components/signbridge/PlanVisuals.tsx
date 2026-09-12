// Tedavi özetindeki görseller: her slayt kendi anlamını taşıyan bir çizimle gelir.
// Tümü currentColor kullanır, dekoratiftir (aria-hidden) ve yanında her zaman metin bulunur.
import type { ReactNode } from 'react';

const svg = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function DiagnosisVisual() {
  return <svg viewBox="0 0 48 48" className="h-full w-full" {...svg} aria-hidden="true">
    <path d="M15 7v10a9 9 0 0 0 18 0V7" />
    <path d="M11 7h8M29 7h8" />
    <path d="M24 26v6a8 8 0 0 0 8 8h2" />
    <circle cx="38" cy="40" r="4" />
  </svg>;
}

export function MedicineVisual() {
  return <svg viewBox="0 0 48 48" className="h-full w-full" {...svg} aria-hidden="true">
    <rect x="6" y="17" width="36" height="16" rx="8" transform="rotate(-30 24 25)" />
    <path d="M17.5 17.5 30.5 32.5" />
    <circle cx="17" cy="31" r="1.6" />
    <circle cx="22" cy="34" r="1.6" />
  </svg>;
}

export function AdviceVisual() {
  return <svg viewBox="0 0 48 48" className="h-full w-full" {...svg} aria-hidden="true">
    <rect x="10" y="7" width="28" height="34" rx="5" />
    <path d="M18 5h12v5H18z" />
    <path d="M17 22l5 5 9-10" />
    <path d="M17 33h14" />
  </svg>;
}

export function CalendarVisual({ day }: { day?: string; month?: string; weekday?: string }) {
  return <svg viewBox="0 0 48 48" className="h-full w-full" {...svg} aria-hidden="true">
    <rect x="6" y="10" width="36" height="32" rx="5" />
    <path d="M6 20h36" />
    <path d="M16 6v8M32 6v8" />
    {day ? <text x="24" y="36" textAnchor="middle" stroke="none" fill="currentColor" fontSize="16" fontWeight="600">{day}</text>
      : <path d="M18 28h12M18 34h8" />}
  </svg>;
}

const rowIcons: Record<string, ReactNode> = {
  name: <><rect x="4" y="12" width="20" height="10" rx="5" transform="rotate(-35 14 17)" /><path d="M10 10.5 17.5 18" /></>,
  dose: <><path d="M6 17h12M9 14l-3 3 3 3M18 14l3 3-3 3" /><path d="M12 7v3M12 24v-3" /></>,
  frequency: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2" /></>,
  meal: <><path d="M7 4v8a2 2 0 0 0 4 0V4M9 12v9" /><path d="M17 4c-2 2-2 6 0 8v9" /></>,
  duration: <><rect x="4" y="6" width="16" height="15" rx="3" /><path d="M4 11h16M9 4v4M15 4v4" /></>,
};
export function MedRowIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" {...svg} aria-hidden="true">{rowIcons[name] ?? rowIcons.name}</svg>;
}
