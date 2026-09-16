/**
 * Doktorun hastaya sorabileceği hazır sorular.
 *
 * Her soru, hastanın işaret diliyle yanıtlayabileceği bir ekrana bağlanır.
 * Henüz ekranı yazılmamış sorular `ready: false` ile işaretli — arayüz
 * bunları "yakında" olarak pasif gösterir, tıklanınca hiçbir yere gitmez.
 *
 * İkonlar `expressions.ts` ile aynı biçimde saf veri, ancak iki boyamalı:
 * her parça bir `tone` taşır (koyu lacivert → açık mavi) ve dolgu ya da
 * çizgi olarak çizilir. Çizim alanı viewBox 0 0 48 48.
 */

import type { QuestionParam } from "../constants/routes";

/** İkon paletindeki basamaklar — `QuestionGlyph` gerçek renklere çevirir. */
export type QuestionTone = "dark" | "mid" | "light" | "pale" | "faint" | "white";

/** İkonun tek bir parçası. */
export interface QuestionShape {
    /** viewBox="0 0 48 48" içindeki yol. */
    d: string;
    tone: QuestionTone;
    /** `true` → çizgi olarak çizilir; yoksa dolgu. */
    stroke?: boolean;
    /** Çizgi kalınlığı (varsayılan 3). */
    width?: number;
    /** Parçaya özel dönüşüm (ör. kapsülü eğmek için). */
    transform?: string;
}

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
    /** Sorunun resmi — arkadan öne doğru çizilen parçalar. */
    art: QuestionShape[];
}

export const DOCTOR_QUESTIONS: DoctorQuestion[] = [
    {
        id: "duration",
        label: "Süre / Zaman",
        hint: "Ne kadar süredir var?",
        target: "duration",
        ready: true,
        listed: true,
        /* Saat: kadranın dışında açık mavi bir yay, içinde koyu akrep-yelkovan. */
        art: [
            { d: "M24 9A17 17 0 0 1 41 26", tone: "light", stroke: true, width: 3.5 },
            { d: "M11 26a13 13 0 1 0 26 0a13 13 0 1 0 -26 0Z", tone: "dark", stroke: true, width: 3 },
            { d: "M24 17.5V26H30.5", tone: "dark", stroke: true, width: 3 },
        ],
    },
    {
        id: "intensity",
        label: "Şiddet Derecesi",
        hint: "1-10 arası ne kadar?",
        target: "intensity",
        ready: true,
        listed: true,
        /* Yükselen çubuklar: yükseldikçe koyulaşır, renk tek başına anlam
           taşımasın diye yükseklik de artar. */
        art: [
            { d: "M6.5 31H8.5A2.5 2.5 0 0 1 11 33.5V38.5A2.5 2.5 0 0 1 8.5 41H6.5A2.5 2.5 0 0 1 4 38.5V33.5A2.5 2.5 0 0 1 6.5 31Z", tone: "pale" },
            { d: "M17.5 24H19.5A2.5 2.5 0 0 1 22 26.5V38.5A2.5 2.5 0 0 1 19.5 41H17.5A2.5 2.5 0 0 1 15 38.5V26.5A2.5 2.5 0 0 1 17.5 24Z", tone: "light" },
            { d: "M28.5 17H30.5A2.5 2.5 0 0 1 33 19.5V38.5A2.5 2.5 0 0 1 30.5 41H28.5A2.5 2.5 0 0 1 26 38.5V19.5A2.5 2.5 0 0 1 28.5 17Z", tone: "mid" },
            { d: "M39.5 10H41.5A2.5 2.5 0 0 1 44 12.5V38.5A2.5 2.5 0 0 1 41.5 41H39.5A2.5 2.5 0 0 1 37 38.5V12.5A2.5 2.5 0 0 1 39.5 10Z", tone: "dark" },
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
        /* Panoya takılı onay işareti. */
        art: [
            { d: "M16 8H32A5 5 0 0 1 37 13V35A5 5 0 0 1 32 40H16A5 5 0 0 1 11 35V13A5 5 0 0 1 16 8Z", tone: "faint" },
            { d: "M21 4.5H27A3 3 0 0 1 30 7.5V8.5A3 3 0 0 1 27 11.5H21A3 3 0 0 1 18 8.5V7.5A3 3 0 0 1 21 4.5Z", tone: "dark" },
            { d: "M17.5 25.5L22 30L31 19", tone: "dark", stroke: true, width: 3.5 },
        ],
    },
    {
        id: "location",
        label: "Yer / Bölge",
        hint: "Ağrı neresinde?",
        target: "location",
        ready: true,
        listed: true,
        /* Gövde silueti + ağrının yayıldığı iç içe halkalar. */
        art: [
            { d: "M19 10a5 5 0 1 0 10 0a5 5 0 1 0 -10 0Z", tone: "dark", stroke: true, width: 3 },
            { d: "M13 22C15 18.5 18.5 17 24 17C29.5 17 33 18.5 35 22L38.5 33M13 22L9.5 33", tone: "dark", stroke: true, width: 3 },
            { d: "M16.5 24L15 40M31.5 24L33 40", tone: "dark", stroke: true, width: 3 },
            { d: "M15 29a9 9 0 1 0 18 0a9 9 0 1 0 -18 0Z", tone: "faint" },
            { d: "M18.5 29a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0 -11 0Z", tone: "light" },
            { d: "M21.5 29a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0Z", tone: "dark" },
        ],
    },
    {
        id: "medication",
        label: "İlaç Kullanımı",
        hint: "Düzenli ilaç var mı?",
        target: "medication",
        ready: true,
        listed: true,
        /* Eğik kapsül (iki yarısı iki ton) + yanında yuvarlak tablet. */
        art: [
            { d: "M20 11H14A8 8 0 0 0 14 27H20Z", tone: "dark", transform: "rotate(35 20 19)" },
            { d: "M20 11H26A8 8 0 0 1 26 27H20Z", tone: "light", transform: "rotate(35 20 19)" },
            { d: "M30.5 36a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0 -15 0Z", tone: "light" },
            { d: "M34 39.5L42 32.5", tone: "white", stroke: true, width: 2.6 },
        ],
    },
    {
        id: "allergy",
        label: "Alerji",
        hint: "Bilinen alerjisi var mı?",
        ready: false,
        listed: false,
        /* Uyarı üçgeni. */
        art: [
            { d: "M21.4 8.6L6.4 34.5A3 3 0 0 0 9 39H39A3 3 0 0 0 41.6 34.5L26.6 8.6A3 3 0 0 0 21.4 8.6Z", tone: "pale" },
            { d: "M24 18V27", tone: "dark", stroke: true, width: 3.5 },
            { d: "M22 32.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z", tone: "dark" },
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
