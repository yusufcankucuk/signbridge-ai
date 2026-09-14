import { NextResponse } from 'next/server';

import { readJsonObject } from '@/lib/apiValidation';
import { getSessionStore } from '@/lib/sessionStore';
import { SessionManager } from '@/lib/stateMachine';
import type { PatientAnswerPayload } from '@/types/session';

const ANSWER_SOURCES = new Set<PatientAnswerPayload['source']>(['manual', 'demo', 'model']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const parsed = await readJsonObject(request, {
        maxBytes: 4 * 1024,
        allowedFields: ['questionId', 'answer', 'source'],
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

    const body = parsed.value;
    if (typeof body.questionId !== 'string' || !UUID_PATTERN.test(body.questionId)) {
        return NextResponse.json({ error: 'questionId geçerli bir UUID olmalıdır.' }, { status: 400 });
    }
    if (typeof body.answer !== 'string' || !body.answer.trim()) {
        return NextResponse.json({ error: 'Hasta yanıtı boş olamaz.' }, { status: 400 });
    }
    if (body.answer.length > 500) {
        return NextResponse.json({ error: 'Hasta yanıtı 500 karakteri aşamaz.' }, { status: 400 });
    }
    if (typeof body.source !== 'string' || !ANSWER_SOURCES.has(body.source as PatientAnswerPayload['source'])) {
        return NextResponse.json({ error: 'Geçersiz hasta yanıt kaynağı.' }, { status: 400 });
    }

    const { id } = await params;
    const store = getSessionStore();
    let session;
    try { session = await store.get(id); }
    catch { return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 }); }
    if (!session) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 404 });
    if (!SessionManager.canTransition(session.state, 'doctor_review')) {
        return NextResponse.json({ error: 'Geçersiz durum geçişi.' }, { status: 409 });
    }
    let pendingQuestionId;
    try { pendingQuestionId = await store.getPendingQuestionId(id); }
    catch { return NextResponse.json({ error: 'Bekleyen soru okunamadı.' }, { status: 500 }); }
    if (pendingQuestionId !== body.questionId) {
        return NextResponse.json({ error: 'Yanıt bekleyen soruyla eşleşmiyor.' }, { status: 409 });
    }

    const payload: PatientAnswerPayload = {
        questionId: body.questionId,
        answer: body.answer.trim(),
        source: body.source as PatientAnswerPayload['source'],
    };
    try {
        const ok = await store.transition({
            id,
            expectedState: session.state,
            nextState: 'doctor_review',
            event: { type: 'patient_answer', payload },
        });
        if (!ok) return NextResponse.json({ error: 'Oturum durumu değişti; yeniden deneyin.' }, { status: 409 });
    } catch {
        return NextResponse.json({ error: 'Hasta yanıtı kaydedilemedi.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, nextState: 'doctor_review' });
}
