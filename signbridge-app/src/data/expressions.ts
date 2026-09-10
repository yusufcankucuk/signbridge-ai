/**
 * Hastanın işaret diliyle anlatabileceği şikayetler.
 *
 * `id` değerleri AI modelinin sınıf adlarıyla eşleşir; ekranlar bu listeyi
 * hem elle seçimde (manual-select) hem de tahmin gösteriminde kullanır.
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
    /** AI sınıf adı — API'ye bu gider. */
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
];

/** Kimlikten ifadeyi bulur; AI tahmini geldiğinde kullanılır. */
export function findExpression(id: string): Expression | undefined {
    return EXPRESSIONS.find((item) => item.id === id);
}

/** Tahmin edilen sınıfın hastaya okunacak cümlesi; bilinmeyen sınıfta boş döner. */
export function sentenceFor(id: string): string {
    return findExpression(id)?.sentence ?? "";
}
