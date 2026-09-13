export interface JsonObjectOptions {
    maxBytes: number;
    allowedFields: readonly string[];
}

export type RequestValidationResult =
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; status: 400 | 413 | 415; error: string };

function failure(status: 400 | 413 | 415, error: string): RequestValidationResult {
    return { ok: false, status, error };
}

async function readLimitedText(request: Request, maxBytes: number): Promise<{ text?: string; tooLarge: boolean }> {
    const contentLength = request.headers.get('content-length');
    if (contentLength !== null) {
        const declaredBytes = Number(contentLength);
        if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) return { tooLarge: true };
        if (declaredBytes > maxBytes) return { tooLarge: true };
    }

    if (!request.body) return { text: '', tooLarge: false };
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
            await reader.cancel();
            return { tooLarge: true };
        }
        text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text, tooLarge: false };
}

export async function readJsonObject(
    request: Request,
    options: JsonObjectOptions,
): Promise<RequestValidationResult> {
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('application/json')) {
        return failure(415, 'Content-Type application/json olmalıdır.');
    }

    const body = await readLimitedText(request, options.maxBytes);
    if (body.tooLarge) return failure(413, `İstek gövdesi ${options.maxBytes} baytı aşamaz.`);

    let value: unknown;
    try {
        value = JSON.parse(body.text ?? '');
    } catch {
        return failure(400, 'Geçerli bir JSON gövdesi gönderilmelidir.');
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return failure(400, 'İstek gövdesi bir JSON nesnesi olmalıdır.');
    }

    const object = value as Record<string, unknown>;
    const allowed = new Set(options.allowedFields);
    if (Object.keys(object).some((key) => !allowed.has(key))) {
        return failure(400, 'İstek gövdesinde beklenmeyen alan bulunuyor.');
    }
    return { ok: true, value: object };
}

export async function validateEmptyRequest(request: Request): Promise<RequestValidationResult> {
    if (!request.body || request.headers.get('content-length') === '0') return { ok: true, value: {} };
    return readJsonObject(request, { maxBytes: 256, allowedFields: [] });
}
