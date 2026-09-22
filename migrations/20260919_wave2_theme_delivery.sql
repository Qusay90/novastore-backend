BEGIN;

CREATE TABLE theme_stocky_deliveries (
    outbox_id UUID PRIMARY KEY REFERENCES theme_outbox(id) ON DELETE RESTRICT,
    connection_id UUID NOT NULL,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    assignment_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'DELIVERY_PENDING'
        CHECK (status IN ('DELIVERY_PENDING','DELIVERED','RECEIPT_CONFIRMED','REJECTED')),
    lease_token UUID,
    receipt JSONB CHECK (receipt IS NULL OR (jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=65536)),
    receipt_hash TEXT CHECK (receipt_hash IS NULL OR receipt_hash ~ '^[a-f0-9]{64}$'),
    result_id TEXT CHECK (result_id IS NULL OR result_id ~ '^[a-f0-9]{64}$'),
    delivered_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    last_error_code TEXT CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z][A-Z0-9_]{0,100}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(connection_id,organization_id,store_id)
        REFERENCES stocky_connector_connections(id,organization_id,store_id) ON DELETE RESTRICT,
    FOREIGN KEY(service_id,organization_id,store_id)
        REFERENCES seller_theme_services(id,organization_id,store_id) ON DELETE RESTRICT,
    FOREIGN KEY(assignment_id,service_id,organization_id,store_id)
        REFERENCES theme_assignments(id,service_id,organization_id,store_id) ON DELETE RESTRICT,
    CHECK ((status='DELIVERY_PENDING' AND receipt IS NULL AND result_id IS NULL AND delivered_at IS NULL)
        OR (status='REJECTED')
        OR (status IN ('DELIVERED','RECEIPT_CONFIRMED') AND receipt IS NOT NULL
            AND receipt_hash IS NOT NULL AND result_id IS NOT NULL AND delivered_at IS NOT NULL)),
    CHECK ((status='RECEIPT_CONFIRMED') = (acknowledged_at IS NOT NULL))
);

CREATE UNIQUE INDEX theme_stocky_receipt_identity ON theme_stocky_deliveries(connection_id,result_id)
    WHERE result_id IS NOT NULL;
CREATE INDEX theme_stocky_service_delivery ON theme_stocky_deliveries(service_id,created_at DESC);

CREATE FUNCTION theme_stocky_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'THEME_DELIVERY_DURABLE_RECORD'; END IF;
    IF ROW(NEW.outbox_id,NEW.connection_id,NEW.service_id,NEW.organization_id,NEW.store_id,NEW.assignment_id)
        IS DISTINCT FROM ROW(OLD.outbox_id,OLD.connection_id,OLD.service_id,OLD.organization_id,OLD.store_id,OLD.assignment_id)
        THEN RAISE EXCEPTION 'THEME_DELIVERY_IMMUTABLE_SCOPE'; END IF;
    IF OLD.receipt IS NOT NULL AND ROW(NEW.receipt,NEW.receipt_hash,NEW.result_id,NEW.delivered_at)
        IS DISTINCT FROM ROW(OLD.receipt,OLD.receipt_hash,OLD.result_id,OLD.delivered_at)
        THEN RAISE EXCEPTION 'THEME_DELIVERY_IMMUTABLE_RECEIPT'; END IF;
    IF OLD.status='RECEIPT_CONFIRMED' AND NEW.status<>'RECEIPT_CONFIRMED'
        THEN RAISE EXCEPTION 'THEME_DELIVERY_CONFIRMED'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER theme_stocky_delivery_identity BEFORE UPDATE OR DELETE ON theme_stocky_deliveries
    FOR EACH ROW EXECUTE FUNCTION theme_stocky_delivery_guard();

COMMIT;
