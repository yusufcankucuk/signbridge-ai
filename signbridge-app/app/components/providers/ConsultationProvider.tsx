"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";

import type {
    ConsultationState,
    TreatmentInfo,
} from "../../../types/consultation";

const initialState: ConsultationState = {
    expression: "",
    symptomDuration: "",
    intensity: null,
    treatment: {
        diagnosis: "",
        medicine: "",
        dose: "",
        frequency: "",
        meal: "",
        duration: "",
    },
};

interface ConsultationContextValue {
    consultation: ConsultationState;
    updateConsultation: (
        updates: Partial<ConsultationState>
    ) => void;
    updateTreatment: (
        updates: Partial<TreatmentInfo>
    ) => void;
    resetConsultation: () => void;
}

const ConsultationContext =
    createContext<ConsultationContextValue | undefined>(
        undefined
    );

interface ConsultationProviderProps {
    children: ReactNode;
}

export function ConsultationProvider({
    children,
}: ConsultationProviderProps) {
    const [consultation, setConsultation] =
        useState<ConsultationState>(initialState);

    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const saved = localStorage.getItem(
                "signbridge-consultation"
            );

            if (saved) {
                try {
                    const parsed = JSON.parse(saved);

                    setConsultation({
                        ...initialState,
                        ...parsed,
                        treatment: {
                            ...initialState.treatment,
                            ...parsed.treatment,
                        },
                    });
                } catch {
                    localStorage.removeItem(
                        "signbridge-consultation"
                    );
                }
            }

            setIsLoaded(true);
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!isLoaded) return;

        localStorage.setItem(
            "signbridge-consultation",
            JSON.stringify(consultation)
        );
    }, [consultation, isLoaded]);

    const updateConsultation = (
        updates: Partial<ConsultationState>
    ) => {
        setConsultation((current) => ({
            ...current,
            ...updates,
        }));
    };

    const updateTreatment = (
        updates: Partial<TreatmentInfo>
    ) => {
        setConsultation((current) => ({
            ...current,
            treatment: {
                ...current.treatment,
                ...updates,
            },
        }));
    };

    const resetConsultation = () => {
        localStorage.removeItem(
            "signbridge-consultation"
        );

        setConsultation(initialState);
    };

    return (
        <ConsultationContext.Provider
            value={{
                consultation,
                updateConsultation,
                updateTreatment,
                resetConsultation,
            }}
        >
            {children}
        </ConsultationContext.Provider>
    );
}

export function useConsultationContext() {
    const context = useContext(ConsultationContext);

    if (!context) {
        throw new Error(
            "useConsultation must be used inside ConsultationProvider"
        );
    }

    return context;
}
