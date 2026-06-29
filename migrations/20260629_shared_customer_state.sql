BEGIN;

CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT favorites_user_product_unique UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id
    ON favorites(user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_product_id
    ON favorites(product_id);

CREATE TABLE IF NOT EXISTS user_shared_state (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state_key VARCHAR(40) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, state_key),
    CONSTRAINT user_shared_state_key_check CHECK (state_key IN ('cart', 'checkout'))
);

CREATE INDEX IF NOT EXISTS idx_user_shared_state_user_id
    ON user_shared_state(user_id);

COMMIT;
