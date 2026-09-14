import { NextResponse } from 'next/server';

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
        const body = await response.json() as { mode?: unknown; cameraAiEnabled?: unknown };
        const cameraAiEnabled = body.cameraAiEnabled !== false && motionPolicyEnabled;
        return NextResponse.json({
            status: 'ok',
            mode: cameraAiEnabled && typeof body.mode === 'string' ? body.mode : 'manual_only',
            cameraAiEnabled,
            minimumMotionScore,
        });
    } catch {
        return NextResponse.json({ status: 'unavailable', mode: 'manual_only', cameraAiEnabled: false, minimumMotionScore });
    }
}
