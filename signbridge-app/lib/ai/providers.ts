import type { AiProvider } from './contracts';
import type { AiServiceConfig } from './config';
import { createHttpAiProvider } from './httpProvider';

export function createLocalAiProvider(config: AiServiceConfig): AiProvider {
    return createHttpAiProvider({
        name: 'local',
        endpoint: `${config.localUrl}/predict`,
        versions: config.versions
    });
}

export function createModelArtsAiProvider(config: AiServiceConfig): AiProvider {
    return createHttpAiProvider({
        name: 'modelarts',
        endpoint: config.modelartsEndpoint!,
        headers: {
            'X-Auth-Token': config.modelartsAuthToken!
        },
        versions: config.versions
    });
}
