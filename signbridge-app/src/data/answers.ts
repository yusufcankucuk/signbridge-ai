/**
 * Doktor sorularına kamerayla verilen yanıtların sözlüğü.
 *
 * Model tarafındaki `ai-training/configs/labels.signbridge71.json` dosyasının `answerContexts`
 * ve etiket metinleriyle birebir aynı olmalıdır; `tests/answer-vocabulary.test.cjs` bunu doğrular.
 */
import type { QuestionKind } from '@/types/session';

/** Kameranın yanıt arayabildiği soru tipleri (custom hariç). */
export const ANSWER_CONTEXTS = ['duration', 'intensity', 'location', 'medication'] as const;
export type AnswerContext = (typeof ANSWER_CONTEXTS)[number];

export function answerContextFor(kind: QuestionKind | undefined): AnswerContext | null {
    return kind && (ANSWER_CONTEXTS as readonly string[]).includes(kind) ? (kind as AnswerContext) : null;
}

/** classId → hastaya ve doktora gösterilen metin. */
export const ANSWER_LABELS: Record<string, string> = {
    'sayi-1': 'Bir', 'sayi-2': 'İki', 'sayi-3': 'Üç', 'sayi-4': 'Dört', 'sayi-5': 'Beş',
    'sayi-6': 'Altı', 'sayi-7': 'Yedi', 'sayi-8': 'Sekiz', 'sayi-9': 'Dokuz', 'sayi-10': 'On',
    'sayi-20': 'Yirmi', 'sayi-30': 'Otuz',
    az: 'Az', hafif: 'Hafif', cok: 'Çok', agir: 'Ağır', iyi: 'İyi', kotu: 'Kötü',
    on: 'Ön', arka: 'Arka', yukari: 'Yukarı', asagi: 'Aşağı',
    bas: 'Baş', goz: 'Göz', kulak: 'Kulak', burun: 'Burun', dis: 'Diş', bogaz: 'Boğaz',
    boyun: 'Boyun', omuz: 'Omuz', kol: 'Kol', el: 'El', gogus: 'Göğüs', karin: 'Karın',
    sirt: 'Sırt', bel: 'Bel', bacak: 'Bacak', diz: 'Diz', ayak: 'Ayak',
    evet: 'Evet', hayir: 'Hayır', ilac: 'İlaç',
};

/** Soru tipine göre kameranın seçebileceği sınıflar (model tarafıyla aynı sıra). */
export const ANSWER_CONTEXT_CLASSES: Record<AnswerContext, string[]> = {
    duration: ['sayi-1', 'sayi-2', 'sayi-3', 'sayi-4', 'sayi-5', 'sayi-6', 'sayi-7', 'sayi-8',
        'sayi-9', 'sayi-10', 'sayi-20', 'sayi-30'],
    intensity: ['sayi-1', 'sayi-2', 'sayi-3', 'sayi-4', 'sayi-5', 'az', 'hafif', 'cok', 'agir', 'iyi', 'kotu'],
    location: ['bas', 'goz', 'kulak', 'burun', 'dis', 'bogaz', 'boyun', 'omuz', 'kol', 'el',
        'gogus', 'karin', 'sirt', 'bel', 'bacak', 'diz', 'ayak', 'on', 'arka', 'yukari', 'asagi'],
    medication: ['evet', 'hayir', 'ilac'],
};

/** "Üç" → 3; sayı olmayan sınıflar için null. */
export const ANSWER_NUMBERS: Record<string, number> = {
    'sayi-1': 1, 'sayi-2': 2, 'sayi-3': 3, 'sayi-4': 4, 'sayi-5': 5, 'sayi-6': 6,
    'sayi-7': 7, 'sayi-8': 8, 'sayi-9': 9, 'sayi-10': 10, 'sayi-20': 20, 'sayi-30': 30,
};

/**
 * Süre yanıtı iki parçadır: sayı işaretle, birim ekrandan seçilir.
 * Zaman birimi işaretleri (gün/hafta/ay/yıl) için henüz referans videomuz yok.
 */
export const DURATION_UNITS = ['saat', 'gün', 'hafta', 'ay', 'yıl'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

/** Avatar görselleri `public/avatars/answers/` altında; dosya adı = classId. */
const AVATAR_DIR = '/avatars/answers';

/** Soru tipinin ekranın üstünde gösterilen avatarı (şimdilik yalnız süre). */
export const QUESTION_AVATARS: Partial<Record<AnswerContext, string>> = {
    duration: `${AVATAR_DIR}/soru-zaman.png`,
    intensity: `${AVATAR_DIR}/soru-siddet.png`,
    location: `${AVATAR_DIR}/soru-yer.png`,
    medication: `${AVATAR_DIR}/soru-ilac.png`,
};

/** Avatarı hazır olan yanıt sınıfları. Yeni avatar geldikçe buraya eklenir. */
const AVATAR_CLASS_IDS = new Set<string>([
    ...Object.keys(ANSWER_NUMBERS),
    'az', 'hafif', 'cok', 'agir', 'iyi', 'kotu',
    ...ANSWER_CONTEXT_CLASSES.location,
    ...ANSWER_CONTEXT_CLASSES.medication,
]);

/** İlaç sorusunun doktora giden cümleleri. "Evet" ve "İlaç" işaretleri ilaç grubu seçimine götürür. */
export const MEDICATION_NONE = 'Düzenli ilaç kullanmıyorum';
export function medicationAnswer(groups: string[], other: string): string {
    const names = [...groups.filter(g => g !== 'Başka bir ilaç'), groups.includes('Başka bir ilaç') ? other.trim() : '']
        .filter(Boolean);
    return names.length ? `Düzenli ilaç kullanıyorum: ${names.join(', ')}` : '';
}

/** "Nereniz ağrıyor?" — seçim ekranındaki 17 vücut bölgesi ve isteğe bağlı 4 yön. */
export const LOCATION_DIRECTIONS = ['on', 'arka', 'yukari', 'asagi'] as const;
export const LOCATION_REGIONS = ANSWER_CONTEXT_CLASSES.location
    .filter(classId => !(LOCATION_DIRECTIONS as readonly string[]).includes(classId));

/** "Karın" + yön "Ön" → "Karın (ön)". */
export function locationAnswer(region: string, direction: string | null): string {
    const label = ANSWER_LABELS[region] ?? region;
    return direction ? `${label} (${(ANSWER_LABELS[direction] ?? direction).toLocaleLowerCase('tr')})` : label;
}

/**
 * "Seçerek yanıtla" şiddet ölçeği: her basamakta rakam ve sözlü karşılık birlikte durur.
 * "Orta" modelde yok (kamera tanımaz); yalnız bu ölçekte seçilir.
 */
export const INTENSITY_SCALE = [
    { value: 1, label: 'Az', avatar: `${AVATAR_DIR}/az.png` },
    { value: 2, label: 'Hafif', avatar: `${AVATAR_DIR}/hafif.png` },
    { value: 3, label: 'Orta', avatar: `${AVATAR_DIR}/orta.png` },
    { value: 4, label: 'Çok', avatar: `${AVATAR_DIR}/cok.png` },
    { value: 5, label: 'Ağır', avatar: `${AVATAR_DIR}/agir.png` },
] as const;

/** Derece belirtmeyen genel durum yanıtları. */
export const INTENSITY_MOODS = [
    { label: 'İyi', avatar: `${AVATAR_DIR}/iyi.png` },
    { label: 'Kötü', avatar: `${AVATAR_DIR}/kotu.png` },
] as const;

export function intensityScaleAnswer(value: number, label: string): string {
    return `${value} / 5 — ${label}`;
}

export function answerAvatar(classId: string | null | undefined): string | null {
    return classId && AVATAR_CLASS_IDS.has(classId) ? `${AVATAR_DIR}/${classId}.png` : null;
}

/** Birim işaretleri modelde yok; avatar yalnız dokunmatik düğmede gösterilir. */
export const DURATION_UNIT_AVATARS: Record<DurationUnit, string> = {
    saat: `${AVATAR_DIR}/birim-saat.png`,
    'gün': `${AVATAR_DIR}/birim-gun.png`,
    hafta: `${AVATAR_DIR}/birim-hafta.png`,
    ay: `${AVATAR_DIR}/birim-ay.png`,
    'yıl': `${AVATAR_DIR}/birim-yil.png`,
};

/** Sayı ve birim istemeyen tek dokunuşluk süre yanıtları (ekrandan seçilir). */
export const DURATION_QUICK_ANSWERS = [
    { label: 'Bugün', avatar: `${AVATAR_DIR}/hizli-bugun.png` },
    { label: 'Dün', avatar: `${AVATAR_DIR}/hizli-dun.png` },
    { label: 'Uzun zamandır', avatar: `${AVATAR_DIR}/hizli-uzun-zamandir.png` },
] as const;

/** Kameranın süre sorusunda tanıdığı sayılar, ekrandaki sırayla. */
export const DURATION_NUMBER_CLASSES = ANSWER_CONTEXT_CLASSES.duration;

export function isDurationNumber(classId: string | null | undefined): boolean {
    return !!classId && classId in ANSWER_NUMBERS;
}

export function durationAnswer(classId: string, unit: string): string {
    return `${ANSWER_NUMBERS[classId]} ${unit}`;
}

/** Tuş takımından girilen sayı + birim → "14 gün". Geçersizse boş metin. */
export function durationFromNumber(value: number, unit: string): string {
    return Number.isInteger(value) && value > 0 && value <= 999 && unit ? `${value} ${unit}` : '';
}

/** Şiddet yanıtını doktorun okuyacağı biçime çevirir. */
export function intensityAnswer(classId: string): string {
    const number = ANSWER_NUMBERS[classId];
    if (number) return `${number} / 5`;
    return ANSWER_LABELS[classId] ?? classId;
}

export function answerText(context: AnswerContext, classId: string): string {
    if (context === 'intensity') return intensityAnswer(classId);
    return ANSWER_LABELS[classId] ?? classId;
}

interface AlternativesLike {
    alternatives?: string[] | null;
    classId?: string | null;
    recognitionContext?: string;
}

/** Onay ekranında gösterilen diğer iki aday (ilk sıradaki hariç). */
export function answerAlternatives(prediction: AlternativesLike | null | undefined, limit = 2): string[] {
    const context = answerContextFor(prediction?.recognitionContext as QuestionKind | undefined);
    if (!prediction || !context || !Array.isArray(prediction.alternatives)) return [];
    const seen = new Set<string>([prediction.classId ?? '']);
    const output: string[] = [];
    for (const classId of prediction.alternatives) {
        if (seen.has(classId) || !(classId in ANSWER_LABELS)) continue;
        seen.add(classId);
        output.push(classId);
        if (output.length >= limit) break;
    }
    return output;
}
