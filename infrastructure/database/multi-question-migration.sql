-- Mevcut SignBridge Supabase kurulumlarında çoklu doktor soru-cevap turunu etkinleştirir.
-- Hem enum kullanan eski kurulumları hem de CHECK constraint kullanan yeni şemayı destekler.

DO $migration$
DECLARE
    column_kind "char";
    type_schema TEXT;
    type_name TEXT;
BEGIN
    SELECT pg_type.typtype, pg_namespace.nspname, pg_type.typname
      INTO column_kind, type_schema, type_name
      FROM pg_attribute
      JOIN pg_class ON pg_class.oid = pg_attribute.attrelid
      JOIN pg_namespace AS table_namespace ON table_namespace.oid = pg_class.relnamespace
      JOIN pg_type ON pg_type.oid = pg_attribute.atttypid
      JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
     WHERE table_namespace.nspname = 'public'
       AND pg_class.relname = 'consultation_sessions'
       AND pg_attribute.attname = 'state'
       AND pg_attribute.attnum > 0
       AND NOT pg_attribute.attisdropped;

    IF column_kind = 'e' THEN
        EXECUTE format(
            'ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L',
            type_schema,
            type_name,
            'patient_response'
        );
    ELSE
        ALTER TABLE public.consultation_sessions
            DROP CONSTRAINT IF EXISTS consultation_sessions_state_check;
        ALTER TABLE public.consultation_sessions
            ADD CONSTRAINT consultation_sessions_state_check CHECK (
                state IN (
                    'patient_capture', 'patient_confirmation', 'doctor_review', 'patient_response',
                    'doctor_response', 'patient_review', 'ended'
                )
            );
    END IF;
END
$migration$;

DO $migration$
DECLARE
    column_kind "char";
    type_schema TEXT;
    type_name TEXT;
BEGIN
    SELECT pg_type.typtype, pg_namespace.nspname, pg_type.typname
      INTO column_kind, type_schema, type_name
      FROM pg_attribute
      JOIN pg_class ON pg_class.oid = pg_attribute.attrelid
      JOIN pg_namespace AS table_namespace ON table_namespace.oid = pg_class.relnamespace
      JOIN pg_type ON pg_type.oid = pg_attribute.atttypid
      JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
     WHERE table_namespace.nspname = 'public'
       AND pg_class.relname = 'interaction_events'
       AND pg_attribute.attname = 'type'
       AND pg_attribute.attnum > 0
       AND NOT pg_attribute.attisdropped;

    IF column_kind = 'e' THEN
        EXECUTE format(
            'ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L',
            type_schema,
            type_name,
            'doctor_question'
        );
        EXECUTE format(
            'ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L',
            type_schema,
            type_name,
            'patient_answer'
        );
    ELSE
        ALTER TABLE public.interaction_events
            DROP CONSTRAINT IF EXISTS interaction_events_type_check;
        ALTER TABLE public.interaction_events
            ADD CONSTRAINT interaction_events_type_check CHECK (
                type IN ('prediction', 'confirmation', 'doctor_question', 'patient_answer', 'doctor_response')
            );
    END IF;
END
$migration$;
