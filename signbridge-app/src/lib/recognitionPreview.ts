import type { FlowState } from './consultationFlow';

// Frontend fixture only. Replace this adapter with the recognition response
// when AI is connected; never treat these values as inferred patient data.
export function recognitionPreview(capture: FlowState['capture'], kind?: string): FlowState['candidate'] {
  if (capture === 'complaint') return { text: 'Başım ağrıyor', source: 'demo' };
  if (capture === 'followup') return { text: 'İlacımı ne zaman almalıyım?', source: 'demo' };
  const answers: Record<string, string> = {
    duration: 'Üç gündür var',
    intensity: '2 / 5 — Hafif',
    location: 'Ağrı başımda',
    medication: 'Düzenli ilaç kullanmıyorum',
    custom: 'Bilmiyorum',
  };
  return kind && answers[kind] ? { text: answers[kind], source: 'demo' } : null;
}
