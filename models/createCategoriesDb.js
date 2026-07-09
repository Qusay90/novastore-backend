const pool = require('../config/db');

const createCategoriesTable = async () => {
    const queryText = `
        CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            parent_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE categories ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS path TEXT;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS depth INTEGER;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_sibling_name_unique
            ON categories (
                COALESCE(parent_id, 0),
                LOWER(BTRIM(name))
            )
            WHERE deleted_at IS NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_path_unique
            ON categories (LOWER(path))
            WHERE path IS NOT NULL AND deleted_at IS NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug_unique
            ON categories (LOWER(slug))
            WHERE slug IS NOT NULL AND deleted_at IS NULL;
    `;

    try {
        await pool.query(queryText);
        console.log("✅ 'categories' tablosu başarıyla oluşturuldu.");
    } catch (err) {
        console.error("❌ Tablo oluşturma hatası:", err);
    } finally {
        pool.end();
    }
};

createCategoriesTable();
