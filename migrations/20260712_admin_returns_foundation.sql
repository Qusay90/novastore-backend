BEGIN;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS refund_status VARCHAR(40) DEFAULT 'NONE';

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS shipment_status VARCHAR(40) DEFAULT 'NONE';

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS returns (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reason_code VARCHAR(50) NOT NULL,
    note TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'REQUESTED',
    refund_amount DECIMAL(10, 2),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_returns_order_id
    ON returns (order_id);

CREATE INDEX IF NOT EXISTS idx_returns_user_id
    ON returns (user_id);

CREATE INDEX IF NOT EXISTS idx_returns_status
    ON returns (status);

CREATE INDEX IF NOT EXISTS idx_returns_created_at
    ON returns (created_at DESC);

COMMIT;
