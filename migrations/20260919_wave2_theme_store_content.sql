BEGIN;

CREATE TABLE theme_store_profiles (
    organization_id BIGINT NOT NULL,
    store_id BIGINT PRIMARY KEY,
    profile JSONB NOT NULL CHECK(jsonb_typeof(profile)='object' AND octet_length(profile::text)<=16384),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(organization_id,store_id) REFERENCES seller_stores(organization_id,id) ON DELETE RESTRICT
);

CREATE TABLE theme_store_legal_documents (
    id UUID PRIMARY KEY,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    locale TEXT NOT NULL CHECK(locale ~ '^[a-z]{2}-[A-Z]{2}$'),
    document_type TEXT NOT NULL CHECK(document_type IN ('privacy','terms','distance-sales','returns','shipping','kvkk','cookie','contact','business-information')),
    version INTEGER NOT NULL CHECK(version>0),
    content TEXT NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 262144),
    content_hash TEXT NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','REVOKED')),
    approved_at TIMESTAMPTZ,
    effective_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(organization_id,store_id,locale,document_type,version),
    FOREIGN KEY(organization_id,store_id) REFERENCES seller_stores(organization_id,id) ON DELETE RESTRICT,
    CHECK((status='DRAFT' AND approved_at IS NULL AND effective_at IS NULL AND revoked_at IS NULL)
        OR (status='APPROVED' AND approved_at IS NOT NULL AND effective_at IS NOT NULL AND revoked_at IS NULL)
        OR (status='REVOKED' AND revoked_at IS NOT NULL)),
    CHECK(expires_at IS NULL OR (effective_at IS NOT NULL AND expires_at>effective_at))
);
CREATE INDEX theme_store_legal_effective ON theme_store_legal_documents(store_id,locale,document_type,version DESC) WHERE status='APPROVED';

CREATE FUNCTION theme_store_legal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'THEME_LEGAL_HISTORY_REQUIRED'; END IF;
    IF ROW(NEW.id,NEW.organization_id,NEW.store_id,NEW.locale,NEW.document_type,NEW.version,NEW.content,NEW.content_hash,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.store_id,OLD.locale,OLD.document_type,OLD.version,OLD.content,OLD.content_hash,OLD.created_at)
        THEN RAISE EXCEPTION 'THEME_LEGAL_IMMUTABLE_CONTENT'; END IF;
    IF OLD.status='REVOKED' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'THEME_LEGAL_REVOKED'; END IF;
    IF OLD.approved_at IS NOT NULL AND ROW(NEW.approved_at,NEW.effective_at,NEW.expires_at)
        IS DISTINCT FROM ROW(OLD.approved_at,OLD.effective_at,OLD.expires_at) THEN RAISE EXCEPTION 'THEME_LEGAL_IMMUTABLE_APPROVAL'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER theme_store_legal_immutable BEFORE UPDATE OR DELETE ON theme_store_legal_documents
    FOR EACH ROW EXECUTE FUNCTION theme_store_legal_guard();

COMMIT;
