require('dotenv').config({ quiet: true });

const { resolveStartupSafety } = require('../config/startupSafety');

const EXPECTED_TARGET = Object.freeze({
    host: '127.0.0.1',
    port: '55432',
    database: 'novastore_category_v2_test',
    user: 'novastore_test'
});

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
    const exactTarget =
        safety.target.host === EXPECTED_TARGET.host &&
        String(safety.target.port) === EXPECTED_TARGET.port &&
        safety.target.database === EXPECTED_TARGET.database &&
        env.DB_HOST === EXPECTED_TARGET.host &&
        String(env.DB_PORT) === EXPECTED_TARGET.port &&
        env.DB_NAME === EXPECTED_TARGET.database &&
        env.DB_USER === EXPECTED_TARGET.user &&
        env.DB_PASSWORD === 'novastore_test_only' &&
        String(env.DB_SSL).toLowerCase() === 'false' &&
        databaseUrl?.hostname === EXPECTED_TARGET.host &&
        databaseUrl?.port === EXPECTED_TARGET.port &&
        databaseUrl?.pathname === `/${EXPECTED_TARGET.database}` &&
        decodeURIComponent(databaseUrl?.username || '') === EXPECTED_TARGET.user &&
        decodeURIComponent(databaseUrl?.password || '') === 'novastore_test_only' &&
        String(env.SUPABASE_USE_POOLER || '').toLowerCase() === 'false' &&
        !env.SUPABASE_POOLER_HOST &&
        !env.SUPABASE_REGION &&
        !env.SUPABASE_PROJECT_REF;

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
    parseMode,
    assertSafeSeedTarget,
    main
};
