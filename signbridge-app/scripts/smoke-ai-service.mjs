import assert from 'node:assert/strict';

const endpoint = process.env.AI_SMOKE_ENDPOINT || process.env.MODELARTS_ENDPOINT;
if (!endpoint) throw new Error('AI_SMOKE_ENDPOINT veya MODELARTS_ENDPOINT tanımlanmalıdır.');

const request = {
    preprocessingVersion: 'landmark46-v1',
    landmarks: Array.from({ length: 60 }, () =>
        Array.from({ length: 46 }, () => [0, 0]),
    ),
    mask: Array.from({ length: 60 }, () => Array.from({ length: 46 }, () => 1))
};

const headers = {
    accept: 'application/json',
    'content-type': 'application/json'
};
if (process.env.MODELARTS_AUTH_TOKEN) {
    headers['X-Auth-Token'] = process.env.MODELARTS_AUTH_TOKEN;
}

const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(15_000)
});
assert.equal(response.ok, true, `AI servisi HTTP ${response.status} döndürdü.`);

const result = await response.json();
assert.equal(typeof result.displayText, 'string');
assert.equal(typeof result.isLowConfidence, 'boolean');
assert.equal(result.predictionMode, 'model');
assert.equal(result.modelVersion, 'autsl20-bigru-v0.1.0');
assert.equal(result.preprocessingVersion, 'landmark46-v1');
assert.equal(result.vocabularyVersion, 'autsl20-v1');
assert.equal(Array.isArray(result.alternatives), true);
assert.equal(typeof result.decisionPolicyVersion, 'string');
assert.ok(result.decisionPolicyVersion.length > 0);
assert.equal(typeof result.requiresConfirmation, 'boolean');
if (result.isLowConfidence) {
    assert.equal(result.classId, null);
    assert.ok(['low_score', 'ambiguous_prediction'].includes(result.rejectionReason));
    assert.equal(result.requiresConfirmation, false);
} else {
    assert.equal(result.rejectionReason, null);
    assert.equal(result.requiresConfirmation, true);
}

// Sağlık metni, sınıf veya ham landmark içeriği bilerek çıktıya yazılmaz.
console.info('AI servis smoke testi başarılı.', {
    modelVersion: result.modelVersion,
    preprocessingVersion: result.preprocessingVersion,
    vocabularyVersion: result.vocabularyVersion,
    decisionPolicyVersion: result.decisionPolicyVersion
});
