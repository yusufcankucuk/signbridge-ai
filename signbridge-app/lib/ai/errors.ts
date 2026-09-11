export const AI_ERROR_CODES = {
    CONFIGURATION_ERROR: 'AI_CONFIGURATION_ERROR',
    TIMEOUT: 'AI_TIMEOUT',
    UNAVAILABLE: 'AI_UNAVAILABLE',
    INVALID_RESPONSE: 'AI_INVALID_RESPONSE',
    VERSION_MISMATCH: 'AI_VERSION_MISMATCH'
} as const;

export type AiErrorCode = typeof AI_ERROR_CODES[keyof typeof AI_ERROR_CODES];

export class AiServiceError extends Error {
    constructor(
        public readonly code: AiErrorCode,
        message: string,
        public readonly status: number,
        public readonly retryable: boolean,
    ) {
        super(message);
        this.name = 'AiServiceError';
    }
}

export function isAiServiceError(error: unknown): error is AiServiceError {
    return error instanceof AiServiceError;
}
