import type { Plan, Question, QuestionKind, Source } from './consultationFlow';

async function request(path: string, method: 'POST' | 'DELETE', body?: unknown): Promise<void> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Görüşme durumu güncellenemedi.');
}

const post = (path: string, body?: unknown) => request(path, 'POST', body);

/** Compatibility client for the earlier plural question endpoint. */
export async function askPatientQuestion(
  sessionId: string,
  question: { id: string; kind: QuestionKind; text: string },
): Promise<void> {
  const id = encodeURIComponent(sessionId);
  await post(`/api/consultations/${id}/questions`, {
    questionId: question.id,
    kind: question.kind,
    text: question.text,
  });
}

/** Canonical multi-step question flow used by the current UI. */
export async function submitDoctorQuestion(sessionId: string, question: Question): Promise<void> {
  const id = encodeURIComponent(sessionId);
  await post(`/api/consultations/${id}/question`, {
    questionId: question.id,
    kind: question.kind,
    text: question.text,
  });
  await post(`/api/consultations/${id}/next`);
}

export function submitPatientAnswer(
  sessionId: string,
  answer: { questionId: string; answer: string; source: Source },
): Promise<void>;
export function submitPatientAnswer(sessionId: string, questionId: string, answer: string): Promise<void>;
export async function submitPatientAnswer(
  sessionId: string,
  questionOrAnswer: string | { questionId: string; answer: string; source: Source },
  answerValue?: string,
): Promise<void> {
  const id = encodeURIComponent(sessionId);
  if (typeof questionOrAnswer === 'object') {
    await post(`/api/consultations/${id}/answers`, questionOrAnswer);
    return;
  }
  await post(`/api/consultations/${id}/patient-answer`, {
    questionId: questionOrAnswer,
    answer: answerValue,
    source: 'manual',
  });
}

export async function cancelPatientQuestion(sessionId: string, questionId: string): Promise<void> {
  const id = encodeURIComponent(sessionId);
  await request(`/api/consultations/${id}/questions`, 'DELETE', { questionId });
}

export async function cancelDoctorQuestion(sessionId: string): Promise<void> {
  await post(`/api/consultations/${encodeURIComponent(sessionId)}/question/cancel`);
}

export async function submitTreatmentPlan(sessionId: string, plan: Plan): Promise<void> {
  await post(`/api/consultations/${encodeURIComponent(sessionId)}/plan`, {
    diagnosis: plan.diagnosis,
    explanation: plan.explanation,
    medications: plan.noMedication ? [] : plan.medications,
    noMedication: plan.noMedication,
    advice: plan.advice,
    followupDate: plan.noFollowup ? '' : plan.followupDate,
    noFollowup: plan.noFollowup,
  });
}
