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
export const DURATION_UNITS = ['gün', 'hafta', 'ay', 'yıl'] as const;

export function isDurationNumber(classId: string | null | undefined): boolean {
    return !!classId && classId in ANSWER_NUMBERS;
}

export function durationAnswer(classId: string, unit: string): string {
    return `${ANSWER_NUMBERS[classId]} ${unit}`;
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
