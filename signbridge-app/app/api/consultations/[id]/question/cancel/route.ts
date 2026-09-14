import { NextResponse } from 'next/server';

import { getSessionStore } from '@/lib/sessionStore';
import { validateEmptyRequest } from '@/lib/apiValidation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const validation = await validateEmptyRequest(request);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.status });
    const { id } = await params;
    const store = getSessionStore();
    let session;
    try { session = await store.get(id); }
    catch { return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 }); }
    if (!session) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 404 });
    if (session.state !== 'patient_question' && session.state !== 'patient_answer') {
        return NextResponse.json({ error: 'Bu durumda soru iptal edilemez.' }, { status: 409 });
    }
    try {
        const ok = await store.transition({
            id,
            expectedState: session.state,
            nextState: 'doctor_review',
            event: { type: 'question_cancelled', payload: {} },
        });
        if (!ok) return NextResponse.json({ error: 'Oturum durumu değişti; yeniden deneyin.' }, { status: 409 });
    } catch {
        return NextResponse.json({ error: 'Soru iptal edilemedi.' }, { status: 500 });
    }
    return NextResponse.json({ success: true, nextState: 'doctor_review' });
}
