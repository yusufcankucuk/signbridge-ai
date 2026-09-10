import type { ReactNode } from "react";

import { cn } from "../../../lib/utils";
import type { TreatmentInfo } from "../../../types/consultation";

interface TreatmentCardProps {
    treatment: TreatmentInfo;
    /** Hasta mı okuyor, doktor mu kontrol ediyor? Renk buna göre değişir. */
    audience?: "hasta" | "doktor";
    className?: string;
}

interface Line {
    key: keyof TreatmentInfo;
    label: string;
    strokes: string[];
}

/* Her satırın kendi ikonu var: hasta metni okumakta zorlanırsa ikon yardımcı olur. */
const LINES: Line[] = [
    {
        key: "medicine",
        label: "İlaç",
        strokes: [
            "M8.5 4.5h7a3 3 0 0 1 0 6h-7a3 3 0 0 1 0-6z",
            "M8.5 13.5h7a3 3 0 0 1 0 6h-7a3 3 0 0 1 0-6z",
        ],
    },
    {
        key: "dose",
        label: "Doz",
        strokes: ["M4 12h16", "M9 8l-5 4 5 4", "M15 8l5 4-5 4"],
    },
    {
        key: "frequency",
        label: "Sıklık",
        strokes: ["M12 7v5l3 2", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"],
    },
    {
        key: "meal",
        label: "Yemek",
        strokes: [
            "M6 3v8a3 3 0 0 0 6 0V3",
            "M9 11v10",
            "M17 3c1.5 2 1.5 5 0 7v11",
        ],
    },
    {
        key: "duration",
        label: "Süre",
        strokes: [
            "M7 3v3M17 3v3",
            "M4 8h16",
            "M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
        ],
    },
];

/**
 * Doktorun yazdığı tedaviyi hastaya okunur biçimde gösterir.
 *
 * Erişilebilirlik: teşhis en büyük punto ile üstte; ilaç bilgileri
 * etiket-değer çiftleri olarak <dl> içinde, her satır ikonlu. Değeri boş
 * olan satır hiç çizilmez — "—" gibi belirsiz bir işaret gösterilmez.
 */
export default function TreatmentCard({
    treatment,
    audience = "hasta",
    className,
}: TreatmentCardProps) {
    const isDoctor = audience === "doktor";

    const filled = LINES.filter((line) => treatment[line.key]?.trim());

    return (
        <section
            className={cn(
                "overflow-hidden rounded-lg border-2 bg-white shadow-card",
                isDoctor ? "border-doctor-100" : "border-brand-100",
                className
            )}
            aria-labelledby="tedavi-teshis"
        >
            {/* Teşhis */}
            <header
                className={cn(
                    "px-5 py-3",
                    isDoctor ? "bg-doctor-50" : "bg-brand-50"
                )}
            >
                <span
                    className={cn(
                        "block text-caption font-bold uppercase tracking-wide",
                        isDoctor ? "text-doctor-600" : "text-brand-700"
                    )}
                >
                    Teşhis
                </span>

                <h2
                    id="tedavi-teshis"
                    className="mt-1 text-h2 leading-tight text-ink"
                >
                    {treatment.diagnosis?.trim() || "Doktor teşhis yazmadı"}
                </h2>
            </header>

            {/* İlaç bilgileri */}
            {filled.length > 0 ? (
                <dl className="divide-y divide-line">
                    {filled.map((line) => (
                        <div
                            key={line.key}
                            className="flex items-center gap-3.5 px-5 py-2.5"
                        >
                            <span
                                className={cn(
                                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-sm",
                                    isDoctor
                                        ? "bg-doctor-50 text-doctor-500"
                                        : "bg-brand-50 text-brand-600"
                                )}
                                aria-hidden="true"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="h-5 w-5"
                                >
                                    {line.strokes.map((d) => (
                                        <path key={d} d={d} />
                                    ))}
                                </svg>
                            </span>

                            <div className="min-w-0 flex-1">
                                <dt className="text-caption text-ink-muted">
                                    {line.label}
                                </dt>

                                <dd className="text-base font-bold leading-snug text-ink">
                                    {treatment[line.key]}
                                </dd>
                            </div>
                        </div>
                    ))}
                </dl>
            ) : (
                <p className="px-5 py-4 text-base text-ink-muted">
                    Henüz ilaç bilgisi girilmedi.
                </p>
            )}
        </section>
    );
}

/**
 * Tedavi kartının altına eklenen not alanı — "3 gün içinde geçmezse tekrar
 * gelin" gibi serbest metinler için.
 */
export function TreatmentNote({ children }: { children: ReactNode }) {
    return (
        <p className="rounded-lg border-2 border-warning-100 bg-warning-50 px-4 py-3 text-base text-ink-body">
            <span className="mr-2 font-bold text-warning-600">Önemli</span>
            {children}
        </p>
    );
}
