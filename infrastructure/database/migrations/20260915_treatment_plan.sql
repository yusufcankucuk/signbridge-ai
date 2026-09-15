BEGIN;

ALTER TABLE interaction_events
    DROP CONSTRAINT IF EXISTS interaction_events_type_check;

ALTER TABLE interaction_events
    ADD CONSTRAINT interaction_events_type_check CHECK (
        type IN (
            'prediction', 'confirmation', 'doctor_question', 'patient_answer',
            'question_cancelled', 'doctor_response', 'treatment_plan'
        )
    );

COMMIT;
