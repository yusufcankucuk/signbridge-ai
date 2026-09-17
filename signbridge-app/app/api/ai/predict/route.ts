import { NextResponse } from 'next/server';
import { createAiService } from '@/lib/ai/service';
import { isAiServiceError } from '@/lib/ai/errors';
import { isLandmarkPredictionRequest } from '@/lib/prediction';
import { readJsonObject } from '@/lib/apiValidation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const parsed = await readJsonObject(request, {
        maxBytes: 256 * 1024,
        allowedFields: ['sessionId', 'preprocessingVersion', 'landmarks', 'mask', 'recognitionContext'],
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const payload = parsed.value;

    if (!isLandmarkPredictionRequest(payload)) {
        return NextResponse.json(
            { error: 'Landmark girdisi 60 kare, 46 nokta ve landmark46-v1 sürümünde olmalıdır.' },
            { status: 400 },
        );
    }

    try {
        const result = await createAiService().predict(payload);
        return NextResponse.json(result.prediction, {
            headers: {
                'X-SignBridge-AI-Provider': result.provider,
                'X-SignBridge-AI-Fallback': String(result.fallbackUsed)
            }
        });
    } catch (error) {
        if (isAiServiceError(error)) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.status },
            );
        }
        return NextResponse.json(
            { error: 'AI servisi beklenmeyen bir hata üretti.', code: 'AI_UNAVAILABLE' },
            { status: 503 },
        );
    }
}
