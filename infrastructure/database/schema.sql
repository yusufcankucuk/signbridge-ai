-- SignBridge AI - Database Schema (GaussDB / PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    sign_input TEXT,
    text_output TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS consultation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state TEXT NOT NULL CHECK (
        state IN (
            'patient_capture', 'patient_confirmation', 'doctor_review',
            'doctor_response', 'patient_review', 'ended'
        )
    ),
    model_version TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS consultation_sessions_expires_at_idx
    ON consultation_sessions (expires_at);

CREATE TABLE IF NOT EXISTS interaction_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('prediction', 'confirmation', 'doctor_response')),
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS interaction_events_session_id_idx
    ON interaction_events (session_id, created_at);

ALTER TABLE consultation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON consultation_sessions, interaction_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION advance_consultation(
    p_session_id UUID,
    p_expected_state TEXT,
    p_next_state TEXT,
    p_event_type TEXT DEFAULT NULL,
    p_event_payload JSONB DEFAULT NULL,
    p_delete_events BOOLEAN DEFAULT FALSE
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    changed INTEGER;
BEGIN
    UPDATE consultation_sessions
       SET state = p_next_state
     WHERE id = p_session_id
       AND state = p_expected_state
       AND expires_at > CURRENT_TIMESTAMP;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        RETURN FALSE;
    END IF;

    IF p_event_type IS NOT NULL THEN
        INSERT INTO interaction_events (session_id, type, payload)
        VALUES (p_session_id, p_event_type, COALESCE(p_event_payload, '{}'::JSONB));
    END IF;

    IF p_delete_events THEN
        DELETE FROM interaction_events WHERE session_id = p_session_id;
    END IF;

    IF p_next_state = 'ended' THEN
        DELETE FROM consultation_sessions WHERE id = p_session_id;
    END IF;
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION advance_consultation(UUID, TEXT, TEXT, TEXT, JSONB, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION advance_consultation(UUID, TEXT, TEXT, TEXT, JSONB, BOOLEAN)
    TO service_role;

-- Teknik gözlemlenebilirlik kaydıdır. Bilerek session_id, payload,
-- sağlık metni, landmark, kamera veya ses alanı içermez.
CREATE TABLE IF NOT EXISTS technical_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (
        type IN (
            'mock_ai_prediction_succeeded',
            'mock_ai_prediction_failed',
            'mock_stt_succeeded',
            'mock_stt_failed'
        )
    ),
    latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0 AND latency_ms <= 600000),
    error_code TEXT CHECK (
        error_code IS NULL OR error_code IN ('PERSISTENCE_ERROR', 'PROVIDER_ERROR')
    ),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS technical_events_created_at_idx
    ON technical_events (created_at DESC);

ALTER TABLE technical_events ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON technical_events TO anon, authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'technical_events'
          AND policyname = 'Allow safe technical event inserts'
    ) THEN
        CREATE POLICY "Allow safe technical event inserts"
            ON technical_events
            FOR INSERT
            TO anon, authenticated
            WITH CHECK (
                type IN (
                    'mock_ai_prediction_succeeded',
                    'mock_ai_prediction_failed',
                    'mock_stt_succeeded',
                    'mock_stt_failed'
                )
                AND latency_ms >= 0
                AND latency_ms <= 600000
                AND (
                    error_code IS NULL
                    OR error_code IN ('PERSISTENCE_ERROR', 'PROVIDER_ERROR')
                )
            );
    END IF;
END
$$;
