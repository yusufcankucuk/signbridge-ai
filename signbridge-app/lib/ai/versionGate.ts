import type { AiContractVersions } from './contracts';

type Environment = Record<string, string | undefined>;

/** Web uygulamasının beklediği model sözleşmesi (AI_EXPECTED_* ortam değişkenleri). */
export function expectedAiVersions(environment: Environment): AiContractVersions {
    return {
        modelVersion: environment.AI_EXPECTED_MODEL_VERSION || 'autsl20-bigru-v0.1.0',
        preprocessingVersion: environment.AI_EXPECTED_PREPROCESSING_VERSION || 'landmark46-v1',
        vocabularyVersion: environment.AI_EXPECTED_VOCABULARY_VERSION || 'autsl20-v1',
    };
}

/**
 * AI servisinin /health yanıtındaki sürümleri beklenenle karşılaştırır.
 * Sözlük/ön işleme alanını göndermeyen eski servisler AUTSL-20 ve landmark46-v1 kabul edilir.
 */
export function versionMismatches(
    health: { modelVersion?: unknown; vocabularyVersion?: unknown; preprocessingVersion?: unknown },
    expected: AiContractVersions,
): Array<keyof AiContractVersions> {
    const reported: AiContractVersions = {
        modelVersion: typeof health.modelVersion === 'string' ? health.modelVersion : '',
        vocabularyVersion: typeof health.vocabularyVersion === 'string' ? health.vocabularyVersion : 'autsl20-v1',
        preprocessingVersion: typeof health.preprocessingVersion === 'string' ? health.preprocessingVersion : 'landmark46-v1',
    };
    return (Object.keys(expected) as Array<keyof AiContractVersions>).filter(key => reported[key] !== expected[key]);
}
