const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
    FORBIDDEN_PROVIDER_CREDENTIAL_KEYS
} = require('../config/stagingRuntimePolicy');
const {
    FORBIDDEN_PROVIDER_CREDENTIAL_NAMES,
    REQUIRED_NAMES,
    RUNTIME_IDENTITY_ENV_KEYS,
    SECRET_NAMES,
    assertNoDuplicateNames,
    buildNamesOnlyReleaseContract,
    validateStagingReleaseEnvironment
} = require('../config/stagingReleaseContract');
const {
    OfflineReleasePlanError,
    buildOfflineReleasePlan,
    parseArguments
} = require('../scripts/stagingReleasePlanCli');
const { loadRegistry } = require('../scripts/staging-migrations/registry');

const root = path.resolve(__dirname, '..');
const authorizedParent = 'c06cbcba0d1cba77b030d2a588e7a699be4a05a2';
const authorizedTree = 'be3504ffea9c99b22502a88bed1dfd9351e9c59a';
const authorizedParentParent = 'cfeaf0f043642ad1db6a7b2b565c3f0e0050ed47';
const authorizedSubject = 'feat(staging): gate access and external side effects';
const packageLockSha = '7993e816b1a610cef93ae84c332fd24fef7d419b8809889680642a4a848190da';
const results = { pass: 0, fail: 0, skip: 0 };

const runGit = (args, options = {}) => {
    const result = spawnSync('git', args, {
        cwd: root,
        encoding: options.encoding === null ? null : 'utf8',
        maxBuffer: 4 * 1024 * 1024
    });
    assert.equal(result.status, 0, String(result.stderr || ''));
    return result.stdout;
};

const gitLine = (args) => String(runGit(args)).trimEnd();
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const check = async (number, name, assertion) => {
    try {
        await assertion();
        results.pass += 1;
        console.log(`PASS ${number}. ${name}`);
    } catch (error) {
        results.fail += 1;
        console.error(`FAIL ${number}. ${name}: ${error.message}`);
    }
};

const expectedChangedPaths = [
    'config/cloudinary.js',
    'config/stagingRuntimePolicy.js',
    'config/startupSafety.js',
    'controllers/assistantController.js',
    'controllers/authController.js',
    'controllers/messageController.js',
    'controllers/notificationController.js',
    'controllers/paymentController.js',
    'controllers/runtimeMetaController.js',
    'docs/staging-runtime-safety.md',
    'middlewares/adminCommerceCapability.js',
    'middlewares/stagingAccessGate.js',
    'package.json',
    'routes/adminAttributeRoutes.js',
    'routes/adminCategoryRoutes.js',
    'routes/adminCollectionRoutes.js',
    'routes/adminMenuRoutes.js',
    'routes/productRoutes.js',
    'scripts/runCiSmokes.js',
    'server.js',
    'services/aiProviderService.js',
    'services/escalationService.js',
    'services/notificationService.js',
    'services/paymentProviderService.js',
    'services/paytrPaymentService.js',
    'tests/adminCatalogMutationFoundationSmoke.js',
    'tests/stagingAccessGateHttpSmoke.js',
    'tests/stagingRuntimeSafetySmoke.js'
].sort();

const expectedProviderKeys = [
    'PAYTR_MERCHANT_ID',
    'PAYTR_MERCHANT_KEY',
    'PAYTR_MERCHANT_SALT',
    'IYZICO_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'GEMINI_API_KEY',
    'OPENAI_API_KEY'
];

const expectedRequiredNames = [
    'AI_PROVIDER',
    'AI_PROVIDER_FALLBACK_ENABLED',
    'DATABASE_URL',
    'JWT_SECRET',
    'NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED',
    'NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED',
    'NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED',
    'NOVASTORE_ALLOW_REMOTE_DB',
    'NOVASTORE_ALLOW_SCHEMA_INIT',
    'NOVASTORE_DEPLOY_ENV',
    'NOVASTORE_EXPECTED_DATABASE_HOST',
    'NOVASTORE_EXPECTED_DATABASE_NAME',
    'NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED',
    'NOVASTORE_STAGING_ACCESS_GATE_ENABLED',
    'NOVASTORE_STAGING_ACCESS_PASSWORD_HASH',
    'NOVASTORE_STAGING_ACCESS_SESSION_SECRET',
    'NOVASTORE_STAGING_ACCESS_USERNAME',
    'NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED',
    'NOVASTORE_STAGING_MIGRATIONS_ENABLED',
    'RAILWAY_GIT_COMMIT_SHA',
    'RENDER_GIT_COMMIT',
    'SKIP_SCHEMA_INIT'
].sort();

const createValidEnvironment = () => ({
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    NOVASTORE_EXPECTED_DATABASE_HOST: 'staging-db.example.test',
    NOVASTORE_EXPECTED_DATABASE_NAME: 'novastore_staging',
    DATABASE_URL: 'postgresql://synthetic-user@staging-db.example.test/novastore_staging',
    JWT_SECRET: 'synthetic-jwt-secret-marker-not-for-reuse',
    RENDER_GIT_COMMIT: 'a'.repeat(40),
    NOVASTORE_STAGING_ACCESS_GATE_ENABLED: 'true',
    NOVASTORE_STAGING_ACCESS_USERNAME: 'synthetic-release-operator',
    NOVASTORE_STAGING_ACCESS_PASSWORD_HASH: '$2b$12$' + 'A'.repeat(53),
    NOVASTORE_STAGING_ACCESS_SESSION_SECRET: 'synthetic-access-session-marker-not-for-reuse',
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

const fakeExpected = Object.freeze({
    head: '1'.repeat(40),
    tree: '2'.repeat(40),
    parent: '3'.repeat(40),
    subject: 'synthetic release candidate'
});

const createFakeGitReader = ({
    head = fakeExpected.head,
    tree = fakeExpected.tree,
    parent = fakeExpected.parent,
    subject = fakeExpected.subject,
    status = Buffer.alloc(0)
} = {}) => (args) => {
    const command = args.join(' ');
    if (command === 'rev-parse HEAD') return `${head}\n`;
    if (command === 'rev-parse HEAD^{tree}') return `${tree}\n`;
    if (command === 'rev-parse HEAD^') return `${parent}\n`;
    if (command === 'show -s --format=%s HEAD') return `${subject}\n`;
    if (command === 'status --porcelain=v1 -z --untracked-files=all') return status;
    throw new Error('unexpected git command');
};

(async () => {
    await check(1, 'parent SHA/tree/subject exact', () => {
        const current = gitLine(['rev-parse', 'HEAD']);
        const base = current === authorizedParent ? current : gitLine(['rev-parse', 'HEAD^']);
        assert.equal(base, authorizedParent);
        assert.equal(gitLine(['rev-parse', `${base}^{tree}`]), authorizedTree);
        assert.equal(gitLine(['rev-parse', `${base}^`]), authorizedParentParent);
        assert.equal(gitLine(['show', '-s', '--format=%s', base]), authorizedSubject);
    });

    await check(2, '1B changed-file list exact 28', () => {
        const actual = String(runGit([
            'diff-tree', '--no-commit-id', '--name-only', '-r', authorizedParent
        ])).split(/\r?\n/).filter(Boolean).sort();
        assert.equal(actual.length, 28);
        assert.deepEqual(actual, expectedChangedPaths);
    });

    await check(3, 'exact provider credential key list', () => {
        assert.deepEqual([...FORBIDDEN_PROVIDER_CREDENTIAL_NAMES], expectedProviderKeys);
    });

    await check(4, 'denylist and runtime policy source exact equality', () => {
        assert.equal(FORBIDDEN_PROVIDER_CREDENTIAL_NAMES, FORBIDDEN_PROVIDER_CREDENTIAL_KEYS);
    });

    await check(5, '1A migration bytes/checksums 15/15 exact', () => {
        const registry = loadRegistry();
        assert.equal(registry.length, 15);
        for (const migration of registry) {
            const bytes = fs.readFileSync(migration.absolutePath);
            assert.equal(sha256(bytes), migration.sha256);
            assert.equal(bytes.includes(0x0d), false);
            const blob = runGit(['show', `HEAD:${migration.path}`], { encoding: null });
            assert.equal(sha256(blob), migration.sha256);
        }
    });

    await check(6, 'package-lock hash unchanged', () => {
        assert.equal(sha256(fs.readFileSync(path.join(root, 'package-lock.json'))), packageLockSha);
    });

    await check(7, 'required key names complete and unique', () => {
        assert.equal(assertNoDuplicateNames(), true);
        assert.deepEqual([...REQUIRED_NAMES], expectedRequiredNames);
        const runtimeSource = fs.readFileSync(
            path.join(root, 'services', 'runtimeIdentityService.js'),
            'utf8'
        );
        const runtimeKeys = [...runtimeSource.matchAll(/environmentKey:\s*'([A-Z0-9_]+)'/g)]
            .map((match) => match[1]);
        assert.deepEqual(runtimeKeys, [...RUNTIME_IDENTITY_ENV_KEYS]);
    });

    await check(8, 'secret keys are names-only', () => {
        const summary = buildNamesOnlyReleaseContract();
        assert.deepEqual(summary.secretNames, SECRET_NAMES);
        assert(summary.secretNames.every((name) => /^[A-Z0-9_]+$/.test(name)));
    });

    await check(9, 'secret values and metadata do not enter output', () => {
        const environment = createValidEnvironment();
        assert.equal(validateStagingReleaseEnvironment(environment).ready, true);
        const output = JSON.stringify(buildNamesOnlyReleaseContract());
        for (const marker of [
            environment.DATABASE_URL,
            environment.JWT_SECRET,
            environment.NOVASTORE_STAGING_ACCESS_USERNAME,
            environment.NOVASTORE_STAGING_ACCESS_PASSWORD_HASH,
            environment.NOVASTORE_STAGING_ACCESS_SESSION_SECRET
        ]) assert.equal(output.includes(marker), false);
        assert.doesNotMatch(output, /synthetic-password|not-for-reuse/i);
    });

    await check(10, 'required exact value mismatch fails closed', () => {
        const environment = createValidEnvironment();
        environment.AI_PROVIDER = 'external';
        assert.throws(
            () => validateStagingReleaseEnvironment(environment),
            (error) => error.code === 'REQUIRED_EXACT_VALUE_MISMATCH'
        );
    });

    await check(11, 'forbidden credential presence fails closed', () => {
        const environment = createValidEnvironment();
        environment.OPENAI_API_KEY = '';
        assert.throws(
            () => validateStagingReleaseEnvironment(environment),
            (error) => error.code === 'FORBIDDEN_PROVIDER_CREDENTIAL_PRESENT'
        );
    });

    await check(12, 'database JWT and access secrets are not false positives', () => {
        const environment = createValidEnvironment();
        assert.equal(validateStagingReleaseEnvironment(environment).ready, true);
        for (const name of [
            'DATABASE_URL',
            'JWT_SECRET',
            'NOVASTORE_STAGING_ACCESS_USERNAME',
            'NOVASTORE_STAGING_ACCESS_PASSWORD_HASH',
            'NOVASTORE_STAGING_ACCESS_SESSION_SECRET'
        ]) assert.equal(FORBIDDEN_PROVIDER_CREDENTIAL_NAMES.includes(name), false);
    });

    await check(13, 'offline plan performs no network DB or provider call', () => {
        const source = fs.readFileSync(path.join(root, 'scripts', 'stagingReleasePlanCli.js'), 'utf8');
        assert.doesNotMatch(source, /require\(['"](?:node:)?(?:http|https|net|dns)['"]\)/);
        assert.doesNotMatch(source, /require\(['"](?:pg|cloudinary|resend|nodemailer)['"]\)/);
        let gitCalls = 0;
        const reader = createFakeGitReader();
        const result = buildOfflineReleasePlan({
            expected: fakeExpected,
            readGit: (...args) => {
                gitCalls += 1;
                return reader(...args);
            }
        });
        assert.equal(result.status, 'PASS');
        assert.equal(gitCalls, 5);
    });

    await check(14, 'missing expected SHA/tree rejected', () => {
        assert.throws(() => parseArguments([]), OfflineReleasePlanError);
        assert.throws(
            () => parseArguments([
                '--expected-head', fakeExpected.head,
                '--expected-parent', fakeExpected.parent,
                '--expected-subject', fakeExpected.subject
            ]),
            OfflineReleasePlanError
        );
    });

    await check(15, 'malformed SHA/tree rejected', () => {
        assert.throws(() => parseArguments([
            '--expected-head', 'short',
            '--expected-tree', fakeExpected.tree,
            '--expected-parent', fakeExpected.parent,
            '--expected-subject', fakeExpected.subject
        ]), (error) => error.code === 'MALFORMED_FULL_SHA');
    });

    await check(16, 'HEAD/tree mismatch rejected', () => {
        assert.throws(
            () => buildOfflineReleasePlan({
                expected: fakeExpected,
                readGit: createFakeGitReader({ head: '4'.repeat(40) })
            }),
            (error) => error.code === 'HEAD_MISMATCH'
        );
        assert.throws(
            () => buildOfflineReleasePlan({
                expected: fakeExpected,
                readGit: createFakeGitReader({ tree: '5'.repeat(40) })
            }),
            (error) => error.code === 'TREE_MISMATCH'
        );
    });

    await check(17, 'dirty staged or untracked state rejected', () => {
        for (const status of [' M tracked.js\0', 'M  staged.js\0', '?? untracked.js\0']) {
            assert.throws(
                () => buildOfflineReleasePlan({
                    expected: fakeExpected,
                    readGit: createFakeGitReader({ status: Buffer.from(status) })
                }),
                (error) => error.code === 'WORKTREE_NOT_CLEAN'
            );
        }
    });

    await check(18, 'offline plan output is deterministic', () => {
        const first = JSON.stringify(buildOfflineReleasePlan({
            expected: fakeExpected,
            readGit: createFakeGitReader()
        }));
        const second = JSON.stringify(buildOfflineReleasePlan({
            expected: fakeExpected,
            readGit: createFakeGitReader()
        }));
        assert.equal(first, second);
        assert.doesNotMatch(first, /timestamp|cwd|AppData|OneDrive/i);
        assert.equal(first.includes(fakeExpected.subject), false);
    });

    await check(19, 'shell injection and argument confusion rejected', () => {
        assert.throws(() => parseArguments([
            '--expected-head', '$(whoami)',
            '--expected-tree', fakeExpected.tree,
            '--expected-parent', fakeExpected.parent,
            '--expected-subject', fakeExpected.subject
        ]), OfflineReleasePlanError);
        assert.throws(() => parseArguments([
            `--expected-head=${fakeExpected.head}`,
            '--expected-tree', fakeExpected.tree,
            '--expected-parent', fakeExpected.parent,
            '--expected-subject', fakeExpected.subject
        ]), OfflineReleasePlanError);
    });

    await check(20, 'npm start performs no migration or bootstrap', () => {
        const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        assert.equal(packageJson.scripts.start, 'node server.js');
        assert.doesNotMatch(packageJson.scripts.start, /migrat|bootstrap|initDb/i);
    });

    console.log(
        `stagingReleaseContractSmoke: PASS=${results.pass} FAIL=${results.fail} SKIPPED=${results.skip}`
    );
    if (results.fail > 0 || results.skip > 0) process.exitCode = 1;
})().catch((error) => {
    results.fail += 1;
    console.error(`FAIL staging release contract harness: ${error.message}`);
    console.log(
        `stagingReleaseContractSmoke: PASS=${results.pass} FAIL=${results.fail} SKIPPED=${results.skip}`
    );
    process.exitCode = 1;
});
