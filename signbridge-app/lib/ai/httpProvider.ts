import { isPredictionPayload } from '@/lib/prediction';
import type { AiContractVersions, AiProvider, AiProviderName, LandmarkPredictionRequest, PredictionPayload } from './contracts';
import { AI_ERROR_CODES, AiServiceError } from './errors';

export const AI_TIMEOUT_MS = 15_000;

type FetchImplementation = typeof fetch;

interface HttpAiProviderOptions {
    name: AiProviderName;
    endpoint: string;
    headers?: Record<string, string>;
    versions: AiContractVersions;
    fetchImplementation?: FetchImplementation;
}

function validateVersions(payload: PredictionPayload, expected: AiContractVersions): void {
    if (payload.predictionMode !== 'model') {
        throw new AiServiceError(
            AI_ERROR_CODES.INVALID_RESPONSE,
            'Gerçek AI sağlayıcısı model tahmini döndürmelidir.',
            502,
            false,
        );
    }

    if (
        payload.modelVersion !== expected.modelVersion ||
        payload.preprocessingVersion !== expected.preprocessingVersion ||
        payload.vocabularyVersion !== expected.vocabularyVersion
    ) {
        throw new AiServiceError(
            AI_ERROR_CODES.VERSION_MISMATCH,
            'AI model, etiket veya ön işleme sürümü backend ile uyumlu değil.',
            409,
            false,
        );
    }
}

export function createHttpAiProvider(options: HttpAiProviderOptions): AiProvider {
    const fetchImplementation = options.fetchImplementation ?? fetch;

    return {
        name: options.name,
        async predict(request: LandmarkPredictionRequest): Promise<PredictionPayload> {
            let response: Response;
            try {
                response = await fetchImplementation(options.endpoint, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        accept: 'application/json',
                        ...options.headers
                    },
                    body: JSON.stringify(request),
                    cache: 'no-store',
                    signal: AbortSignal.timeout(AI_TIMEOUT_MS)
                });
            } catch (error) {
                const isTimeout =
                    error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
                throw new AiServiceError(
                    isTimeout ? AI_ERROR_CODES.TIMEOUT : AI_ERROR_CODES.UNAVAILABLE,
                    isTimeout ? 'AI servisi 15 saniye içinde yanıt vermedi.' : 'AI servisine ulaşılamıyor.',
                    503,
                    true,
                );
            }

            if (!response.ok) {
                throw new AiServiceError(
                    AI_ERROR_CODES.UNAVAILABLE,
                    'AI sağlayıcısı isteği tamamlayamadı.',
                    503,
                    response.status >= 500,
                );
            }

            let payload: unknown;
            try {
                payload = await response.json();
            } catch {
                throw new AiServiceError(
                    AI_ERROR_CODES.INVALID_RESPONSE,
                    'AI sağlayıcısı geçerli JSON döndürmedi.',
                    502,
                    false,
                );
            }

            if (!isPredictionPayload(payload)) {
                throw new AiServiceError(
                    AI_ERROR_CODES.INVALID_RESPONSE,
                    'AI sağlayıcısı ortak cevap sözleşmesine uymuyor.',
                    502,
                    false,
                );
            }

            validateVersions(payload, options.versions);
            return payload;
        }
    };
}
