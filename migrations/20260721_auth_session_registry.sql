ALTER TABLE users
    ADD COLUMN IF NOT EXISTS auth_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS auth_sessions (
    id BIGSERIAL PRIMARY KEY,
    jti_hash CHAR(64) NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    principal_type VARCHAR(16) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoke_reason VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_auth_sessions_principal
        CHECK (principal_type IN ('customer', 'admin')),
    CONSTRAINT chk_auth_sessions_expiry
        CHECK (expires_at > issued_at),
    CONSTRAINT chk_auth_sessions_jti_hash
        CHECK (jti_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active_user_principal
    ON auth_sessions (user_id, principal_type, expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
    ON auth_sessions (expires_at, id);

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
      AND expires_at > CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_revoke_auth_sessions ON users;
CREATE TRIGGER trg_users_revoke_auth_sessions
AFTER UPDATE OF password, role, auth_enabled ON users
FOR EACH ROW
WHEN (
    OLD.password IS DISTINCT FROM NEW.password
    OR OLD.role IS DISTINCT FROM NEW.role
    OR OLD.auth_enabled IS DISTINCT FROM NEW.auth_enabled
)
EXECUTE FUNCTION novastore_revoke_sessions_for_user_security_change();

CREATE OR REPLACE FUNCTION novastore_notify_auth_session_revoked()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
        PERFORM pg_notify(
            'novastore_auth_session_revoked',
            json_build_object(
                'session_id', NEW.id,
                'user_id', NEW.user_id,
                'principal_type', NEW.principal_type
            )::TEXT
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_sessions_notify_revoked ON auth_sessions;
CREATE TRIGGER trg_auth_sessions_notify_revoked
AFTER UPDATE OF revoked_at ON auth_sessions
FOR EACH ROW
EXECUTE FUNCTION novastore_notify_auth_session_revoked();
