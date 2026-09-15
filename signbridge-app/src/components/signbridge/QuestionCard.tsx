"use client";

import { cn } from "../../../lib/utils";
import type { DoctorQuestion } from "../../data/questions";
import QuestionGlyph from "./QuestionGlyph";

interface QuestionCardProps {
    question: DoctorQuestion;
    onSelect?: (question: DoctorQuestion) => void;
    /**
     * `row` — ikon solda, ad ve açıklama yanında (liste görünümü, dikeyde az yer kaplar).
     * `tile` — ikon üstte, ad altta (ızgara görünümü).
     */
    layout?: "row" | "tile";
    className?: string;
}

/**
 * Doktorun hazır soru kartı — doktor akışında (lacivert) kullanılır.
 *
 * Henüz ekranı yazılmamış sorular pasif gösterilir: `disabled` + "Yakında"
 * etiketi, böylece doktor tıklayıp boş bir ekrana düşmez.
 */
export default function QuestionCard({
    question,
    onSelect,
    layout = "row",
    className,
}: QuestionCardProps) {
    const disabled = !question.ready || !onSelect;
    const row = layout === "row";

    const icon = (
        <span
            className={cn(
                "flex shrink-0 items-center justify-center rounded-md",
                row ? "h-11 w-11" : "h-12 w-12",
                disabled ? "bg-white" : "bg-doctor-50"
            )}
            aria-hidden="true"
        >
            <QuestionGlyph
                question={question}
                muted={disabled}
                className={row ? "h-7 w-7" : "h-8 w-8"}
            />
        </span>
    );

    const text = (
        <span className={cn("block min-w-0", row && "flex-1")}>
            <span
                className={cn(
                    "block text-label leading-snug",
                    disabled ? "text-ink-muted" : "text-ink"
                )}
            >
                {question.label}
            </span>

            <span className="mt-0.5 block text-caption leading-snug text-ink-muted">
                {question.hint}
            </span>
        </span>
    );

    const badge = !question.ready && (
        <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-fine font-bold text-warning-600">
            Yakında
        </span>
    );

    const chevron = !disabled && (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 shrink-0 text-doctor-300"
            aria-hidden="true"
        >
            <path d="M9 5l7 7-7 7" />
        </svg>
    );

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect?.(question)}
            className={cn(
                "w-full rounded-lg border-2 text-left transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring focus-visible:ring-doctor-300 focus-visible:ring-offset-2",
                row
                    ? "flex min-h-tap items-center gap-3.5 px-4 py-3"
                    : "flex min-h-[124px] flex-col items-start gap-2 p-4",
                disabled
                    ? "cursor-not-allowed border-line bg-surface-subtle"
                    : "border-doctor-100 bg-white shadow-card hover:border-doctor-500 hover:bg-doctor-50 active:scale-[0.99]",
                className
            )}
        >
            {icon}
            {row ? (
                <>
                    {text}
                    {badge}
                    {chevron}
                </>
            ) : (
                <span className="mt-auto block w-full">
                    {text}
                    {badge && <span className="mt-2 block">{badge}</span>}
                </span>
            )}
        </button>
    );
}
