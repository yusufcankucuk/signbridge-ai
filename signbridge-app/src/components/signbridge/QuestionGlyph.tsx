import { cn } from "../../../lib/utils";
import type { DoctorQuestion, QuestionTone } from "../../data/questions";

/**
 * Soru ikonlarının paleti — doktor akışının lacivert tonları
 * (`tailwind.config.ts` içindeki `doctor` ölçeği).
 */
const ACTIVE: Record<QuestionTone, string> = {
    dark: "#12507E", // doctor-500
    mid: "#356FA4", // doctor-400
    light: "#6795C2", // doctor-300
    pale: "#9CBBDA", // doctor-200
    faint: "#CBDCEE", // doctor-100
    white: "#FFFFFF",
};

/** Pasif ("Yakında") kartlarda ikon renkten arındırılır. */
const MUTED: Record<QuestionTone, string> = {
    dark: "#6B7683",
    mid: "#8A939E",
    light: "#A8B0B9",
    pale: "#C4CAD1",
    faint: "#E4E7EA",
    white: "#FFFFFF",
};

interface QuestionGlyphProps {
    question: DoctorQuestion;
    /** Pasif kartlarda gri palet kullanılır. */
    muted?: boolean;
    className?: string;
}

/**
 * Hazır sorunun iki tonlu çizimi. Dekoratiftir — anlamı her zaman yanındaki
 * etiket taşır, bu yüzden `aria-hidden`. Boyut dışarıdan `className` ile verilir.
 */
export default function QuestionGlyph({
    question,
    muted = false,
    className,
}: QuestionGlyphProps) {
    const palette = muted ? MUTED : ACTIVE;

    return (
        <svg
            viewBox="0 0 48 48"
            aria-hidden="true"
            className={cn("block", className)}
        >
            {question.art.map((shape, i) => (
                <path
                    key={`${question.id}-${i}`}
                    d={shape.d}
                    transform={shape.transform}
                    fill={shape.stroke ? "none" : palette[shape.tone]}
                    stroke={shape.stroke ? palette[shape.tone] : "none"}
                    strokeWidth={shape.width ?? 3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            ))}
        </svg>
    );
}
