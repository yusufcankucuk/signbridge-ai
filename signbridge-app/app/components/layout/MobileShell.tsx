import type { ReactNode } from "react";

interface MobileShellProps {
    children: ReactNode;
}

/**
 * Tek cihazlı akışın taşıyıcı kabuğu.
 * Mobilde tam ekran, masaüstünde ortada 416px'lik cihaz görünümü.
 */
export default function MobileShell({ children }: MobileShellProps) {
    return (
        <>
            <a href="#icerik" className="skip-link">
                İçeriğe geç
            </a>

            <div className="flex min-h-screen w-full items-center justify-center bg-surface-canvas p-0 sm:p-6">
                <main
                    id="icerik"
                    className="flex min-h-screen w-full flex-col bg-white sm:min-h-shell sm:max-w-shell sm:rounded-2xl sm:border sm:border-line sm:shadow-raised"
                >
                    {children}
                </main>
            </div>
        </>
    );
}
