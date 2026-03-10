const { Pool } = require('pg');
require('dotenv').config();
const dns = require('dns');

const connectionString = process.env.DATABASE_URL;
const useSsl = String(process.env.DB_SSL || 'true').toLowerCase() !== 'false';

// Force IPv4 resolution for Supabase on Render
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    keepAlive: true
});

pool.on('connect', () => {
    console.log('PostgreSQL baglantisi hazir.');
});

module.exports = pool;
