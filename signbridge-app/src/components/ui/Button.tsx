import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../../lib/utils";

export type ButtonVariant =
    | "primary"
    | "doctor"
    | "secondary"
    | "outline"
    | "ghost"
    | "danger";

export type ButtonSize = "md" | "lg" | "xl";

interface BaseProps {
    children: ReactNode;
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Varsayılan olarak true: mobil akışta butonlar tam genişlikte durur. */
    fullWidth?: boolean;
    /** Metnin solunda gösterilecek ikon (aria-hidden verilmelidir). */
    icon?: ReactNode;
    /** Metnin sağında gösterilecek ikon. */
    iconRight?: ReactNode;
    loading?: boolean;
    className?: string;
}

interface ButtonAsButton
    extends BaseProps,
        Omit<
            ButtonHTMLAttributes<HTMLButtonElement>,
            keyof BaseProps
        > {
    href?: undefined;
}

interface ButtonAsLink extends BaseProps {
    /** Verildiğinde next/link olarak render edilir. */
    href: string;
    "aria-label"?: string;
    onClick?: () => void;
}

type ButtonProps = ButtonAsButton | ButtonAsLink;

const base =
    "inline-flex items-center justify-center gap-2.5 rounded-lg font-bold " +
    "transition-all duration-200 select-none " +
    "active:scale-[0.98] " +
    "focus-visible:outline-none focus-visible:ring focus-visible:ring-brand-300 focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
    /* Hasta akışının birincil eylemi */
    primary:
        "bg-brand-500 text-white shadow-brand hover:bg-brand-600 active:bg-brand-700",

    /* Doktor akışının birincil eylemi */
    doctor:
        "bg-doctor-500 text-white shadow-doctor hover:bg-doctor-600 active:bg-doctor-700 focus-visible:ring-doctor-300",

    /* Yumuşak ikincil eylem — aynı akış rengi, düşük vurgu */
    secondary:
        "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200",

    /* Çerçeveli ikincil eylem */
    outline:
        "border-2 border-line-strong bg-white text-ink-body hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700",

    /* En düşük vurgu — "geri", "atla" gibi eylemler */
    ghost: "bg-transparent text-ink-muted hover:bg-surface-subtle hover:text-ink",

    /* Yıkıcı eylem — "görüşmeyi bitir", "sil" */
    danger:
        "bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-700 focus-visible:ring-danger-100",
};

/* Yükseklikler dokunma alanı minimumlarına bağlıdır. */
const sizes: Record<ButtonSize, string> = {
    md: "min-h-tap px-5 text-label",
    lg: "min-h-tap-lg px-6 text-base",
    xl: "min-h-tap-xl px-7 text-lead",
};

function Spinner() {
    return (
        <svg
            className="h-5 w-5 shrink-0 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="3"
                strokeOpacity="0.3"
            />
            <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
            />
        </svg>
    );
}

export default function Button(props: ButtonProps) {
    const {
        children,
        variant = "primary",
        size = "lg",
        fullWidth = true,
        icon,
        iconRight,
        loading = false,
        className,
    } = props;

    const classes = cn(
        base,
        variants[variant],
        sizes[size],
        fullWidth ? "w-full" : "w-auto",
        className
    );

    const content = (
        <>
            {loading ? <Spinner /> : icon}
            <span className="whitespace-normal break-words py-2 text-center leading-snug">{children}</span>
            {!loading && iconRight}
        </>
    );

    if (props.href !== undefined) {
        const { href, onClick } = props;

        return (
            <Link
                href={href}
                onClick={onClick}
                aria-label={props["aria-label"]}
                className={classes}
            >
                {content}
            </Link>
        );
    }

    const {
        href: _href,
        children: _children,
        variant: _variant,
        size: _size,
        fullWidth: _fullWidth,
        icon: _icon,
        iconRight: _iconRight,
        loading: _loading,
        className: _className,
        ...rest
    } = props as ButtonAsButton;

    return (
        <button
            type={rest.type ?? "button"}
            {...rest}
            disabled={rest.disabled || loading}
            aria-busy={loading || undefined}
            className={classes}
        >
            {content}
        </button>
    );
}
