export const SAMPLE_DOCTOR_TRANSCRIPT =
    'Geçmiş olsun. Ağrınızın ne zaman başladığını ve şiddetini öğrenmek istiyorum.';

const mockSpeechProvider = {
    name: 'mock',
    async transcribe() {
        return {
            transcript: SAMPLE_DOCTOR_TRANSCRIPT,
            provider: 'mock',
            source: 'speech',
            edited: false
        };
    }
};

export function createSpeechToTextService({ provider = process.env.SPEECH_PROVIDER ?? 'mock' } = {}) {
    if (provider !== 'mock') {
        throw new Error(`Desteklenmeyen ses sağlayıcısı: ${provider}`);
    }

    return {
        provider: mockSpeechProvider.name,
        transcribe: () => mockSpeechProvider.transcribe(),
        textFallbackRequired: true
    };
}
