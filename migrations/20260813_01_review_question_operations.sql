BEGIN;

ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS status VARCHAR(20);

UPDATE reviews
SET status = 'PUBLISHED'
WHERE status IS NULL;

ALTER TABLE reviews
    ALTER COLUMN status SET DEFAULT 'PENDING';

ALTER TABLE reviews
    ALTER COLUMN status SET NOT NULL;

ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;

ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS moderated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;

ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS moderation_note TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_reviews_operational_status'
          AND conrelid = 'reviews'::regclass
    ) THEN
        ALTER TABLE reviews
            ADD CONSTRAINT chk_reviews_operational_status
            CHECK (status IN ('PENDING', 'PUBLISHED', 'HIDDEN'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_reviews_revision_positive'
          AND conrelid = 'reviews'::regclass
    ) THEN
        ALTER TABLE reviews
            ADD CONSTRAINT chk_reviews_revision_positive
            CHECK (revision >= 1);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_reviews_comment_no_control'
          AND conrelid = 'reviews'::regclass
    ) THEN
        ALTER TABLE reviews
            ADD CONSTRAINT chk_reviews_comment_no_control
            CHECK (
                comment IS NULL
                OR regexp_replace(comment, E'[\\t\\n\\r]', '', 'g') !~ '[[:cntrl:]]'
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_reviews_moderation_note_no_control'
          AND conrelid = 'reviews'::regclass
    ) THEN
        ALTER TABLE reviews
            ADD CONSTRAINT chk_reviews_moderation_note_no_control
            CHECK (
                moderation_note IS NULL
                OR regexp_replace(moderation_note, E'[\\t\\n\\r]', '', 'g') !~ '[[:cntrl:]]'
            ) NOT VALID;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM reviews
        WHERE product_id IS NOT NULL
          AND user_id IS NOT NULL
        GROUP BY product_id, user_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'reviews contains duplicate product/customer rows; resolve them before applying the operational uniqueness gate'
            USING ERRCODE = '23505';
    END IF;
END;
$$;

ALTER TABLE reviews VALIDATE CONSTRAINT chk_reviews_comment_no_control;
ALTER TABLE reviews VALIDATE CONSTRAINT chk_reviews_moderation_note_no_control;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_product_user_unique
    ON reviews(product_id, user_id)
    WHERE product_id IS NOT NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_moderation_queue
    ON reviews(status, created_at ASC, id ASC);

ALTER TABLE product_questions
    ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;

ALTER TABLE product_questions
    ADD COLUMN IF NOT EXISTS answered_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE product_questions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE product_questions
SET answer = NULL,
    answered_at = NULL,
    answered_by = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE answer IS NOT NULL
  AND BTRIM(answer) = '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_product_questions_revision_positive'
          AND conrelid = 'product_questions'::regclass
    ) THEN
        ALTER TABLE product_questions
            ADD CONSTRAINT chk_product_questions_revision_positive
            CHECK (revision >= 1);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_product_questions_question_no_control'
          AND conrelid = 'product_questions'::regclass
    ) THEN
        ALTER TABLE product_questions
            ADD CONSTRAINT chk_product_questions_question_no_control
            CHECK (regexp_replace(question, E'[\\t\\n\\r]', '', 'g') !~ '[[:cntrl:]]') NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_product_questions_answer_no_control'
          AND conrelid = 'product_questions'::regclass
    ) THEN
        ALTER TABLE product_questions
            ADD CONSTRAINT chk_product_questions_answer_no_control
            CHECK (
                answer IS NULL
                OR regexp_replace(answer, E'[\\t\\n\\r]', '', 'g') !~ '[[:cntrl:]]'
            ) NOT VALID;
    END IF;
END;
$$;

ALTER TABLE product_questions VALIDATE CONSTRAINT chk_product_questions_question_no_control;
ALTER TABLE product_questions VALIDATE CONSTRAINT chk_product_questions_answer_no_control;

CREATE TABLE IF NOT EXISTS customer_operation_audit_events (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_role VARCHAR(20) NOT NULL,
    entity_type VARCHAR(20) NOT NULL,
    entity_id INTEGER NOT NULL,
    action VARCHAR(30) NOT NULL,
    before_state JSONB NOT NULL DEFAULT '{}'::JSONB,
    after_state JSONB NOT NULL DEFAULT '{}'::JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_customer_operation_audit_actor_role CHECK (actor_role = 'admin'),
    CONSTRAINT chk_customer_operation_audit_entity_type CHECK (entity_type IN ('review', 'question')),
    CONSTRAINT chk_customer_operation_audit_action CHECK (action IN ('publish', 'hide', 'answer', 'revise_answer')),
    CONSTRAINT chk_customer_operation_audit_before_object CHECK (jsonb_typeof(before_state) = 'object'),
    CONSTRAINT chk_customer_operation_audit_after_object CHECK (jsonb_typeof(after_state) = 'object'),
    CONSTRAINT chk_customer_operation_audit_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_customer_operation_audit_entity
    ON customer_operation_audit_events(entity_type, entity_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_customer_operation_audit_actor
    ON customer_operation_audit_events(actor_user_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION reject_customer_operation_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'customer_operation_audit_events is append-only'
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_operation_audit_append_only
    ON customer_operation_audit_events;

CREATE TRIGGER trg_customer_operation_audit_append_only
    BEFORE UPDATE OR DELETE ON customer_operation_audit_events
    FOR EACH ROW
    EXECUTE FUNCTION reject_customer_operation_audit_mutation();

COMMIT;
