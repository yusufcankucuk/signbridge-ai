import { NextResponse } from 'next/server';

import { readJsonObject } from '@/lib/apiValidation';
import { getSessionStore } from '@/lib/sessionStore';
import { SessionManager } from '@/lib/stateMachine';
import type { DoctorQuestionPayload } from '@/types/session';

const QUESTION_KINDS = new Set<DoctorQuestionPayload['kind']>([
    'duration',
    'intensity',
    'location',
    'medication',
    'custom',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const parsed = await readJsonObject(request, {
        maxBytes: 2 * 1024,
        allowedFields: ['questionId', 'kind', 'text'],
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

    const body = parsed.value;
    if (typeof body.questionId !== 'string' || !UUID_PATTERN.test(body.questionId)) {
        return NextResponse.json({ error: 'questionId geçerli bir UUID olmalıdır.' }, { status: 400 });
    }
    if (typeof body.kind !== 'string' || !QUESTION_KINDS.has(body.kind as DoctorQuestionPayload['kind'])) {
        return NextResponse.json({ error: 'Geçersiz soru türü.' }, { status: 400 });
    }
    if (typeof body.text !== 'string' || !body.text.trim()) {
        return NextResponse.json({ error: 'Soru metni boş olamaz.' }, { status: 400 });
    }
    if (body.text.length > 180) {
        return NextResponse.json({ error: 'Soru metni 180 karakteri aşamaz.' }, { status: 400 });
    }

    const { id } = await params;
    const store = getSessionStore();
    let session;
    try { session = await store.get(id); }
    catch { return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 }); }
    if (!session) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 404 });
    if (!SessionManager.canTransition(session.state, 'patient_response')) {
        return NextResponse.json({ error: 'Geçersiz durum geçişi.' }, { status: 409 });
    }

    const payload: DoctorQuestionPayload = {
        questionId: body.questionId,
        kind: body.kind as DoctorQuestionPayload['kind'],
        text: body.text.trim(),
    };
    try {
        const ok = await store.transition({
            id,
            expectedState: session.state,
            nextState: 'patient_response',
            event: { type: 'doctor_question', payload },
        });
        if (!ok) return NextResponse.json({ error: 'Oturum durumu değişti; yeniden deneyin.' }, { status: 409 });
    } catch {
        return NextResponse.json({ error: 'Doktor sorusu kaydedilemedi.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, nextState: 'patient_response', questionId: payload.questionId });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const parsed = await readJsonObject(request, {
        maxBytes: 512,
        allowedFields: ['questionId'],
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    if (typeof parsed.value.questionId !== 'string' || !UUID_PATTERN.test(parsed.value.questionId)) {
        return NextResponse.json({ error: 'questionId geçerli bir UUID olmalıdır.' }, { status: 400 });
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
    if (pendingQuestionId !== parsed.value.questionId) {
        return NextResponse.json({ error: 'İptal edilen soru bekleyen soruyla eşleşmiyor.' }, { status: 409 });
    }

    try {
        const ok = await store.transition({ id, expectedState: session.state, nextState: 'doctor_review' });
        if (!ok) return NextResponse.json({ error: 'Oturum durumu değişti; yeniden deneyin.' }, { status: 409 });
    } catch {
        return NextResponse.json({ error: 'Doktor sorusu iptal edilemedi.' }, { status: 500 });
    }
    return NextResponse.json({ success: true, nextState: 'doctor_review' });
}
