import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { SessionManager } from '@/lib/stateMachine';
import { readJsonObject } from '@/lib/apiValidation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const supabase = getSupabase();
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

    const { data: session, error: sessionError } = await supabase
        .from('consultation_sessions')
        .select('state')
        .eq('id', id)
        .maybeSingle();

    if (sessionError) return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 });
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
    const { error: eventError } = await supabase
        .from('interaction_events')
        .insert([{ session_id: id, type: 'doctor_response', payload: eventPayload }]);
    if (eventError) return NextResponse.json({ error: 'Doktor yanıtı kaydedilemedi.' }, { status: 500 });

    const { error: stateError } = await supabase
        .from('consultation_sessions')
        .update({ state: 'patient_review' })
        .eq('id', id);
    if (stateError) return NextResponse.json({ error: 'Oturum durumu güncellenemedi.' }, { status: 500 });

    return NextResponse.json({ success: true, nextState: 'patient_review' });
}
