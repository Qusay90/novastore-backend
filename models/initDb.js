const pool = require('../config/db');
const bcrypt = require('bcrypt');

const createTables = async () => {
    // 1. Kullanıcılar, Ürünler ve Siparişler tabloları için SQL komutları
    const queryText = `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            phone VARCHAR(20),
            password VARCHAR(255) NOT NULL,
            role VARCHAR(20) DEFAULT 'customer',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(10, 2) NOT NULL,
            stock INTEGER DEFAULT 0,
            image_url VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            total_amount DECIMAL(10, 2) NOT NULL,
            status VARCHAR(50) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            sender_id INTEGER REFERENCES users(id),
            receiver_id INTEGER REFERENCES users(id),
            message TEXT NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS product_questions (
            id SERIAL PRIMARY KEY,
            product_id INTEGER REFERENCES products(id),
            user_id INTEGER REFERENCES users(id),
            question TEXT NOT NULL,
            answer TEXT,
            answered_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    try {
        await pool.query(queryText);
        console.log("✅ Tablolar başarıyla oluşturuldu.");

        // Sistem Yöneticisi hesabını veritabanına işleme
        const hashedPassword = await bcrypt.hash('NovaAdmin2026!', 10); // Geçici şifre
        const adminCheck = await pool.query("SELECT * FROM users WHERE email = 'isbatat1120@gmail.com'");

        if (adminCheck.rows.length === 0) {
            await pool.query(
                "INSERT INTO users (name, email, phone, password, role) VALUES ($1, $2, $3, $4, $5)",
                ['Kurucu Yönetici', 'isbatat1120@gmail.com', '05314642430', hashedPassword, 'admin']
            );
            console.log("👑 Yönetici (Admin) hesabı sisteme tanımlandı.");
        }

    } catch (err) {
        console.error("❌ Veritabanı kurulum hatası:", err);
    } finally {
        pool.end(); // İşlem bitince bağlantıyı kapat
    }
};

createTables();
