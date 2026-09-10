const ALLOWED_EVENT_TYPES = new Set([
    'mock_ai_prediction_succeeded',
    'mock_ai_prediction_failed',
    'mock_stt_succeeded',
    'mock_stt_failed'
]);

/**
 * @param {any} database
 * @param {{ type: string, latencyMs: number, errorCode?: string | null }} event
 */
export async function recordTechnicalEvent(database, { type, latencyMs, errorCode = null }) {
    if (!ALLOWED_EVENT_TYPES.has(type)) {
        return false;
    }

    const safeLatency = Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : 0;
    const safeErrorCode = typeof errorCode === 'string' ? errorCode.slice(0, 64) : null;

    try {
        const { error } = await database.from('technical_events').insert([{
            type,
            latency_ms: safeLatency,
            error_code: safeErrorCode
        }]);
        return !error;
    } catch {
        // Teknik log hatası ana görüşme akışını veya hassas veriyi dışarı sızdırmamalı.
        return false;
    }
}
