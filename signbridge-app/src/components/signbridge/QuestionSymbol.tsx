import { DOCTOR_QUESTIONS } from "../../data/questions";
import type { QuestionKind } from "../../lib/consultationFlow";
import QuestionGlyph from "./QuestionGlyph";

interface QuestionSymbolProps {
    kind: QuestionKind;
    className?: string;
}

/**
 * Doktorun soru menüsündeki ikon. `DOCTOR_QUESTIONS` içindeki çizimi
 * soru türünün kimliğinden bulur; böylece kart görünümü ile menü görünümü
 * aynı ikon verisini paylaşır. Türün çizimi yoksa hiçbir şey basmaz —
 * anlamı zaten yanındaki etiket taşır.
 */
export default function QuestionSymbol({ kind, className }: QuestionSymbolProps) {
    const question = DOCTOR_QUESTIONS.find((item) => item.id === kind);

    if (!question) return null;

    return (
        <QuestionGlyph
            question={question}
            className={className ?? "h-[26px] w-[26px]"}
        />
    );
}
