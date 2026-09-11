/**
 * Koşullu class birleştirici (harici bağımlılık gerektirmez).
 *
 * cn("p-4", isActive && "bg-brand-500", undefined) -> "p-4 bg-brand-500"
 */
export function cn(
    ...values: Array<string | false | null | undefined>
): string {
    return values.filter(Boolean).join(" ");
}
