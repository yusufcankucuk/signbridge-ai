import { SessionState, ConsultationSession } from '../types/session';

// Hangi durumdan hangisine geçilebileceğini belirten kısıtlama haritası
const ALLOWED_TRANSITIONS: Record<SessionState, SessionState[]> = {
    'idle': ['patient_capture'],
    'patient_capture': ['patient_confirmation', 'ended'],
    'patient_confirmation': ['doctor_review', 'patient_capture', 'ended'], // Ret durumunda patient_capture'a döner
    'doctor_review': ['doctor_response', 'ended'],
    'doctor_response': ['patient_review', 'ended'],
    'patient_review': ['patient_capture', 'ended'], // Yeni tura başlar veya biter
    'ended': [] // Terminal durum, hiçbir yere geçemez
};

export class SessionManager {
    // İlk hafta veritabanı isteğe bağlı olduğu için bellekte (in-memory) tutuyoruz
    private static sessions: Map<string, ConsultationSession> = new Map();
    private static events: Map<string, any[]> = new Map();

    // Geçiş kontrolü (Geçersiz durum geçişi engellenir)[cite: 3]
    public static canTransition(currentState: SessionState, nextState: SessionState): boolean {
        return ALLOWED_TRANSITIONS[currentState].includes(nextState);
    }

    // Yeni oturum oluşturma
    public static createSession(id: string): ConsultationSession {
        const session: ConsultationSession = {
            id,
            state: 'idle',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 60000).toISOString() // 30 dk sonra silinir
        };
        this.sessions.set(id, session);
        this.events.set(id, []);
        return session;
    }

    // Oturumu sonlandırma ve temizleme (Geçici hassas içerik silinir)[cite: 3]
    public static endSession(id: string): boolean {
        const session = this.sessions.get(id);
        if (!session) return false;

        // Durumu ended yap ve verileri RAM'den temizle[cite: 3]
        session.state = 'ended';
        this.events.delete(id); // Hastanın sağlık/iletişim verilerini hemen uçuruyoruz
        this.sessions.delete(id);

        return true;
    }
}