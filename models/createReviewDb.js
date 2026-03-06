const pool = require('../config/db');

const createReviewTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Başarılı: Yorumlar (reviews) tablosu veritabanına eklendi!");
    } catch (err) {
        console.error("❌ Hata:", err);
    } finally {
        pool.end();
    }
};

createReviewTable();