import Image from "next/image";

import { cn } from "../../../lib/utils";

interface LogoProps {
    /** Kutu kenar uzunluğu (px). */
    size?: number;
    /** Yanında "SignBridge" yazsın mı? */
    withWordmark?: boolean;
    /** Logo yumuşak marka zemini üzerinde gösterilsin mi? */
    plate?: boolean;
    className?: string;
}

/**
 * SignBridge markası. Logo dekoratiftir (alt=""), marka adı metin olarak verilir;
 * sadece işaret kullanıldığında görünmez etiket eklenir.
 */
export default function Logo({
    size = 40,
    withWordmark = false,
    plate = false,
    className,
}: LogoProps) {
    return (
        <span className={cn("inline-flex items-center gap-2.5", className)}>
            <span
                className={cn(
                    "inline-flex shrink-0 items-center justify-center overflow-hidden",
                    plate && "rounded-xl bg-brand-gradient-soft p-1.5"
                )}
            >
                <Image
                    src="/logo/signbridge-logo.png"
                    alt=""
                    width={size}
                    height={size}
                    priority
                    style={{ width: size, height: size }}
                />
            </span>

            {withWordmark ? (
                <span className="text-h3 tracking-tight text-ink">
                    SignBridge
                </span>
            ) : (
                <span className="sr-only">SignBridge</span>
            )}
        </span>
    );
}
