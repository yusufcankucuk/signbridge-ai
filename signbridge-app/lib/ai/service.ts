import type { AiProvider, AiServiceResult, LandmarkPredictionRequest } from './contracts';
import { getAiServiceConfig, type AiServiceConfig } from './config';
import { isAiServiceError } from './errors';
import { createLocalAiProvider, createModelArtsAiProvider } from './providers';

function providerFor(config: AiServiceConfig): AiProvider {
    return config.provider === 'modelarts'
        ? createModelArtsAiProvider(config)
        : createLocalAiProvider(config);
}

export function createAiService(config: AiServiceConfig = getAiServiceConfig()) {
    const primaryProvider = providerFor(config);
    const fallbackProvider =
        config.provider === 'modelarts' && config.fallbackProvider === 'local'
            ? createLocalAiProvider(config)
            : undefined;

    return {
        async predict(request: LandmarkPredictionRequest): Promise<AiServiceResult> {
            try {
                return {
                    prediction: await primaryProvider.predict(request),
                    provider: primaryProvider.name,
                    fallbackUsed: false
                };
            } catch (error) {
                if (!fallbackProvider || !isAiServiceError(error) || !error.retryable) {
                    throw error;
                }

                return {
                    prediction: await fallbackProvider.predict(request),
                    provider: fallbackProvider.name,
                    fallbackUsed: true
                };
            }
        }
    };
}
