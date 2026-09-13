import { NextResponse } from 'next/server';
import { getSessionStore } from '@/lib/sessionStore';
import { SessionManager } from '@/lib/stateMachine';
import { validateEmptyRequest } from '@/lib/apiValidation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const validation = await validateEmptyRequest(request);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.status });
    const store = getSessionStore();
    const { id } = await params;
    let session;
    try { session = await store.get(id); }
    catch { return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 }); }
    if (!session) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 404 });
    if (!SessionManager.canTransition(session.state, 'patient_capture')) {
        return NextResponse.json({ error: 'Geçersiz durum geçişi.' }, { status: 409 });
    }

    try {
        const ok = await store.transition({ id, expectedState: session.state, nextState: 'patient_capture' });
        if (!ok) return NextResponse.json({ error: 'Oturum durumu değişti; yeniden deneyin.' }, { status: 409 });
    } catch { return NextResponse.json({ error: 'Yeni iletişim turu başlatılamadı.' }, { status: 500 }); }

    return NextResponse.json({ success: true, nextState: 'patient_capture' });
}
