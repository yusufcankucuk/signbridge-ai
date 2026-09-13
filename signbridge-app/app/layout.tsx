import "./globals.css";
import "./compact.css";
import type { Metadata } from "next";
import { FlowProvider } from "../src/components/providers/FlowProvider";
import { Suspense } from "react";

export const metadata: Metadata = {
    title: "SignBridge",
    description: "Sağlıkta engelsiz iletişim",
    applicationName: "SignBridge",
    manifest: "/manifest.webmanifest",
    icons: {
        icon: "/logo/signbridge-logo.png",
        apple: "/logo/signbridge-logo.png",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="tr">
            <body>
                <Suspense fallback={null}>
                    <FlowProvider>{children}</FlowProvider>
                </Suspense>
            </body>
        </html>
    );
}
