/**
 * Doktorun hastaya sorabileceği hazır sorular.
 *
 * Her soru, hastanın işaret diliyle yanıtlayabileceği bir ekrana bağlanır.
 * Henüz ekranı yazılmamış sorular `ready: false` ile işaretli — arayüz
 * bunları "yakında" olarak pasif gösterir, tıklanınca hiçbir yere gitmez.
 *
 * İkonlar `expressions.ts` ile aynı biçimde saf veri (viewBox 0 0 24 24).
 */

import type { QuestionParam } from "../constants/routes";

export interface DoctorQuestion {
    id: string;
    /** Karttaki kısa ad. */
    label: string;
    /** Kartın altındaki açıklama — doktora ne soracağını anlatır. */
    hint: string;
    /** Hastaya yönlendirileceği ekran; yoksa henüz yazılmamış. */
    target?: QuestionParam;
    /** Ekranı yazıldı mı? `false` ise kart pasif ve "Yakında" etiketli görünür. */
    ready: boolean;
    /**
     * Doktor ekranında listelensin mi? Ekran kaydırmasız olduğu için
     * listeye sığan kadarı gösterilir; kalanlar hazır olduğunda açılır.
     */
    listed: boolean;
    /** viewBox="0 0 24 24" içinde çizilen çizgiler. */
    strokes: string[];
}

export const DOCTOR_QUESTIONS: DoctorQuestion[] = [
    {
        id: "duration",
        label: "Süre / Zaman",
        hint: "Ne kadar süredir var?",
        target: "duration",
        ready: true,
        listed: true,
        strokes: ["M12 7v5l3 2", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"],
    },
    {
        id: "intensity",
        label: "Şiddet Derecesi",
        hint: "1-10 arası ne kadar?",
        target: "intensity",
        ready: true,
        listed: true,
        /* Yükselen çubuklar: 24'lük kutuya dikeyde ortalanır, kırpılmaz. */
        strokes: [
            "M5 19v-3.5",
            "M10 19v-7",
            "M15 19v-10.5",
            "M20 19v-14",
        ],
    },
    {
        id: "summary",
        label: "Özeti Onayla",
        hint: "Özeti görüp onaylar",
        target: "summary",
        ready: true,
        /* Soru listesinde yok: özet, doktor tedaviyi yazdıktan SONRA
           hastaya gösterilir (`/doctor/result` → `/patient/summary`). */
        listed: false,
        strokes: [
            "M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
            "M9.5 12l2 2 3.5-4",
        ],
    },
    {
        id: "location",
        label: "Yer / Bölge",
        hint: "Ağrı neresinde?",
        target: "location",
        ready: true,
        listed: true,
        strokes: [
            "M12 21s-6-4.5-6-9a6 6 0 0 1 12 0c0 4.5-6 9-6 9z",
            "M12 12h.01",
        ],
    },
    {
        id: "medication",
        label: "İlaç Kullanımı",
        hint: "Düzenli ilaç var mı?",
        target: "medication",
        ready: true,
        listed: true,
        strokes: [
            "M8.5 4.5h7a3 3 0 0 1 0 6h-7a3 3 0 0 1 0-6z",
            "M8.5 13.5h7a3 3 0 0 1 0 6h-7a3 3 0 0 1 0-6z",
        ],
    },
    {
        id: "allergy",
        label: "Alerji",
        hint: "Bilinen alerjisi var mı?",
        ready: false,
        listed: false,
        strokes: [
            "M12 4v11",
            "M12 19h.01",
            "M10.3 4.2L2.6 17.5A1.5 1.5 0 0 0 3.9 19.8h16.2a1.5 1.5 0 0 0 1.3-2.3L13.7 4.2a1.5 1.5 0 0 0-2.6 0z",
        ],
    },
];

/** Hastanın süre sorusuna verebileceği hazır yanıtlar. */
export const DURATION_OPTIONS = [
    { id: "today", label: "Bugün başladı" },
    { id: "2-3-days", label: "2-3 gündür" },
    { id: "1-week", label: "Yaklaşık 1 haftadır" },
    { id: "1-month", label: "1 aydan uzun" },
] as const;

/**
 * Ağrı şiddeti ölçeği. Renk tek başına anlam taşımadığı için her basamağın
 * hem sayısı hem sözlü karşılığı var.
 */
export const INTENSITY_LEVELS = [
    { value: 2, label: "Hafif", hint: "Fark ediyorum ama işimi engellemiyor" },
    { value: 5, label: "Orta", hint: "Canımı sıkıyor, dikkatimi dağıtıyor" },
    { value: 8, label: "Şiddetli", hint: "Zor dayanıyorum" },
    { value: 10, label: "Dayanılmaz", hint: "Hiçbir şey yapamıyorum" },
] as const;

/**
 * Hasta tedaviyi anlamadığında neyi tekrar sormak istediğini seçer.
 *
 * İki başlık altında toplandı: hastalığın kendisi ve ilaç. Doktora
 * "anlamadım" demek yerine tam olarak neyin belirsiz olduğunu göstermek
 * görüşmeyi kısaltır.
 */
export interface FollowupGroup {
    id: string;
    title: string;
    items: Array<{ id: string; label: string }>;
}

export const PATIENT_FOLLOWUP_GROUPS: FollowupGroup[] = [
    {
        id: "illness",
        title: "Hastalığım",
        items: [
            { id: "diagnosis", label: "Hastalığım ne?" },
            { id: "severity", label: "Ciddi mi?" },
            { id: "recovery", label: "Ne zaman geçer?" },
            { id: "precautions", label: "Nelere dikkat etmeliyim?" },
        ],
    },
    {
        id: "medicine",
        title: "İlacım",
        items: [
            { id: "medicine-name", label: "İlacın adı ne?" },
            { id: "dose", label: "Ne kadar alacağım?" },
            { id: "timing", label: "Ne zaman alacağım?" },
            { id: "duration", label: "Kaç gün alacağım?" },
        ],
    },
];

/** Ayrı duran seçenek: hasta hiçbir şeyi anlamadıysa. */
export const PATIENT_FOLLOWUP_ALL = {
    id: "all",
    label: "Hepsini tekrar anlatın",
};

/** Hastanın seçtiği takip sorusunun metnini kimliğinden bulur. */
export function findFollowupLabel(id: string | null): string {
    if (!id) return "";

    if (id === PATIENT_FOLLOWUP_ALL.id) return PATIENT_FOLLOWUP_ALL.label;

    for (const group of PATIENT_FOLLOWUP_GROUPS) {
        const found = group.items.find((item) => item.id === id);
        if (found) return found.label;
    }

    return "";
}
