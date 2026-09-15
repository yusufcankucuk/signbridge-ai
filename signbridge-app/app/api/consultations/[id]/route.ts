import { NextResponse } from 'next/server';

import { getSessionStore } from '@/lib/sessionStore';
import type { DoctorQuestionPayload, PatientAnswerPayload, TreatmentPlanPayload } from '@/types/session';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params; const store = getSessionStore();
    let session; let events;
    try {
        session = await store.get(id);
        if (!session) return NextResponse.json({ error: 'Oturum bulunamadı veya süresi doldu.' }, { status: 404 });
        events = await store.getEvents(id);
    } catch { return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 }); }

    const questions = new Map<string, DoctorQuestionPayload>();
    const cancelled = new Set<string>();
    const answers: PatientAnswerPayload[] = [];
    let plan: TreatmentPlanPayload | null = null;
    let expression = '';
    let latestPredictionText = '';
    for (const event of events) {
        if (event.type === 'prediction') {
            const displayText = (event.payload as { displayText?: unknown } | null)?.displayText;
            if (typeof displayText === 'string') latestPredictionText = displayText;
        } else if (event.type === 'confirmation') {
            const payload = event.payload as { confirmed?: unknown; manualSelection?: unknown } | null;
            if (typeof payload?.manualSelection === 'string') expression = payload.manualSelection;
            else if (payload?.confirmed === true && latestPredictionText && !expression) expression = latestPredictionText;
        } else if (event.type === 'doctor_question') {
            const payload = event.payload as DoctorQuestionPayload;
            if (typeof payload?.questionId === 'string') questions.set(payload.questionId, payload);
        } else if (event.type === 'patient_answer') {
            const payload = event.payload as PatientAnswerPayload;
            if (typeof payload?.questionId === 'string') answers.push(payload);
        } else if (event.type === 'question_cancelled') {
            const questionId = (event.payload as { questionId?: unknown } | null)?.questionId;
            if (typeof questionId === 'string') cancelled.add(questionId);
        } else if (event.type === 'treatment_plan') {
            plan = event.payload as TreatmentPlanPayload;
        }
    }
    const answered = new Set(answers.map((answer) => answer.questionId));
    const pending = [...questions.values()].reverse().find((question) => !answered.has(question.questionId) && !cancelled.has(question.questionId)) ?? null;
    const turns = answers.flatMap((answer) => {
        const question = questions.get(answer.questionId);
        return question ? [{ id: question.questionId, kind: question.kind, text: question.text, answer: answer.answer, source: answer.source }] : [];
    });
    return NextResponse.json({
        id: session.id, state: session.state, createdAt: session.created_at, expiresAt: session.expires_at,
        expression,
        pending: pending ? { id: pending.questionId, kind: pending.kind, text: pending.text } : null,
        turns, plan,
    });
}
