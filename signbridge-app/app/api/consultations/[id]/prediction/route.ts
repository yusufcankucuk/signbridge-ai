import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createAiService } from '@/lib/services/aiService.mjs';
import { recordTechnicalEvent } from '@/lib/services/technicalEventLogger.mjs';

const aiService = createAiService();

export async function POST(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;
    const startedAt = Date.now();
    const { data: session } = await supabase.from('consultation_sessions').select('state').eq('id', id).single();

    if (session?.state !== 'patient_capture') {
        return NextResponse.json({ error: 'Geçersiz durum geçişi. Şu an patient_capture bekleniyor.' }, { status: 409 });
    }

    try {
        // Mock sağlayıcı ham kamera karesi veya landmark verisi saklamaz.
        const prediction = await aiService.predict();
        const { error: eventError } = await supabase
            .from('interaction_events')
            .insert([{ session_id: id, type: 'prediction', payload: prediction }]);
        const { error: stateError } = await supabase
            .from('consultation_sessions')
            .update({ state: 'patient_confirmation', model_version: prediction.modelVersion })
            .eq('id', id);

        if (eventError || stateError) {
            await recordTechnicalEvent(supabase, {
                type: 'mock_ai_prediction_failed',
                latencyMs: Date.now() - startedAt,
                errorCode: 'PERSISTENCE_ERROR'
            });
            return NextResponse.json({ error: 'Tahmin kaydedilemedi.' }, { status: 500 });
        }

        await recordTechnicalEvent(supabase, {
            type: 'mock_ai_prediction_succeeded',
            latencyMs: Date.now() - startedAt
        });

        return NextResponse.json({
            success: true,
            prediction,
            provider: aiService.provider,
            nextState: 'patient_confirmation'
        });
    } catch {
        await recordTechnicalEvent(supabase, {
            type: 'mock_ai_prediction_failed',
            latencyMs: Date.now() - startedAt,
            errorCode: 'PROVIDER_ERROR'
        });
        return NextResponse.json({ error: 'AI servisi şu anda kullanılamıyor.' }, { status: 503 });
    }
}
