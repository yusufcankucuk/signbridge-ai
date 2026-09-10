"use client";

import { cn } from "../../../lib/utils";
import ExpressionGlyph from "./ExpressionGlyph";
import type { Expression } from "../../data/expressions";

interface ExpressionCardProps {
    expression: Expression;
    selected?: boolean;
    onSelect?: (expression: Expression) => void;
    /** Seçim listesinde mi, yoksa salt okunur bir özet mi? */
    readOnly?: boolean;
    className?: string;
}

/**
 * Şikayet kartı — hasta elle seçim yaparken ve özet ekranlarında kullanılır.
 *
 * Erişilebilirlik: seçim gerçek bir <button> ile yapılır (klavye ile gezilebilir),
 * dokunma alanı 96px, seçili durum renkle birlikte kalın kenar ve tik ikonu
 * gösterir. İkon dekoratif; anlamı her zaman metin taşır.
 */
export default function ExpressionCard({
    expression,
    selected = false,
    onSelect,
    readOnly = false,
    className,
}: ExpressionCardProps) {
    const art = (
        <>
            <span
                className={cn(
                    "flex h-14 w-14 shrink-0 items-center justify-center rounded-md transition-colors",
                    selected
                        ? "bg-brand-500 text-white"
                        : "bg-brand-50 text-brand-600"
                )}
                aria-hidden="true"
            >
                <ExpressionGlyph
                    expression={expression}
                    className="h-8 w-8"
                />
            </span>

            <span className="min-w-0 flex-1 text-left">
                <span className="block text-h3 leading-tight text-ink">
                    {expression.label}
                </span>

                <span className="mt-0.5 block text-caption text-ink-muted">
                    {expression.sentence}
                </span>
            </span>
        </>
    );

    const shell = cn(
        "flex w-full items-center gap-4 rounded-lg border-2 p-4",
        "min-h-[96px] transition-all duration-200",
        selected
            ? "border-brand-500 bg-brand-50 shadow-brand"
            : "border-line bg-white shadow-card",
        className
    );

    if (readOnly || !onSelect) {
        return <div className={shell}>{art}</div>;
    }

    return (
        <button
            type="button"
            onClick={() => onSelect(expression)}
            aria-pressed={selected}
            className={cn(
                shell,
                "cursor-pointer hover:border-brand-300 hover:shadow-raised active:scale-[0.99]",
                "focus-visible:outline-none focus-visible:ring focus-visible:ring-brand-300 focus-visible:ring-offset-2"
            )}
        >
            {art}

            <span
                className={cn(
                    "shrink-0 transition-opacity",
                    selected ? "text-brand-600 opacity-100" : "opacity-0"
                )}
                aria-hidden="true"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="h-7 w-7"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                    />
                </svg>
            </span>
        </button>
    );
}
