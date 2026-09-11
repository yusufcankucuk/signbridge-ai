import "./globals.css";
import "./compact.css";
import type { Metadata } from "next";
import { FlowProvider } from "../src/components/providers/FlowProvider";
import { Suspense } from "react";

export const metadata: Metadata = {
    title: "SignBridge",
    description: "Sağlıkta engelsiz iletişim",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="tr">
            <body>
                <FlowProvider>
                    <Suspense fallback={null}>{children}</Suspense>
                </FlowProvider>
            </body>
        </html>
    );
}
