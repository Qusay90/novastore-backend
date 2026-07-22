const { spawnSync } = require('child_process');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const smokeTests = [
    'tests/startupSafetySmoke.js',
    'tests/socketAuthSmoke.js',
    'tests/sharedStateSmoke.js',
    'tests/paymentProviderConfigSmoke.js',
    'tests/categoryPlpStorefrontSmoke.js',
    'tests/stagingMigrationFoundationSmoke.js'
];

const smokeEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://novastore_ci:novastore_ci_only@127.0.0.1:55432/novastore_ci',
    DB_SSL: 'false',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    SUPABASE_USE_POOLER: 'false',
    SUPABASE_POOLER_HOST: '',
    SUPABASE_REGION: '',
    SUPABASE_PROJECT_REF: ''
};

for (const relativePath of smokeTests) {
    console.log(`\n[ci-smoke] Running ${relativePath}`);

    const result = spawnSync(process.execPath, [path.join(rootDir, relativePath)], {
        cwd: rootDir,
        env: smokeEnv,
        stdio: 'inherit'
    });

    if (result.error) {
        console.error(`[ci-smoke] Could not start ${relativePath}:`, result.error.message);
        process.exit(1);
    }

    if (result.status !== 0) {
        console.error(`[ci-smoke] Failed: ${relativePath} (exit ${result.status})`);
        process.exit(result.status || 1);
    }
}

console.log(`\n[ci-smoke] PASS: ${smokeTests.length} smoke tests completed.`);
