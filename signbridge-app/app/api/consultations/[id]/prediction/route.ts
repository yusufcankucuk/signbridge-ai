import { NextResponse } from 'next/server';
import { getSessionStore } from '@/lib/sessionStore';
import { createAiService } from '@/lib/ai/service';
import { isAiServiceError } from '@/lib/ai/errors';
import { isLandmarkPredictionRequest } from '@/lib/prediction';
import { SessionManager } from '@/lib/stateMachine';
import { readJsonObject } from '@/lib/apiValidation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const store = getSessionStore();
    const { id } = await params;
    const parsed = await readJsonObject(request, {
        maxBytes: 256 * 1024,
        allowedFields: ['sessionId', 'preprocessingVersion', 'landmarks', 'mask'],
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const payload = parsed.value;

    if (!isLandmarkPredictionRequest(payload)) {
        return NextResponse.json(
            { error: 'Landmark girdisi 60 kare, 46 nokta ve landmark46-v1 sürümünde olmalıdır.' },
            { status: 400 },
        );
    }
    if (payload.sessionId && payload.sessionId !== id) {
        return NextResponse.json({ error: 'İstek gövdesindeki sessionId URL ile eşleşmiyor.' }, { status: 400 });
    }

    let session;
    try {
        session = await store.get(id);
    } catch {
        return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 });
    }
    if (!session) {
        return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 404 });
    }

    if (!SessionManager.canTransition(session.state, 'patient_confirmation')) {
        return NextResponse.json({ error: 'Geçersiz durum geçişi. Şu an patient_capture bekleniyor.' }, { status: 409 });
    }

    let result;
    try {
        result = await createAiService().predict({ ...payload, sessionId: id });
    } catch (error) {
        if (isAiServiceError(error)) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
        }
        return NextResponse.json(
            { error: 'AI servisi beklenmeyen bir hata üretti.', code: 'AI_UNAVAILABLE' },
            { status: 503 },
        );
    }

    let transitioned = false;
    try {
        transitioned = await store.transition({
            id,
            expectedState: session.state,
            nextState: 'patient_confirmation',
            event: { type: 'prediction', payload: result.prediction },
        });
    } catch {
        return NextResponse.json({ error: 'Oturum durumu güncellenemedi.' }, { status: 500 });
    }
    if (!transitioned) return NextResponse.json({ error: 'Oturum durumu değişti; yeniden deneyin.' }, { status: 409 });

    return NextResponse.json({
        success: true,
        nextState: 'patient_confirmation',
        prediction: result.prediction,
        provider: result.provider,
        fallbackUsed: result.fallbackUsed,
    });
}
