//Bu dosya, Node.js ile PostgreSQL veritabanımız arasındaki köprüyü kuracak.
const { Pool } = require('pg');
require('dotenv').config();

// Veritabanı bağlantı havuzunu oluşturuyoruz
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Eğer bulut tabanlı bir veritabanı kullanacaksan aşağıdaki satırın başındaki // işaretlerini kaldır:
    ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => {
    console.log('🔌 PostgreSQL veritabanına başarıyla bağlanıldı.');
});

module.exports = pool;