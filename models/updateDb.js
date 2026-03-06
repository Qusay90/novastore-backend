const pool = require('../config/db');

const updateDatabase = async () => {
    try {
        console.log("⏳ Veritabanı sipariş detayları için güncelleniyor...");

        // orders (siparişler) tablomuza yeni yetenekler (sütunlar) ekliyoruz
        await pool.query(`
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS email VARCHAR(100);
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS address TEXT;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB;
        `);

        console.log("✅ Veritabanı başarıyla güncellendi! Artık müşteri ve ürün detaylarını tutabiliriz.");
    } catch (err) {
        console.error("❌ Hata oluştu:", err);
    } finally {
        pool.end();
    }
};

updateDatabase();