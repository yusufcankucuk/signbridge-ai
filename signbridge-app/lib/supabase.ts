import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient<any> | undefined;

export function getSupabase(): SupabaseClient<any> {
    if (client) return client;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY sunucu ortamında tanımlanmalıdır.');
    }

    client = createClient<any>(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return client;
}
