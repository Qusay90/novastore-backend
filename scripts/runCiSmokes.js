const { spawnSync } = require('child_process');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const smokeTests = [
    'tests/startupSafetySmoke.js',
    'tests/socketAuthSmoke.js',
    'tests/sharedStateSmoke.js',
    'tests/paymentProviderConfigSmoke.js',
    'tests/categoryPlpStorefrontSmoke.js'
];

for (const relativePath of smokeTests) {
    console.log(`\n[ci-smoke] Running ${relativePath}`);

    const result = spawnSync(process.execPath, [path.join(rootDir, relativePath)], {
        cwd: rootDir,
        env: {
            ...process.env,
            NODE_ENV: 'test'
        },
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
