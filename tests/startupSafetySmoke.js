const assert = require('assert');
const {
    applyDevelopmentPreviewFallback,
    getDatabaseTarget,
    isSafeLocalDatabase,
    resolveStartupSafety
} = require('../config/startupSafety');

const baseEnv = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://user:password@localhost:5432/novastore_test',
    DB_SSL: 'false'
};

const localTarget = getDatabaseTarget(baseEnv);
assert.strictEqual(localTarget.host, 'localhost');
assert.strictEqual(localTarget.database, 'novastore_test');
assert.strictEqual(isSafeLocalDatabase(localTarget), true);

const safeSkip = resolveStartupSafety({
    ...baseEnv,
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    SKIP_SCHEMA_INIT: 'true'
});
assert.strictEqual(safeSkip.canStart, true);
assert.strictEqual(safeSkip.shouldRunSchemaInit, false);
assert.strictEqual(safeSkip.shouldVerifyDbConnection, true);

const safeSchema = resolveStartupSafety({
    ...baseEnv,
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'true'
});
assert.strictEqual(safeSchema.canStart, true);
assert.strictEqual(safeSchema.shouldRunSchemaInit, true);

const remoteSafe = resolveStartupSafety({
    NODE_ENV: 'test',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    SKIP_SCHEMA_INIT: 'true',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres',
    DB_SSL: 'true'
});
assert.strictEqual(remoteSafe.canStart, false);
assert(remoteSafe.errors.some((error) => /Safe local backend/i.test(error)));

const remoteDefault = resolveStartupSafety({
    NODE_ENV: 'development',
    SKIP_SCHEMA_INIT: 'true',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres'
});
assert.strictEqual(remoteDefault.canStart, false);
assert.strictEqual(remoteDefault.allowRemoteDatabase, false);
assert(remoteDefault.errors.some((error) => /Remote veritabani/i.test(error)));

const previewEnv = {
    NODE_ENV: 'development',
    NOVASTORE_LOCAL_PREVIEW: 'true',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres',
    SUPABASE_USE_POOLER: 'true',
    SUPABASE_REGION: 'ap-southeast-2'
};
const previewFallback = applyDevelopmentPreviewFallback(previewEnv);
assert.strictEqual(previewFallback.applied, true);
assert.strictEqual(previewFallback.originalTarget.isSupabaseHost, true);
assert.strictEqual(previewEnv.NOVASTORE_LOCAL_PREVIEW, 'true');
assert.strictEqual(previewEnv.SKIP_SCHEMA_INIT, 'true');
assert.strictEqual(previewEnv.NOVASTORE_ALLOW_SCHEMA_INIT, 'false');
assert.strictEqual(previewEnv.SUPABASE_USE_POOLER, 'false');
assert.strictEqual(previewEnv.NOVASTORE_ALLOW_REMOTE_DB, 'false');
assert.strictEqual(previewEnv.NOVASTORE_SAFE_LOCAL_BACKEND, 'false');
const previewTarget = getDatabaseTarget(previewEnv);
assert.strictEqual(previewTarget.isLocalHost, true);
assert.strictEqual(previewTarget.host, '127.0.0.1');
assert.strictEqual(String(previewTarget.port), '55432');
assert.strictEqual(previewTarget.database, 'novastore_preview');
const previewSafety = resolveStartupSafety(previewEnv);
assert.strictEqual(previewSafety.canStart, true);
assert.strictEqual(previewSafety.localPreviewMode, true);
assert.strictEqual(previewSafety.isPreviewSinkTarget, true);
assert.strictEqual(previewSafety.shouldRunSchemaInit, false);
assert.strictEqual(previewSafety.shouldVerifyDbConnection, false);

const previewNotRequested = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres',
    SKIP_SCHEMA_INIT: 'true'
};
assert.strictEqual(applyDevelopmentPreviewFallback(previewNotRequested).applied, false);
assert.strictEqual(resolveStartupSafety(previewNotRequested).canStart, false);

for (const nodeEnv of ['test', 'staging', 'production']) {
    const disallowedPreviewEnv = {
        NODE_ENV: nodeEnv,
        NOVASTORE_LOCAL_PREVIEW: 'true',
        DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres',
        SKIP_SCHEMA_INIT: 'true'
    };
    assert.strictEqual(applyDevelopmentPreviewFallback(disallowedPreviewEnv).applied, false);
    const disallowedSafety = resolveStartupSafety(disallowedPreviewEnv);
    assert.strictEqual(disallowedSafety.canStart, false);
    assert(disallowedSafety.errors.some((error) => /yalnizca acik NODE_ENV=development/i.test(error)));
}

const missingNodeEnvPreview = {
    NOVASTORE_LOCAL_PREVIEW: 'true',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres',
    SKIP_SCHEMA_INIT: 'true'
};
assert.strictEqual(applyDevelopmentPreviewFallback(missingNodeEnvPreview).applied, false);
const missingNodeEnvSafety = resolveStartupSafety(missingNodeEnvPreview);
assert.strictEqual(missingNodeEnvSafety.canStart, false);
assert(missingNodeEnvSafety.errors.some((error) => /yalnizca acik NODE_ENV=development/i.test(error)));

const conflictingPreviewEnv = {
    NODE_ENV: 'development',
    NOVASTORE_LOCAL_PREVIEW: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres',
    SKIP_SCHEMA_INIT: 'true'
};
assert.strictEqual(applyDevelopmentPreviewFallback(conflictingPreviewEnv).applied, false);
const conflictingPreviewSafety = resolveStartupSafety(conflictingPreviewEnv);
assert.strictEqual(conflictingPreviewSafety.canStart, false);
assert(conflictingPreviewSafety.errors.some((error) => /birlikte kullanilamaz/i.test(error)));

const nonSupabaseRemotePreview = {
    NODE_ENV: 'development',
    NOVASTORE_LOCAL_PREVIEW: 'true',
    DATABASE_URL: 'postgres://user:secret@remote.example:5432/novastore',
    SKIP_SCHEMA_INIT: 'true'
};
assert.strictEqual(applyDevelopmentPreviewFallback(nonSupabaseRemotePreview).applied, false);
assert.strictEqual(resolveStartupSafety(nonSupabaseRemotePreview).canStart, false);

const remoteOptIn = resolveStartupSafety({
    NODE_ENV: 'development',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres'
});
assert.strictEqual(remoteOptIn.canStart, true);
assert.strictEqual(remoteOptIn.allowRemoteDatabase, true);
assert.strictEqual(remoteOptIn.shouldRunSchemaInit, false);

const remotePoolerOverride = resolveStartupSafety({
    ...baseEnv,
    SUPABASE_USE_POOLER: 'true',
    SUPABASE_REGION: 'eu-central-1'
});
assert.strictEqual(remotePoolerOverride.canStart, false);
assert.strictEqual(remotePoolerOverride.target.isSupabaseHost, true);

const missingDatabase = resolveStartupSafety({
    NODE_ENV: 'development',
    SKIP_SCHEMA_INIT: 'true'
});
assert.strictEqual(missingDatabase.canStart, false);

const productionSchema = resolveStartupSafety({
    ...baseEnv,
    NODE_ENV: 'production',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'true'
});
assert.strictEqual(productionSchema.canStart, false);
assert(productionSchema.errors.some((error) => /Production/i.test(error)));

const defaultPostgres = resolveStartupSafety({
    NODE_ENV: 'test',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    DATABASE_URL: 'postgres://user:password@localhost:5432/postgres'
});
assert.strictEqual(defaultPostgres.canStart, false);

console.log('startup safety smoke passed');
