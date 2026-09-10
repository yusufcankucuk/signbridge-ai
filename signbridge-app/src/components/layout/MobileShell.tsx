import type { ReactNode } from "react";

interface MobileShellProps {
    children: ReactNode;
}

/**
 * Tek cihazlı akışın taşıyıcı kabuğu.
 *
 * Kabuk her zaman pencereye sığar ve kaydırma yapılmaz: yükseklik `100dvh`
 * (mobil tarayıcı çubuklarını hesaba katar), masaüstünde en fazla 844px'lik
 * cihaz çerçevesi ama pencere kısaysa pencereye göre küçülür.
 *
 * İçerik bu yüzden `h-full` ve `min-h-0` ile yerleşir; sayfalar `min-h-screen`
 * kullanmaz. Bir ekranın içeriği sığmıyorsa çözüm kaydırma değil, içeriği
 * sıkıştırmaktır.
 */
export default function MobileShell({ children }: MobileShellProps) {
    return (
        <div className="contents">
            <a href="#icerik" className="skip-link">
                İçeriğe geç
            </a>

            <div className="sb-shell-viewport flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-surface-canvas p-0 sm:p-6">
                <div
                    id="icerik"
                    tabIndex={-1}
                    className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-white sm:h-[min(844px,100%)] sm:max-w-shell sm:rounded-2xl sm:border sm:border-line sm:shadow-raised"
                >
                    {children}
                </div>
            </div>
        </div>
    );
}
