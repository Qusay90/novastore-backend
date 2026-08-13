BEGIN;

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS entity_type VARCHAR(40),
    ADD COLUMN IF NOT EXISTS entity_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_notifications_entity_pair'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT chk_notifications_entity_pair
            CHECK ((entity_type IS NULL) = (entity_id IS NULL));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_notifications_entity_type'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT chk_notifications_entity_type
            CHECK (
                entity_type IS NULL OR entity_type IN (
                    'order',
                    'product',
                    'product_question',
                    'return_request',
                    'review',
                    'support_thread'
                )
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_notifications_entity_id'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT chk_notifications_entity_id
            CHECK (entity_id IS NULL OR entity_id > 0);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_notifications_entity
    ON notifications (entity_type, entity_id)
    WHERE entity_type IS NOT NULL;

CREATE TABLE IF NOT EXISTS support_threads (
    id BIGSERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    source VARCHAR(24) NOT NULL DEFAULT 'DIRECT',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP,
    CONSTRAINT uq_support_threads_customer UNIQUE (customer_id),
    CONSTRAINT chk_support_threads_status CHECK (status IN ('OPEN', 'TAKEN_OVER', 'CLOSED')),
    CONSTRAINT chk_support_threads_source CHECK (source IN ('DIRECT', 'NOVABOT', 'MIGRATED')),
    CONSTRAINT chk_support_threads_assignment CHECK (
        status <> 'TAKEN_OVER' OR assigned_admin_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_support_threads_queue
    ON support_threads (status, last_message_at DESC NULLS LAST, id DESC);

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS support_thread_id BIGINT,
    ADD COLUMN IF NOT EXISTS handoff_dismissed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS handoff_dismissed_by INTEGER REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE messages
    DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
    DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey,
    ADD CONSTRAINT messages_sender_id_fkey
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT,
    ADD CONSTRAINT messages_receiver_id_fkey
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE RESTRICT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_messages_support_thread'
          AND conrelid = 'messages'::regclass
    ) THEN
        ALTER TABLE messages
            ADD CONSTRAINT fk_messages_support_thread
            FOREIGN KEY (support_thread_id) REFERENCES support_threads(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_messages_handoff_dismissal_pair'
          AND conrelid = 'messages'::regclass
    ) THEN
        ALTER TABLE messages
            ADD CONSTRAINT chk_messages_handoff_dismissal_pair
            CHECK ((handoff_dismissed_at IS NULL) = (handoff_dismissed_by IS NULL));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_messages_handoff_dismissal_scope'
          AND conrelid = 'messages'::regclass
    ) THEN
        ALTER TABLE messages
            ADD CONSTRAINT chk_messages_handoff_dismissal_scope
            CHECK (handoff_dismissed_at IS NULL OR message LIKE '[AI DESTEK DEVRI]%');
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_messages_message_no_control'
          AND conrelid = 'messages'::regclass
    ) THEN
        ALTER TABLE messages
            ADD CONSTRAINT chk_messages_message_no_control
            CHECK (regexp_replace(message, E'[\\t\\n\\r]', '', 'g') !~ '[[:cntrl:]]')
            NOT VALID;
    END IF;
END;
$$;

ALTER TABLE messages VALIDATE CONSTRAINT chk_messages_message_no_control;

INSERT INTO support_threads (customer_id, status, source, last_message_at)
SELECT
    u.id,
    'OPEN',
    'MIGRATED',
    MAX(m.created_at)
FROM users u
JOIN messages m ON m.sender_id = u.id OR m.receiver_id = u.id
WHERE u.role = 'customer'
GROUP BY u.id
ON CONFLICT (customer_id) DO UPDATE
SET last_message_at = GREATEST(
        support_threads.last_message_at,
        EXCLUDED.last_message_at
    ),
    updated_at = CURRENT_TIMESTAMP;

UPDATE messages m
SET support_thread_id = (
    SELECT st.id
    FROM support_threads st
    WHERE st.customer_id = m.sender_id OR st.customer_id = m.receiver_id
    ORDER BY st.id ASC
    LIMIT 1
)
WHERE m.support_thread_id IS NULL
  AND 1 = (
      SELECT COUNT(*)
      FROM support_threads st
      WHERE st.customer_id = m.sender_id OR st.customer_id = m.receiver_id
  );

CREATE INDEX IF NOT EXISTS idx_messages_support_thread
    ON messages (support_thread_id, created_at, id);

CREATE TABLE IF NOT EXISTS support_thread_events (
    id BIGSERIAL PRIMARY KEY,
    support_thread_id BIGINT NOT NULL REFERENCES support_threads(id) ON DELETE RESTRICT,
    actor_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    event_type VARCHAR(40) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_support_thread_events_type CHECK (
        event_type IN (
            'THREAD_CREATED',
            'MESSAGE_CREATED',
            'NOVABOT_ESCALATED',
            'TAKEOVER',
            'STATUS_CHANGED',
            'HANDOFF_DISMISSED'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_support_thread_events_thread
    ON support_thread_events (support_thread_id, created_at, id);

CREATE OR REPLACE FUNCTION reject_support_thread_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'support_thread_events is append-only'
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_support_thread_events_append_only
    ON support_thread_events;

CREATE TRIGGER trg_support_thread_events_append_only
    BEFORE UPDATE OR DELETE ON support_thread_events
    FOR EACH ROW
    EXECUTE FUNCTION reject_support_thread_event_mutation();

COMMIT;
