import { expectedAiVersions } from './versionGate';
import type { AiContractVersions, AiFallbackProviderName, AiProviderName } from './contracts';
import { AI_ERROR_CODES, AiServiceError } from './errors';

export interface AiServiceConfig {
    provider: AiProviderName;
    fallbackProvider: AiFallbackProviderName;
    localUrl: string;
    modelartsEndpoint?: string;
    modelartsAuthToken?: string;
    versions: AiContractVersions;
}

type Environment = Record<string, string | undefined>;

function modelartsEnabled(value: string | undefined): boolean {
    return value?.trim().toLowerCase() === 'true';
}

function requiredServerValue(environment: Environment, key: string): string {
    const value = environment[key]?.trim();
    if (!value) {
        throw new AiServiceError(
            AI_ERROR_CODES.CONFIGURATION_ERROR,
            `${key} sunucu ortam değişkeni tanımlanmalıdır.`,
            503,
            false,
        );
    }
    return value;
}

function providerName(value: string | undefined): AiProviderName {
    const selected = value?.trim() || 'local';
    if (selected !== 'local' && selected !== 'modelarts') {
        throw new AiServiceError(
            AI_ERROR_CODES.CONFIGURATION_ERROR,
            'AI_PROVIDER yalnızca local veya modelarts olabilir.',
            503,
            false,
        );
    }
    return selected;
}

function fallbackProviderName(value: string | undefined): AiFallbackProviderName {
    const selected = value?.trim() || 'none';
    if (selected !== 'local' && selected !== 'none') {
        throw new AiServiceError(
            AI_ERROR_CODES.CONFIGURATION_ERROR,
            'AI_FALLBACK_PROVIDER yalnızca local veya none olabilir.',
            503,
            false,
        );
    }
    return selected;
}

function modelartsEndpoint(environment: Environment): string {
    const value = requiredServerValue(environment, 'MODELARTS_ENDPOINT');
    let endpoint: URL;
    try {
        endpoint = new URL(value);
    } catch {
        throw new AiServiceError(
            AI_ERROR_CODES.CONFIGURATION_ERROR,
            'MODELARTS_ENDPOINT geçerli bir URL olmalıdır.',
            503,
            false,
        );
    }

    const isLoopback = endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1';
    if (endpoint.protocol !== 'https:' && !isLoopback) {
        throw new AiServiceError(
            AI_ERROR_CODES.CONFIGURATION_ERROR,
            'ModelArts endpoint kimlik bilgilerini korumak için HTTPS kullanmalıdır.',
            503,
            false,
        );
    }
    return endpoint.toString();
}

export function getAiServiceConfig(environment: Environment = process.env): AiServiceConfig {
    const provider = providerName(environment.AI_PROVIDER);
    const fallbackProvider = fallbackProviderName(environment.AI_FALLBACK_PROVIDER);

    if (provider === 'modelarts' && !modelartsEnabled(environment.MODELARTS_ENABLED)) {
        throw new AiServiceError(
            AI_ERROR_CODES.CONFIGURATION_ERROR,
            'ModelArts entegrasyonu devre dışı. Kullanmak için MODELARTS_ENABLED=true ayarlanmalıdır.',
            503,
            false,
        );
    }

    if (environment.NEXT_PUBLIC_MODELARTS_AUTH_TOKEN || environment.NEXT_PUBLIC_HUAWEI_SECRET_KEY) {
        throw new AiServiceError(
            AI_ERROR_CODES.CONFIGURATION_ERROR,
            'ModelArts kimlik bilgileri NEXT_PUBLIC_ önekiyle tanımlanamaz.',
            503,
            false,
        );
    }

    return {
        provider,
        fallbackProvider,
        localUrl: (environment.AI_LOCAL_URL || environment.AI_SERVICE_URL || 'http://ai-inference:8000').replace(/\/$/, ''),
        modelartsEndpoint:
            provider === 'modelarts' ? modelartsEndpoint(environment) : environment.MODELARTS_ENDPOINT,
        modelartsAuthToken:
            provider === 'modelarts' ? requiredServerValue(environment, 'MODELARTS_AUTH_TOKEN') : environment.MODELARTS_AUTH_TOKEN,
        versions: expectedAiVersions(environment)
    };
}
