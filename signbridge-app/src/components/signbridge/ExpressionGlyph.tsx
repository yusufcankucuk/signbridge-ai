import { cn } from "../../../lib/utils";
import type { Expression } from "../../data/expressions";

interface ExpressionGlyphProps {
    expression: Expression;
    /** Çizgi kalınlığı — büyük boyutlarda düşürülür. */
    strokeWidth?: number;
    className?: string;
}

/**
 * Bir şikayetin temsili çizimi. Saf `svg`; boyutu dışarıdan `className` ile
 * verilir (`h-full w-full` gibi). Dekoratiftir — anlamı her zaman yanındaki
 * metin taşır, bu yüzden `aria-hidden`.
 */
export default function ExpressionGlyph({
    expression,
    strokeWidth = 2.6,
    className,
}: ExpressionGlyphProps) {
    return (
        <svg
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={cn("block", className)}
        >
            {expression.art.strokes.map((d) => (
                <path key={d} d={d} />
            ))}

            {expression.art.dots?.map(([cx, cy, r]) => (
                <circle
                    key={`${cx}-${cy}-${r}`}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="currentColor"
                    stroke="none"
                />
            ))}
        </svg>
    );
}
