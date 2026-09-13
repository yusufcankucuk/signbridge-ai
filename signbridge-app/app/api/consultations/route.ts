import { NextResponse } from 'next/server';
import { getSessionStore } from '@/lib/sessionStore';
import { validateEmptyRequest } from '@/lib/apiValidation';

export async function POST(request: Request) {
    const validation = await validateEmptyRequest(request);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.status });
    try {
        const session = await getSessionStore().create();
        return NextResponse.json(session, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Oturum oluşturulamadı.' }, { status: 500 });
    }
}
