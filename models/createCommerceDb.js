const pool = require('../config/db');

const createCommerceSchema = async () => {
    const query = `
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(40) DEFAULT 'PENDING';
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(120);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_provider VARCHAR(80);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_no VARCHAR(120);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_status VARCHAR(40) DEFAULT 'NONE';
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status VARCHAR(40) DEFAULT 'NONE';
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) DEFAULT 'card';
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'TRY';
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

        CREATE TABLE IF NOT EXISTS payments (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            provider VARCHAR(40) NOT NULL,
            idempotency_key VARCHAR(120) UNIQUE,
            payment_ref VARCHAR(120) UNIQUE,
            external_ref VARCHAR(120),
            amount DECIMAL(10, 2) NOT NULL,
            currency VARCHAR(10) DEFAULT 'TRY',
            status VARCHAR(40) NOT NULL,
            raw_request JSONB,
            raw_response JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

        CREATE TABLE IF NOT EXISTS shipments (
            id SERIAL PRIMARY KEY,
            order_id INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            provider VARCHAR(80) NOT NULL,
            tracking_no VARCHAR(120) NOT NULL,
            tracking_url TEXT,
            shipment_status VARCHAR(40) DEFAULT 'CREATED',
            eta_date DATE,
            label_url TEXT,
            raw_payload JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_shipments_tracking_no ON shipments(tracking_no);

        CREATE TABLE IF NOT EXISTS returns (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            reason_code VARCHAR(50) NOT NULL,
            note TEXT,
            status VARCHAR(40) DEFAULT 'REQUESTED',
            refund_amount DECIMAL(10, 2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns(order_id);
        CREATE INDEX IF NOT EXISTS idx_returns_user_id ON returns(user_id);

        CREATE TABLE IF NOT EXISTS coupons (
            id SERIAL PRIMARY KEY,
            code VARCHAR(64) UNIQUE NOT NULL,
            discount_type VARCHAR(20) NOT NULL,
            discount_value DECIMAL(10, 2) NOT NULL,
            min_order_amount DECIMAL(10, 2) DEFAULT 0,
            max_discount_amount DECIMAL(10, 2),
            usage_limit INTEGER,
            used_count INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            starts_at TIMESTAMP,
            ends_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT chk_coupon_type CHECK (UPPER(discount_type) IN ('PERCENT', 'FIXED'))
        );

        CREATE TABLE IF NOT EXISTS campaign_configs (
            key VARCHAR(80) PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS webhook_events (
            id SERIAL PRIMARY KEY,
            provider VARCHAR(40) NOT NULL,
            external_event_id VARCHAR(120) UNIQUE,
            signature_valid BOOLEAN DEFAULT FALSE,
            payload JSONB,
            processed BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_events (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            event_type VARCHAR(60) NOT NULL,
            message TEXT,
            payload JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);

        CREATE TABLE IF NOT EXISTS notification_audit_logs (
            id SERIAL PRIMARY KEY,
            notification_id INTEGER REFERENCES notifications(id) ON DELETE SET NULL,
            channel VARCHAR(40) NOT NULL,
            room VARCHAR(120) NOT NULL,
            event_name VARCHAR(80) NOT NULL,
            payload JSONB,
            delivered BOOLEAN DEFAULT FALSE,
            attempts INTEGER DEFAULT 0,
            last_error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_discount_amount, is_active)
        VALUES ('NOVA10', 'PERCENT', 10, 500, 300, TRUE)
        ON CONFLICT (code) DO NOTHING;

        INSERT INTO campaign_configs (key, value)
        VALUES
            ('FREE_SHIPPING_THRESHOLD', '1500'),
            ('DEFAULT_SHIPPING_FEE', '49.9')
        ON CONFLICT (key) DO NOTHING;

        CREATE TABLE IF NOT EXISTS invoices (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            invoice_type VARCHAR(30) NOT NULL,
            invoice_no VARCHAR(80) UNIQUE NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            currency VARCHAR(10) DEFAULT 'TRY',
            status VARCHAR(30) DEFAULT 'CREATED',
            provider VARCHAR(40) DEFAULT 'mock',
            provider_ref VARCHAR(120),
            issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT chk_invoice_type CHECK (invoice_type IN ('INVOICE', 'CANCELLATION', 'RETURN'))
        );
        CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
    `;

    await pool.query(query);
    console.log('Commerce schema hazir.');
};

module.exports = createCommerceSchema;
