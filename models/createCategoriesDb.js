const pool = require('../config/db');

const createCategoriesTable = async () => {
    const queryText = `
        CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
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
