import type { QuestionKind, Source } from './consultationFlow';

async function request(path: string, method: 'POST' | 'DELETE', body?: unknown): Promise<void> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Görüşme durumu güncellenemedi.');
}

const post = (path: string, body?: unknown) => request(path, 'POST', body);

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

export async function submitPatientAnswer(
  sessionId: string,
  answer: { questionId: string; answer: string; source: Source },
): Promise<void> {
  const id = encodeURIComponent(sessionId);
  await post(`/api/consultations/${id}/answers`, answer);
}

export async function cancelPatientQuestion(sessionId: string, questionId: string): Promise<void> {
  const id = encodeURIComponent(sessionId);
  await request(`/api/consultations/${id}/questions`, 'DELETE', { questionId });
}
