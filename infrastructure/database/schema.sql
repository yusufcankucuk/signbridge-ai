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
