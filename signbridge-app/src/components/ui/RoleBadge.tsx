import { cn } from "../../../lib/utils";

export type Role = "hasta" | "doktor";

interface RoleBadgeProps {
    role: Role;
    size?: "sm" | "md" | "lg";
    className?: string;
}

/**
 * Cihazın o an kimde olduğunu gösterir.
 * Renk tek başına ayırt edici değildir: ikon + metin her zaman birlikte gösterilir.
 */
const config = {
    hasta: {
        label: "Hasta",
        classes: "bg-brand-50 text-brand-700 border-brand-200",
        icon: (
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 1115 0"
            />
        ),
    },
    doktor: {
        label: "Doktor",
        classes: "bg-doctor-50 text-doctor-600 border-doctor-200",
        // Tedavi özetindeki stetoskopun küçük hâli (PlanVisuals > DiagnosisVisual).
        icon: (
            <g strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.5 3.5v5a4.5 4.5 0 0 0 9 0v-5" />
                <path d="M5.5 3.5h4M14.5 3.5h4" />
                <path d="M12 13v2.5a4 4 0 0 0 4 4h.5" />
                <circle cx="18.5" cy="19.5" r="2" />
            </g>
        ),
    },
} as const;

const sizes = {
    sm: "gap-1.5 px-3 py-1.5 text-caption [&_svg]:h-4 [&_svg]:w-4",
    md: "gap-2 px-3 py-1.5 text-label [&_svg]:h-5 [&_svg]:w-5",
    lg: "gap-2.5 px-4 py-2 text-base [&_svg]:h-6 [&_svg]:w-6",
};

export default function RoleBadge({
    role,
    size = "md",
    className,
}: RoleBadgeProps) {
    const item = config[role];

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border font-medium",
                item.classes,
                sizes[size],
                className
            )}
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden="true"
                className="shrink-0"
            >
                {item.icon}
            </svg>

            <span>
                <span className="sr-only">Cihaz şu anda: </span>
                {item.label}
            </span>
        </span>
    );
}
