"use client";

import { useEffect, useState } from "react";

/**
 * Hastanın tedaviden sonra sorduğu soru ve doktorun yanıtı.
 *
 * Bu, görüşmenin ana verisinden (`useConsultation`) ayrı tutulur: geçici bir
 * soru-cevap turudur ve `types/consultation.ts` sözleşmesine dokunmaz.
 * Ekranlar arasında `localStorage` üzerinden taşınır — hasta verisi adres
 * çubuğuna yazılmaz.
 */
const KEY = "signbridge-followup";

export interface Followup {
    /** Hastanın seçtiği soru kimliği (`PATIENT_FOLLOWUP_*`). */
    questionId: string | null;
    /** Doktorun yazdığı yanıt. */
    answer: string;
}

const empty: Followup = { questionId: null, answer: "" };

function read(): Followup {
    if (typeof window === "undefined") return empty;

    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return empty;

        const parsed = JSON.parse(raw) as Partial<Followup>;

        return {
            questionId: parsed.questionId ?? null,
            answer: parsed.answer ?? "",
        };
    } catch {
        return empty;
    }
}

function write(value: Followup) {
    try {
        window.localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
        /* Tarayıcı depolamayı engelliyorsa akış yine çalışır, sadece
           yanıt bir sonraki ekrana taşınmaz. */
    }
}

export function useFollowup() {
    const [followup, setFollowup] = useState<Followup>(empty);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setFollowup(read());
            setIsLoaded(true);
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    const askQuestion = (questionId: string) => {
        const next: Followup = { questionId, answer: "" };
        setFollowup(next);
        write(next);
    };

    const answerQuestion = (answer: string) => {
        const next: Followup = { ...followup, answer };
        setFollowup(next);
        write(next);
    };

    const clearFollowup = () => {
        setFollowup(empty);

        try {
            window.localStorage.removeItem(KEY);
        } catch {
            /* yoksay */
        }
    };

    return {
        followup,
        isLoaded,
        askQuestion,
        answerQuestion,
        clearFollowup,
    };
}
