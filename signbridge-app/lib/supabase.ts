import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient<any> | undefined;

export function getSupabase(): SupabaseClient<any> {
    if (client) return client;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('SUPABASE_URL ve SUPABASE_ANON_KEY ortam değişkenleri tanımlanmalıdır.');
    }

    client = createClient<any>(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return client;
}
