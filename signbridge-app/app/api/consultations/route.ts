import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { validateEmptyRequest } from '@/lib/apiValidation';

export async function POST(request: Request) {
    const validation = await validateEmptyRequest(request);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.status });
    const supabase = getSupabase();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString(); // 30 dk sonra expire

    const { data, error } = await supabase
        .from('consultation_sessions')
        .insert([{ state: 'patient_capture', expires_at: expiresAt }])
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: 'Oturum oluşturulamadı.' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}
