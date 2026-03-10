const { Pool } = require('pg');
require('dotenv').config();
const dns = require('dns');

// Force IPv4 resolution for Supabase on Render
dns.setDefaultResultOrder('ipv4first');

const useSsl = String(process.env.DB_SSL || 'true').toLowerCase() !== 'false';

// Use individual variables if available (avoids & encoding issues in URL)
// Otherwise fall back to full DATABASE_URL
let poolConfig;
if (process.env.DB_HOST) {
    poolConfig = {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'postgres',
        ssl: useSsl ? { rejectUnauthorized: false } : false,
        keepAlive: true
    };
} else {
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: useSsl ? { rejectUnauthorized: false } : false,
        keepAlive: true
    };
}

const pool = new Pool(poolConfig);

pool.on('connect', () => {
    console.log('PostgreSQL baglantisi hazir.');
});

module.exports = pool;
