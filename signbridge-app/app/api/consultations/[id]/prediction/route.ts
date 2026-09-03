import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;
    const payload = await request.json();

    const { data: session } = await supabase.from('consultation_sessions').select('state').eq('id', id).single();

    if (session?.state !== 'patient_capture') {
        return NextResponse.json({ error: 'Geçersiz durum geçişi. Şu an patient_capture bekleniyor.' }, { status: 409 });
    }

    // Tahmini kaydet ve durumu güncelle
    await supabase.from('interaction_events').insert([{ session_id: id, type: 'prediction', payload }]);
    await supabase.from('consultation_sessions').update({ state: 'patient_confirmation' }).eq('id', id);

    return NextResponse.json({ success: true, message: 'Tahmin onaya sunuldu.' });
}