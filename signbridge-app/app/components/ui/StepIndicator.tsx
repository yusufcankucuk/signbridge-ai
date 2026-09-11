import { cn } from "../../../lib/utils";

interface StepIndicatorProps {
    /** Kaçıncı adım (1'den başlar). */
    current: number;
    /** Toplam adım sayısı. */
    total: number;
    /** Adımın adı — ekranda ve ekran okuyucuda okunur. */
    label?: string;
    tone?: "brand" | "doctor";
    className?: string;
}

/**
 * Akış içinde nerede olunduğunu gösterir.
 * Erişilebilirlik: noktalar dekoratiftir; ilerleme metni ("2 / 5") her zaman yazılır.
 */
export default function StepIndicator({
    current,
    total,
    label,
    tone = "brand",
    className,
}: StepIndicatorProps) {
    const activeDot = tone === "brand" ? "bg-brand-500" : "bg-doctor-500";
    const activeText = tone === "brand" ? "text-brand-700" : "text-doctor-600";

    return (
        <div
            className={cn("flex items-center gap-3", className)}
            role="group"
            aria-label={
                label
                    ? `Adım ${current} / ${total}: ${label}`
                    : `Adım ${current} / ${total}`
            }
        >
            <div className="flex items-center gap-1.5" aria-hidden="true">
                {Array.from({ length: total }, (_, index) => {
                    const step = index + 1;
                    const done = step < current;
                    const active = step === current;

                    return (
                        <span
                            key={step}
                            className={cn(
                                "h-2.5 rounded-full transition-all duration-200",
                                active
                                    ? cn("w-7", activeDot)
                                    : done
                                      ? "w-2.5 bg-brand-300"
                                      : "w-2.5 bg-line-strong"
                            )}
                        />
                    );
                })}
            </div>

            <span className={cn("text-caption font-bold", activeText)}>
                {current} / {total}
                {label && (
                    <span className="ml-1.5 font-normal text-ink-muted">
                        · {label}
                    </span>
                )}
            </span>
        </div>
    );
}
