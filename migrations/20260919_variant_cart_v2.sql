BEGIN;

-- Additive only. Applying this migration never guesses a variant or converts a
-- customer's payload. Adoption is an authenticated, revision-checked operation.
ALTER TABLE user_shared_state
    ADD COLUMN IF NOT EXISTS cart_schema_version SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_shared_state_v1_archive (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state_key VARCHAR(40) NOT NULL CHECK (state_key IN ('cart', 'checkout')),
    payload JSONB NOT NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, state_key)
);

CREATE TABLE IF NOT EXISTS user_cart_finalizations (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    cart_revision BIGINT NOT NULL,
    purchased_lines JSONB NOT NULL,
    finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, order_id)
);

-- Last line of defence against an older backend writer. Application guards
-- return the public HTTP 426/409 contracts before this constraint is reached.
CREATE OR REPLACE FUNCTION protect_shared_cart_v2() RETURNS trigger AS $$
DECLARE owner_id INTEGER;
BEGIN
    owner_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
    PERFORM pg_advisory_xact_lock(73192, owner_id);
    IF TG_OP = 'DELETE' THEN
        -- A customer's lawful account deletion may cascade. Cart logout/clear
        -- must retain a versioned tombstone and may not erase v2 authority.
        IF EXISTS (SELECT 1 FROM users WHERE id = owner_id)
           AND EXISTS (SELECT 1 FROM user_shared_state WHERE user_id = owner_id AND cart_schema_version >= 2) THEN
            RAISE EXCEPTION 'CART_CLIENT_UPGRADE_REQUIRED' USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.cart_schema_version NOT IN (1, 2) OR NEW.revision < 0 THEN
        RAISE EXCEPTION 'CART_SCHEMA_UNSUPPORTED' USING ERRCODE = '23514';
    END IF;
    IF NEW.cart_schema_version = 1 AND EXISTS (
        SELECT 1 FROM user_shared_state WHERE user_id = owner_id AND cart_schema_version >= 2
    ) THEN
        RAISE EXCEPTION 'CART_CLIENT_UPGRADE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF NEW.cart_schema_version = 2 THEN
        IF NEW.payload->>'cartSchemaVersion' IS DISTINCT FROM '2'
           OR jsonb_typeof(NEW.payload->'items') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'CART_SCHEMA_UNSUPPORTED' USING ERRCODE = '23514';
        END IF;
        IF TG_OP = 'UPDATE' AND NEW.revision <= OLD.revision THEN
            RAISE EXCEPTION 'CART_REVISION_CONFLICT' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_shared_state_v2_guard ON user_shared_state;
CREATE TRIGGER user_shared_state_v2_guard
    BEFORE INSERT OR UPDATE OR DELETE ON user_shared_state
    FOR EACH ROW EXECUTE FUNCTION protect_shared_cart_v2();

COMMIT;
