const pool = require('../config/db');

const createAnalyticsSchema = async () => {
    const query = `
        CREATE TABLE IF NOT EXISTS visitor_sessions (
            id SERIAL PRIMARY KEY,
            session_key VARCHAR(120) UNIQUE NOT NULL,
            visitor_key VARCHAR(120) NOT NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            landing_path TEXT,
            entry_page_type VARCHAR(40) DEFAULT 'other',
            referrer TEXT,
            user_agent TEXT,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ended_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS page_visits (
            id SERIAL PRIMARY KEY,
            page_key VARCHAR(120) UNIQUE NOT NULL,
            session_key VARCHAR(120) NOT NULL REFERENCES visitor_sessions(session_key) ON DELETE CASCADE,
            page_type VARCHAR(40) DEFAULT 'other',
            page_path TEXT NOT NULL,
            page_title VARCHAR(255),
            product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
            referrer TEXT,
            entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            left_at TIMESTAMP,
            duration_seconds INTEGER DEFAULT 0,
            heartbeat_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS product_actions (
            id SERIAL PRIMARY KEY,
            action_key VARCHAR(120) UNIQUE NOT NULL,
            session_key VARCHAR(120) NOT NULL REFERENCES visitor_sessions(session_key) ON DELETE CASCADE,
            visitor_key VARCHAR(120) NOT NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
            action_type VARCHAR(40) NOT NULL,
            quantity INTEGER DEFAULT 1,
            page_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE orders ADD COLUMN IF NOT EXISTS analytics_session_key VARCHAR(120);

        CREATE INDEX IF NOT EXISTS idx_visitor_sessions_started_at ON visitor_sessions(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_visitor_sessions_user_id ON visitor_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_visitor_sessions_visitor_key ON visitor_sessions(visitor_key);
        CREATE INDEX IF NOT EXISTS idx_page_visits_session_key ON page_visits(session_key);
        CREATE INDEX IF NOT EXISTS idx_page_visits_product_id ON page_visits(product_id);
        CREATE INDEX IF NOT EXISTS idx_page_visits_entered_at ON page_visits(entered_at DESC);
        CREATE INDEX IF NOT EXISTS idx_product_actions_session_key ON product_actions(session_key);
        CREATE INDEX IF NOT EXISTS idx_product_actions_product_id ON product_actions(product_id);
        CREATE INDEX IF NOT EXISTS idx_product_actions_type_created_at ON product_actions(action_type, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_orders_analytics_session_key ON orders(analytics_session_key);
    `;

    await pool.query(query);
    console.log('Analytics schema hazir.');
};

module.exports = createAnalyticsSchema;
