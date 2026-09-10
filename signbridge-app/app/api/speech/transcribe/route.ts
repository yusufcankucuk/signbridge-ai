import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createSpeechToTextService } from '@/lib/services/speechToTextService.mjs';
import { recordTechnicalEvent } from '@/lib/services/technicalEventLogger.mjs';

const speechService = createSpeechToTextService();

export async function POST() {
    const startedAt = Date.now();
    try {
        // Demo endpoint'i ham ses kabul etmez veya saklamaz; yalnızca örnek metin döndürür.
        const result = await speechService.transcribe();
        await recordTechnicalEvent(supabase, {
            type: 'mock_stt_succeeded',
            latencyMs: Date.now() - startedAt
        });

        return NextResponse.json({
            ...result,
            textFallbackRequired: speechService.textFallbackRequired,
            browserSpeechPreferred: true
        });
    } catch {
        await recordTechnicalEvent(supabase, {
            type: 'mock_stt_failed',
            latencyMs: Date.now() - startedAt,
            errorCode: 'PROVIDER_ERROR'
        });
        return NextResponse.json({
            error: 'Ses servisi kullanılamıyor. Doktor yanıtını metin olarak girmelidir.',
            textFallbackRequired: true
        }, { status: 503 });
    }
}
