const assert = require('node:assert/strict');
const {
    REMOTE_DATABASE_OVERRIDE_NAMES,
    applyDevelopmentPreviewFallback,
    getDatabaseTarget,
    isSafeLocalDatabase,
    resolveDatabaseTarget,
    resolveStartupSafety
} = require('../config/startupSafety');
const {
    StagingReleaseContractError,
    validateStagingReleaseEnvironment
} = require('../config/stagingReleaseContract');

const baseEnv = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://user:password@localhost:5432/novastore_test',
    DB_SSL: 'false'
};

const validRemoteUrl = (
    'postgresql://synthetic-user@staging-db.example.test/' +
    'novastore_staging?sslmode=verify-full'
);

const validStagingEnvironment = () => ({
    NODE_ENV: 'production',
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    NOVASTORE_EXPECTED_DATABASE_HOST: 'staging-db.example.test',
    NOVASTORE_EXPECTED_DATABASE_NAME: 'novastore_staging',
    DATABASE_URL: validRemoteUrl,
    NOVASTORE_STAGING_ACCESS_GATE_ENABLED: 'true',
    NOVASTORE_STAGING_ACCESS_USERNAME: 'synthetic-release-operator',
    NOVASTORE_STAGING_ACCESS_PASSWORD_HASH: `$2b$12$${'A'.repeat(53)}`,
    NOVASTORE_STAGING_ACCESS_SESSION_SECRET: 'synthetic-access-session-marker-not-for-reuse',
    NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED: 'true',
    NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED: 'false',
    NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED: 'false',
    NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED: 'false',
    NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED: 'false',
    AI_PROVIDER: 'mock',
    AI_PROVIDER_FALLBACK_ENABLED: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    JWT_SECRET: 'synthetic-jwt-secret-marker-not-for-reuse'
});

const expectTargetCode = (environment, code) => {
    const target = resolveDatabaseTarget(environment);
    assert.equal(target.attested, false, code);
    assert(target.errorCodes.includes(code), `${code}: ${target.errorCodes.join(', ')}`);
    return target;
};

const localTarget = getDatabaseTarget(baseEnv);
assert.equal(localTarget.host, 'localhost');
assert.equal(localTarget.database, 'novastore_test');
assert.equal(localTarget.local, true);
assert.equal(isSafeLocalDatabase(localTarget), true);

const legacyLocalMaintenanceFallback = resolveStartupSafety({
    NODE_ENV: 'development',
    DB_HOST: '127.0.0.1',
    SKIP_SCHEMA_INIT: 'true'
});
assert.equal(legacyLocalMaintenanceFallback.canStart, true);
assert.equal(legacyLocalMaintenanceFallback.target.database, 'postgres');
assert(legacyLocalMaintenanceFallback.target.poolConfig);
assert.equal(legacyLocalMaintenanceFallback.safeLocalDatabase, false);

const safeSkip = resolveStartupSafety({
    ...baseEnv,
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    SKIP_SCHEMA_INIT: 'true'
});
assert.equal(safeSkip.canStart, true);
assert.equal(safeSkip.shouldRunSchemaInit, false);
assert.equal(safeSkip.shouldVerifyDbConnection, true);

const safeSchema = resolveStartupSafety({
    ...baseEnv,
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'true'
});
assert.equal(safeSchema.canStart, true);
assert.equal(safeSchema.shouldRunSchemaInit, true);

const remoteSafe = resolveStartupSafety({
    NODE_ENV: 'test',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    SKIP_SCHEMA_INIT: 'true',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres',
    DB_SSL: 'true'
});
assert.equal(remoteSafe.canStart, false);
assert(remoteSafe.errors.some((error) => /Safe local backend/i.test(error)));

const remoteDefault = resolveStartupSafety({
    NODE_ENV: 'development',
    SKIP_SCHEMA_INIT: 'true',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres'
});
assert.equal(remoteDefault.canStart, false);
assert.equal(remoteDefault.allowRemoteDatabase, false);
assert(remoteDefault.errors.some((error) => /Remote veritabani/i.test(error)));

const previewEnv = {
    NODE_ENV: 'development',
    NOVASTORE_LOCAL_PREVIEW: 'true',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres',
    SUPABASE_USE_POOLER: 'true',
    SUPABASE_REGION: 'ap-southeast-2'
};
const previewFallback = applyDevelopmentPreviewFallback(previewEnv);
assert.equal(previewFallback.applied, true);
assert.equal(previewFallback.originalTarget.isSupabaseHost, true);
assert.equal(previewEnv.NOVASTORE_LOCAL_PREVIEW, 'true');
assert.equal(previewEnv.SKIP_SCHEMA_INIT, 'true');
assert.equal(previewEnv.NOVASTORE_ALLOW_SCHEMA_INIT, 'false');
assert.equal(previewEnv.SUPABASE_USE_POOLER, 'false');
assert.equal(previewEnv.NOVASTORE_SAFE_LOCAL_BACKEND, 'false');
const previewTarget = getDatabaseTarget(previewEnv);
assert.equal(previewTarget.isLocalHost, true);
assert.equal(previewTarget.host, '127.0.0.1');
assert.equal(String(previewTarget.port), '55432');
assert.equal(previewTarget.database, 'novastore_preview');
const previewSafety = resolveStartupSafety(previewEnv);
assert.equal(previewSafety.canStart, true);
assert.equal(previewSafety.localPreviewMode, true);
assert.equal(previewSafety.isPreviewSinkTarget, true);
assert.equal(previewSafety.shouldRunSchemaInit, false);
assert.equal(previewSafety.shouldVerifyDbConnection, false);

const previewNotRequested = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres',
    SKIP_SCHEMA_INIT: 'true'
};
assert.equal(applyDevelopmentPreviewFallback(previewNotRequested).applied, false);
assert.equal(resolveStartupSafety(previewNotRequested).canStart, false);

for (const nodeEnv of ['test', 'staging', 'production']) {
    const disallowedPreviewEnv = {
        NODE_ENV: nodeEnv,
        NOVASTORE_LOCAL_PREVIEW: 'true',
        DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres',
        SKIP_SCHEMA_INIT: 'true'
    };
    assert.equal(applyDevelopmentPreviewFallback(disallowedPreviewEnv).applied, false);
    const disallowedSafety = resolveStartupSafety(disallowedPreviewEnv);
    assert.equal(disallowedSafety.canStart, false);
    assert(disallowedSafety.errors.some((error) => /yalnizca acik NODE_ENV=development/i.test(error)));
}

const missingNodeEnvPreview = {
    NOVASTORE_LOCAL_PREVIEW: 'true',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres',
    SKIP_SCHEMA_INIT: 'true'
};
assert.equal(applyDevelopmentPreviewFallback(missingNodeEnvPreview).applied, false);
const missingNodeEnvSafety = resolveStartupSafety(missingNodeEnvPreview);
assert.equal(missingNodeEnvSafety.canStart, false);
assert(missingNodeEnvSafety.errors.some((error) => /yalnizca acik NODE_ENV=development/i.test(error)));

const conflictingPreviewEnv = {
    NODE_ENV: 'development',
    NOVASTORE_LOCAL_PREVIEW: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres',
    SKIP_SCHEMA_INIT: 'true'
};
assert.equal(applyDevelopmentPreviewFallback(conflictingPreviewEnv).applied, false);
const conflictingPreviewSafety = resolveStartupSafety(conflictingPreviewEnv);
assert.equal(conflictingPreviewSafety.canStart, false);
assert(conflictingPreviewSafety.errors.some((error) => /birlikte kullanilamaz/i.test(error)));

const nonSupabaseRemotePreview = {
    NODE_ENV: 'development',
    NOVASTORE_LOCAL_PREVIEW: 'true',
    DATABASE_URL: 'postgres://user:secret@remote.example:5432/novastore',
    SKIP_SCHEMA_INIT: 'true'
};
assert.equal(applyDevelopmentPreviewFallback(nonSupabaseRemotePreview).applied, false);
assert.equal(resolveStartupSafety(nonSupabaseRemotePreview).canStart, false);

const oldUnauditedRemoteOptIn = resolveStartupSafety({
    NODE_ENV: 'development',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    DATABASE_URL: 'postgres://postgres:secret@db.projectref.supabase.co:5432/postgres'
});
assert.equal(oldUnauditedRemoteOptIn.canStart, false);
assert.equal(oldUnauditedRemoteOptIn.target.remoteRelease, true);
assert(
    oldUnauditedRemoteOptIn.errors.some((error) => /attestation\/TLS validation failed/i)
);

const stagingRemote = resolveStartupSafety(validStagingEnvironment());
assert.equal(stagingRemote.canStart, true);
assert.equal(stagingRemote.target.remoteRelease, true);
assert.equal(stagingRemote.target.attested, true);
assert.equal(stagingRemote.target.tlsEnabled, true);
assert.equal(stagingRemote.target.tlsVerified, true);
assert.equal(stagingRemote.target.poolConfig.ssl.rejectUnauthorized, true);
assert.equal(Object.getPrototypeOf(stagingRemote.target.poolConfig), null);
assert.equal(Object.getPrototypeOf(stagingRemote.target.poolConfig.ssl), null);
assert.equal(stagingRemote.shouldVerifyDbConnection, true);

const stagingReleaseEnvironment = {
    ...validStagingEnvironment(),
    NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
    RENDER_GIT_COMMIT: 'a'.repeat(40)
};
assert.equal(validateStagingReleaseEnvironment(stagingReleaseEnvironment).databaseMode, 'staging');
const productionNamedStagingTarget = {
    ...stagingReleaseEnvironment,
    NOVASTORE_EXPECTED_DATABASE_NAME: 'novastore_production',
    DATABASE_URL:
        'postgresql://synthetic-user@staging-db.example.test/' +
        'novastore_production?sslmode=verify-full'
};
assert.throws(
    () => validateStagingReleaseEnvironment(productionNamedStagingTarget),
    (error) => (
        error instanceof StagingReleaseContractError &&
        error.code === 'REMOTE_STAGING_TARGET_REQUIRED'
    )
);
assert.throws(
    () => validateStagingReleaseEnvironment(
        stagingReleaseEnvironment,
        { allowBootstrapCapability: true }
    ),
    (error) => (
        error instanceof StagingReleaseContractError &&
        error.code === 'BOOTSTRAP_CAPABILITY_NOT_AUTHORIZED'
    )
);
const bootstrapStagingReleaseEnvironment = {
    ...stagingReleaseEnvironment,
    NOVASTORE_STAGING_BOOTSTRAP_ENABLED: 'true'
};
assert.equal(
    validateStagingReleaseEnvironment(
        bootstrapStagingReleaseEnvironment,
        { allowBootstrapCapability: true }
    ).bootstrapCapabilityAuthorized,
    true
);
assert.throws(
    () => validateStagingReleaseEnvironment(bootstrapStagingReleaseEnvironment),
    (error) => (
        error instanceof StagingReleaseContractError &&
        error.code === 'BOOTSTRAP_CAPABILITY_NOT_AUTHORIZED'
    )
);

const productionRemote = resolveStartupSafety({
    NODE_ENV: 'production',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    NOVASTORE_EXPECTED_DATABASE_HOST: 'production-db.example.test',
    NOVASTORE_EXPECTED_DATABASE_NAME: 'novastore_production',
    DATABASE_URL:
        'postgresql://synthetic-user@production-db.example.test/' +
        'novastore_production?sslmode=verify-full'
});
assert.equal(productionRemote.canStart, true);
assert.equal(productionRemote.target.remoteRelease, true);
assert.equal(productionRemote.target.attested, true);
assert.equal(productionRemote.target.poolConfig.ssl.rejectUnauthorized, true);

const localWithRemoteCapability = resolveStartupSafety({
    ...baseEnv,
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    SKIP_SCHEMA_INIT: 'true'
});
assert.equal(localWithRemoteCapability.canStart, true);
assert.equal(localWithRemoteCapability.target.local, true);
assert.equal(localWithRemoteCapability.target.remoteRelease, false);

const remotePoolerOverride = resolveStartupSafety({
    ...baseEnv,
    SUPABASE_USE_POOLER: 'true',
    SUPABASE_REGION: 'eu-central-1'
});
assert.equal(remotePoolerOverride.canStart, false);
assert.equal(remotePoolerOverride.target.isSupabaseHost, true);

const hermeticStagingLocal = resolveStartupSafety({
    ...baseEnv,
    DB_HOST: '127.0.0.1',
    DB_PORT: '5432',
    DB_NAME: 'novastore_hermetic_test',
    DB_USER: 'novastore_test',
    DB_PASSWORD: 'novastore_test_only',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_STAGING_ACCESS_GATE_ENABLED: 'true',
    NOVASTORE_STAGING_ACCESS_USERNAME: 'synthetic-test-operator',
    NOVASTORE_STAGING_ACCESS_PASSWORD_HASH: `$2b$12$${'A'.repeat(53)}`,
    NOVASTORE_STAGING_ACCESS_SESSION_SECRET: 'synthetic-staging-session-secret-for-tests',
    NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED: 'true',
    NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED: 'false',
    NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED: 'false',
    NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED: 'false',
    NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED: 'false',
    AI_PROVIDER: 'mock',
    AI_PROVIDER_FALLBACK_ENABLED: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false'
});
assert.equal(hermeticStagingLocal.canStart, true);
assert.equal(hermeticStagingLocal.target.remoteRelease, false);
assert.equal(hermeticStagingLocal.target.local, true);

const missingDatabase = resolveStartupSafety({
    NODE_ENV: 'development',
    SKIP_SCHEMA_INIT: 'true'
});
assert.equal(missingDatabase.canStart, false);

const productionSchema = resolveStartupSafety({
    ...baseEnv,
    NODE_ENV: 'production',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'true'
});
assert.equal(productionSchema.canStart, false);
assert(productionSchema.errors.some((error) => /Production/i.test(error)));

const defaultPostgres = resolveStartupSafety({
    NODE_ENV: 'test',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    DATABASE_URL: 'postgres://user:password@localhost:5432/postgres'
});
assert.equal(defaultPostgres.canStart, false);

const remoteNegativeCases = [
    ['missing expected host', (env) => { delete env.NOVASTORE_EXPECTED_DATABASE_HOST; }, 'EXPECTED_DATABASE_HOST_REQUIRED'],
    ['missing expected database', (env) => { delete env.NOVASTORE_EXPECTED_DATABASE_NAME; }, 'EXPECTED_DATABASE_NAME_REQUIRED'],
    ['malformed URL', (env) => { env.DATABASE_URL = 'not-a-database-url'; }, 'REMOTE_DATABASE_URL_REQUIRED'],
    ['host mismatch', (env) => { env.NOVASTORE_EXPECTED_DATABASE_HOST = 'other-db.example.test'; }, 'DATABASE_HOST_ATTESTATION_MISMATCH'],
    ['database mismatch', (env) => { env.NOVASTORE_EXPECTED_DATABASE_NAME = 'other_database'; }, 'DATABASE_NAME_ATTESTATION_MISMATCH'],
    ['raw IPv4 host', (env) => {
        env.NOVASTORE_EXPECTED_DATABASE_HOST = '203.0.113.10';
        env.DATABASE_URL = 'postgresql://synthetic-user@203.0.113.10/novastore_staging?sslmode=verify-full';
    }, 'REMOTE_DATABASE_HOST_NOT_DNS'],
    ['numeric IPv4 shorthand', (env) => {
        env.NOVASTORE_EXPECTED_DATABASE_HOST = '127.0.1';
        env.DATABASE_URL = 'postgresql://synthetic-user@127.0.1/novastore_staging?sslmode=verify-full';
    }, 'REMOTE_DATABASE_HOST_NOT_DNS'],
    ['numeric IPv4 octal lookalike', (env) => {
        env.NOVASTORE_EXPECTED_DATABASE_HOST = '0177.0.0.1';
        env.DATABASE_URL = 'postgresql://synthetic-user@0177.0.0.1/novastore_staging?sslmode=verify-full';
    }, 'REMOTE_DATABASE_HOST_NOT_DNS'],
    ['numeric IPv4 hexadecimal lookalike', (env) => {
        env.NOVASTORE_EXPECTED_DATABASE_HOST = '0x7f.0.0.1';
        env.DATABASE_URL = 'postgresql://synthetic-user@0x7f.0.0.1/novastore_staging?sslmode=verify-full';
    }, 'REMOTE_DATABASE_HOST_NOT_DNS'],
    ['numeric IPv4 padded lookalike', (env) => {
        env.NOVASTORE_EXPECTED_DATABASE_HOST = '001.002.003.004';
        env.DATABASE_URL = 'postgresql://synthetic-user@001.002.003.004/novastore_staging?sslmode=verify-full';
    }, 'REMOTE_DATABASE_HOST_NOT_DNS'],
    ['missing sslmode', (env) => {
        env.DATABASE_URL = 'postgresql://synthetic-user@staging-db.example.test/novastore_staging';
    }, 'REMOTE_TLS_QUERY_INVALID'],
    ['sslmode require', (env) => {
        env.DATABASE_URL =
            'postgresql://synthetic-user@staging-db.example.test/novastore_staging?sslmode=require';
    }, 'REMOTE_TLS_QUERY_INVALID'],
    ['sslmode disable', (env) => {
        env.DATABASE_URL =
            'postgresql://synthetic-user@staging-db.example.test/novastore_staging?sslmode=disable';
    }, 'REMOTE_TLS_QUERY_INVALID'],
    ['extra URL option', (env) => {
        env.DATABASE_URL =
            'postgresql://synthetic-user@staging-db.example.test/' +
            'novastore_staging?sslmode=verify-full&application_name=test';
    }, 'REMOTE_TLS_QUERY_INVALID']
];

for (const [name, mutate, code] of remoteNegativeCases) {
    const environment = validStagingEnvironment();
    mutate(environment);
    expectTargetCode(environment, code);
    assert.equal(resolveStartupSafety(environment).canStart, false, name);
}

for (const name of REMOTE_DATABASE_OVERRIDE_NAMES) {
    const environment = validStagingEnvironment();
    Object.defineProperty(environment, name, {
        configurable: true,
        enumerable: true,
        get() {
            throw new Error(`forbidden getter read: ${name}`);
        }
    });
    const target = expectTargetCode(environment, 'REMOTE_DATABASE_OVERRIDE_PRESENT');
    assert.equal(target.poolConfig, undefined, name);
    assert.equal(resolveStartupSafety(environment).canStart, false, name);
}

assert.equal(REMOTE_DATABASE_OVERRIDE_NAMES.includes('DB_SSL'), true);
assert.equal(REMOTE_DATABASE_OVERRIDE_NAMES.includes('PGUSER'), true);
assert.equal(REMOTE_DATABASE_OVERRIDE_NAMES.includes('PGPASSWORD'), true);

const explicitWeakTlsOverride = validStagingEnvironment();
explicitWeakTlsOverride.DB_SSL = 'false';
expectTargetCode(explicitWeakTlsOverride, 'REMOTE_DATABASE_OVERRIDE_PRESENT');
assert.equal(resolveStartupSafety(explicitWeakTlsOverride).canStart, false);

const inheritedPasswordOverride = validStagingEnvironment();
Object.defineProperty(Object.prototype, 'PGPASSWORD', {
    configurable: true,
    value: 'synthetic-ambient-password-not-for-use'
});
try {
    expectTargetCode(inheritedPasswordOverride, 'REMOTE_DATABASE_OVERRIDE_PRESENT');
    assert.equal(resolveStartupSafety(inheritedPasswordOverride).canStart, false);
} finally {
    delete Object.prototype.PGPASSWORD;
}

Object.defineProperty(Object.prototype, 'connectionString', {
    configurable: true,
    value:
        'postgresql://attacker@evil-db.example.test/' +
        'evil_database?sslmode=no-verify'
});
try {
    const prototypeSafeTarget = resolveDatabaseTarget(validStagingEnvironment());
    assert.equal(prototypeSafeTarget.attested, true);
    assert.equal(Object.getPrototypeOf(prototypeSafeTarget.poolConfig), null);
    const { Client } = require('pg');
    const client = new Client(prototypeSafeTarget.poolConfig);
    assert.equal(client.connectionParameters.host, 'staging-db.example.test');
    assert.equal(client.connectionParameters.database, 'novastore_staging');
    assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true);
    assert.equal(typeof client.connectionParameters.password, 'function');
} finally {
    delete Object.prototype.connectionString;
}

const ambientMutationNames = [
    'PGOPTIONS',
    'PGREPLICATION',
    'PGSSLNEGOTIATION',
    'PGAPPNAME',
    'PGCLIENT_ENCODING',
    'PGCONNECT_TIMEOUT',
    'PGPASSWORD'
];
const previousAmbientValues = new Map(ambientMutationNames.map((name) => [
    name,
    {
        present: Object.prototype.hasOwnProperty.call(process.env, name),
        value: process.env[name]
    }
]));
try {
    Object.assign(process.env, {
        PGOPTIONS: '-c search_path=attacker_schema',
        PGREPLICATION: 'database',
        PGSSLNEGOTIATION: 'direct',
        PGAPPNAME: 'attacker-application',
        PGCLIENT_ENCODING: 'LATIN1',
        PGCONNECT_TIMEOUT: '1',
        PGPASSWORD: 'synthetic-ambient-password-not-for-use'
    });
    const pinnedTarget = resolveDatabaseTarget(validStagingEnvironment());
    // This target was deliberately resolved from a clean environment object;
    // later global pg mutations must still be ignored by its Pool config.
    assert.equal(pinnedTarget.attested, true);
    const { Pool } = require('pg');
    const pinnedPool = new Pool(pinnedTarget.poolConfig);
    Object.setPrototypeOf(pinnedPool.options, null);
    const effectiveClient = new pinnedPool.Client(pinnedPool.options);
    assert.equal(effectiveClient.connectionParameters.host, 'staging-db.example.test');
    assert.equal(effectiveClient.connectionParameters.database, 'novastore_staging');
    assert.equal(effectiveClient.connectionParameters.options, '-c search_path=pg_catalog,public');
    assert.equal(effectiveClient.connectionParameters.replication, 'false');
    assert.equal(effectiveClient.connectionParameters.sslnegotiation, 'postgres');
    assert.equal(effectiveClient.connectionParameters.application_name, 'novastore_runtime');
    assert.equal(effectiveClient.connectionParameters.client_encoding, 'UTF8');
    assert.equal(effectiveClient.connectionParameters.connect_timeout, 10);
    assert.equal(effectiveClient.connectionParameters.ssl.rejectUnauthorized, true);
    void pinnedPool.end();
} finally {
    for (const [name, previous] of previousAmbientValues) {
        if (previous.present) process.env[name] = previous.value;
        else delete process.env[name];
    }
}

const publicRemoteTarget = resolveDatabaseTarget(validStagingEnvironment());
assert.deepEqual(
    Object.keys(publicRemoteTarget).sort(),
    [
        'attested',
        'database',
        'errorCodes',
        'hasDatabaseConfig',
        'host',
        'isLocalHost',
        'isSupabaseHost',
        'label',
        'local',
        'port',
        'remoteRelease',
        'tlsEnabled',
        'tlsVerified'
    ]
);
assert.equal(JSON.stringify(publicRemoteTarget).includes('synthetic-user'), false);
assert.equal(JSON.stringify(publicRemoteTarget).includes('password'), false);
assert.equal(JSON.stringify(publicRemoteTarget).includes('DATABASE_URL'), false);

console.log(
    `startup safety smoke passed: remote-negative=${remoteNegativeCases.length} ` +
    `override-negative=${REMOTE_DATABASE_OVERRIDE_NAMES.length} local-preview=PASS`
);
