BEGIN;

CREATE TABLE IF NOT EXISTS store_follows (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_follows_store_id_created_at
    ON store_follows(store_id, created_at DESC, user_id);

COMMIT;
