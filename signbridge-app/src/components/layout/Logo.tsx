import Image from "next/image";

import { cn } from "../../../lib/utils";

interface LogoProps {
    /** İşaretin (logo görselinin) kenar uzunluğu, px. */
    size?: number;
    /**
     * `color` — açık zeminler için renkli logo.
     * `white` — teal/gradyan zeminler için beyaz silüet.
     */
    variant?: "color" | "white";
    /** Yanında/altında "SignBridge" yazsın mı? */
    withWordmark?: boolean;
    /** `row` — işaret solda, yazı sağda. `column` — işaret üstte, yazı altta. */
    layout?: "row" | "column";
    /** Kelime markasının punto sınıfı. */
    wordmarkClassName?: string;
    /** İşaret yumuşak marka zemini üzerinde gösterilsin mi? */
    plate?: boolean;
    className?: string;
}

/**
 * SignBridge markası.
 *
 * Kelime markası iki tonlu: "Sign" koyu teal, "Bridge" logodaki açık teal.
 * Renk sadece büyük ve kalın puntoda kullanılır (bkz. `brand-accent` notu).
 *
 * Erişilebilirlik: görsel dekoratiftir (`alt=""`), marka adı gerçek metin
 * olarak basılır; sadece işaret gösterildiğinde görünmez etiket eklenir.
 */
export default function Logo({
    size = 40,
    variant = "color",
    withWordmark = false,
    layout = "row",
    wordmarkClassName,
    plate = false,
    className,
}: LogoProps) {
    const white = variant === "white";

    return (
        <span
            className={cn(
                "inline-flex items-center",
                layout === "column"
                    ? "flex-col gap-4"
                    : "flex-row gap-2.5",
                className
            )}
        >
            <span
                className={cn(
                    "inline-flex shrink-0 items-center justify-center",
                    plate && "rounded-2xl bg-brand-gradient-soft p-3"
                )}
            >
                <Image
                    src={
                        white
                            ? "/logo/signbridge-logo-white.png"
                            : "/logo/signbridge-logo.png"
                    }
                    alt=""
                    width={size}
                    height={size}
                    priority
                    style={{ width: size, height: size }}
                />
            </span>

            {withWordmark ? (
                <span
                    className={cn(
                        "font-extrabold tracking-tight",
                        wordmarkClassName ?? "text-h3"
                    )}
                >
                    <span className={white ? "text-white" : "text-brand-500"}>
                        Sign
                    </span>
                    <span
                        className={white ? "text-mint-300" : "text-brand-accent"}
                    >
                        Bridge
                    </span>
                </span>
            ) : (
                <span className="sr-only">SignBridge</span>
            )}
        </span>
    );
}
