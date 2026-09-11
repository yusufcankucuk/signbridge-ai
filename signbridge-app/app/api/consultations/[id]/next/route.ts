import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { SessionManager } from '@/lib/stateMachine';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const supabase = getSupabase();
    const { id } = await params;
    const { data: session, error: sessionError } = await supabase
        .from('consultation_sessions')
        .select('state')
        .eq('id', id)
        .maybeSingle();

    if (sessionError) return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 });
    if (!session) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 404 });
    if (!SessionManager.canTransition(session.state, 'patient_capture')) {
        return NextResponse.json({ error: 'Geçersiz durum geçişi.' }, { status: 409 });
    }

    const { error: stateError } = await supabase
        .from('consultation_sessions')
        .update({ state: 'patient_capture' })
        .eq('id', id);
    if (stateError) return NextResponse.json({ error: 'Yeni iletişim turu başlatılamadı.' }, { status: 500 });

    return NextResponse.json({ success: true, nextState: 'patient_capture' });
}
