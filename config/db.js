const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const useSsl = String(process.env.DB_SSL || 'true').toLowerCase() !== 'false';

const pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
    console.log('PostgreSQL baglantisi hazir.');
});

module.exports = pool;
