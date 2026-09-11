import type { PredictionPayload } from '@/types/session';

const MODES = new Set(['model', 'mock', 'manual']);
const PREDICTION_FIELDS = new Set([
    'classId',
    'displayText',
    'confidence',
    'alternatives',
    'isLowConfidence',
    'predictionMode',
    'modelVersion',
    'preprocessingVersion',
    'vocabularyVersion',
]);
const LANDMARK_REQUEST_FIELDS = new Set(['sessionId', 'preprocessingVersion', 'landmarks', 'mask']);

export interface LandmarkPredictionRequest {
    sessionId?: string;
    preprocessingVersion: string;
    landmarks: number[][][];
    mask: number[][];
}

function isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === 'string';
}

export function isPredictionPayload(value: unknown): value is PredictionPayload {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const payload = value as Record<string, unknown>;
    if (Object.keys(payload).some((key) => !PREDICTION_FIELDS.has(key))) return false;
    const confidenceIsValid =
        payload.confidence === null ||
        (typeof payload.confidence === 'number' &&
            Number.isFinite(payload.confidence) &&
            payload.confidence >= 0 &&
            payload.confidence <= 1);
    const alternativesAreValid =
        Array.isArray(payload.alternatives) &&
        payload.alternatives.length <= 3 &&
        payload.alternatives.every((item) => typeof item === 'string' && item.length <= 100);

    if (
        !isNullableString(payload.classId) ||
        (typeof payload.classId === 'string' && payload.classId.length > 100) ||
        typeof payload.displayText !== 'string' ||
        payload.displayText.trim().length === 0 ||
        payload.displayText.length > 500 ||
        !confidenceIsValid ||
        !alternativesAreValid ||
        typeof payload.isLowConfidence !== 'boolean' ||
        typeof payload.predictionMode !== 'string' ||
        !MODES.has(payload.predictionMode) ||
        !isNullableString(payload.modelVersion) ||
        (typeof payload.modelVersion === 'string' && payload.modelVersion.length > 100) ||
        typeof payload.preprocessingVersion !== 'string' ||
        payload.preprocessingVersion.length > 100 ||
        typeof payload.vocabularyVersion !== 'string' ||
        payload.vocabularyVersion.length > 100
    ) {
        return false;
    }

    if (payload.isLowConfidence && payload.classId !== null) return false;
    if (payload.predictionMode === 'manual' && payload.confidence !== null) return false;
    if (payload.predictionMode === 'model' && payload.modelVersion === null) return false;
    return true;
}

export function isLandmarkPredictionRequest(value: unknown): value is LandmarkPredictionRequest {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const request = value as Record<string, unknown>;
    if (Object.keys(request).some((key) => !LANDMARK_REQUEST_FIELDS.has(key))) return false;
    if (
        request.sessionId !== undefined &&
        (typeof request.sessionId !== 'string' || request.sessionId.length === 0 || request.sessionId.length > 100)
    ) return false;
    if (request.preprocessingVersion !== 'landmark46-v1') return false;
    if (!Array.isArray(request.landmarks) || request.landmarks.length !== 60) return false;
    if (!Array.isArray(request.mask) || request.mask.length !== 60) return false;

    for (let frame = 0; frame < 60; frame += 1) {
        const landmarks = request.landmarks[frame];
        const mask = request.mask[frame];
        if (!Array.isArray(landmarks) || landmarks.length !== 46) return false;
        if (!Array.isArray(mask) || mask.length !== 46) return false;
        for (let point = 0; point < 46; point += 1) {
            const coordinate = landmarks[point];
            if (
                !Array.isArray(coordinate) ||
                coordinate.length !== 2 ||
                coordinate.some((item) => typeof item !== 'number' || !Number.isFinite(item))
            ) {
                return false;
            }
            if (mask[point] !== 0 && mask[point] !== 1) return false;
        }
    }
    return true;
}
