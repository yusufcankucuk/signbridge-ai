const MOCK_AI_RESPONSE = Object.freeze({
    classId: 'AGRI',
    displayText: 'Başım ağrıyor',
    confidence: 0.92,
    alternatives: ['Başım dönüyor', 'Kendimi iyi hissetmiyorum'],
    isLowConfidence: false,
    modelVersion: 'mock-demo-v1'
});

const mockAiProvider = {
    name: 'mock',
    async predict() {
        return { ...MOCK_AI_RESPONSE, alternatives: [...MOCK_AI_RESPONSE.alternatives] };
    }
};

export function createAiService({ provider = process.env.AI_PROVIDER ?? 'mock' } = {}) {
    if (provider !== 'mock') {
        throw new Error(`Desteklenmeyen AI sağlayıcısı: ${provider}`);
    }

    return {
        provider: mockAiProvider.name,
        predict: (input) => mockAiProvider.predict(input)
    };
}

export { MOCK_AI_RESPONSE };
