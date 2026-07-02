const assert = require('assert');
const {
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
