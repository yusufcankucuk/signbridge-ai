/**
 * Vücut bölgeleri — hasta ağrının yerini gösterirken kullanılır.
 *
 * Şekiller 100x210'luk bir kutuya çizilmiş basit bir insan silueti oluşturur;
 * her bölge aynı zamanda dokunma alanıdır. `shapes` boşsa bölge haritada
 * gösterilemez (örneğin sırt, önden görünmez) — o bölge sadece liste
 * düğmesiyle seçilir.
 */

export interface RegionShape {
    kind: "ellipse" | "rect";
    /** ellipse: cx, cy, rx, ry — rect: x, y, w, h, r */
    values: number[];
}

export interface BodyRegion {
    id: string;
    /** Ekranda görünen ad. */
    label: string;
    /** Hastanın cümlesi — doktor bunu okur. */
    sentence: string;
    shapes: RegionShape[];
}

export const BODY_REGIONS: BodyRegion[] = [
    {
        id: "head",
        label: "Baş",
        sentence: "Ağrı başımda",
        shapes: [{ kind: "ellipse", values: [50, 18, 12, 14] }],
    },
    {
        id: "chest",
        label: "Göğüs",
        sentence: "Ağrı göğsümde",
        shapes: [{ kind: "rect", values: [31, 34, 38, 32, 13] }],
    },
    {
        id: "belly",
        label: "Karın",
        sentence: "Ağrı karnımda",
        shapes: [{ kind: "rect", values: [34, 68, 32, 28, 12] }],
    },
    {
        id: "arms",
        label: "Kollar",
        sentence: "Ağrı kollarımda",
        shapes: [
            { kind: "rect", values: [16, 37, 12, 58, 6] },
            { kind: "rect", values: [72, 37, 12, 58, 6] },
        ],
    },
    {
        id: "legs",
        label: "Bacaklar",
        sentence: "Ağrı bacaklarımda",
        shapes: [
            { kind: "rect", values: [36, 99, 13, 70, 6.5] },
            { kind: "rect", values: [51, 99, 13, 70, 6.5] },
        ],
    },
    {
        id: "back",
        label: "Sırt / Bel",
        sentence: "Ağrı sırtımda",
        /* Önden görünmez — sadece liste düğmesinden seçilir. */
        shapes: [],
    },
];

export function findRegion(id: string): BodyRegion | undefined {
    return BODY_REGIONS.find((item) => item.id === id);
}

/**
 * Hastanın düzenli kullandığı ilaç grupları.
 * Marka adı değil grup adı: hasta okuyup tanıyabilsin.
 */
export const MEDICATION_GROUPS = [
    { id: "blood-pressure", label: "Tansiyon ilacı" },
    { id: "diabetes", label: "Şeker (diyabet) ilacı" },
    { id: "blood-thinner", label: "Kan sulandırıcı" },
    { id: "painkiller", label: "Ağrı kesici" },
    { id: "heart", label: "Kalp ilacı" },
    { id: "other", label: "Başka bir ilaç" },
] as const;
