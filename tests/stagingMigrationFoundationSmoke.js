const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const manifest = require('../scripts/staging-migrations/manifest.json');
const {
    loadRegistry,
    sha256,
    stripTransactionWrapper,
    validateManifest
} = require('../scripts/staging-migrations/registry');
const {
    LOCAL_TEST_CAPABILITY,
    redact,
    validateTarget
} = require('../scripts/staging-migrations/guard');
const { runPlan, runStatus } = require('../scripts/staging-migrations/runner');

const root = path.join(__dirname, '..');
const localDatabaseName = 'novastore_p4d1a_foundation_test';
const localEnv = {
    NODE_ENV: 'test',
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    NOVASTORE_EXPECTED_DATABASE_HOST: '127.0.0.1',
    NOVASTORE_EXPECTED_DATABASE_NAME: localDatabaseName,
    [LOCAL_TEST_CAPABILITY]: 'true',
    DATABASE_URL: `postgresql://127.0.0.1/${localDatabaseName}`
};

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

(async () => {
    assert.equal(validateManifest(manifest), true);
    const registry = loadRegistry();
    assert.equal(registry.length, 15);
    assert.equal(registry[0].id, '20260628_staging_schema_baseline');
    assert.equal(registry.at(-1).id, '20260721_auth_session_registry');
    assert.deepEqual(
        registry.filter((entry) => entry.id.startsWith('20260712_')).map((entry) => entry.path),
        [
            'migrations/20260712_admin_notifications_foundation.sql',
            'migrations/20260712_admin_returns_foundation.sql',
            'migrations/20260712_admin_analytics_foundation.sql'
        ]
    );
    assert.equal(new Set(registry.map((entry) => entry.id)).size, registry.length);
    assert.equal(new Set(registry.map((entry) => entry.path)).size, registry.length);
    assert.equal(registry.filter((entry) => entry.transactionWrapper).length, 9);

    const duplicate = manifest.map((entry) => ({ ...entry }));
    duplicate[1].id = duplicate[0].id;
    assert.throws(() => validateManifest(duplicate), /order|duplicate/i);
    const traversal = manifest.map((entry) => ({ ...entry }));
    traversal[0].path = 'migrations/../outside.sql';
    assert.throws(() => validateManifest(traversal), /invalid migration path/i);
    const rawChecksumMismatch = manifest.map((entry) => ({ ...entry }));
    rawChecksumMismatch[0].sha256 = '0'.repeat(64);
    assert.throws(() => loadRegistry({ manifest: rawChecksumMismatch }), /checksum mismatch/i);
    assert.throws(
        () => stripTransactionWrapper('SELECT 1;\n', 'unit_wrapper'),
        /wrapper does not match/i
    );

    for (const migration of registry) {
        const bytes = fs.readFileSync(migration.absolutePath);
        assert.equal(bytes.includes(0x0d), false, `${migration.path} contains CR bytes`);
        assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
        assert.equal(sha256(bytes), migration.sha256);
    }

    const attributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
    assert.match(attributes, /^\/migrations\/\*\.sql text eol=lf$/m);
    const attrResult = spawnSync(
        'git',
        ['check-attr', 'text', 'eol', '--', ...registry.map((entry) => entry.path)],
        { cwd: root, encoding: 'utf8' }
    );
    assert.equal(attrResult.status, 0, attrResult.stderr);
    assert.equal((attrResult.stdout.match(/: text: set/g) || []).length, registry.length);
    assert.equal((attrResult.stdout.match(/: eol: lf/g) || []).length, registry.length);

    for (const migration of registry) {
        let blob = spawnSync('git', ['show', `:${migration.path}`], {
            cwd: root,
            encoding: null,
            maxBuffer: 2 * 1024 * 1024
        });
        if (blob.status !== 0) {
            blob = spawnSync('git', ['show', `HEAD:${migration.path}`], {
                cwd: root,
                encoding: null,
                maxBuffer: 2 * 1024 * 1024
            });
        }
        assert.equal(blob.status, 0, String(blob.stderr || ''));
        assert.equal(hash(blob.stdout), migration.sha256, `${migration.path} differs from its Git blob`);
    }

    const baseline = fs.readFileSync(path.join(root, registry[0].path), 'utf8');
    assert.doesNotMatch(baseline, /^\s*(?:INSERT|UPDATE|DELETE\s+FROM|TRUNCATE)\b/im);
    assert.doesNotMatch(baseline, /@|https?:\/\//i);

    const target = validateTarget(localEnv);
    assert.equal(target.localTest, true);
    assert.equal(target.database, localDatabaseName);
    assert.throws(() => validateTarget({ ...localEnv, NOVASTORE_DEPLOY_ENV: '' }), /must be exactly staging/i);
    assert.throws(
        () => validateTarget({ ...localEnv, NOVASTORE_EXPECTED_DATABASE_HOST: 'localhost' }),
        /host does not match/i
    );
    assert.throws(
        () => validateTarget({
            ...localEnv,
            NOVASTORE_EXPECTED_DATABASE_NAME: 'novastore_prod',
            DATABASE_URL: 'postgresql://127.0.0.1/novastore_prod'
        }),
        /production-like/i
    );
    assert.throws(
        () => validateTarget({ ...localEnv, [LOCAL_TEST_CAPABILITY]: '' }),
        /loopback migration targets require/i
    );
    assert.throws(
        () => validateTarget(localEnv, { bootstrap: true }),
        /bootstrap_enabled/i
    );
    assert.equal(
        validateTarget({ ...localEnv, NOVASTORE_STAGING_BOOTSTRAP_ENABLED: 'true' }, { bootstrap: true }).localTest,
        true
    );
    assert.equal(
        validateTarget({
            NOVASTORE_DEPLOY_ENV: 'staging',
            NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
            NOVASTORE_ALLOW_REMOTE_DB: 'true',
            NOVASTORE_EXPECTED_DATABASE_HOST: 'staging-db.internal',
            NOVASTORE_EXPECTED_DATABASE_NAME: 'novastore_staging',
            DATABASE_URL: 'postgresql://staging-db.internal/novastore_staging'
        }).mode,
        'staging'
    );

    const markerUrl = 'postgresql://127.0.0.1/db?marker=unit-redaction-marker';
    const redacted = redact(
        `failed ${markerUrl}`,
        { DATABASE_URL: markerUrl }
    );
    assert.doesNotMatch(redacted, /unit-redaction-marker|postgresql:\/\//i);

    let planClientCalls = 0;
    const planOutput = [];
    const plan = await runPlan({
        registry,
        output: (line) => planOutput.push(line),
        createClient: () => {
            planClientCalls += 1;
            throw new Error('plan must not create a DB client');
        }
    });
    assert.equal(plan.length, registry.length);
    assert.equal(planClientCalls, 0);
    assert.equal(planOutput.length, registry.length + 1);

    let rejectedStatusClientCalls = 0;
    await assert.rejects(
        runStatus({
            env: {},
            registry,
            createClient: () => {
                rejectedStatusClientCalls += 1;
                throw new Error('target guard must run first');
            },
            output: () => {}
        }),
        /NOVASTORE_DEPLOY_ENV/
    );
    assert.equal(rejectedStatusClientCalls, 0);

    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    for (const script of [
        'staging:migrate:plan',
        'staging:migrate:status',
        'staging:migrate',
        'staging:bootstrap'
    ]) assert.equal(typeof packageJson.scripts[script], 'string');

    const stagingSources = [
        'scripts/stagingMigrationCli.js',
        'scripts/stagingBootstrapCli.js',
        'scripts/staging-migrations/runner.js',
        'scripts/staging-migrations/bootstrap.js'
    ].map((relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')).join('\n');
    assert.doesNotMatch(stagingSources, /require\([^)]*initDb/i);
    assert.doesNotMatch(stagingSources, /dotenv|cloudinary|nodemailer|resend|fetch\s*\(/i);

    console.log('staging migration foundation smoke passed: 21 checks');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
