import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase'; // Yol projenin yapısına göre değişebilir (örn: '../../../lib/supabase')

export async function POST() {
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString(); // 30 dk sonra expire

    const { data, error } = await supabase
        .from('consultation_sessions')
        .insert([{ state: 'patient_capture', expires_at: expiresAt }])
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}