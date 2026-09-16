import { NextResponse } from 'next/server';
import { expectedAiVersions, versionMismatches } from '@/lib/ai/versionGate';

export const dynamic = 'force-dynamic';

export async function GET() {
    const provider = process.env.AI_PROVIDER ?? 'mock';
    const motionPolicyEnabled = process.env.CAMERA_MOTION_POLICY_ENABLED === 'true';
    const configuredThreshold = Number(process.env.CAMERA_MINIMUM_MOTION_SCORE ?? '0.12');
    const minimumMotionScore = Number.isFinite(configuredThreshold) && configuredThreshold >= 0
        ? configuredThreshold
        : 0.12;
    if (provider === 'mock') {
        return NextResponse.json({
            status: 'ok', mode: motionPolicyEnabled ? 'mock' : 'manual_only',
            cameraAiEnabled: motionPolicyEnabled, minimumMotionScore,
            experimental: motionPolicyEnabled,
            warning: motionPolicyEnabled ? 'Deneysel kamera tahmini; tıbbi tanı değildir ve hasta onayı zorunludur.' : null,
        });
    }
    if (provider !== 'local') {
        return NextResponse.json({
            status: 'ok', mode: motionPolicyEnabled ? provider : 'manual_only',
            cameraAiEnabled: motionPolicyEnabled, minimumMotionScore,
        });
    }
    const base = (process.env.AI_LOCAL_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
    try {
        const response = await fetch(`${base}/health`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(3_000),
        });
        if (!response.ok) throw new Error('AI health failed');
        const body = await response.json() as {
            mode?: unknown;
            cameraAiEnabled?: unknown;
            modelLoaded?: unknown;
            modelVersion?: unknown;
            decisionPolicyVersion?: unknown;
            experimental?: unknown;
            warning?: unknown;
            vocabularyVersion?: unknown;
            preprocessingVersion?: unknown;
        };
        // Servis beklenen model/sözlük sürümünü çalıştırmıyorsa kamera tahmini hiç açılmaz.
        const expectedVersions = expectedAiVersions(process.env);
        const mismatches = body.modelLoaded === false ? [] : versionMismatches(body, expectedVersions);
        const cameraAiEnabled = body.cameraAiEnabled !== false && motionPolicyEnabled && mismatches.length === 0;
        return NextResponse.json({
            status: 'ok',
            mode: cameraAiEnabled && typeof body.mode === 'string' ? body.mode : 'manual_only',
            cameraAiEnabled,
            minimumMotionScore,
            modelVersion: typeof body.modelVersion === 'string' ? body.modelVersion : null,
            decisionPolicyVersion: typeof body.decisionPolicyVersion === 'string' ? body.decisionPolicyVersion : null,
            experimental: cameraAiEnabled && body.experimental === true,
            warning: cameraAiEnabled && typeof body.warning === 'string' ? body.warning : null,
            vocabularyVersion: typeof body.vocabularyVersion === 'string' ? body.vocabularyVersion : null,
            expectedVersions,
            versionMismatch: mismatches.length > 0,
            versionMismatchFields: mismatches,
        });
    } catch {
        return NextResponse.json({
            status: 'unavailable', mode: 'manual_only', cameraAiEnabled: false,
            minimumMotionScore, modelVersion: null, decisionPolicyVersion: null,
            experimental: false, warning: null, vocabularyVersion: null,
        });
    }
}
