BEGIN;

ALTER TABLE consultation_sessions
    DROP CONSTRAINT IF EXISTS consultation_sessions_state_check;
ALTER TABLE consultation_sessions
    ADD CONSTRAINT consultation_sessions_state_check CHECK (
        state IN (
            'patient_capture', 'patient_confirmation', 'doctor_review',
            'patient_question', 'patient_answer', 'patient_answer_confirmation',
            'patient_response',
            'doctor_response', 'patient_review', 'ended'
        )
    );

ALTER TABLE interaction_events
    DROP CONSTRAINT IF EXISTS interaction_events_type_check;
ALTER TABLE interaction_events
    ADD CONSTRAINT interaction_events_type_check CHECK (
        type IN ('prediction', 'confirmation', 'doctor_question', 'patient_answer', 'question_cancelled', 'doctor_response')
    );

COMMIT;
