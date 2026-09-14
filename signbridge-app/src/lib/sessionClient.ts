// Sunucu oturumu ile istemci akışını eşleyen yardımcılar.
// 409 "Geçersiz durum geçişi" hatası, oturumun zaten hedef durumda olduğu
// anlamına gelebilir; bu durumda akışı kesmek yerine adımı atlıyoruz.
const STATE_CONFLICT = 409;

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function postOrThrow(path: string, body?: unknown): Promise<void> {
  const response = await post(path, body);
  if (!response.ok) throw new Error('Görüşme durumu güncellenemedi.');
}

/** İstek başarısızsa yalnız durum çakışmasını yutar, gerçek hataları yükseltir. */
async function postTolerateConflict(path: string, body?: unknown): Promise<void> {
  const response = await post(path, body);
  if (response.ok || response.status === STATE_CONFLICT) return;
  throw new Error('Görüşme durumu güncellenemedi.');
}

export async function preparePatientCapture(sessionId: string, doctorText: string): Promise<void> {
  const id = encodeURIComponent(sessionId);
  await postTolerateConflict(`/api/consultations/${id}/doctor-response`, {
    transcript: doctorText,
    source: 'text',
    edited: false,
  });
  await postTolerateConflict(`/api/consultations/${id}/next`);
}

/**
 * Hastanın seçenekle verdiği yanıtı sunucuya yazar ve oturumu doktora devreder.
 * Bu çağrı olmadan yanıt yalnız cihaz belleğinde kalır ve doktorun sonraki
 * sorusu geçersiz durum geçişiyle reddedilir.
 * `manualSelection` sunucuda 120 karakterle sınırlıdır; uzun yanıtlar kırpılır.
 */
export async function recordPatientAnswer(sessionId: string, answer: string): Promise<void> {
  const text = answer.trim();
  if (!text) return;
  const id = encodeURIComponent(sessionId);
  await postOrThrow(`/api/consultations/${id}/confirm`, {
    confirmed: true,
    manualSelection: text.slice(0, 120),
  });
}
