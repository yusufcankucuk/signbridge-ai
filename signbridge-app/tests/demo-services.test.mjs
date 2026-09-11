import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiService } from '../lib/services/aiService.mjs';
import { createSpeechToTextService } from '../lib/services/speechToTextService.mjs';
import { recordTechnicalEvent } from '../lib/services/technicalEventLogger.mjs';

test('mock AI servis katmanı ortak tahmin sözleşmesini döndürür', async () => {
    const service = createAiService({ provider: 'mock' });
    const prediction = await service.predict();

    assert.equal(service.provider, 'mock');
    assert.equal(prediction.classId, 'AGRI');
    assert.equal(prediction.displayText, 'Başım ağrıyor');
    assert.equal(prediction.modelVersion, 'mock-demo-v1');
    assert.equal(typeof prediction.confidence, 'number');
    assert.equal(Array.isArray(prediction.alternatives), true);
});

test('mock STT örnek doktor metni ve zorunlu yazı fallback bilgisini döndürür', async () => {
    const service = createSpeechToTextService({ provider: 'mock' });
    const response = await service.transcribe();

    assert.equal(response.provider, 'mock');
    assert.equal(response.source, 'speech');
    assert.ok(response.transcript.length > 0);
    assert.equal(service.textFallbackRequired, true);
});

test('servis çağrıları ham veri veya sağlık metni loglamaz', async () => {
    const messages = [];
    const originalLog = console.log;
    const originalInfo = console.info;
    console.log = (...args) => messages.push(args);
    console.info = (...args) => messages.push(args);

    try {
        await createAiService({ provider: 'mock' }).predict({ rawFrames: 'sensitive-camera-data' });
        await createSpeechToTextService({ provider: 'mock' }).transcribe('sensitive-audio-data');
    } finally {
        console.log = originalLog;
        console.info = originalInfo;
    }

    assert.deepEqual(messages, []);
});

test('Supabase teknik logu yalnız güvenli alanları yazar', async () => {
    let insertedRow;
    const database = {
        from(table) {
            assert.equal(table, 'technical_events');
            return {
                async insert(rows) {
                    insertedRow = rows[0];
                    return { error: null };
                }
            };
        }
    };

    const result = await recordTechnicalEvent(database, {
        type: 'mock_ai_prediction_succeeded',
        latencyMs: 12.4,
        transcript: 'Bu alan loglanmamalı',
        rawFrames: 'Bu alan loglanmamalı'
    });

    assert.equal(result, true);
    assert.deepEqual(insertedRow, {
        type: 'mock_ai_prediction_succeeded',
        latency_ms: 12,
        error_code: null
    });
});
