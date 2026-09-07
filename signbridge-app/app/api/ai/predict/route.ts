import { NextResponse } from 'next/server';
import { isLandmarkPredictionRequest, isPredictionPayload } from '@/lib/prediction';

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

    const serviceUrl = process.env.AI_SERVICE_URL || 'http://ai-inference:8000';
    try {
        const response = await fetch(`${serviceUrl}/predict`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store',
            signal: AbortSignal.timeout(15_000),
        });
        const result: unknown = await response.json();
        if (!response.ok) {
            return NextResponse.json(result, { status: response.status });
        }
        if (!isPredictionPayload(result)) {
            return NextResponse.json({ error: 'AI servisi geçersiz bir cevap döndürdü.' }, { status: 502 });
        }
        return NextResponse.json(result);
    } catch {
        return NextResponse.json({ error: 'AI servisine şu anda ulaşılamıyor.' }, { status: 503 });
    }
}
