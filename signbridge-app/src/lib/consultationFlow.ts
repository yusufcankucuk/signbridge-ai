export type QuestionKind = 'duration' | 'intensity' | 'location' | 'medication' | 'custom';
import type { PredictionPayload } from '../../types/session';

export type Source = 'manual' | 'demo' | 'model';
export interface Question { id: string; kind: QuestionKind; text: string }
export interface Turn extends Question { answer: string; source: Source }
export interface Medication { id: string; name: string; dose: string; frequency: string; meal: string; duration: string }
export interface Plan { diagnosis: string; explanation: string; medications: Medication[]; noMedication: boolean; advice: string; followupDate: string; noFollowup: boolean; approved: boolean }
export interface FlowState {
  version: 2; active: boolean; sessionId: string; expression: string; reviewed: boolean; turns: Turn[];
  pending: Question | null; capture: 'complaint' | 'answer' | 'followup';
  candidate: { text: string; source: Source; prediction?: PredictionPayload } | null;
  plan: Plan; followups: { question: string; answer: string }[];
  patientQuestion: string; patientAnswer: string; understood: boolean;
}
export const emptyPlan = (): Plan => ({ diagnosis: '', explanation: '', medications: [], noMedication: false, advice: '', followupDate: '', noFollowup: false, approved: false });
export const emptyFlow = (): FlowState => ({ version: 2, active: false, sessionId: '', expression: '', reviewed: false, turns: [], pending: null, capture: 'complaint', candidate: null, plan: emptyPlan(), followups: [], patientQuestion: '', patientAnswer: '', understood: false });
export const questionLabels: Record<QuestionKind, string> = { duration: 'Ne kadar süredir var?', intensity: 'Ağrınız 1–5 arasında ne kadar şiddetli?', location: 'Ağrı neresinde?', medication: 'Düzenli ilaç kullanıyor musunuz?', custom: 'Sorunuzu yazın' };
export function planErrors(plan: Plan): string[] {
  const errors: string[] = [];
  if (!plan.diagnosis.trim()) errors.push('Tanı veya değerlendirme bilgisini yazın.');
  if (!plan.explanation.trim()) errors.push('Hasta için sade açıklama yazın.');
  if (!plan.noMedication && !plan.medications.length) errors.push('İlaç ekleyin veya ilaçsız tedaviyi seçin.');
  if (!plan.noMedication && plan.medications.some(m => ![m.name, m.dose, m.frequency, m.meal, m.duration].every(v => v.trim()))) errors.push('Her ilacın adını, dozunu, sıklığını, kullanımını ve süresini tamamlayın.');
  if (plan.noMedication && !plan.advice.trim()) errors.push('İlaçsız tedavi açıklamasını yazın.');
  if (!plan.noFollowup && !/^\d{4}-\d{2}-\d{2}$/.test(plan.followupDate)) errors.push('Kontrol tarihi girin veya planlanmadığını belirtin.');
  return errors;
}
export function recordAnswer(state: FlowState, answer: string, source: Source): FlowState {
  if (!state.pending || !answer.trim()) return state;
  return { ...state, turns: [...state.turns, { ...state.pending, answer: answer.trim(), source }], pending: null, candidate: null, understood: false, plan: { ...state.plan, approved: false } };
}
