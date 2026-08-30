BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE seller_applications
    ADD COLUMN IF NOT EXISTS applicant_user_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'fk_seller_applications_applicant_user'
           AND conrelid = 'seller_applications'::regclass
    ) THEN
        ALTER TABLE seller_applications
            ADD CONSTRAINT fk_seller_applications_applicant_user
            FOREIGN KEY (applicant_user_id)
            REFERENCES users(id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_seller_applications_applicant_user_updated
    ON seller_applications (applicant_user_id, updated_at DESC, id)
    WHERE applicant_user_id IS NOT NULL;

COMMIT;
