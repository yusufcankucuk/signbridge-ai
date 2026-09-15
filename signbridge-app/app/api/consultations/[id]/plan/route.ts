import { NextResponse } from 'next/server';

import { readJsonObject } from '@/lib/apiValidation';
import { getSessionStore } from '@/lib/sessionStore';
import { SessionManager } from '@/lib/stateMachine';
import type { TreatmentPlanPayload } from '@/types/session';

function istanbulToday(): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
}

function text(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized && normalized.length <= max ? normalized : null;
}

function parsePlan(value: Record<string, unknown>): TreatmentPlanPayload | null {
    const diagnosis = text(value.diagnosis, 100);
    const explanation = text(value.explanation, 500);
    const adviceValue = typeof value.advice === 'string' ? value.advice.trim() : null;
    if (!diagnosis || !explanation || adviceValue === null || adviceValue.length > 500) return null;
    if (typeof value.noMedication !== 'boolean' || typeof value.noFollowup !== 'boolean') return null;
    if (!Array.isArray(value.medications) || value.medications.length > 10) return null;
    const medications = value.medications.map((item) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
        const row = item as Record<string, unknown>;
        const allowed = new Set(['id', 'name', 'dose', 'frequency', 'meal', 'duration']);
        if (Object.keys(row).some((key) => !allowed.has(key))) return null;
        const id = text(row.id, 100); const name = text(row.name, 100); const dose = text(row.dose, 80);
        const frequency = text(row.frequency, 80); const meal = text(row.meal, 100); const duration = text(row.duration, 80);
        return id && name && dose && frequency && meal && duration ? { id, name, dose, frequency, meal, duration } : null;
    });
    if (medications.some((item) => item === null)) return null;
    if (value.noMedication && medications.length > 0) return null;
    if (!value.noMedication && medications.length === 0) return null;
    if (value.noMedication && !adviceValue) return null;
    const followupDate = typeof value.followupDate === 'string' ? value.followupDate : '';
    if (!value.noFollowup && (!/^\d{4}-\d{2}-\d{2}$/.test(followupDate) || followupDate < istanbulToday())) return null;
    if (value.noFollowup && followupDate !== '') return null;
    return {
        diagnosis, explanation, medications: medications as TreatmentPlanPayload['medications'],
        noMedication: value.noMedication, advice: adviceValue,
        followupDate, noFollowup: value.noFollowup, approved: true,
    };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const parsed = await readJsonObject(request, {
        maxBytes: 24 * 1024,
        allowedFields: ['diagnosis', 'explanation', 'medications', 'noMedication', 'advice', 'followupDate', 'noFollowup'],
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const plan = parsePlan(parsed.value);
    if (!plan) return NextResponse.json({ error: 'Tedavi planı eksik, geçersiz veya kontrol tarihi geçmiş.' }, { status: 400 });

    const { id } = await params; const store = getSessionStore();
    let session;
    try { session = await store.get(id); }
    catch { return NextResponse.json({ error: 'Oturum okunamadı.' }, { status: 500 }); }
    if (!session) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 404 });
    if (!SessionManager.canTransition(session.state, 'patient_review')) {
        return NextResponse.json({ error: 'Bu durumda tedavi planı gönderilemez.' }, { status: 409 });
    }
    try {
        const ok = await store.transition({
            id, expectedState: session.state, nextState: 'patient_review',
            event: { type: 'treatment_plan', payload: plan },
        });
        if (!ok) return NextResponse.json({ error: 'Oturum durumu değişti; yeniden deneyin.' }, { status: 409 });
    } catch { return NextResponse.json({ error: 'Tedavi planı kaydedilemedi.' }, { status: 500 }); }
    return NextResponse.json({ success: true, nextState: 'patient_review', plan });
}
