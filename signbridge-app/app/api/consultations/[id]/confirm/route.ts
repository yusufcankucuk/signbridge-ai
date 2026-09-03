import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;
    const body = await request.json(); // { confirmed: boolean, manualSelection?: string }

    const { data: session } = await supabase.from('consultation_sessions').select('state').eq('id', id).single();

    if (session?.state !== 'patient_confirmation') {
        return NextResponse.json({ error: 'Geçersiz durum geçişi.' }, { status: 409 });
    }

    // Kararı kaydet
    await supabase.from('interaction_events').insert([{ session_id: id, type: 'confirmation', payload: body }]);

    // Onaylandıysa veya manuel seçildiyse doktora geç, reddedildiyse kameraya dön[cite: 2]
    const nextState = body.confirmed || body.manualSelection ? 'doctor_review' : 'patient_capture';
    await supabase.from('consultation_sessions').update({ state: nextState }).eq('id', id);

    return NextResponse.json({ success: true, nextState });
}