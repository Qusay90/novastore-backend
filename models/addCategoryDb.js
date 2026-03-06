const pool = require('../config/db');

const addCategoryColumn = async () => {
    try {
        await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Kategorisiz';");
        console.log("✅ Başarılı: Ürünler tablosuna 'Kategori' (category) özelliği eklendi!");
    } catch (err) {
        console.error("❌ Hata:", err);
    } finally {
        pool.end();
    }
};

addCategoryColumn();