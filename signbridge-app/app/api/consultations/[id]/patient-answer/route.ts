import { NextResponse } from 'next/server';

import { readJsonObject } from '@/lib/apiValidation';
import { getSessionStore } from '@/lib/sessionStore';
import { SessionManager } from '@/lib/stateMachine';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const parsed = await readJsonObject(request, {
        maxBytes: 4 * 1024,
        allowedFields: ['questionId', 'answer', 'source'],
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

    const body = parsed.value as { questionId?: unknown; answer?: unknown; source?: unknown };
    const questionId = typeof body.questionId === 'string' ? body.questionId.trim() : '';
    const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
    if (!questionId || questionId.length > 100) {
        return NextResponse.json({ error: 'questionId geçerli ve en fazla 100 karakter olmalıdır.' }, { status: 400 });
    }
    if (!answer || answer.length > 500) {
        return NextResponse.json({ error: 'Yanıt boş olamaz ve 500 karakteri aşamaz.' }, { status: 400 });
    }
    if (body.source !== 'manual') {
        return NextResponse.json({ error: 'Manuel yanıt kaynağı geçersiz.' }, { status: 400 });
    }

    const { id } = await params;
    const store = getSessionStore();
    let session;
    try { session = await store.get(id); }
    catch { return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 }); }
    if (!session) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 404 });
    if (!SessionManager.canTransition(session.state, 'doctor_review')) {
        return NextResponse.json({ error: 'Bu durumda hasta yanıtı gönderilemez.' }, { status: 409 });
    }

    let pendingQuestionId;
    try { pendingQuestionId = await store.getPendingQuestionId(id); }
    catch { return NextResponse.json({ error: 'Bekleyen soru okunamadı.' }, { status: 500 }); }
    if (pendingQuestionId !== questionId) {
        return NextResponse.json({ error: 'Yanıt bekleyen soruyla eşleşmiyor.' }, { status: 409 });
    }

    try {
        const ok = await store.transition({
            id,
            expectedState: session.state,
            nextState: 'doctor_review',
            event: { type: 'patient_answer', payload: { questionId, answer, source: 'manual' } },
        });
        if (!ok) return NextResponse.json({ error: 'Oturum durumu değişti; yeniden deneyin.' }, { status: 409 });
    } catch {
        return NextResponse.json({ error: 'Hasta yanıtı kaydedilemedi.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, nextState: 'doctor_review' });
}
