import { NextResponse } from 'next/server';

import { getSessionStore } from '@/lib/sessionStore';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const store = getSessionStore();
        const ready = await store.health();
        return NextResponse.json(
            { status: ready ? 'ready' : 'unavailable', service: 'signbridge-web', sessionStore: store.kind },
            { status: ready ? 200 : 503 },
        );
    } catch {
        return NextResponse.json(
            { status: 'unavailable', service: 'signbridge-web' },
            { status: 503 },
        );
    }
}
