BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
    id UUID PRIMARY KEY,
    auth_session_id BIGINT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
    generation INTEGER NOT NULL,
    token_hash CHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    rotated_at TIMESTAMPTZ,
    replayed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ,
    replaced_by_token_id UUID REFERENCES auth_refresh_tokens(id) ON DELETE SET NULL,
    CONSTRAINT uq_auth_refresh_tokens_hash UNIQUE (token_hash),
    CONSTRAINT uq_auth_refresh_tokens_session_generation UNIQUE (auth_session_id, generation),
    CONSTRAINT chk_auth_refresh_tokens_generation CHECK (generation >= 1),
    CONSTRAINT chk_auth_refresh_tokens_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_auth_refresh_tokens_expiry CHECK (expires_at > issued_at),
    CONSTRAINT chk_auth_refresh_tokens_status CHECK (
        status IN ('active', 'rotated', 'replayed', 'revoked', 'expired')
    ),
    CONSTRAINT chk_auth_refresh_tokens_terminal_state CHECK (
        (status = 'active' AND rotated_at IS NULL AND replayed_at IS NULL AND revoked_at IS NULL AND expired_at IS NULL)
        OR (status = 'rotated' AND rotated_at IS NOT NULL)
        OR (status = 'replayed' AND replayed_at IS NOT NULL)
        OR (status = 'revoked' AND revoked_at IS NOT NULL)
        OR (status = 'expired' AND expired_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_refresh_tokens_active_session
    ON auth_refresh_tokens (auth_session_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_session_status_expiry
    ON auth_refresh_tokens (auth_session_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_hash_status
    ON auth_refresh_tokens (token_hash, status);

CREATE OR REPLACE FUNCTION novastore_revoke_sessions_for_user_security_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE auth_sessions
    SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
        revoke_reason = COALESCE(revoke_reason, 'user_security_state_changed')
    WHERE user_id = NEW.id
      AND revoked_at IS NULL
      AND (
          expires_at > CURRENT_TIMESTAMP
          OR EXISTS (
              SELECT 1
              FROM auth_refresh_tokens refresh_token
              WHERE refresh_token.auth_session_id = auth_sessions.id
                AND refresh_token.status = 'active'
                AND refresh_token.expires_at > CURRENT_TIMESTAMP
          )
      );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_customer_refresh_session_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM auth_sessions
        WHERE id = NEW.auth_session_id
          AND principal_type = 'customer'
    ) THEN
        RAISE EXCEPTION 'auth refresh token requires a customer session'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_refresh_customer_binding ON auth_refresh_tokens;
CREATE TRIGGER trg_auth_refresh_customer_binding
    BEFORE INSERT OR UPDATE OF auth_session_id ON auth_refresh_tokens
    FOR EACH ROW EXECUTE FUNCTION enforce_customer_refresh_session_binding();

CREATE OR REPLACE FUNCTION revoke_customer_refresh_for_auth_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
        UPDATE auth_refresh_tokens
        SET status = 'revoked',
            revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
        WHERE auth_session_id = NEW.id
          AND status = 'active';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_session_revoke_customer_refresh ON auth_sessions;
CREATE TRIGGER trg_auth_session_revoke_customer_refresh
    AFTER UPDATE OF revoked_at ON auth_sessions
    FOR EACH ROW EXECUTE FUNCTION revoke_customer_refresh_for_auth_session();

COMMIT;
