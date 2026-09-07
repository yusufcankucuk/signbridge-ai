import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const supabase = getSupabase();
    const { id } = await params;

    // 1. Durumu ended olarak işaretle
    await supabase.from('consultation_sessions').update({ state: 'ended' }).eq('id', id);

    // 2. Hassas sağlık ve konuşma verilerini içeren interaction_events tablosunu temizle
    await supabase.from('interaction_events').delete().eq('session_id', id);

    return NextResponse.json({ success: true, message: 'Oturum güvenle sonlandırıldı ve hassas veriler temizlendi.' });
}
