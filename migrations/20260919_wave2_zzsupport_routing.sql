BEGIN;

-- This is customer-to-store support. Existing platform customer threads and
-- merchant-to-platform support retain their independent ownership contracts.
CREATE TABLE theme_store_support_policies (
    service_id UUID PRIMARY KEY,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    recipient TEXT NOT NULL CHECK(recipient IN ('SELLER','PLATFORM')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    approved_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(service_id,organization_id,store_id) REFERENCES seller_theme_services(id,organization_id,store_id) ON DELETE RESTRICT
);
CREATE TABLE theme_store_support_threads (
    id UUID PRIMARY KEY,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    recipient TEXT NOT NULL CHECK(recipient IN ('SELLER','PLATFORM')),
    policy_revision INTEGER NOT NULL CHECK(policy_revision>=0),
    subject TEXT NOT NULL CHECK(char_length(subject) BETWEEN 1 AND 160),
    client_request_id UUID NOT NULL,
    request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    customer_read_id BIGINT NOT NULL DEFAULT 0 CHECK(customer_read_id>=0),
    operator_read_id BIGINT NOT NULL DEFAULT 0 CHECK(operator_read_id>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(service_id,customer_id,client_request_id),
    UNIQUE(id,service_id,organization_id,store_id),
    FOREIGN KEY(service_id,organization_id,store_id) REFERENCES seller_theme_services(id,organization_id,store_id) ON DELETE RESTRICT
);
CREATE INDEX theme_support_inbox ON theme_store_support_threads(service_id,recipient,last_message_at DESC,id);
CREATE INDEX theme_support_customer ON theme_store_support_threads(service_id,customer_id,last_message_at DESC,id);
CREATE TABLE theme_store_support_messages (
    id BIGSERIAL PRIMARY KEY,
    thread_id UUID NOT NULL,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    sender_kind TEXT NOT NULL CHECK(sender_kind IN ('CUSTOMER','SELLER','ADMIN')),
    sender_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    body TEXT NOT NULL CHECK(char_length(body) BETWEEN 1 AND 5000),
    client_message_id UUID NOT NULL,
    request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(thread_id,sender_kind,sender_user_id,client_message_id),
    FOREIGN KEY(thread_id,service_id,organization_id,store_id) REFERENCES theme_store_support_threads(id,service_id,organization_id,store_id) ON DELETE RESTRICT
);
CREATE INDEX theme_support_thread_messages ON theme_store_support_messages(thread_id,id);
CREATE FUNCTION theme_support_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' OR TG_TABLE_NAME='theme_store_support_messages' THEN RAISE EXCEPTION 'THEME_SUPPORT_HISTORY_REQUIRED'; END IF;
    IF ROW(NEW.id,NEW.service_id,NEW.organization_id,NEW.store_id,NEW.customer_id,NEW.recipient,NEW.policy_revision,NEW.subject,NEW.client_request_id,NEW.request_hash,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id,OLD.service_id,OLD.organization_id,OLD.store_id,OLD.customer_id,OLD.recipient,OLD.policy_revision,OLD.subject,OLD.client_request_id,OLD.request_hash,OLD.created_at)
        THEN RAISE EXCEPTION 'THEME_SUPPORT_IDENTITY_IMMUTABLE'; END IF;
    IF NEW.customer_read_id<OLD.customer_read_id OR NEW.operator_read_id<OLD.operator_read_id OR NEW.revision<OLD.revision
        THEN RAISE EXCEPTION 'THEME_SUPPORT_MONOTONIC_STATE_REQUIRED'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER theme_support_thread_guard BEFORE UPDATE OR DELETE ON theme_store_support_threads FOR EACH ROW EXECUTE FUNCTION theme_support_immutable_guard();
CREATE TRIGGER theme_support_message_guard BEFORE UPDATE OR DELETE ON theme_store_support_messages FOR EACH ROW EXECUTE FUNCTION theme_support_immutable_guard();

COMMIT;
