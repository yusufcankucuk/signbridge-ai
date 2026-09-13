async function post(path: string, body?: unknown): Promise<void> {
  const response = await fetch(path, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Görüşme durumu güncellenemedi.');
}

export async function preparePatientCapture(sessionId: string, doctorText: string): Promise<void> {
  const id = encodeURIComponent(sessionId);
  await post(`/api/consultations/${id}/doctor-response`, { transcript: doctorText, source: 'text', edited: false });
  await post(`/api/consultations/${id}/next`);
}
