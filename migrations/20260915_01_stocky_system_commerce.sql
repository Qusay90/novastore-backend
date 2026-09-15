BEGIN;

CREATE TABLE IF NOT EXISTS stocky_connector_connections (
    id UUID NOT NULL,
    organization_id BIGINT NOT NULL REFERENCES seller_organizations(id) ON DELETE RESTRICT,
    store_id BIGINT NOT NULL,
    remote_store_id VARCHAR(191) NOT NULL,
    endpoint_origin VARCHAR(512) NOT NULL,
    key_id VARCHAR(64) NOT NULL,
    secret_ref VARCHAR(128) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disabled_at TIMESTAMPTZ,
    CONSTRAINT pk_stocky_connector_connections PRIMARY KEY (id),
    CONSTRAINT uq_stocky_connector_connections_scope UNIQUE (id, organization_id, store_id),
    CONSTRAINT fk_stocky_connector_connections_store
        FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_stocky_connector_connections_status
        CHECK (status IN ('active', 'disabled')),
    CONSTRAINT chk_stocky_connector_connections_revision CHECK (revision >= 1),
    CONSTRAINT chk_stocky_connector_connections_remote_store
        CHECK (remote_store_id = BTRIM(remote_store_id) AND LENGTH(remote_store_id) BETWEEN 1 AND 191),
    CONSTRAINT chk_stocky_connector_connections_endpoint
        CHECK (endpoint_origin = BTRIM(endpoint_origin) AND LENGTH(endpoint_origin) BETWEEN 1 AND 512),
    CONSTRAINT chk_stocky_connector_connections_key_id
        CHECK (key_id ~ '^[A-Za-z0-9._-]{1,64}$'),
    CONSTRAINT chk_stocky_connector_connections_secret_ref
        CHECK (secret_ref ~ '^[A-Za-z0-9._:-]{1,128}$'),
    CONSTRAINT chk_stocky_connector_connections_disabled
        CHECK ((status = 'active' AND disabled_at IS NULL) OR (status = 'disabled' AND disabled_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stocky_connector_connections_active_store
    ON stocky_connector_connections (organization_id, store_id)
    WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_stocky_connector_connections_active_remote_store
    ON stocky_connector_connections (LOWER(remote_store_id))
    WHERE status = 'active';

CREATE OR REPLACE FUNCTION stocky_guard_connector_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'STOCKY_CONNECTOR_CONNECTION_DELETE_FORBIDDEN' USING ERRCODE = '55000';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.store_id IS DISTINCT FROM OLD.store_id
       OR NEW.remote_store_id IS DISTINCT FROM OLD.remote_store_id
       OR NEW.endpoint_origin IS DISTINCT FROM OLD.endpoint_origin
       OR NEW.key_id IS DISTINCT FROM OLD.key_id
       OR NEW.secret_ref IS DISTINCT FROM OLD.secret_ref
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'STOCKY_CONNECTOR_BINDING_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    IF OLD.status <> 'active'
       OR NEW.status <> 'disabled'
       OR NEW.disabled_at IS NULL
       OR NEW.revision <> OLD.revision + 1 THEN
        RAISE EXCEPTION 'STOCKY_CONNECTOR_STATE_TRANSITION_INVALID' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stocky_connector_binding_guard ON stocky_connector_connections;
CREATE TRIGGER stocky_connector_binding_guard
    BEFORE UPDATE OR DELETE ON stocky_connector_connections
    FOR EACH ROW EXECUTE FUNCTION stocky_guard_connector_binding();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_seller_outbox_events_scope'
          AND conrelid = 'seller_outbox_events'::regclass
    ) THEN
        ALTER TABLE seller_outbox_events
            ADD CONSTRAINT uq_seller_outbox_events_scope UNIQUE (id, organization_id, store_id);
    END IF;
END;
$$;

ALTER TABLE seller_outbox_delivery_attempts
    ADD COLUMN IF NOT EXISTS stocky_connection_id UUID REFERENCES stocky_connector_connections(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS operation VARCHAR(24),
    ADD COLUMN IF NOT EXISTS request_nonce VARCHAR(128),
    ADD COLUMN IF NOT EXISTS request_body_sha256 CHAR(64),
    ADD COLUMN IF NOT EXISTS response_body_sha256 CHAR(64),
    ADD COLUMN IF NOT EXISTS http_status INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_seller_outbox_delivery_stocky_operation'
          AND conrelid = 'seller_outbox_delivery_attempts'::regclass
    ) THEN
        ALTER TABLE seller_outbox_delivery_attempts
            ADD CONSTRAINT chk_seller_outbox_delivery_stocky_operation
            CHECK (operation IS NULL OR operation IN ('post_event', 'get_status', 'ack_result'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_seller_outbox_delivery_stocky_nonce'
          AND conrelid = 'seller_outbox_delivery_attempts'::regclass
    ) THEN
        ALTER TABLE seller_outbox_delivery_attempts
            ADD CONSTRAINT chk_seller_outbox_delivery_stocky_nonce
            CHECK (
                request_nonce IS NULL
                OR request_nonce ~ '^[A-Za-z0-9_-]{16,128}$'
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_seller_outbox_delivery_stocky_hashes'
          AND conrelid = 'seller_outbox_delivery_attempts'::regclass
    ) THEN
        ALTER TABLE seller_outbox_delivery_attempts
            ADD CONSTRAINT chk_seller_outbox_delivery_stocky_hashes
            CHECK (
                (request_body_sha256 IS NULL OR request_body_sha256 ~ '^[0-9a-f]{64}$')
                AND (response_body_sha256 IS NULL OR response_body_sha256 ~ '^[0-9a-f]{64}$')
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_seller_outbox_delivery_stocky_http_status'
          AND conrelid = 'seller_outbox_delivery_attempts'::regclass
    ) THEN
        ALTER TABLE seller_outbox_delivery_attempts
            ADD CONSTRAINT chk_seller_outbox_delivery_stocky_http_status
            CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599);
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_outbox_delivery_stocky_nonce
    ON seller_outbox_delivery_attempts (stocky_connection_id, request_nonce)
    WHERE stocky_connection_id IS NOT NULL AND request_nonce IS NOT NULL;

CREATE TABLE IF NOT EXISTS stocky_connector_event_results (
    id UUID NOT NULL,
    outbox_event_id UUID NOT NULL,
    connection_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    canonical_order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    source_event_id UUID NOT NULL,
    result_id CHAR(64) NOT NULL,
    result_revision BIGINT NOT NULL,
    remote_store_id VARCHAR(191) NOT NULL,
    request_nonce VARCHAR(128) NOT NULL,
    request_body_sha256 CHAR(64) NOT NULL,
    response_body_sha256 CHAR(64) NOT NULL,
    processing_status VARCHAR(24) NOT NULL,
    reason_code VARCHAR(80),
    stocky_sale_ref VARCHAR(191),
    processed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_stocky_connector_event_results PRIMARY KEY (id),
    CONSTRAINT uq_stocky_connector_event_results_event_revision UNIQUE (outbox_event_id, result_revision),
    CONSTRAINT uq_stocky_connector_event_results_event_result UNIQUE (outbox_event_id, result_id),
    CONSTRAINT uq_stocky_connector_event_results_result UNIQUE (connection_id, result_id),
    CONSTRAINT fk_stocky_connector_event_results_connection
        FOREIGN KEY (connection_id, organization_id, store_id)
        REFERENCES stocky_connector_connections(id, organization_id, store_id) ON DELETE RESTRICT,
    CONSTRAINT fk_stocky_connector_event_results_outbox
        FOREIGN KEY (outbox_event_id, organization_id, store_id)
        REFERENCES seller_outbox_events(id, organization_id, store_id) ON DELETE RESTRICT,
    CONSTRAINT chk_stocky_connector_event_results_source CHECK (source_event_id = outbox_event_id),
    CONSTRAINT chk_stocky_connector_event_results_hashes CHECK (
        result_id ~ '^[0-9a-f]{64}$'
        AND request_body_sha256 ~ '^[0-9a-f]{64}$'
        AND response_body_sha256 ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT chk_stocky_connector_event_results_nonce
        CHECK (request_nonce ~ '^[A-Za-z0-9_-]{16,128}$'),
    CONSTRAINT chk_stocky_connector_event_results_status
        CHECK (processing_status IN ('committed', 'manual_required', 'stale')),
    CONSTRAINT chk_stocky_connector_event_results_revision CHECK (result_revision >= 1),
    CONSTRAINT chk_stocky_connector_event_results_reason
        CHECK (reason_code IS NULL OR reason_code ~ '^[A-Za-z0-9._:-]{1,80}$'),
    CONSTRAINT chk_stocky_connector_event_results_sale_ref
        CHECK (stocky_sale_ref IS NULL OR LENGTH(stocky_sale_ref) BETWEEN 1 AND 191)
);

CREATE INDEX IF NOT EXISTS idx_stocky_connector_event_results_order
    ON stocky_connector_event_results (canonical_order_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS stocky_connector_result_ack_attempts (
    id UUID NOT NULL,
    result_id UUID NOT NULL REFERENCES stocky_connector_event_results(id) ON DELETE RESTRICT,
    attempt_number INTEGER NOT NULL,
    outcome VARCHAR(16) NOT NULL,
    request_nonce VARCHAR(128) NOT NULL,
    request_body_sha256 CHAR(64) NOT NULL,
    response_body_sha256 CHAR(64),
    http_status INTEGER,
    error_code VARCHAR(80),
    retry_after_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_stocky_connector_result_ack_attempts PRIMARY KEY (id),
    CONSTRAINT uq_stocky_connector_result_ack_attempt UNIQUE (result_id, attempt_number),
    CONSTRAINT uq_stocky_connector_result_ack_nonce UNIQUE (request_nonce),
    CONSTRAINT chk_stocky_connector_result_ack_number CHECK (attempt_number >= 1),
    CONSTRAINT chk_stocky_connector_result_ack_outcome CHECK (outcome IN ('acknowledged', 'failed', 'dead_letter')),
    CONSTRAINT chk_stocky_connector_result_ack_nonce CHECK (request_nonce ~ '^[A-Za-z0-9_-]{16,128}$'),
    CONSTRAINT chk_stocky_connector_result_ack_hashes CHECK (
        request_body_sha256 ~ '^[0-9a-f]{64}$'
        AND (response_body_sha256 IS NULL OR response_body_sha256 ~ '^[0-9a-f]{64}$')
    ),
    CONSTRAINT chk_stocky_connector_result_ack_http_status
        CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
    CONSTRAINT chk_stocky_connector_result_ack_error
        CHECK (error_code IS NULL OR error_code ~ '^[A-Z0-9._:-]{1,80}$')
);

CREATE INDEX IF NOT EXISTS idx_stocky_connector_result_ack_attempts_result
    ON stocky_connector_result_ack_attempts (result_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_stocky_connector_result_ack_attempts_retry
    ON stocky_connector_result_ack_attempts (retry_after_at, id)
    WHERE retry_after_at IS NOT NULL;

DROP TRIGGER IF EXISTS stocky_connector_event_results_append_only ON stocky_connector_event_results;
CREATE TRIGGER stocky_connector_event_results_append_only
    BEFORE UPDATE OR DELETE ON stocky_connector_event_results
    FOR EACH ROW EXECUTE FUNCTION seller_reject_append_only_mutation();

DROP TRIGGER IF EXISTS stocky_connector_result_ack_attempts_append_only ON stocky_connector_result_ack_attempts;
CREATE TRIGGER stocky_connector_result_ack_attempts_append_only
    BEFORE UPDATE OR DELETE ON stocky_connector_result_ack_attempts
    FOR EACH ROW EXECUTE FUNCTION seller_reject_append_only_mutation();

COMMIT;
