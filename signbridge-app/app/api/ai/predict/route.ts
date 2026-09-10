import { NextResponse } from 'next/server';
import { createAiService } from '@/lib/ai/service';
import { isAiServiceError } from '@/lib/ai/errors';
import { isLandmarkPredictionRequest } from '@/lib/prediction';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
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
