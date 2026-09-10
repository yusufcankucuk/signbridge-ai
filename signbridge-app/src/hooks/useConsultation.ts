"use client";

import { useConsultationContext } from "../components/providers/ConsultationProvider";

export function useConsultation() {
    return useConsultationContext();
}