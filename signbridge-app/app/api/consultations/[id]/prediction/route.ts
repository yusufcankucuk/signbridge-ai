import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { isPredictionPayload } from '@/lib/prediction';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const supabase = getSupabase();
    const { id } = await params;
    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return NextResponse.json({ error: 'Geçerli bir JSON gövdesi gönderilmelidir.' }, { status: 400 });
    }

    if (!isPredictionPayload(payload)) {
        return NextResponse.json(
            { error: 'Tahmin verisi SignBridge AI sözleşmesine uymuyor.' },
            { status: 400 },
        );
    }

    const { data: session } = await supabase.from('consultation_sessions').select('state').eq('id', id).single();

    if (session?.state !== 'patient_capture') {
        return NextResponse.json({ error: 'Geçersiz durum geçişi. Şu an patient_capture bekleniyor.' }, { status: 409 });
    }

    // Tahmini kaydet ve durumu güncelle
    const { error: eventError } = await supabase
        .from('interaction_events')
        .insert([{ session_id: id, type: 'prediction', payload }]);
    if (eventError) {
        return NextResponse.json({ error: 'Tahmin kaydedilemedi.' }, { status: 500 });
    }

    const { error: stateError } = await supabase
        .from('consultation_sessions')
        .update({ state: 'patient_confirmation' })
        .eq('id', id);
    if (stateError) {
        return NextResponse.json({ error: 'Oturum durumu güncellenemedi.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Tahmin onaya sunuldu.' });
}
