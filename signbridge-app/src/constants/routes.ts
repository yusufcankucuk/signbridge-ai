/**
 * Uygulama rotaları ve akış içindeki konumları.
 *
 * Rota metnini elle yazmak yerine buradan kullan: bir ekranın yolu
 * değiştiğinde tek yerden düzeltilir.
 */

export const ROUTES = {
    home: "/",

    /* Hasta — anlatım */
    camera: "/camera",
    recognition: "/recognition",
    confirm: "/confirm",
    manualSelect: "/manual-select",
    fallback: "/fallback",

    /* Hasta — ek sorular */
    patientDuration: "/patient/duration",
    patientIntensity: "/patient/intensity",
    patientLocation: "/patient/location",
    patientMedication: "/patient/medication",
    patientSummary: "/patient/summary",
    /* Hasta tedaviyi anlamadığında ne sormak istediğini seçtiği ekran. */
    patientQuestion: "/patient/question",
    /* Doktorun yanıtını hastanın okuduğu ekran. */
    patientAnswer: "/patient/answer",

    /* Cihaz devri */
    handoffDoctor: "/handoff/doctor",
    handoffPatient: "/handoff/patient",

    /* Doktor */
    doctorQuestions: "/doctor/questions",
    doctorConversation: "/doctor/conversation",
    doctorResult: "/doctor/result",
    /* Hastanın sorusunu görüp yanıt yazdığı ekran. */
    doctorAnswer: "/doctor/answer",

    /* Bitiş */
    complete: "/complete",
} as const;

export type RouteKey = keyof typeof ROUTES;
export type Route = (typeof ROUTES)[RouteKey];

/**
 * Doktor bir soru sorduğunda cihaz hastaya `?question=` parametresiyle geçer;
 * hasta tarafı bu parametreye göre hangi ekranı açacağını bilir.
 */
export type QuestionParam =
    | "duration"
    | "intensity"
    | "location"
    | "medication"
    | "summary";

export function handoffToPatient(question?: QuestionParam): string {
    return question
        ? `${ROUTES.handoffPatient}?question=${question}`
        : ROUTES.handoffPatient;
}

export const QUESTION_ROUTE: Record<QuestionParam, string> = {
    duration: ROUTES.patientDuration,
    intensity: ROUTES.patientIntensity,
    location: ROUTES.patientLocation,
    medication: ROUTES.patientMedication,
    summary: ROUTES.patientSummary,
};

/**
 * Ekranın hangi rolde ve akışın kaçıncı adımında olduğu.
 * AppHeader ve StepIndicator bu tablodan beslenir; tasarım sistemindeki
 * "hasta teal, doktor lacivert" kuralı burada tek yerden tanımlı.
 */
export interface ScreenMeta {
    role?: "hasta" | "doktor";
    step?: { current: number; total: number; label: string };
}

export const FLOW_TOTAL = 5;

export const SCREEN_META: Record<string, ScreenMeta> = {
    [ROUTES.home]: {},

    [ROUTES.camera]: {
        role: "hasta",
        step: { current: 1, total: FLOW_TOTAL, label: "Anlat" },
    },
    [ROUTES.recognition]: {
        role: "hasta",
        step: { current: 2, total: FLOW_TOTAL, label: "Tanıma" },
    },
    [ROUTES.confirm]: {
        role: "hasta",
        step: { current: 2, total: FLOW_TOTAL, label: "Onay" },
    },
    [ROUTES.manualSelect]: {
        role: "hasta",
        step: { current: 2, total: FLOW_TOTAL, label: "Elle seçim" },
    },
    [ROUTES.fallback]: {
        role: "hasta",
        step: { current: 2, total: FLOW_TOTAL, label: "Elle seçim" },
    },

    [ROUTES.patientDuration]: {
        role: "hasta",
        step: { current: 3, total: FLOW_TOTAL, label: "Süre" },
    },
    [ROUTES.patientIntensity]: {
        role: "hasta",
        step: { current: 3, total: FLOW_TOTAL, label: "Şiddet" },
    },
    [ROUTES.patientLocation]: {
        role: "hasta",
        step: { current: 3, total: FLOW_TOTAL, label: "Yer" },
    },
    [ROUTES.patientMedication]: {
        role: "hasta",
        step: { current: 3, total: FLOW_TOTAL, label: "İlaç" },
    },
    [ROUTES.patientSummary]: {
        role: "hasta",
        step: { current: 3, total: FLOW_TOTAL, label: "Özet" },
    },

    [ROUTES.patientQuestion]: {
        role: "hasta",
        step: { current: 5, total: FLOW_TOTAL, label: "Soru" },
    },

    [ROUTES.patientAnswer]: {
        role: "hasta",
        step: { current: 5, total: FLOW_TOTAL, label: "Yanıt" },
    },
    [ROUTES.doctorAnswer]: {
        role: "doktor",
        step: { current: 5, total: FLOW_TOTAL, label: "Yanıt" },
    },

    [ROUTES.handoffDoctor]: {},
    [ROUTES.handoffPatient]: {},

    [ROUTES.doctorQuestions]: {
        role: "doktor",
        step: { current: 4, total: FLOW_TOTAL, label: "Soru sor" },
    },
    [ROUTES.doctorConversation]: {
        role: "doktor",
        step: { current: 4, total: FLOW_TOTAL, label: "Görüşme" },
    },
    [ROUTES.doctorResult]: {
        role: "doktor",
        step: { current: 4, total: FLOW_TOTAL, label: "Tedavi" },
    },

    [ROUTES.complete]: {
        step: { current: 5, total: FLOW_TOTAL, label: "Tamamlandı" },
    },
};
