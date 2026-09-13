import { NextResponse } from 'next/server';
import { getSessionStore } from '@/lib/sessionStore';
import { SessionManager } from '@/lib/stateMachine';
import { readJsonObject } from '@/lib/apiValidation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const store = getSessionStore();
    const { id } = await params;
    const parsed = await readJsonObject(request, {
        maxBytes: 8 * 1024,
        allowedFields: ['transcript', 'source', 'edited'],
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const body = parsed.value;
    const payload = body as { transcript?: unknown; source?: unknown; edited?: unknown };
    if (typeof payload.transcript !== 'string' || !payload.transcript.trim()) {
        return NextResponse.json({ error: 'Doktor yanıtı boş olamaz.' }, { status: 400 });
    }
    if (payload.transcript.length > 2_000) {
        return NextResponse.json({ error: 'Doktor yanıtı 2000 karakteri aşamaz.' }, { status: 400 });
    }
    if (payload.source !== 'speech' && payload.source !== 'text') {
        return NextResponse.json({ error: 'Doktor yanıt kaynağı speech veya text olmalıdır.' }, { status: 400 });
    }
    if (payload.edited !== undefined && typeof payload.edited !== 'boolean') {
        return NextResponse.json({ error: 'edited alanı boolean olmalıdır.' }, { status: 400 });
    }

    let session;
    try { session = await store.get(id); }
    catch { return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 }); }
    if (!session) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 404 });
    if (
        !SessionManager.canTransition(session.state, 'doctor_response') ||
        !SessionManager.canTransition('doctor_response', 'patient_review')
    ) {
        return NextResponse.json({ error: 'Geçersiz durum geçişi.' }, { status: 409 });
    }

    const eventPayload = {
        transcript: payload.transcript.trim(),
        source: payload.source,
        edited: payload.edited ?? false,
    };
    try {
        const ok = await store.transition({ id, expectedState: session.state, nextState: 'patient_review', event: { type: 'doctor_response', payload: eventPayload } });
        if (!ok) return NextResponse.json({ error: 'Oturum durumu değişti; yeniden deneyin.' }, { status: 409 });
    } catch { return NextResponse.json({ error: 'Doktor yanıtı kaydedilemedi.' }, { status: 500 }); }

    return NextResponse.json({ success: true, nextState: 'patient_review' });
}
