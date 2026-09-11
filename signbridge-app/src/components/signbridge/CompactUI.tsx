"use client";
import { useState, type ReactNode } from 'react';
import { useFlow } from '../providers/FlowProvider';
import MobileShell from '../layout/MobileShell';
import AppHeader from '../layout/AppHeader';
import Button from '../ui/Button';

export function Frame({ title, role = 'hasta', children, footer, home = false, allowEmpty = false }: {
  title?: string; role?: 'hasta' | 'doktor'; children: ReactNode; footer?: ReactNode; home?: boolean; allowEmpty?: boolean;
}) {
  const { state, ready } = useFlow();
  const available = ready && (state.active || allowEmpty);
  return <MobileShell>
    {!home && <AppHeader role={role} />}
    <main className="compact-screen sb-screen-body">
      {title && <h1 className="compact-title">{title}</h1>}
      <div className="compact-content">
        {!ready ? null : !available ? <div className="compact-center"><p>Görüşme henüz başlamadı.</p><Button href="/">Başla</Button></div> : children}
      </div>
      {available && footer && <footer className="compact-footer">{footer}</footer>}
    </main>
  </MobileShell>;
}

export function Actions({ children }: { children: ReactNode }) { return <div className="compact-actions">{children}</div>; }
export function Choice({ children, selected, onClick }: { children: ReactNode; selected?: boolean; onClick: () => void }) {
  return <button type="button" className={`compact-choice ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={onClick}>{children}</button>;
}
export function Pager({ index, total, onChange, label = 'Sayfa' }: { index: number; total: number; onChange: (index: number) => void; label?: string }) {
  if (total < 2) return null;
  return <nav className="compact-pager" aria-label={label}>
    <button type="button" disabled={index <= 0} onClick={() => onChange(index - 1)} aria-label={`Önceki ${label.toLocaleLowerCase('tr')}`}>‹ Geri</button>
    <span aria-live="polite">{index + 1} / {total}</span>
    <button type="button" disabled={index >= total - 1} onClick={() => onChange(index + 1)} aria-label={`Sonraki ${label.toLocaleLowerCase('tr')}`}>İleri ›</button>
  </nav>;
}

// Bound text per page, including long unbroken words, without discarding content.
export function textPages(text: string, size = 170): string[] {
  const pages: string[] = []; let rest = text.trim();
  while (rest.length > size) {
    const space = rest.lastIndexOf(' ', size);
    const cut = space > size / 2 ? space : size;
    pages.push(rest.slice(0, cut)); rest = rest.slice(cut).trimStart();
  }
  if (rest) pages.push(rest);
  const bounded = pages.flatMap(page => {
    const lines = page.split('\n'); const chunks: string[] = [];
    for (let i = 0; i < lines.length; i += 5) chunks.push(lines.slice(i, i + 5).join('\n'));
    return chunks;
  });
  return bounded.length ? bounded : [''];
}
export function ReadText({ text, className = '' }: { text: string; className?: string }) {
  const [page, setPage] = useState(0); const pages = textPages(text); const index = Math.min(page, pages.length - 1);
  return <div className={`compact-reading ${className}`}><p className="compact-read-text">{pages[index]}</p><Pager index={index} total={pages.length} onChange={setPage} label="metin" /></div>;
}
export function Empty({ text, href = '/doctor/conversation' }: { text: string; href?: string }) { return <div className="compact-center"><p>{text}</p><Button href={href}>Geri dön</Button></div>; }
export function CameraIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/></svg>; }
