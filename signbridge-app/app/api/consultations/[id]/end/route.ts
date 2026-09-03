import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;

    // 1. Durumu ended olarak işaretle
    await supabase.from('consultation_sessions').update({ state: 'ended' }).eq('id', id);

    // 2. Hassas sağlık ve konuşma verilerini içeren interaction_events tablosunu temizle
    await supabase.from('interaction_events').delete().eq('session_id', id);

    return NextResponse.json({ success: true, message: 'Oturum güvenle sonlandırıldı ve hassas veriler temizlendi.' });
}