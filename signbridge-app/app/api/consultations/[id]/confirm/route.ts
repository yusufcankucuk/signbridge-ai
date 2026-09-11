import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { SessionManager } from '@/lib/stateMachine';
import { readJsonObject } from '@/lib/apiValidation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const supabase = getSupabase();
    const { id } = await params;
    const parsed = await readJsonObject(request, {
        maxBytes: 2 * 1024,
        allowedFields: ['confirmed', 'manualSelection'],
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const body = parsed.value;

    if (typeof body !== 'object' || body === null || typeof (body as { confirmed?: unknown }).confirmed !== 'boolean') {
        return NextResponse.json({ error: 'confirmed alanı boolean olmalıdır.' }, { status: 400 });
    }
    const confirmation = body as { confirmed: boolean; manualSelection?: unknown };
    const manualSelection =
        typeof confirmation.manualSelection === 'string' && confirmation.manualSelection.trim()
            ? confirmation.manualSelection.trim()
            : undefined;
    if (confirmation.manualSelection !== undefined && !manualSelection) {
        return NextResponse.json({ error: 'manualSelection boş olamaz.' }, { status: 400 });
    }
    if (manualSelection && manualSelection.length > 120) {
        return NextResponse.json({ error: 'manualSelection 120 karakteri aşamaz.' }, { status: 400 });
    }

    const { data: session, error: sessionError } = await supabase
        .from('consultation_sessions')
        .select('state')
        .eq('id', id)
        .maybeSingle();

    if (sessionError) return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 });
    if (!session) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 404 });
    if (session.state !== 'patient_confirmation') {
        return NextResponse.json({ error: 'Geçersiz durum geçişi.' }, { status: 409 });
    }

    const eventPayload = { confirmed: confirmation.confirmed, ...(manualSelection ? { manualSelection } : {}) };
    const { error: eventError } = await supabase
        .from('interaction_events')
        .insert([{ session_id: id, type: 'confirmation', payload: eventPayload }]);
    if (eventError) return NextResponse.json({ error: 'Hasta onayı kaydedilemedi.' }, { status: 500 });

    const nextState = confirmation.confirmed || manualSelection ? 'doctor_review' : 'patient_capture';
    if (!SessionManager.canTransition(session.state, nextState)) {
        return NextResponse.json({ error: 'Geçersiz durum geçişi.' }, { status: 409 });
    }
    const { error: stateError } = await supabase.from('consultation_sessions').update({ state: nextState }).eq('id', id);
    if (stateError) return NextResponse.json({ error: 'Oturum durumu güncellenemedi.' }, { status: 500 });

    return NextResponse.json({ success: true, nextState });
}
