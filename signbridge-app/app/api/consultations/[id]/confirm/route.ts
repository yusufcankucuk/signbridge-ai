import { NextResponse } from 'next/server';
import { getSessionStore } from '@/lib/sessionStore';
import { SessionManager } from '@/lib/stateMachine';
import { readJsonObject } from '@/lib/apiValidation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const store = getSessionStore();
    const { id } = await params;
    const parsed = await readJsonObject(request, {
        maxBytes: 2 * 1024,
        allowedFields: ['confirmed', 'manualSelection'],
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const body = parsed.value;

    if (typeof body !== 'object' || body === null || typeof (body as { confirmed?: unknown }).confirmed !== 'boolean') {
        return NextResponse.json({ error: 'confirmed alanı boolean olmalıdır.' }, { status: 400 });
    }
    const confirmation = body as { confirmed: boolean; manualSelection?: unknown };
    const manualSelection =
        typeof confirmation.manualSelection === 'string' && confirmation.manualSelection.trim()
            ? confirmation.manualSelection.trim()
            : undefined;
    if (confirmation.manualSelection !== undefined && !manualSelection) {
        return NextResponse.json({ error: 'manualSelection boş olamaz.' }, { status: 400 });
    }
    if (manualSelection && manualSelection.length > 120) {
        return NextResponse.json({ error: 'manualSelection 120 karakteri aşamaz.' }, { status: 400 });
    }

    let session;
    try { session = await store.get(id); }
    catch { return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 }); }
    if (!session) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 404 });
    const manualFromCapture = session.state === 'patient_capture' && Boolean(manualSelection);
    const answerConfirmation = session.state === 'patient_answer_confirmation';
    if (session.state !== 'patient_confirmation' && !answerConfirmation && !manualFromCapture) {
        return NextResponse.json({ error: 'Geçersiz durum geçişi.' }, { status: 409 });
    }

    const eventPayload = { confirmed: confirmation.confirmed, ...(manualSelection ? { manualSelection } : {}) };
    const retryState = answerConfirmation ? 'patient_answer' : 'patient_capture';
    const nextState = confirmation.confirmed || manualSelection ? 'doctor_review' : retryState;
    if (!manualFromCapture && !SessionManager.canTransition(session.state, nextState)) {
        return NextResponse.json({ error: 'Geçersiz durum geçişi.' }, { status: 409 });
    }
    let event: { type: 'confirmation' | 'patient_answer'; payload: unknown } = { type: 'confirmation', payload: eventPayload };
    if (answerConfirmation && confirmation.confirmed && !manualSelection) {
        try {
            const events = await store.getEvents(id);
            const prediction = [...events].reverse().find((item) => item.type === 'prediction')?.payload as { displayText?: unknown } | undefined;
            const questionId = await store.getPendingQuestionId(id);
            if (!questionId || typeof prediction?.displayText !== 'string' || !prediction.displayText.trim()) {
                return NextResponse.json({ error: 'Onaylanacak kamera yanıtı bulunamadı.' }, { status: 409 });
            }
            event = { type: 'patient_answer', payload: { questionId, answer: prediction.displayText.trim(), source: 'model' } };
        } catch { return NextResponse.json({ error: 'Kamera yanıtı okunamadı.' }, { status: 500 }); }
    }
    try {
        const ok = await store.transition({ id, expectedState: session.state, nextState, event });
        if (!ok) return NextResponse.json({ error: 'Oturum durumu değişti; yeniden deneyin.' }, { status: 409 });
    } catch { return NextResponse.json({ error: 'Oturum durumu güncellenemedi.' }, { status: 500 }); }

    return NextResponse.json({ success: true, nextState });
}
