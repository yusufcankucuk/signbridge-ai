import { NextResponse } from 'next/server';

import { readJsonObject } from '@/lib/apiValidation';
import { getSessionStore } from '@/lib/sessionStore';
import { SessionManager } from '@/lib/stateMachine';
import type { QuestionKind } from '@/types/session';

const QUESTION_KINDS = new Set<QuestionKind>(['duration', 'intensity', 'location', 'medication', 'custom']);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const parsed = await readJsonObject(request, {
        maxBytes: 4 * 1024,
        allowedFields: ['questionId', 'kind', 'text'],
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

    const body = parsed.value as { questionId?: unknown; kind?: unknown; text?: unknown };
    const questionId = typeof body.questionId === 'string' ? body.questionId.trim() : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!questionId || questionId.length > 100) {
        return NextResponse.json({ error: 'questionId geçerli ve en fazla 100 karakter olmalıdır.' }, { status: 400 });
    }
    if (typeof body.kind !== 'string' || !QUESTION_KINDS.has(body.kind as QuestionKind)) {
        return NextResponse.json({ error: 'Geçersiz soru türü.' }, { status: 400 });
    }
    if (!text || text.length > 180) {
        return NextResponse.json({ error: 'Soru boş olamaz ve 180 karakteri aşamaz.' }, { status: 400 });
    }

    const { id } = await params;
    const store = getSessionStore();
    let session;
    try { session = await store.get(id); }
    catch { return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 }); }
    if (!session) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 404 });
    if (!SessionManager.canTransition(session.state, 'patient_question')) {
        return NextResponse.json({ error: 'Bu durumda yeni soru gönderilemez.' }, { status: 409 });
    }

    try {
        const ok = await store.transition({
            id,
            expectedState: session.state,
            nextState: 'patient_question',
            event: { type: 'doctor_question', payload: { questionId, kind: body.kind, text } },
        });
        if (!ok) return NextResponse.json({ error: 'Oturum durumu değişti; yeniden deneyin.' }, { status: 409 });
    } catch {
        return NextResponse.json({ error: 'Soru kaydedilemedi.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, nextState: 'patient_question' });
}
