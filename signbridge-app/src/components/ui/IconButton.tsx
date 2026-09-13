import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../../lib/utils";

export type IconButtonVariant =
    | "solid"
    | "soft"
    | "outline"
    | "ghost"
    | "danger";

export type IconButtonSize = "md" | "lg" | "xl";

interface BaseProps {
    /** Zorunlu: ikon butonun görünür metni olmadığı için erişilebilir ad. */
    label: string;
    children: ReactNode;
    variant?: IconButtonVariant;
    size?: IconButtonSize;
    className?: string;
}

interface AsButton
    extends BaseProps,
        Omit<
            ButtonHTMLAttributes<HTMLButtonElement>,
            keyof BaseProps
        > {
    href?: undefined;
}

interface AsLink extends BaseProps {
    href: string;
    onClick?: () => void;
}

type IconButtonProps = AsButton | AsLink;

const base =
    "inline-flex shrink-0 items-center justify-center rounded-full " +
    "transition-all duration-200 active:scale-[0.96] " +
    "focus-visible:outline-none focus-visible:ring focus-visible:ring-brand-300 focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50";

const variants: Record<IconButtonVariant, string> = {
    solid: "bg-brand-500 text-white shadow-brand hover:bg-brand-600",
    soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
    outline:
        "border border-line-strong bg-white text-ink-body shadow-card hover:border-brand-300 hover:text-brand-700",
    ghost: "bg-transparent text-ink-muted hover:bg-surface-subtle hover:text-ink",
    danger:
        "bg-danger-500 text-white hover:bg-danger-600 focus-visible:ring-danger-100",
};

/* Görsel kutu küçük görünse de dokunma alanı 56px'in altına inmez. */
const sizes: Record<IconButtonSize, string> = {
    md: "h-tap w-tap [&_svg]:h-6 [&_svg]:w-6",
    lg: "h-tap-lg w-tap-lg [&_svg]:h-7 [&_svg]:w-7",
    xl: "h-tap-xl w-tap-xl [&_svg]:h-8 [&_svg]:w-8",
};

export default function IconButton(props: IconButtonProps) {
    const {
        label,
        children,
        variant = "soft",
        size = "md",
        className,
    } = props;

    const classes = cn(base, variants[variant], sizes[size], className);

    if (props.href !== undefined) {
        return (
            <Link
                href={props.href}
                onClick={props.onClick}
                aria-label={label}
                title={label}
                className={classes}
            >
                <span aria-hidden="true">{children}</span>
            </Link>
        );
    }

    const {
        href: _href,
        label: _label,
        children: _children,
        variant: _variant,
        size: _size,
        className: _className,
        ...rest
    } = props as AsButton;

    return (
        <button
            type={rest.type ?? "button"}
            {...rest}
            aria-label={label}
            title={label}
            className={classes}
        >
            <span aria-hidden="true">{children}</span>
        </button>
    );
}
