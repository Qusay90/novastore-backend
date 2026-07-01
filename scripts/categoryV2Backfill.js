const pool = require('../config/db');
const { resolveStartupSafety } = require('../config/startupSafety');
const { applyCategoryV2BackfillConstraints } = require('../models/categoryV2Schema');
const { runCategoryV2Backfill } = require('../services/categoryV2BackfillService');

const parseMode = (args) => {
    const supportedArgs = new Set(['--apply', '--dry-run']);
    const unknown = args.filter((arg) => !supportedArgs.has(arg));
    if (unknown.length > 0) {
        throw new Error(`Unknown arguments: ${unknown.join(', ')}`);
    }
    if (args.includes('--apply') && args.includes('--dry-run')) {
        throw new Error('Choose either --apply or --dry-run.');
    }
    return args.includes('--apply') ? 'apply' : 'dry-run';
};

const assertSafeTarget = (mode) => {
    const safety = resolveStartupSafety(process.env);
    if (!safety.canStart || !safety.safeLocalDatabase || safety.target.isSupabaseHost) {
        throw new Error(`Category backfill refused unsafe target: ${safety.target.label}`);
    }
    if (safety.target.database !== 'novastore_category_v2_test') {
        throw new Error('Category backfill is restricted to novastore_category_v2_test in Tur 2.');
    }
    if (mode === 'apply' && !safety.shouldRunSchemaInit) {
        throw new Error('Apply mode requires NOVASTORE_ALLOW_SCHEMA_INIT=true and SKIP_SCHEMA_INIT=false.');
    }
    return safety;
};

(async () => {
    const mode = parseMode(process.argv.slice(2));
    const safety = assertSafeTarget(mode);

    if (mode === 'apply') {
        await applyCategoryV2BackfillConstraints(pool);
    }

    const report = await runCategoryV2Backfill(pool, { apply: mode === 'apply' });
    console.log(JSON.stringify({
        target: safety.target.label,
        ...report
    }, null, 2));
})().catch((error) => {
    console.error(JSON.stringify({
        error: error.message,
        code: error.code || null,
        issues: error.issues || []
    }, null, 2));
    process.exitCode = 1;
}).finally(async () => {
    await pool.end();
});
