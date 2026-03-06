const pool = require('../config/db');

const addOldPriceColumn = async () => {
    try {
        await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS old_price DECIMAL(10,2);');
        console.log("✅ Başarılı: Ürünler (products) tablosuna 'Eski Fiyat' (old_price) sütunu eklendi!");
    } catch (err) {
        console.error("❌ Hata:", err);
    } finally {
        pool.end();
    }
};

addOldPriceColumn();