const pool = require('../config/db');

const createProductMediaTable = async () => {
    const queryText = `
        CREATE TABLE IF NOT EXISTS product_media (
            id SERIAL PRIMARY KEY,
            product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
            media_url VARCHAR(255) NOT NULL,
            is_main BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    try {
        await pool.query(queryText);
        console.log("✅ 'product_media' tablosu başarıyla oluşturuldu.");
    } catch (err) {
        console.error("❌ Tablo oluşturma hatası:", err);
    } finally {
        pool.end();
    }
};

createProductMediaTable();
