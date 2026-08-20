BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM seller_sessions session
        JOIN seller_memberships membership
          ON membership.organization_id = session.organization_id
         AND membership.id = session.membership_id
        WHERE membership.user_id <> session.user_id
    ) THEN
        RAISE EXCEPTION 'SELLER_SESSION_MEMBERSHIP_USER_MISMATCH'
            USING ERRCODE = '23514';
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_seller_memberships_organization_id_id_user_id'
          AND conrelid = 'seller_memberships'::regclass
    ) THEN
        ALTER TABLE seller_memberships
            ADD CONSTRAINT uq_seller_memberships_organization_id_id_user_id
            UNIQUE (organization_id, id, user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_seller_sessions_membership_user'
          AND conrelid = 'seller_sessions'::regclass
    ) THEN
        ALTER TABLE seller_sessions
            ADD CONSTRAINT fk_seller_sessions_membership_user
            FOREIGN KEY (organization_id, membership_id, user_id)
            REFERENCES seller_memberships(organization_id, id, user_id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

COMMIT;
