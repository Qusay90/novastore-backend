const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

const useSsl = String(process.env.DB_SSL || 'true').toLowerCase() !== 'false';
const truthyValues = new Set(['1', 'true', 'yes', 'on']);

const parseInteger = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const parseDatabaseUrl = (value) => {
    if (!value) return null;

    try {
        return new URL(value);
    } catch (error) {
        return null;
    }
};

const decodeEnvValue = (value) => {
    if (!value) return value;

    try {
        return decodeURIComponent(value);
    } catch (error) {
        return value;
    }
};

const normalizeDatabaseName = (pathname) => {
    const databaseName = String(pathname || '').replace(/^\/+/, '').trim();
    return databaseName || 'postgres';
};

const getSupabaseProjectRef = (hostname = '') => {
    const match = hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    return match ? match[1] : '';
};

const isSupabaseDirectHost = (hostname = '') => /^db\.[a-z0-9]+\.supabase\.co$/i.test(hostname);
const isSupabasePoolerHost = (hostname = '') => /\.pooler\.supabase\.com$/i.test(hostname);

const parsedDatabaseUrl = parseDatabaseUrl(process.env.DATABASE_URL);
const hasExplicitHost = Boolean(process.env.DB_HOST);
const shouldUseSupabasePooler =
    truthyValues.has(String(process.env.SUPABASE_USE_POOLER || '').toLowerCase()) ||
    Boolean(process.env.SUPABASE_POOLER_HOST || process.env.SUPABASE_REGION);

const buildDiscreteConfig = () => ({
    host: process.env.DB_HOST,
    port: parseInteger(process.env.DB_PORT, 5432),
    user: process.env.DB_USER || decodeEnvValue(parsedDatabaseUrl?.username) || 'postgres',
    password: process.env.DB_PASSWORD || decodeEnvValue(parsedDatabaseUrl?.password),
    database: process.env.DB_NAME || normalizeDatabaseName(parsedDatabaseUrl?.pathname),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    keepAlive: true
});

const buildSupabasePoolerConfig = () => {
    const projectRef = process.env.SUPABASE_PROJECT_REF || getSupabaseProjectRef(parsedDatabaseUrl?.hostname);
    const poolerHost =
        process.env.SUPABASE_POOLER_HOST ||
        (process.env.SUPABASE_REGION ? `aws-0-${process.env.SUPABASE_REGION}.pooler.supabase.com` : '');

    if (!projectRef || !poolerHost) {
        return null;
    }

    const poolerMode = String(process.env.SUPABASE_POOLER_MODE || 'session').toLowerCase();
    const defaultPort = poolerMode === 'transaction' ? 6543 : 5432;
    const baseUser = process.env.DB_USER || decodeEnvValue(parsedDatabaseUrl?.username) || 'postgres';
    const poolerUser =
        isSupabasePoolerHost(poolerHost) && !baseUser.includes('.')
            ? `${baseUser}.${projectRef}`
            : baseUser;

    return {
        host: poolerHost,
        port: parseInteger(process.env.DB_PORT, defaultPort),
        user: poolerUser,
        password: process.env.DB_PASSWORD || decodeEnvValue(parsedDatabaseUrl?.password),
        database: process.env.DB_NAME || normalizeDatabaseName(parsedDatabaseUrl?.pathname),
        ssl: useSsl ? { rejectUnauthorized: false } : false,
        keepAlive: true
    };
};

const buildConnectionStringConfig = () => ({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    keepAlive: true
});

let poolConfig;

if (hasExplicitHost) {
    poolConfig = buildDiscreteConfig();
} else if (shouldUseSupabasePooler) {
    poolConfig = buildSupabasePoolerConfig() || buildConnectionStringConfig();
} else {
    poolConfig = buildConnectionStringConfig();
}

const describeConnectionTarget = () => {
    if (poolConfig.host) {
        return `${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`;
    }

    if (parsedDatabaseUrl) {
        return `${parsedDatabaseUrl.hostname}:${parsedDatabaseUrl.port || '5432'}${parsedDatabaseUrl.pathname}`;
    }

    return 'DATABASE_URL veya DB_HOST tanimli degil';
};

const formatDbError = (error) => {
    const rawMessage = error?.message || 'Bilinmeyen veritabani hatasi';
    const hints = [];
    const directSupabaseHost = parsedDatabaseUrl?.hostname || '';
    const supabaseProjectRef = getSupabaseProjectRef(directSupabaseHost);

    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
        hints.push('DATABASE_URL veya DB_HOST tanimli degil.');
    }

    if (error?.code === 'ENOTFOUND' && isSupabaseDirectHost(directSupabaseHost) && !shouldUseSupabasePooler) {
        const poolerUserHint = supabaseProjectRef ? `postgres.${supabaseProjectRef}` : 'postgres.<project-ref>';
        hints.push(
            'Supabase direct DB hostu IPv6-only oldugu icin bu ortamda cozulmuyor. ' +
            'Mevcut DATABASE_URL kalabilir; Session Pooler icin SUPABASE_USE_POOLER=true ve ' +
            'SUPABASE_REGION=<bolge> ekle ya da SUPABASE_POOLER_HOST=aws-0-<bolge>.pooler.supabase.com kullan. ' +
            `Gerekirse DB_USER=${poolerUserHint} ve DB_PORT=5432 ayarla.`
        );
    }

    if (shouldUseSupabasePooler && !process.env.SUPABASE_POOLER_HOST && !process.env.SUPABASE_REGION) {
        hints.push('SUPABASE_USE_POOLER=true ise SUPABASE_REGION veya SUPABASE_POOLER_HOST de gerekli.');
    }

    if (error?.code === '28P01') {
        hints.push('Kullanici adi veya sifre hatali gorunuyor.');
    }

    if (isSupabasePoolerHost(poolConfig.host || '') && !String(poolConfig.user || '').includes('.')) {
        hints.push('Supabase pooler icin DB_USER genelde postgres.<project-ref> formatinda olmalidir.');
    }

    return hints.length > 0 ? `${rawMessage} | ${hints.join(' ')}` : rawMessage;
};

const pool = new Pool(poolConfig);

pool.on('connect', () => {
    console.log('PostgreSQL baglantisi hazir.');
});

pool.formatError = formatDbError;
pool.getTargetLabel = describeConnectionTarget;

module.exports = pool;
