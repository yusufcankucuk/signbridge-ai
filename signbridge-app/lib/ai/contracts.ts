import type { LandmarkPredictionRequest } from '@/lib/prediction';
import type { PredictionPayload } from '@/types/session';

export type AiProviderName = 'local' | 'modelarts';
export type AiFallbackProviderName = 'local' | 'none';

export interface AiProvider {
    readonly name: AiProviderName;
    predict(request: LandmarkPredictionRequest): Promise<PredictionPayload>;
}

export interface AiServiceResult {
    prediction: PredictionPayload;
    provider: AiProviderName;
    fallbackUsed: boolean;
}

export interface AiContractVersions {
    modelVersion: string;
    preprocessingVersion: string;
    vocabularyVersion: string;
}

export type { LandmarkPredictionRequest, PredictionPayload };
