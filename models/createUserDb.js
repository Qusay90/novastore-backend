const pool = require('../config/db');

const createUserTable = async () => {
    try {
        console.log("⏳ Kullanıcılar (Users) tablosu için veritabanı güncelleniyor...");

        // Müşterilerimiz için tablo oluşturuyoruz. Şifreler kesinlikle düz metin olarak değil, hashlenmiş saklanacak!
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'customer',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Eski siparişlerimizi yeni üyelik sistemine bağlamak için orders tablosuna 'user_id' ekliyoruz
        await pool.query(`
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
        `);

        console.log("✅ Veritabanı başarıyla güncellendi! Artık müşteri kaydedebiliriz.");
    } catch (err) {
        console.error("❌ Hata oluştu:", err);
    } finally {
        pool.end();
    }
};

createUserTable();