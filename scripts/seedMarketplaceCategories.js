require('dotenv').config({ quiet: true });

const { resolveStartupSafety } = require('../config/startupSafety');

const EXPECTED_TARGET = Object.freeze({
    protocol: 'postgresql:',
    host: '127.0.0.1',
    database: 'novastore_category_v2_test'
});
const MIN_TEST_PORT = 1024;
const MAX_TEST_PORT = 65535;

const decodeUrlCredential = (value) => {
    try {
        return decodeURIComponent(value || '');
    } catch (_) {
        return null;
    }
};

const isBlank = (value) => String(value || '').trim() === '';

const parseMode = (args = []) => {
    const supported = new Set(['--apply', '--dry-run']);
    const unknown = args.filter((arg) => !supported.has(arg));
    if (unknown.length > 0) {
        throw new Error(`Unknown arguments: ${unknown.join(', ')}`);
    }
    if (args.includes('--apply') && args.includes('--dry-run')) {
        throw new Error('Choose either --apply or --dry-run.');
    }
    return args.includes('--apply') ? 'apply' : 'dry-run';
};

const assertSafeSeedTarget = (env = process.env) => {
    const safety = resolveStartupSafety(env);
    let databaseUrl;
    try {
        databaseUrl = new URL(env.DATABASE_URL);
    } catch (_) {
        databaseUrl = null;
    }
    const urlPort = databaseUrl?.port || '';
    const parsedPort = Number(urlPort);
    const urlDatabase = String(databaseUrl?.pathname || '').replace(/^\/+/, '');
    const urlUser = decodeUrlCredential(databaseUrl?.username);
    const urlPassword = decodeUrlCredential(databaseUrl?.password);
    const hasValidExplicitPort =
        /^\d+$/.test(urlPort) &&
        Number.isInteger(parsedPort) &&
        parsedPort >= MIN_TEST_PORT &&
        parsedPort <= MAX_TEST_PORT;
    const exactTarget =
        databaseUrl?.protocol === EXPECTED_TARGET.protocol &&
        safety.target.host === EXPECTED_TARGET.host &&
        databaseUrl?.hostname === EXPECTED_TARGET.host &&
        env.DB_HOST === EXPECTED_TARGET.host &&
        hasValidExplicitPort &&
        String(safety.target.port) === urlPort &&
        String(env.DB_PORT || '') === urlPort &&
        safety.target.database === EXPECTED_TARGET.database &&
        env.DB_NAME === EXPECTED_TARGET.database &&
        urlDatabase === EXPECTED_TARGET.database &&
        urlUser !== null &&
        urlPassword !== null &&
        urlUser.length > 0 &&
        urlPassword.length > 0 &&
        env.DB_USER === urlUser &&
        env.DB_PASSWORD === urlPassword &&
        String(env.NODE_ENV || '').trim().toLowerCase() === 'test' &&
        String(env.NOVASTORE_SAFE_LOCAL_BACKEND || '').trim().toLowerCase() === 'true' &&
        String(env.NOVASTORE_ALLOW_REMOTE_DB || '').trim().toLowerCase() === 'false' &&
        String(env.DB_SSL).toLowerCase() === 'false' &&
        String(env.SUPABASE_USE_POOLER || '').toLowerCase() === 'false' &&
        isBlank(env.SUPABASE_POOLER_HOST) &&
        isBlank(env.SUPABASE_REGION) &&
        isBlank(env.SUPABASE_PROJECT_REF) &&
        isBlank(env.PGHOST) &&
        isBlank(env.PGPORT) &&
        isBlank(env.PGDATABASE) &&
        isBlank(env.PGUSER) &&
        isBlank(env.PGPASSWORD) &&
        String(env.SKIP_SCHEMA_INIT || '').trim().toLowerCase() === 'true' &&
        String(env.NOVASTORE_ALLOW_SCHEMA_INIT || '').trim().toLowerCase() === 'false';

    if (
        !safety.canStart ||
        !safety.safeLocalMode ||
        !safety.safeLocalDatabase ||
        safety.allowRemoteDatabase ||
        safety.target.isSupabaseHost ||
        !exactTarget
    ) {
        throw new Error(`Marketplace category seed refused unsafe target: ${safety.target.label}`);
    }
    if (!safety.skipSchemaInit || safety.allowSchemaInit) {
        throw new Error('Marketplace category seed requires SKIP_SCHEMA_INIT=true and schema init disabled.');
    }
    return safety;
};

const main = async () => {
    const mode = parseMode(process.argv.slice(2));
    const safety = assertSafeSeedTarget(process.env);

    // Load the database driver only after the exact local-only preflight passes.
    const pool = require('../config/db');
    const { runMarketplaceCategorySeed } = require('../services/marketplaceCategorySeedService');
    try {
        const report = await runMarketplaceCategorySeed(pool, { apply: mode === 'apply' });
        console.log(JSON.stringify({
            target: safety.target.label,
            ...report
        }, null, 2));
    } finally {
        await pool.end();
    }
};

if (require.main === module) {
    main().catch((error) => {
        console.error(JSON.stringify({
            error: error.message,
            code: error.code || null,
            report: error.report || null
        }, null, 2));
        process.exitCode = 1;
    });
}

module.exports = {
    EXPECTED_TARGET,
    MIN_TEST_PORT,
    MAX_TEST_PORT,
    parseMode,
    assertSafeSeedTarget,
    main
};
