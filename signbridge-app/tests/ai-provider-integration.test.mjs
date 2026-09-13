import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';

const VALID_PREDICTION = {
    classId: 'acil',
    displayText: 'Acil yardım gerekiyor',
    confidence: 0.94,
    alternatives: ['yardim', 'tehlike'],
    isLowConfidence: false,
    predictionMode: 'model',
    modelVersion: 'autsl20-bigru-v0.1.0',
    preprocessingVersion: 'landmark46-v1',
    vocabularyVersion: 'autsl20-v1',
    decisionPolicyVersion: 'score-threshold-v1',
    rejectionReason: null,
    requiresConfirmation: true
};

const VALID_REQUEST = {
    sessionId: 'integration-test',
    preprocessingVersion: 'landmark46-v1',
    landmarks: Array.from({ length: 60 }, () =>
        Array.from({ length: 46 }, () => [0, 0]),
    ),
    mask: Array.from({ length: 60 }, () => Array.from({ length: 46 }, () => 1))
};

async function listen(handler) {
    const server = createServer(handler);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test portu alınamadı.');
    return { server, url: `http://127.0.0.1:${address.port}` };
}

async function freePort() {
    const { server, url } = await listen((_request, response) => response.end());
    const port = Number(new URL(url).port);
    await new Promise((resolve) => server.close(resolve));
    return port;
}

async function startNext(environment) {
    const port = await freePort();
    const output = [];
    const child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            NODE_ENV: 'production',
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_ANON_KEY: 'integration-test-key',
            ...environment
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (chunk) => output.push(chunk.toString()));
    child.stderr.on('data', (chunk) => output.push(chunk.toString()));

    const baseUrl = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 80; attempt += 1) {
        if (child.exitCode !== null) {
            throw new Error(`Next.js başlatılamadı:\n${output.join('')}`);
        }
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) return { child, baseUrl, output };
        } catch {
            // Sunucu hazır olana kadar kısa aralıklarla tekrar dene.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    child.kill('SIGTERM');
    throw new Error(`Next.js zamanında hazır olmadı:\n${output.join('')}`);
}

async function stopNext(child) {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000))
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
}

async function closeServer(server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
}

async function predict(baseUrl) {
    return fetch(`${baseUrl}/api/ai/predict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(VALID_REQUEST)
    });
}

test('ModelArts açıkça etkinleştirilmedikçe çağrılmaz', async () => {
    let requestCount = 0;
    const upstream = await listen((_request, response) => {
        requestCount += 1;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(VALID_PREDICTION));
    });
    const app = await startNext({
        AI_PROVIDER: 'modelarts',
        MODELARTS_ENABLED: 'false',
        MODELARTS_ENDPOINT: upstream.url,
        MODELARTS_AUTH_TOKEN: 'integration-test-token'
    });
    try {
        const response = await predict(app.baseUrl);
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
            error: 'ModelArts entegrasyonu devre dışı. Kullanmak için MODELARTS_ENABLED=true ayarlanmalıdır.',
            code: 'AI_CONFIGURATION_ERROR'
        });
        assert.equal(requestCount, 0);
    } finally {
        await stopNext(app.child);
        await closeServer(upstream.server);
    }
});

test('local ve ModelArts sağlayıcıları aynı cevap sözleşmesini döndürür', async (context) => {
    await context.test('local FastAPI sağlayıcısı', async () => {
        const upstream = await listen((_request, response) => {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify(VALID_PREDICTION));
        });
        const app = await startNext({ AI_PROVIDER: 'local', AI_LOCAL_URL: upstream.url });
        try {
            const response = await predict(app.baseUrl);
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('x-signbridge-ai-provider'), 'local');
            assert.deepEqual(await response.json(), VALID_PREDICTION);
        } finally {
            await stopNext(app.child);
            await closeServer(upstream.server);
        }
    });

    await context.test('Huawei ModelArts sağlayıcısı', async () => {
        let receivedToken;
        const upstream = await listen((request, response) => {
            receivedToken = request.headers['x-auth-token'];
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify(VALID_PREDICTION));
        });
        const app = await startNext({
            AI_PROVIDER: 'modelarts',
            MODELARTS_ENABLED: 'true',
            MODELARTS_ENDPOINT: `${upstream.url}/v1/infers/test-service`,
            MODELARTS_AUTH_TOKEN: 'integration-test-token'
        });
        try {
            const response = await predict(app.baseUrl);
            const body = await response.json();
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('x-signbridge-ai-provider'), 'modelarts');
            assert.deepEqual(body, VALID_PREDICTION);
            assert.equal(receivedToken, 'integration-test-token');
            assert.equal(JSON.stringify(body).includes('integration-test-token'), false);
        } finally {
            await stopNext(app.child);
            await closeServer(upstream.server);
        }
    });
});

test('sürüm uyuşmazlığı kontrollü 409 üretir', async () => {
    const upstream = await listen((_request, response) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ...VALID_PREDICTION, vocabularyVersion: 'wrong-vocabulary' }));
    });
    const app = await startNext({ AI_PROVIDER: 'local', AI_LOCAL_URL: upstream.url });
    try {
        const response = await predict(app.baseUrl);
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), {
            error: 'AI model, etiket veya ön işleme sürümü backend ile uyumlu değil.',
            code: 'AI_VERSION_MISMATCH'
        });
    } finally {
        await stopNext(app.child);
        await closeServer(upstream.server);
    }
});

test('ulaşılamayan sağlayıcı kontrollü 503 üretir', async () => {
    const unavailablePort = await freePort();
    const app = await startNext({ AI_PROVIDER: 'local', AI_LOCAL_URL: `http://127.0.0.1:${unavailablePort}` });
    try {
        const response = await predict(app.baseUrl);
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
            error: 'AI servisine ulaşılamıyor.',
            code: 'AI_UNAVAILABLE'
        });
    } finally {
        await stopNext(app.child);
    }
});

test('AI servisinin bozuk cevabı kontrollü 502 üretir', async () => {
    const upstream = await listen((_request, response) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"invalidJson":');
    });
    const app = await startNext({ AI_PROVIDER: 'local', AI_LOCAL_URL: upstream.url });
    try {
        const response = await predict(app.baseUrl);
        assert.equal(response.status, 502);
        assert.deepEqual(await response.json(), {
            error: 'AI sağlayıcısı geçerli JSON döndürmedi.',
            code: 'AI_INVALID_RESPONSE'
        });
    } finally {
        await stopNext(app.child);
        await closeServer(upstream.server);
    }
});

test('AI servisinin yetkisiz cevabı kontrollü 503 üretir', async () => {
    const upstream = await listen((_request, response) => {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'sensitive-upstream-detail' }));
    });
    const app = await startNext({ AI_PROVIDER: 'local', AI_LOCAL_URL: upstream.url });
    try {
        const response = await predict(app.baseUrl);
        assert.equal(response.status, 503);
        const body = await response.json();
        assert.deepEqual(body, {
            error: 'AI servisi kimlik doğrulamasını kabul etmedi.',
            code: 'AI_AUTHENTICATION_ERROR'
        });
        assert.equal(JSON.stringify(body).includes('sensitive-upstream-detail'), false);
    } finally {
        await stopNext(app.child);
        await closeServer(upstream.server);
    }
});

test('15 saniyeyi aşan sağlayıcı kontrollü timeout hatası üretir', { timeout: 20_000 }, async () => {
    const upstream = await listen((_request, _response) => {
        // İstek bilerek açık bırakılır; backend'in 15 saniyelik sınırı doğrulanır.
    });
    const app = await startNext({ AI_PROVIDER: 'local', AI_LOCAL_URL: upstream.url });
    const startedAt = Date.now();
    try {
        const response = await predict(app.baseUrl);
        const elapsed = Date.now() - startedAt;
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
            error: 'AI servisi 15 saniye içinde yanıt vermedi.',
            code: 'AI_TIMEOUT'
        });
        assert.ok(elapsed >= 14_500, `Timeout çok erken gerçekleşti: ${elapsed}ms`);
        assert.ok(elapsed < 18_000, `Timeout çok geç gerçekleşti: ${elapsed}ms`);
    } finally {
        await stopNext(app.child);
        await closeServer(upstream.server);
    }
});

test('ModelArts kesintisinde yapılandırılmış local fallback kullanılır', async () => {
    const modelarts = await listen((_request, response) => {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'unavailable' }));
    });
    const local = await listen((_request, response) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(VALID_PREDICTION));
    });
    const app = await startNext({
        AI_PROVIDER: 'modelarts',
        MODELARTS_ENABLED: 'true',
        AI_FALLBACK_PROVIDER: 'local',
        AI_LOCAL_URL: local.url,
        MODELARTS_ENDPOINT: modelarts.url,
        MODELARTS_AUTH_TOKEN: 'integration-test-token'
    });
    try {
        const response = await predict(app.baseUrl);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('x-signbridge-ai-provider'), 'local');
        assert.equal(response.headers.get('x-signbridge-ai-fallback'), 'true');
        assert.deepEqual(await response.json(), VALID_PREDICTION);
    } finally {
        await stopNext(app.child);
        await closeServer(modelarts.server);
        await closeServer(local.server);
    }
});
