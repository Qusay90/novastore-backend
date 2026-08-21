BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS seller_application_terms_authority (
    authority_key SMALLINT NOT NULL DEFAULT 1,
    active_revision VARCHAR(120) NOT NULL,
    generation BIGINT NOT NULL,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_application_terms_authority PRIMARY KEY (authority_key),
    CONSTRAINT chk_seller_application_terms_authority_singleton CHECK (authority_key = 1),
    CONSTRAINT chk_seller_application_terms_authority_revision CHECK (
        LENGTH(BTRIM(active_revision)) BETWEEN 1 AND 120
        AND active_revision !~ '[[:cntrl:]]'
    ),
    CONSTRAINT chk_seller_application_terms_authority_generation CHECK (generation >= 1)
);

CREATE TABLE IF NOT EXISTS seller_application_terms_authority_events (
    id BIGSERIAL NOT NULL,
    generation BIGINT NOT NULL,
    active_revision VARCHAR(120) NOT NULL,
    previous_generation BIGINT,
    previous_revision VARCHAR(120),
    activated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_application_terms_authority_events PRIMARY KEY (id),
    CONSTRAINT uq_seller_application_terms_authority_events_generation UNIQUE (generation),
    CONSTRAINT chk_seller_application_terms_authority_event_revision CHECK (
        LENGTH(BTRIM(active_revision)) BETWEEN 1 AND 120
        AND active_revision !~ '[[:cntrl:]]'
    ),
    CONSTRAINT chk_seller_application_terms_authority_event_generation CHECK (generation >= 1),
    CONSTRAINT chk_seller_application_terms_authority_event_previous CHECK (
        (previous_generation IS NULL AND previous_revision IS NULL)
        OR (previous_generation IS NOT NULL AND previous_generation >= 1 AND previous_revision IS NOT NULL)
    )
);

CREATE OR REPLACE FUNCTION seller_application_terms_authority_event_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'SELLER_APPLICATION_TERMS_AUTHORITY_EVENT_APPEND_ONLY' USING ERRCODE = '55000';
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_seller_application_terms_authority_events_append_only'
          AND tgrelid = 'seller_application_terms_authority_events'::regclass
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_seller_application_terms_authority_events_append_only BEFORE UPDATE OR DELETE ON seller_application_terms_authority_events FOR EACH ROW EXECUTE FUNCTION seller_application_terms_authority_event_append_only()';
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_seller_application_terms_authority_events_no_truncate'
          AND tgrelid = 'seller_application_terms_authority_events'::regclass
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_seller_application_terms_authority_events_no_truncate BEFORE TRUNCATE ON seller_application_terms_authority_events FOR EACH STATEMENT EXECUTE FUNCTION seller_application_terms_authority_event_append_only()';
    END IF;
END;
$$;

COMMIT;
