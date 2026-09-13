import type { ReactNode } from "react";

import { cn } from "../../../lib/utils";

export type CardTone = "neutral" | "brand" | "doctor" | "success" | "warning" | "danger";

interface CardProps {
    children?: ReactNode;
    /** Kart başlığı — verilirse h3 olarak render edilir. */
    title?: ReactNode;
    /** Başlık altındaki açıklama. */
    description?: ReactNode;
    /** Başlığın solundaki ikon. */
    icon?: ReactNode;
    /** Kartın altındaki eylem alanı. */
    footer?: ReactNode;
    tone?: CardTone;
    /** Tıklanabilir kart (seçim listeleri) — hover/odak durumları açılır. */
    interactive?: boolean;
    /** Seçili durum: renkle birlikte kalın kenar ve onay ikonu ile gösterilir. */
    selected?: boolean;
    padding?: "sm" | "md" | "lg";
    className?: string;
}

const tones: Record<CardTone, string> = {
    neutral: "border-line bg-white",
    brand: "border-brand-100 bg-brand-50",
    doctor: "border-doctor-100 bg-doctor-50",
    success: "border-success-100 bg-success-50",
    warning: "border-warning-100 bg-warning-50",
    danger: "border-danger-100 bg-danger-50",
};

const paddings = {
    sm: "p-4",
    md: "p-5",
    lg: "p-6",
};

export default function Card({
    children,
    title,
    description,
    icon,
    footer,
    tone = "neutral",
    interactive = false,
    selected = false,
    padding = "md",
    className,
}: CardProps) {
    return (
        <div
            className={cn(
                "rounded-lg border shadow-card transition-all duration-200",
                tones[tone],
                paddings[padding],
                interactive &&
                    "cursor-pointer hover:border-brand-300 hover:bg-brand-50",
                selected && "border-brand-500 bg-brand-50 shadow-brand",
                className
            )}
        >
            {(title || icon) && (
                <div className="mb-1.5 flex items-start gap-3">
                    {icon && (
                        <span
                            className="mt-0.5 shrink-0 text-brand-600 [&_svg]:h-6 [&_svg]:w-6"
                            aria-hidden="true"
                        >
                            {icon}
                        </span>
                    )}

                    <div className="min-w-0 flex-1">
                        {title && (
                            <h3 className="text-h3 text-ink">{title}</h3>
                        )}

                        {description && (
                            <p className="mt-1 text-caption text-ink-muted">
                                {description}
                            </p>
                        )}
                    </div>

                    {selected && (
                        <span
                            className="shrink-0 text-brand-600"
                            aria-hidden="true"
                        >
                            <svg
                                className="h-6 w-6"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                        </span>
                    )}
                </div>
            )}

            {!title && description && (
                <p className="text-caption text-ink-muted">{description}</p>
            )}

            {children && (
                <div className={cn(Boolean(title) && "mt-3", "text-base text-ink-body")}>
                    {children}
                </div>
            )}

            {footer && (
                <div className="mt-4 border-t border-line pt-4">{footer}</div>
            )}
        </div>
    );
}
