/**
 * Hastanın işaret diliyle anlatabileceği şikayetler.
 *
 * Ekranlar bu listeyi hem elle seçimde (manual-select) hem de kamera tahmininin
 * gösteriminde kullanır. Birleşik modelin `symptom` bağlamındaki cevabı
 * `expressionId` alanında buradaki `id` değerini taşır (ör. `seker` → `diabetes`).
 *
 * İkonlar burada saf veri olarak duruyor (JSX değil), böylece bu dosya
 * hem sunucu hem istemci tarafında kullanılabilir. `ExpressionGlyph`
 * bunları çiziyor: `strokes` çizgi, `dots` içi dolu daire.
 *
 * Çizimler 48x48 kutuya, onay ekranında ~260px'e kadar büyütülecek şekilde
 * tasarlandı: baş profili + ağrı işareti gibi tanınabilir siluetler.
 */

export interface ExpressionArt {
    /** viewBox="0 0 48 48" içinde çizilen çizgiler. */
    strokes: string[];
    /** İçi dolu daireler: [cx, cy, r] */
    dots?: Array<[number, number, number]>;
}

export interface Expression {
    /** Avatar kimliği — modelin `expressionId` alanıyla eşleşir. */
    id: string;
    /** Ekranda görünen ad. */
    label: string;
    /** Hastaya okunacak tam cümle — onay ekranında bu gösterilir. */
    sentence: string;
    /** Vücut bölgesi — gruplama ve doktor özeti için. */
    region: "bas" | "govde" | "genel";
    art: ExpressionArt;
    /**
     * Varsa, büyük ekranlarda çizgi glifi yerine gösterilen resimli anlatım
     * (`public/illustrations/...`). Onay ekranı gibi tek şikayetin ekranı
     * kapladığı yerlerde kullanılır; kart listelerinde hep glif kullanılır.
     */
    illustration?: string;
    /** Position in the unchanged, user-supplied 5 × 2 illustration sheet. */
    illustrationTile?: { column: number; row: number };
    /** Acil olabilecek belirti: onay ekranında ayrıca uyarı gösterilir. */
    urgent?: boolean;
}

export const EXPRESSIONS: Expression[] = [
    {
        id: "headache",
        label: "Baş ağrısı",
        sentence: "Başım ağrıyor",
        region: "bas",
        illustration: "/illustrations/symptoms-sheet.png",
        illustrationTile: { column: 3, row: 0 },
        art: {
            strokes: [
                "M34.5 41v-4.6c0-2.1.7-3.8 2-5.4 2-2.5 3.1-5.5 3.1-8.9C39.6 13.6 32.6 7 23.8 7 15 7 8 13.6 8 22.1c0 3.4 1.1 5.9 2.8 8 1.2 1.5 1.8 2.9 1.8 4.7V41",
                "M25.5 15.5l-5.2 8.6h6.4l-4.4 8.4",
            ],
        },
    },
    {
        id: "stomachache",
        illustration: "/illustrations/symptoms-sheet.png",
        illustrationTile: { column: 4, row: 0 },
        label: "Karın ağrısı",
        sentence: "Karnım ağrıyor",
        region: "govde",
        art: {
            strokes: [
                "M12 15c3.4-3.4 7.4-5 12-5s8.6 1.6 12 5",
                "M13.6 16.5v13.4c0 6 4.6 10.6 10.4 10.6s10.4-4.6 10.4-10.6V16.5",
                "M18 27.5c2.2 2.4 4.2 2.4 6.2 0s4.2-2.4 6.4 0",
            ],
            dots: [[24, 21, 3]],
        },
    },
    {
        id: "dizziness",
        illustration: "/illustrations/dizziness.png",
        label: "Baş dönmesi",
        sentence: "Başım dönüyor",
        region: "bas",
        art: {
            strokes: [
                "M34.5 41v-4.6c0-2.1.7-3.8 2-5.4 2-2.5 3.1-5.5 3.1-8.9C39.6 13.6 32.6 7 23.8 7 15 7 8 13.6 8 22.1c0 3.4 1.1 5.9 2.8 8 1.2 1.5 1.8 2.9 1.8 4.7V41",
                "M23.9 23.1 L23.5 23.4 L22.9 23.6 L22.3 23.5 L21.7 23.2 L21.2 22.6 L20.8 21.9 L20.8 20.9 L21.1 20.0 L21.7 19.1 L22.7 18.4 L23.9 18.1 L25.2 18.2 L26.5 18.8 L27.6 19.8 L28.3 21.2 L28.6 22.8 L28.3 24.4 L27.4 26.0 L26.1 27.2 L24.3 28.0 L22.3 28.2 L20.2 27.7 L18.4 26.5 L17.0 24.8 L16.2 22.6 L16.2 20.2 L16.9 17.8 L18.4 15.8 L20.6 14.3 L23.2 13.5 L26.0 13.6 L28.7 14.6 L30.9 16.5 L32.5 19.1",
            ],
        },
    },
    {
        id: "nausea",
        illustration: "/illustrations/symptoms-sheet.png",
        illustrationTile: { column: 0, row: 1 },
        label: "Bulantı",
        sentence: "Midem bulanıyor",
        region: "govde",
        art: {
            strokes: [
                "M32 38.5V35c0-1.9.6-3.4 1.8-4.8 1.8-2.2 2.8-5 2.8-8C36.6 14.4 30.2 8.5 22.2 8.5 14.2 8.5 8 14.4 8 22.2c0 3 1 5.3 2.5 7.2 1.1 1.3 1.6 2.6 1.6 4.2v4.9",
                "M17 24c2 1.8 3.6 1.8 5.4 0",
                "M27 30.5c1.6 1.6 3.4 1.6 5 0",
                "M31 35.5c1.6 1.6 3.4 1.6 5 0",
                "M35 40.5c1.6 1.6 3.4 1.6 5 0",
            ],
        },
    },
    {
        id: "shortness-of-breath",
        illustration: "/illustrations/symptoms-sheet.png",
        illustrationTile: { column: 2, row: 1 },
        label: "Nefes darlığı",
        sentence: "Nefes almakta zorlanıyorum",
        region: "govde",
        art: {
            strokes: [
                "M24 8v11",
                "M24 19l-5.5 3.5",
                "M24 19l5.5 3.5",
                "M18.5 22.5c-4.4 2.4-6.6 7.6-6.6 13 0 5 2.2 7.4 5.4 7.4 2.8 0 4.2-2.2 4.2-5.4V22.5",
                "M29.5 22.5c4.4 2.4 6.6 7.6 6.6 13 0 5-2.2 7.4-5.4 7.4-2.8 0-4.2-2.2-4.2-5.4V22.5",
            ],
        },
    },
    {
        id: "fever",
        illustration: "/illustrations/symptoms-sheet.png",
        illustrationTile: { column: 0, row: 0 },
        label: "Ateş",
        sentence: "Ateşim var",
        region: "genel",
        art: {
            strokes: [
                "M27.5 10.5a4.2 4.2 0 0 0-8.4 0v18.4a7.6 7.6 0 1 0 8.4 0V10.5z",
                "M23.3 20v10",
                "M33 13h5",
                "M33 19.5h5",
                "M33 26h5",
            ],
            dots: [[23.3, 34.5, 3.8]],
        },
    },
    {
        id: "pain",
        label: "Ağrı",
        sentence: "Bir yerim ağrıyor",
        region: "genel",
        illustration: "/illustrations/pain.png",
        art: {
            strokes: ["M28 5 L15 26h9l-4 17 14-21h-9z"],
        },
    },
    {
        id: "asthma",
        label: "Astım",
        sentence: "Astımım var",
        region: "govde",
        illustration: "/illustrations/asthma.png",
        art: {
            strokes: [
                "M17 17h10v21a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z",
                "M27 22h6",
                "M33 12c3.5 0 3.5 4.5 7 4.5",
                "M33 30c3.5 0 3.5 4.5 7 4.5",
            ],
        },
    },
    {
        id: "rash",
        label: "Döküntü / alerji",
        sentence: "Cildimde döküntü var",
        region: "genel",
        illustration: "/illustrations/rash.png",
        art: {
            strokes: [
                "M16 11h16a5 5 0 0 1 5 5v16a5 5 0 0 1-5 5H16a5 5 0 0 1-5-5V16a5 5 0 0 1 5-5z",
            ],
            dots: [
                [19, 19, 2.1],
                [27, 16.5, 2.1],
                [32, 24, 2.1],
                [22, 27.5, 2.1],
                [29.5, 31, 2.1],
            ],
        },
    },
    {
        id: "palpitations",
        label: "Kalp çarpıntısı",
        sentence: "Kalbim hızlı çarpıyor",
        region: "govde",
        illustration: "/illustrations/palpitations.png",
        art: {
            strokes: [
                "M24 41S9 32 9 22.5A8.5 8.5 0 0 1 24 17a8.5 8.5 0 0 1 15 5.5C39 32 24 41 24 41z",
                "M13 24.5h5l3-6.5 4 13 3-6.5h6",
            ],
        },
    },
    {
        id: "heart-attack",
        urgent: true,
        label: "Kalp krizi işareti",
        sentence: "Göğsümde şiddetli ağrı var",
        region: "govde",
        illustration: "/illustrations/heart-attack.png",
        art: {
            strokes: [
                "M24 41S9 32 9 22.5A8.5 8.5 0 0 1 24 17a8.5 8.5 0 0 1 15 5.5C39 32 24 41 24 41z",
                "M26.5 19.5l-6 9.5h6l-4.5 9",
            ],
        },
    },
    {
        id: "bleeding",
        urgent: true,
        label: "Kanama",
        sentence: "Kanamam var",
        region: "genel",
        illustration: "/illustrations/bleeding.png",
        art: {
            strokes: [
                "M28 7c6.5 9 10 13.5 10 19a10 10 0 0 1-20 0c0-5.5 3.5-10 10-19z",
                "M8 17l7 6",
                "M8 27l7-4",
            ],
        },
    },
    {
        id: "vomiting",
        label: "Kusma",
        sentence: "Kusuyorum",
        region: "govde",
        illustration: "/illustrations/vomiting.png",
        art: {
            strokes: [
                "M28 34v-3c0-1.8.6-3.3 1.7-4.6 1.7-2 2.6-4.6 2.6-7.4C32.3 11.6 26.3 6 18.8 6 11.4 6 5.5 11.6 5.5 19c0 2.8.9 5 2.3 6.8 1 1.2 1.5 2.4 1.5 3.9V34",
                "M16 21c1.9 1.7 3.4 1.7 5.1 0",
                "M23 27c2.5 4 5.5 8 9 11",
                "M32 38c2.5 0 4-1.5 4-4",
            ],
        },
    },
    {
        id: "diabetes",
        label: "Şeker hastalığı",
        sentence: "Şeker hastasıyım",
        region: "genel",
        illustration: "/illustrations/diabetes.png",
        art: {
            strokes: [
                "M16 6h16a3 3 0 0 1 3 3v30a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z",
                "M18 12h12v8H18z",
                "M19 27h4M25 27h4M19 34h4M25 34h4",
            ],
        },
    },
    {
        id: "burn",
        urgent: true,
        label: "Yanık",
        sentence: "Yanığım var",
        region: "genel",
        illustration: "/illustrations/burn.png",
        art: {
            strokes: [
                "M24 5c6.5 7.5 11 12 11 19.5a11 11 0 0 1-22 0c0-4.5 2-8 5.5-11 0 4.5 2 6.5 4 6.5 2.2 0 3.3-2.2 3.3-5.5 0-3.3-1-6.7-1.8-9.5z",
            ],
        },
    },
];

/** Kimlikten ifadeyi bulur; AI tahmini geldiğinde kullanılır. */
export function findExpression(id: string): Expression | undefined {
    return EXPRESSIONS.find((item) => item.id === id);
}

interface CandidateLike {
    text: string;
    prediction?: { expressionId?: string | null } | null;
}

/**
 * Onay ekranında gösterilecek avatarı seçer.
 * Model cevabında `expressionId` varsa yalnız o avatar ve yalnız cümlesi cevap metniyle
 * aynıysa gösterilir; böylece örneğin `diabetes` avatarı başka bir sınıfa yanlışlıkla bağlanmaz.
 * `expressionId` yoksa (eski model veya elle seçim) cümle eşleşmesi kullanılır.
 */
export function expressionForCandidate(candidate: CandidateLike | null | undefined): Expression | undefined {
    if (!candidate) return undefined;
    const expressionId = candidate.prediction?.expressionId;
    if (expressionId) {
        const match = EXPRESSIONS.find((item) => item.id === expressionId);
        return match && match.sentence === candidate.text ? match : undefined;
    }
    return EXPRESSIONS.find((item) => item.sentence === candidate.text);
}

/** Tahmin edilen sınıfın hastaya okunacak cümlesi; bilinmeyen sınıfta boş döner. */
export function sentenceFor(id: string): string {
    return findExpression(id)?.sentence ?? "";
}
