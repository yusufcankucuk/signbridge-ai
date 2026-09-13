// Uygulamanın anlık olarak bulunabileceği 7 durum
export type SessionState =
    | 'idle'
    | 'patient_capture'
    | 'patient_confirmation'
    | 'doctor_review'
    | 'doctor_response'
    | 'patient_review'
    | 'ended';

// 1. Görüşme Oturumu Veri Modeli (consultation_sessions)
export interface ConsultationSession {
    id: string; // UUID
    state: SessionState;
    createdAt: string; // ISO Date String
    expiresAt: string; // Otomatik temizlik için son kullanma tarihi
    modelVersion?: string; // AI model versiyon takibi
}

// Olay Tipleri
export type InteractionEventType = 'prediction' | 'confirmation' | 'doctor_response';

// 2. Etkileşim Olayları Veri Modeli (interaction_events)
export interface InteractionEvent {
    id: string; // UUID
    sessionId: string; // İlişkili olduğu oturum ID'si
    type: InteractionEventType;
    payload: any; // Olayın detayları (JSON)
    createdAt: string;
}

// --- Payload (İçerik) Detayları ---

export interface PredictionPayload {
    classId: string | null;
    displayText: string;
    confidence: number | null;
    alternatives: string[];
    isLowConfidence: boolean;
    predictionMode: 'model' | 'mock' | 'manual';
    modelVersion: string | null;
    preprocessingVersion: string;
    vocabularyVersion: string;
    decisionPolicyVersion: string;
    rejectionReason: 'low_score' | 'ambiguous_prediction' | null;
    requiresConfirmation: boolean;
}

export interface ConfirmationPayload {
    confirmed: boolean;
    manualSelection?: string; // Eğer hasta reddedip elle seçerse
}

export interface DoctorResponsePayload {
    transcript: string;
    source: 'speech' | 'text';
    edited: boolean;
}
