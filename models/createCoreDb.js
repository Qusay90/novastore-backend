const pool = require('../config/db');

const createCoreSchema = async () => {
    const query = `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            full_name VARCHAR(100),
            name VARCHAR(100),
            email VARCHAR(100) UNIQUE NOT NULL,
            phone VARCHAR(20),
            password VARCHAR(255) NOT NULL,
            role VARCHAR(20) DEFAULT 'customer',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'customer';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

        UPDATE users
        SET full_name = COALESCE(full_name, name)
        WHERE full_name IS NULL AND name IS NOT NULL;

        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(10, 2) NOT NULL DEFAULT 0,
            old_price DECIMAL(10, 2),
            stock INTEGER DEFAULT 0,
            image_url TEXT,
            category VARCHAR(100) DEFAULT 'Kategorisiz',
            categories TEXT[] DEFAULT ARRAY['Kategorisiz']::TEXT[],
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE products ADD COLUMN IF NOT EXISTS old_price DECIMAL(10, 2);
        ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Kategorisiz';
        ALTER TABLE products ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT ARRAY['Kategorisiz']::TEXT[];
        ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE products ALTER COLUMN image_url TYPE TEXT;
        UPDATE products
        SET categories = ARRAY[COALESCE(NULLIF(category, ''), 'Kategorisiz')]::TEXT[]
        WHERE categories IS NULL OR array_length(categories, 1) IS NULL;
        UPDATE products
        SET category = COALESCE(NULLIF(category, ''), categories[1], 'Kategorisiz')
        WHERE category IS NULL OR category = '';

        CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
            status VARCHAR(50) DEFAULT 'pending',
            customer_name VARCHAR(100),
            email VARCHAR(100),
            phone VARCHAR(20),
            address TEXT,
            items JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS email VARCHAR(100);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            message TEXT NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

        CREATE TABLE IF NOT EXISTS product_questions (
            id SERIAL PRIMARY KEY,
            product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            question TEXT NOT NULL,
            answer TEXT,
            answered_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE product_questions ADD COLUMN IF NOT EXISTS answer TEXT;
        ALTER TABLE product_questions ADD COLUMN IF NOT EXISTS answered_at TIMESTAMP;
        ALTER TABLE product_questions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

        CREATE TABLE IF NOT EXISTS reviews (
            id SERIAL PRIMARY KEY,
            product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS comment TEXT;
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

        CREATE TABLE IF NOT EXISTS review_media (
            id SERIAL PRIMARY KEY,
            review_id INTEGER REFERENCES reviews(id) ON DELETE CASCADE,
            media_url TEXT NOT NULL,
            media_type VARCHAR(20) DEFAULT 'image',
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE review_media ADD COLUMN IF NOT EXISTS media_url TEXT;
        ALTER TABLE review_media ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) DEFAULT 'image';
        ALTER TABLE review_media ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
        ALTER TABLE review_media ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE review_media ALTER COLUMN media_url TYPE TEXT;

        CREATE TABLE IF NOT EXISTS product_media (
            id SERIAL PRIMARY KEY,
            product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
            media_url TEXT NOT NULL,
            is_main BOOLEAN DEFAULT FALSE,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE product_media ADD COLUMN IF NOT EXISTS is_main BOOLEAN DEFAULT FALSE;
        ALTER TABLE product_media ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
        ALTER TABLE product_media ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE product_media ADD COLUMN IF NOT EXISTS media_url TEXT;
        ALTER TABLE product_media ALTER COLUMN media_url TYPE TEXT;

        CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(sender_id, receiver_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_product_questions_product_id ON product_questions(product_id);
        CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
        CREATE INDEX IF NOT EXISTS idx_review_media_review_id ON review_media(review_id);
        CREATE INDEX IF NOT EXISTS idx_product_media_product_id ON product_media(product_id);
    `;

    await pool.query(query);
    console.log('Temel veritabani schema hazir.');
};

module.exports = createCoreSchema;
