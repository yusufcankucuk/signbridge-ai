import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { createAiService } from '@/lib/ai/service';
import { isAiServiceError } from '@/lib/ai/errors';
import { isLandmarkPredictionRequest } from '@/lib/prediction';
import { SessionManager } from '@/lib/stateMachine';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const supabase = getSupabase();
    const { id } = await params;
    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return NextResponse.json({ error: 'Geçerli bir JSON gövdesi gönderilmelidir.' }, { status: 400 });
    }

    if (!isLandmarkPredictionRequest(payload)) {
        return NextResponse.json(
            { error: 'Landmark girdisi 60 kare, 46 nokta ve landmark46-v1 sürümünde olmalıdır.' },
            { status: 400 },
        );
    }
    if (payload.sessionId && payload.sessionId !== id) {
        return NextResponse.json({ error: 'İstek gövdesindeki sessionId URL ile eşleşmiyor.' }, { status: 400 });
    }

    const { data: session, error: sessionError } = await supabase
        .from('consultation_sessions')
        .select('state')
        .eq('id', id)
        .maybeSingle();

    if (sessionError) {
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

    const { error: eventError } = await supabase
        .from('interaction_events')
        .insert([{ session_id: id, type: 'prediction', payload: result.prediction }]);
    if (eventError) {
        return NextResponse.json({ error: 'Tahmin kaydedilemedi.' }, { status: 500 });
    }

    const { error: stateError } = await supabase
        .from('consultation_sessions')
        .update({ state: 'patient_confirmation' })
        .eq('id', id);
    if (stateError) {
        return NextResponse.json({ error: 'Oturum durumu güncellenemedi.' }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        nextState: 'patient_confirmation',
        prediction: result.prediction,
        provider: result.provider,
        fallbackUsed: result.fallbackUsed,
    });
}
