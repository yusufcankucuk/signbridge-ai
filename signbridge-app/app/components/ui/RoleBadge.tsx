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
        icon: (
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v4m-2-2h4M6.75 8.25h10.5v4.5a5.25 5.25 0 11-10.5 0v-4.5z"
            />
        ),
    },
} as const;

const sizes = {
    sm: "gap-1.5 px-2.5 py-1 text-caption [&_svg]:h-4 [&_svg]:w-4",
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
                "inline-flex items-center rounded-full border-2 font-bold",
                item.classes,
                sizes[size],
                className
            )}
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
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
