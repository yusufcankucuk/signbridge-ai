"use client";

import { useEffect, useState } from "react";

import Button from "../ui/Button";
import RoleBadge, { type Role } from "../ui/RoleBadge";

interface HandoffScreenProps {
    /** Cihaz kime veriliyor? */
    to: Role;
    /** Karşı tarafa ne söyleneceği — kısa ve emir kipinde. */
    instruction?: string;
    /** Devam butonuna basılınca ne olacak. */
    onContinue: () => void;
    /** Butonun metni. */
    continueLabel?: string;
    /**
     * Saniye cinsinden geri sayım. Verilirse süre dolunca `onContinue`
     * kendiliğinden çalışır; 0 veya verilmezse sadece butonla geçilir.
     */
    autoSeconds?: number;
}

const COPY: Record<Role, { title: string; instruction: string }> = {
    doktor: {
        title: "Cihazı doktora verin",
        instruction:
            "Anlattıklarınız hazır. Tableti karşınızdaki sağlık çalışanına uzatın.",
    },
    hasta: {
        title: "Cihazı hastaya verin",
        instruction: "Yanıtınız kaydedildi. Tableti hastaya geri uzatın.",
    },
};

/**
 * Cihaz devri ekranı. Tek cihazlı akışın en kritik anı: iki kişi arasında
 * sıranın değiştiğini hem renkle hem büyük metinle anlatır.
 *
 * Erişilebilirlik: geçiş `aria-live="assertive"` ile duyurulur, geri sayım
 * hem sayı hem metin olarak verilir, `prefers-reduced-motion` altında nabız
 * animasyonu durur (globals.css tüm animasyonları kapatıyor).
 */
export default function HandoffScreen({
    to,
    instruction,
    onContinue,
    continueLabel = "Devam et",
    autoSeconds = 0,
}: HandoffScreenProps) {
    const copy = COPY[to];
    const [left, setLeft] = useState(autoSeconds);

    useEffect(() => {
        if (autoSeconds <= 0) return;

        setLeft(autoSeconds);

        const timer = setInterval(() => {
            setLeft((value) => {
                if (value <= 1) {
                    clearInterval(timer);
                    onContinue();
                    return 0;
                }

                return value - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
        // onContinue her render'da değişebileceği için bağımlılığa alınmıyor.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoSeconds]);

    return (
        <div className="flex min-h-screen flex-col bg-brand-gradient px-6 py-10 sm:min-h-shell">
            <div
                className="my-auto flex flex-col items-center text-center"
                aria-live="assertive"
            >
                {/* Devir ikonu */}
                <span
                    className="mb-7 flex h-24 w-24 items-center justify-center rounded-2xl bg-white/15 text-white ring-4 ring-white/25"
                    aria-hidden="true"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-12 w-12"
                    >
                        <path d="M4 9h13l-3-3M20 15H7l3 3" />
                    </svg>
                </span>

                <h1 className="text-h1 leading-tight text-white">
                    {copy.title}
                </h1>

                <p className="mt-3 max-w-[30ch] text-lead text-white/90">
                    {instruction ?? copy.instruction}
                </p>

                <span className="mt-7 rounded-full bg-white px-1 py-1">
                    <RoleBadge role={to} size="lg" className="border-0" />
                </span>

                {autoSeconds > 0 && (
                    <p className="mt-6 text-base text-white/85">
                        <span className="font-bold tabular-nums">{left}</span>{" "}
                        saniye içinde kendiliğinden geçecek
                    </p>
                )}
            </div>

            <Button
                variant="secondary"
                size="xl"
                onClick={onContinue}
                className="bg-white text-brand-700 shadow-raised hover:bg-brand-50 focus-visible:ring-white"
                iconRight={
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        aria-hidden="true"
                        className="h-6 w-6"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 5l7 7-7 7"
                        />
                    </svg>
                }
            >
                {continueLabel}
            </Button>
        </div>
    );
}
