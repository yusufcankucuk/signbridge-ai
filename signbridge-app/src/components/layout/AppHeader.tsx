import Link from "next/link";

import Logo from "./Logo";
import RoleBadge, { type Role } from "../ui/RoleBadge";
import StepIndicator from "../ui/StepIndicator";

interface AppHeaderProps {
    /** Cihazın o an kimde olduğunu gösterir. ("Hasta"/"Doktor" yazımı da kabul edilir) */
    role?: Role | "Hasta" | "Doktor";
    /** Akış içindeki konum — verilirse başlığın altında ince bir şerit olarak çıkar. */
    step?: { current: number; total: number; label?: string };
}

export default function AppHeader({ role, step }: AppHeaderProps) {
    const normalizedRole = role
        ? (role.toLowerCase() as Role)
        : undefined;

    return (
        <header className="sticky top-0 z-20 shrink-0 border-b border-line bg-white/90 backdrop-blur-md">
            <div className="flex h-14 items-center justify-between px-5">
                <Link
                    href="/"
                    aria-label="SignBridge ana ekran"
                    className="-mx-2 flex min-h-11 items-center rounded-md px-2 py-2"
                >
                    <Logo size={28} withWordmark />
                </Link>

                {normalizedRole && (
                    <RoleBadge role={normalizedRole} size="sm" />
                )}
            </div>

            {step && (
                <div className="border-t border-line px-5 py-2.5">
                    <StepIndicator
                        current={step.current}
                        total={step.total}
                        label={step.label}
                        tone={normalizedRole === "doktor" ? "doctor" : "brand"}
                    />
                </div>
            )}
        </header>
    );
}
