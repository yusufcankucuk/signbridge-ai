import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { SessionManager } from '@/lib/stateMachine';
import { validateEmptyRequest } from '@/lib/apiValidation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const validation = await validateEmptyRequest(request);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.status });
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
