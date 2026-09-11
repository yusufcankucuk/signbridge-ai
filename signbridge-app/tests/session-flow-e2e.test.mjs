import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

const VALID_PREDICTION = {
    classId: 'yardim',
    displayText: 'Yardım',
    confidence: 0.93,
    alternatives: ['tehlike'],
    isLowConfidence: false,
    predictionMode: 'model',
    modelVersion: 'autsl20-bigru-v0.1.0',
    preprocessingVersion: 'landmark46-v1',
    vocabularyVersion: 'autsl20-v1'
};

const LANDMARK_REQUEST = {
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

async function closeServer(server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
}

async function freePort() {
    const listener = await listen((_request, response) => response.end());
    const port = Number(new URL(listener.url).port);
    await closeServer(listener.server);
    return port;
}

function sendJson(response, status, value) {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(value));
}

function filterValue(url, name) {
    const value = url.searchParams.get(name);
    return value?.startsWith('eq.') ? value.slice(3) : undefined;
}

async function requestBody(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : undefined;
}

async function startSupabaseTestServer() {
    const sessions = new Map();
    const events = [];
    const listener = await listen(async (request, response) => {
        const url = new URL(request.url, 'http://127.0.0.1');
        const table = url.pathname.split('/').at(-1);
        const wantsSingle = String(request.headers.accept).includes('application/vnd.pgrst.object+json');

        if (table === 'consultation_sessions' && request.method === 'POST') {
            const body = await requestBody(request);
            const input = Array.isArray(body) ? body[0] : body;
            const row = {
                id: randomUUID(),
                state: input.state,
                created_at: new Date().toISOString(),
                expires_at: input.expires_at
            };
            sessions.set(row.id, row);
            return sendJson(response, 201, wantsSingle ? row : [row]);
        }

        if (table === 'consultation_sessions' && request.method === 'GET') {
            const row = sessions.get(filterValue(url, 'id'));
            if (wantsSingle) {
                if (row) return sendJson(response, 200, { state: row.state });
                return sendJson(response, 406, { code: 'PGRST116', message: 'No rows' });
            }
            return sendJson(response, 200, row ? [{ state: row.state }] : []);
        }

        if (table === 'consultation_sessions' && request.method === 'PATCH') {
            const row = sessions.get(filterValue(url, 'id'));
            const body = await requestBody(request);
            if (row) Object.assign(row, body);
            response.writeHead(204);
            return response.end();
        }

        if (table === 'interaction_events' && request.method === 'POST') {
            const body = await requestBody(request);
            for (const input of Array.isArray(body) ? body : [body]) {
                events.push({ id: randomUUID(), ...input });
            }
            response.writeHead(201);
            return response.end();
        }

        if (table === 'interaction_events' && request.method === 'DELETE') {
            const sessionId = filterValue(url, 'session_id');
            for (let index = events.length - 1; index >= 0; index -= 1) {
                if (events[index].session_id === sessionId) events.splice(index, 1);
            }
            response.writeHead(204);
            return response.end();
        }

        return sendJson(response, 404, { message: 'Unsupported test request' });
    });

    return {
        ...listener,
        snapshot(sessionId) {
            return { state: sessions.get(sessionId)?.state, eventCount: events.length };
        }
    };
}

async function startAiTestServer() {
    return listen(async (request, response) => {
        const body = await requestBody(request);
        assert.equal(request.method, 'POST');
        assert.match(request.url, /\/predict$/);
        assert.equal(typeof body.sessionId, 'string');
        assert.equal(body.landmarks.length, 60);
        sendJson(response, 200, VALID_PREDICTION);
    });
}

async function startNext(environment) {
    const port = await freePort();
    const output = [];
    const child = spawn(
        process.execPath,
        ['./node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
        {
            cwd: process.cwd(),
            env: { ...process.env, NODE_ENV: 'production', ...environment },
            stdio: ['ignore', 'pipe', 'pipe']
        },
    );
    child.stdout.on('data', (chunk) => output.push(chunk.toString()));
    child.stderr.on('data', (chunk) => output.push(chunk.toString()));

    const baseUrl = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 80; attempt += 1) {
        if (child.exitCode !== null) throw new Error(`Next.js başlatılamadı:\n${output.join('')}`);
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) return { child, baseUrl };
        } catch {
            // Next.js production sunucusu hazır olana kadar tekrar dene.
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

async function post(baseUrl, path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json();
    return { status: response.status, payload };
}

test('create → prediction → confirm → doctor response → next/end tam turu', async () => {
    const supabase = await startSupabaseTestServer();
    const externalAiUrl = process.env.E2E_AI_LOCAL_URL?.replace(/\/$/, '');
    const ai = externalAiUrl ? undefined : await startAiTestServer();
    const app = await startNext({
        SUPABASE_URL: supabase.url,
        SUPABASE_ANON_KEY: 'e2e-test-key',
        AI_PROVIDER: 'local',
        AI_FALLBACK_PROVIDER: 'none',
        MODELARTS_ENABLED: 'false',
        AI_LOCAL_URL: externalAiUrl ?? ai.url
    });
    const evidence = [];

    try {
        const created = await post(app.baseUrl, '/api/consultations');
        assert.equal(created.status, 201);
        assert.equal(created.payload.state, 'patient_capture');
        const sessionId = created.payload.id;
        evidence.push({ step: 'create', status: created.status, state: created.payload.state });

        const predicted = await post(
            app.baseUrl,
            `/api/consultations/${sessionId}/prediction`,
            LANDMARK_REQUEST,
        );
        assert.equal(predicted.status, 200);
        assert.equal(predicted.payload.nextState, 'patient_confirmation');
        assert.equal(predicted.payload.prediction.predictionMode, 'model');
        assert.equal(predicted.payload.provider, 'local');
        evidence.push({
            step: 'prediction',
            status: predicted.status,
            state: predicted.payload.nextState,
            provider: predicted.payload.provider
        });

        const repeatedPrediction = await post(
            app.baseUrl,
            `/api/consultations/${sessionId}/prediction`,
            LANDMARK_REQUEST,
        );
        assert.equal(repeatedPrediction.status, 409);
        evidence.push({ step: 'invalid-repeat-prediction', status: repeatedPrediction.status });

        const doctorWithoutConfirmation = await post(
            app.baseUrl,
            `/api/consultations/${sessionId}/doctor-response`,
            { transcript: 'Yanıt metni', source: 'text', edited: false },
        );
        assert.equal(doctorWithoutConfirmation.status, 409);
        evidence.push({ step: 'doctor-before-confirm', status: doctorWithoutConfirmation.status });

        const confirmed = await post(
            app.baseUrl,
            `/api/consultations/${sessionId}/confirm`,
            { confirmed: true },
        );
        assert.equal(confirmed.status, 200);
        assert.equal(confirmed.payload.nextState, 'doctor_review');
        evidence.push({ step: 'confirm', status: confirmed.status, state: confirmed.payload.nextState });

        const doctorResponse = await post(
            app.baseUrl,
            `/api/consultations/${sessionId}/doctor-response`,
            { transcript: 'Yanıt metni', source: 'text', edited: false },
        );
        assert.equal(doctorResponse.status, 200);
        assert.equal(doctorResponse.payload.nextState, 'patient_review');
        evidence.push({
            step: 'doctor-response',
            status: doctorResponse.status,
            state: doctorResponse.payload.nextState
        });

        const nextTurn = await post(app.baseUrl, `/api/consultations/${sessionId}/next`);
        assert.equal(nextTurn.status, 200);
        assert.equal(nextTurn.payload.nextState, 'patient_capture');
        evidence.push({ step: 'next', status: nextTurn.status, state: nextTurn.payload.nextState });

        const invalidNext = await post(app.baseUrl, `/api/consultations/${sessionId}/next`);
        assert.equal(invalidNext.status, 409);
        evidence.push({ step: 'invalid-next', status: invalidNext.status });

        const ended = await post(app.baseUrl, `/api/consultations/${sessionId}/end`);
        assert.equal(ended.status, 200);
        assert.equal(ended.payload.nextState, 'ended');
        assert.deepEqual(supabase.snapshot(sessionId), { state: 'ended', eventCount: 0 });
        evidence.push({ step: 'end', status: ended.status, state: ended.payload.nextState, eventsRemaining: 0 });

        console.info(`E2E kanıtı (hassas içerik içermez): ${JSON.stringify(evidence)}`);
    } finally {
        await stopNext(app.child);
        await closeServer(supabase.server);
        if (ai) await closeServer(ai.server);
    }
});
