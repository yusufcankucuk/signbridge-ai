export interface TreatmentInfo {
    diagnosis: string;
    medicine: string;
    dose: string;
    frequency: string;
    meal: string;
    duration: string;
}

export interface ConsultationState {
    expression: string;
    symptomDuration: string;
    intensity: number | null;
    treatment: TreatmentInfo;
}