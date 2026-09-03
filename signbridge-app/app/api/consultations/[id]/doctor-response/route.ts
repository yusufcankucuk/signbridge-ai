import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;
    const payload = await request.json(); // { transcript: string, source: 'speech' | 'text' }

    const { data: session } = await supabase.from('consultation_sessions').select('state').eq('id', id).single();

    if (session?.state !== 'doctor_review' && session?.state !== 'doctor_response') {
        return NextResponse.json({ error: 'Geçersiz durum geçişi.' }, { status: 409 });
    }

    if (!payload.transcript) {
        return NextResponse.json({ error: 'Doktor yanıtı boş olamaz.' }, { status: 400 });
    }

    await supabase.from('interaction_events').insert([{ session_id: id, type: 'doctor_response', payload }]);
    await supabase.from('consultation_sessions').update({ state: 'patient_review' }).eq('id', id);

    return NextResponse.json({ success: true, message: 'Yanıt hastaya iletildi.' });
}