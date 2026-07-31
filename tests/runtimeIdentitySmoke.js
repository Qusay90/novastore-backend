const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { resolveRuntimeIdentity } = require('../services/runtimeIdentityService');
const {
    StagingReleaseContractError,
    validateStagingReleaseEnvironment
} = require('../config/stagingReleaseContract');
const { REMOTE_READINESS_QUERY } = require('../controllers/runtimeMetaController');
const { createRuntimeMetaRouter } = require('../routes/runtimeMetaRoutes');

const repositoryRoot = path.resolve(__dirname, '..');
const renderRevision = 'a'.repeat(40);
const railwayRevision = 'b'.repeat(40);
const unavailableBody = { status: 'unavailable' };
const results = { pass: 0, fail: 0, skip: 0 };

const createAccessorEnvironment = (environmentKey, revision) => {
    let getterCalls = 0;
    let setterCalls = 0;
    const environment = {};
    Object.defineProperty(environment, environmentKey, {
        enumerable: true,
        get: () => {
            getterCalls += 1;
            return revision;
        },
        set: () => {
            setterCalls += 1;
        }
    });
    return {
        environment,
        getterCalls: () => getterCalls,
        setterCalls: () => setterCalls
    };
};

const createValidStagingReleaseEnvironment = () => ({
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    NOVASTORE_EXPECTED_DATABASE_HOST: 'staging-db.example.test',
    NOVASTORE_EXPECTED_DATABASE_NAME: 'novastore_staging',
    DATABASE_URL: 'postgresql://synthetic-user@staging-db.example.test/novastore_staging?sslmode=verify-full',
    JWT_SECRET: 'synthetic-jwt-secret-marker-not-for-reuse',
    RENDER_GIT_COMMIT: renderRevision,
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

const check = async (name, assertion) => {
    try {
        await assertion();
        results.pass += 1;
        console.log(`PASS ${name}`);
    } catch (error) {
        results.fail += 1;
        console.error(`FAIL ${name}: ${error.message}`);
    }
};

const startRuntimeServer = async ({ database, environment }, configureApp) => {
    const app = express();
    app.use('/api', createRuntimeMetaRouter({ database, environment }));
    if (configureApp) configureApp(app);
    app.use((req, res) => res.status(418).type('html').send('fallback'));

    const server = await new Promise((resolve, reject) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
        instance.once('error', reject);
    });

    return {
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        })
    };
};

const request = async (baseUrl, pathname, method = 'GET') => {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(10000)
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    return {
        status: response.status,
        headers: response.headers,
        text,
        body: text && /^application\/json\b/i.test(contentType) ? JSON.parse(text) : null
    };
};

const withRuntimeServer = async (options, assertion, configureApp) => {
    const server = await startRuntimeServer(options, configureApp);
    try {
        await assertion(server.baseUrl);
    } finally {
        await server.close();
    }
};

const createDatabase = (queryImplementation, metadataImplementation) => {
    const state = { queryCount: 0, metadataCount: 0, statements: [] };
    const database = {
        query: async (statement) => {
            state.queryCount += 1;
            state.statements.push(statement);
            return queryImplementation(statement);
        }
    };
    if (metadataImplementation) {
        database.getRuntimeTargetMetadata = () => {
            state.metadataCount += 1;
            return metadataImplementation();
        };
    }
    return {
        state,
        database
    };
};

const assertUnavailable = (identity) => {
    assert.deepEqual(identity, { available: false });
};

const assertJsonResponse = (response, status, body) => {
    assert.equal(response.status, status);
    assert.match(response.headers.get('content-type') || '', /^application\/json\b/i);
    assert.deepEqual(response.body, body);
};

const revisionCases = [
    ['render revision', { RENDER_GIT_COMMIT: renderRevision }, {
        available: true,
        provider: 'render',
        revision: renderRevision
    }],
    ['railway revision', { RAILWAY_GIT_COMMIT_SHA: railwayRevision }, {
        available: true,
        provider: 'railway',
        revision: railwayRevision
    }]
];

const unavailableRevisionCases = [
    ['missing revision', {}],
    ['inherited Render revision', Object.create({ RENDER_GIT_COMMIT: renderRevision })],
    ['inherited Railway revision', Object.create({ RAILWAY_GIT_COMMIT_SHA: railwayRevision })],
    ['setter-only Render revision', Object.defineProperty({}, 'RENDER_GIT_COMMIT', {
        enumerable: true,
        set: () => {}
    })],
    ['malformed Render revision', { RENDER_GIT_COMMIT: 'not-a-revision' }],
    ['malformed Railway revision', { RAILWAY_GIT_COMMIT_SHA: 'not-a-revision' }],
    ['short revision', { RENDER_GIT_COMMIT: 'a'.repeat(39) }],
    ['uppercase revision', { RENDER_GIT_COMMIT: 'A'.repeat(40) }],
    ['whitespace revision', { RENDER_GIT_COMMIT: `${renderRevision} ` }],
    ['extra-text revision', { RENDER_GIT_COMMIT: `${renderRevision}-extra` }],
    ['dual provider revision', {
        RENDER_GIT_COMMIT: renderRevision,
        RAILWAY_GIT_COMMIT_SHA: railwayRevision
    }],
    ['arbitrary fallback variables', {
        APP_VERSION: renderRevision,
        VERSION: renderRevision,
        COMMIT_SHA: renderRevision,
        GIT_SHA: renderRevision,
        SOURCE_VERSION: renderRevision
    }]
];

const runRevisionResolutionMatrix = async () => {
    for (const [name, environment, expected] of revisionCases) {
        await check(`revision resolution: ${name}`, async () => {
            assert.deepEqual(resolveRuntimeIdentity(environment), expected);
        });
    }

    for (const [name, environment] of unavailableRevisionCases) {
        await check(`revision resolution: ${name}`, async () => {
            assertUnavailable(resolveRuntimeIdentity(environment));
        });
    }

    await check('revision resolution: accessor revision is rejected without getter execution', async () => {
        const accessor = createAccessorEnvironment('RENDER_GIT_COMMIT', renderRevision);
        assertUnavailable(resolveRuntimeIdentity(accessor.environment));
        assert.equal(accessor.getterCalls(), 0);
        assert.equal(accessor.setterCalls(), 0);
    });

    await check('revision resolution: inherited revision does not suppress an own provider', async () => {
        const environment = Object.assign(
            Object.create({ RENDER_GIT_COMMIT: renderRevision }),
            { RAILWAY_GIT_COMMIT_SHA: railwayRevision }
        );
        assert.deepEqual(resolveRuntimeIdentity(environment), {
            available: true,
            provider: 'railway',
            revision: railwayRevision
        });
    });

    await check('release contract: accessor identity is rejected without getter execution', async () => {
        const accessor = createAccessorEnvironment('RENDER_GIT_COMMIT', renderRevision);
        const environment = createValidStagingReleaseEnvironment();
        Object.defineProperty(
            environment,
            'RENDER_GIT_COMMIT',
            Object.getOwnPropertyDescriptor(accessor.environment, 'RENDER_GIT_COMMIT')
        );
        assert.throws(
            () => validateStagingReleaseEnvironment(environment),
            (error) => (
                error instanceof StagingReleaseContractError &&
                error.code === 'RUNTIME_IDENTITY_REJECTED' &&
                error.message === 'Staging release contract validation failed.' &&
                !/RENDER|SENSITIVE/i.test(error.message)
            )
        );
        assert.equal(accessor.getterCalls(), 0);
        assert.equal(accessor.setterCalls(), 0);
    });

    await check('revision resolution: no unauthorized source fallback', async () => {
        const source = fs.readFileSync(
            path.join(repositoryRoot, 'services', 'runtimeIdentityService.js'),
            'utf8'
        );
        assert.doesNotMatch(source, /require\(['"](?:node:)?(?:fs|child_process)['"]\)/);
        assert.doesNotMatch(source, /(?:^|[^A-Z0-9_])(?:APP_VERSION|VERSION|COMMIT_SHA|GIT_SHA|SOURCE_VERSION)(?:[^A-Z0-9_]|$)/m);
        assert.doesNotMatch(source, /package\.json|\.git(?:[\\/]|\b)/i);
    });
};

const runLiveMatrix = async () => {
    const cases = [
        ['valid revision + DB up', { RENDER_GIT_COMMIT: renderRevision }, async () => ({ rows: [{ ready: 1 }] })],
        ['missing revision + DB up', {}, async () => ({ rows: [{ ready: 1 }] })],
        ['valid revision + DB down', { RENDER_GIT_COMMIT: renderRevision }, async () => { throw new Error('down'); }],
        ['missing revision + DB down', {}, async () => { throw new Error('down'); }]
    ];

    for (const [name, environment, implementation] of cases) {
        await check(`live: ${name}`, async () => {
            const fake = createDatabase(implementation);
            await withRuntimeServer({ database: fake.database, environment }, async (baseUrl) => {
                const response = await request(baseUrl, '/api/health/live');
                assertJsonResponse(response, 200, { status: 'live' });
            });
            assert.equal(fake.state.queryCount, 0);
        });
    }
};

const runReadyMatrix = async () => {
    const successCases = [
        ['Render revision + SELECT 1', { RENDER_GIT_COMMIT: renderRevision }],
        ['Railway revision + SELECT 1', { RAILWAY_GIT_COMMIT_SHA: railwayRevision }]
    ];

    for (const [name, environment] of successCases) {
        await check(`ready: ${name}`, async () => {
            const fake = createDatabase(async () => ({ rows: [{ ready: 1 }] }));
            await withRuntimeServer({ database: fake.database, environment }, async (baseUrl) => {
                const response = await request(baseUrl, '/api/health/ready');
                assertJsonResponse(response, 200, { status: 'ready' });
            });
            assert.equal(fake.state.queryCount, 1);
            assert.deepEqual(fake.state.statements, ['SELECT 1 AS ready']);
        });
    }

    const identityFailureCases = [
        ['missing revision', {}],
        ['inherited Render revision', Object.create({ RENDER_GIT_COMMIT: renderRevision })],
        ['inherited Railway revision', Object.create({ RAILWAY_GIT_COMMIT_SHA: railwayRevision })],
        ['malformed revision', { RENDER_GIT_COMMIT: 'invalid-RUNTIME-MARKER' }],
        ['dual provider', {
            RENDER_GIT_COMMIT: renderRevision,
            RAILWAY_GIT_COMMIT_SHA: railwayRevision
        }]
    ];

    for (const [name, environment] of identityFailureCases) {
        await check(`ready: ${name} skips DB`, async () => {
            const fake = createDatabase(async () => ({ rows: [{ ready: 1 }] }));
            await withRuntimeServer({ database: fake.database, environment }, async (baseUrl) => {
                const response = await request(baseUrl, '/api/health/ready');
                assertJsonResponse(response, 503, unavailableBody);
                assert.doesNotMatch(response.text, /RUNTIME-MARKER/);
            });
            assert.equal(fake.state.queryCount, 0);
        });
    }

    await check('ready: accessor revision skips DB without invoking getter', async () => {
        const accessor = createAccessorEnvironment('RENDER_GIT_COMMIT', renderRevision);
        const fake = createDatabase(async () => ({ rows: [{ ready: 1 }] }));
        await withRuntimeServer({ database: fake.database, environment: accessor.environment }, async (baseUrl) => {
            const response = await request(baseUrl, '/api/health/ready');
            assertJsonResponse(response, 503, unavailableBody);
            assert.doesNotMatch(response.text, /RENDER|SENSITIVE/i);
        });
        assert.equal(fake.state.queryCount, 0);
        assert.equal(accessor.getterCalls(), 0);
        assert.equal(accessor.setterCalls(), 0);
    });

    await check('ready: DB failure is generic', async () => {
        const fake = createDatabase(async () => {
            throw new Error('SENSITIVE-DSN-MARKER stack driver detail');
        });
        await withRuntimeServer({
            database: fake.database,
            environment: { RENDER_GIT_COMMIT: renderRevision }
        }, async (baseUrl) => {
            const response = await request(baseUrl, '/api/health/ready');
            assertJsonResponse(response, 503, unavailableBody);
            assert.doesNotMatch(response.text, /SENSITIVE|DSN|stack|driver/i);
        });
        assert.equal(fake.state.queryCount, 1);
    });

    await check('ready: invalid query result is unavailable', async () => {
        const fake = createDatabase(async () => ({ rows: [{ ready: 0 }] }));
        await withRuntimeServer({
            database: fake.database,
            environment: { RENDER_GIT_COMMIT: renderRevision }
        }, async (baseUrl) => {
            assertJsonResponse(await request(baseUrl, '/api/health/ready'), 503, unavailableBody);
        });
        assert.equal(fake.state.queryCount, 1);
    });

    await check('ready: unexpected identity error is generic and skips DB', async () => {
        const fake = createDatabase(async () => ({ rows: [{ ready: 1 }] }));
        const environment = new Proxy({}, {
            get: () => { throw new Error('SENSITIVE-IDENTITY-MARKER'); }
        });
        await withRuntimeServer({ database: fake.database, environment }, async (baseUrl) => {
            const response = await request(baseUrl, '/api/health/ready');
            assertJsonResponse(response, 503, unavailableBody);
            assert.doesNotMatch(response.text, /SENSITIVE|IDENTITY|MARKER/i);
        });
        assert.equal(fake.state.queryCount, 0);
    });
};

const runRemoteReadyMatrix = async () => {
    const remoteEnvironment = () => ({
        NODE_ENV: 'production',
        DATABASE_URL:
            'postgresql://synthetic-user@runtime-db.example.test/' +
            'novastore_runtime?sslmode=verify-full',
        NOVASTORE_EXPECTED_DATABASE_HOST: 'runtime-db.example.test',
        NOVASTORE_EXPECTED_DATABASE_NAME: 'novastore_runtime',
        SKIP_SCHEMA_INIT: 'true',
        NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
        RENDER_GIT_COMMIT: renderRevision
    });
    const metadata = (overrides = {}) => Object.freeze(Object.assign(Object.create(null), {
        host: 'runtime-db.example.test',
        port: 5432,
        database: 'novastore_runtime',
        local: false,
        remoteRelease: true,
        tlsEnabled: true,
        tlsVerified: true,
        attested: true,
        ...overrides
    }));
    const successResult = () => ({
        rows: [{
            ready: 1,
            database: 'novastore_runtime',
            port: 5432
        }]
    });

    await check('ready remote: attested target metadata and connected identity pass', async () => {
        const fake = createDatabase(async () => successResult(), () => metadata());
        await withRuntimeServer({
            database: fake.database,
            environment: remoteEnvironment()
        }, async (baseUrl) => {
            assertJsonResponse(await request(baseUrl, '/api/health/ready'), 200, { status: 'ready' });
        });
        assert.equal(fake.state.metadataCount, 1);
        assert.equal(fake.state.queryCount, 1);
        assert.deepEqual(fake.state.statements, [REMOTE_READINESS_QUERY]);
    });

    await check('ready remote: direct non-default server port remains exact', async () => {
        const environment = remoteEnvironment();
        environment.DATABASE_URL =
            'postgresql://synthetic-user@runtime-db.example.test:5433/' +
            'novastore_runtime?sslmode=verify-full';
        const directMetadata = () => metadata({ port: 5433 });

        const positive = createDatabase(async () => ({
            rows: [{ ready: 1, database: 'novastore_runtime', port: 5433 }]
        }), directMetadata);
        await withRuntimeServer({
            database: positive.database,
            environment
        }, async (baseUrl) => {
            assertJsonResponse(await request(baseUrl, '/api/health/ready'), 200, { status: 'ready' });
        });

        const mismatch = createDatabase(async () => ({
            rows: [{ ready: 1, database: 'novastore_runtime', port: 5432 }]
        }), directMetadata);
        await withRuntimeServer({
            database: mismatch.database,
            environment
        }, async (baseUrl) => {
            assertJsonResponse(await request(baseUrl, '/api/health/ready'), 503, unavailableBody);
        });
    });

    await check('ready remote: Supabase transaction-pooler maps client 6543 to backend 5432', async () => {
        const environment = remoteEnvironment();
        environment.NOVASTORE_EXPECTED_DATABASE_HOST = 'aws-0-eu.pooler.supabase.com';
        environment.DATABASE_URL =
            'postgresql://synthetic-user@aws-0-eu.pooler.supabase.com:6543/' +
            'novastore_runtime?sslmode=verify-full';
        const poolerMetadata = () => metadata({
            host: 'aws-0-eu.pooler.supabase.com',
            port: 6543
        });

        const positive = createDatabase(async () => ({
            rows: [{ ready: 1, database: 'novastore_runtime', port: 5432 }]
        }), poolerMetadata);
        await withRuntimeServer({
            database: positive.database,
            environment
        }, async (baseUrl) => {
            assertJsonResponse(await request(baseUrl, '/api/health/ready'), 200, { status: 'ready' });
        });

        const mismatch = createDatabase(async () => ({
            rows: [{ ready: 1, database: 'novastore_runtime', port: 6543 }]
        }), poolerMetadata);
        await withRuntimeServer({
            database: mismatch.database,
            environment
        }, async (baseUrl) => {
            assertJsonResponse(await request(baseUrl, '/api/health/ready'), 503, unavailableBody);
        });
    });

    await check('ready remote: missing metadata fails before query', async () => {
        const fake = createDatabase(async () => successResult());
        await withRuntimeServer({
            database: fake.database,
            environment: remoteEnvironment()
        }, async (baseUrl) => {
            assertJsonResponse(await request(baseUrl, '/api/health/ready'), 503, unavailableBody);
        });
        assert.equal(fake.state.queryCount, 0);
    });

    const metadataFailures = [
        ['host mismatch', () => metadata({ host: 'wrong-db.example.test' })],
        ['database mismatch', () => metadata({ database: 'wrong_database' })],
        ['port mismatch', () => metadata({ port: 6543 })],
        ['local flag', () => metadata({ local: true })],
        ['remote release flag', () => metadata({ remoteRelease: false })],
        ['TLS disabled', () => metadata({ tlsEnabled: false })],
        ['TLS unverified', () => metadata({ tlsVerified: false })],
        ['target unattested', () => metadata({ attested: false })],
        ['mutable metadata', () => ({ ...metadata() })],
        ['extra metadata field', () => Object.freeze(Object.assign(
            Object.create(null),
            metadata(),
            { username: 'forbidden' }
        ))],
        ['inherited secret field', () => Object.freeze(Object.assign(
            Object.create({ password: 'inherited-secret' }),
            metadata()
        ))]
    ];

    for (const [name, metadataFactory] of metadataFailures) {
        await check(`ready remote: ${name} fails before query`, async () => {
            const fake = createDatabase(async () => successResult(), metadataFactory);
            await withRuntimeServer({
                database: fake.database,
                environment: remoteEnvironment()
            }, async (baseUrl) => {
                const response = await request(baseUrl, '/api/health/ready');
                assertJsonResponse(response, 503, unavailableBody);
                assert.doesNotMatch(response.text, /wrong|username|runtime-db|novastore_runtime/i);
            });
            assert.equal(fake.state.queryCount, 0);
        });
    }

    const queryFailures = [
        ['database identity mismatch', async () => ({
            rows: [{ ready: 1, database: 'wrong_database', port: 5432 }]
        })],
        ['server port mismatch', async () => ({
            rows: [{ ready: 1, database: 'novastore_runtime', port: 6543 }]
        })],
        ['ready value invalid', async () => ({
            rows: [{ ready: 0, database: 'novastore_runtime', port: 5432 }]
        })],
        ['row cardinality invalid', async () => ({ rows: [] })],
        ['sensitive query failure', async () => {
            throw new Error('SENSITIVE-REMOTE-DSN-MARKER runtime-db.example.test');
        }]
    ];

    for (const [name, queryImplementation] of queryFailures) {
        await check(`ready remote: ${name} is generic`, async () => {
            const fake = createDatabase(queryImplementation, () => metadata());
            await withRuntimeServer({
                database: fake.database,
                environment: remoteEnvironment()
            }, async (baseUrl) => {
                const response = await request(baseUrl, '/api/health/ready');
                assertJsonResponse(response, 503, unavailableBody);
                assert.doesNotMatch(response.text, /SENSITIVE|REMOTE|DSN|runtime-db|novastore_runtime/i);
            });
            assert.equal(fake.state.queryCount, 1);
        });
    }

    await check('ready remote: invalid attestation skips metadata and query', async () => {
        const environment = remoteEnvironment();
        environment.DATABASE_URL =
            'postgresql://synthetic-user@runtime-db.example.test/novastore_runtime?sslmode=require';
        const fake = createDatabase(async () => successResult(), () => metadata());
        await withRuntimeServer({ database: fake.database, environment }, async (baseUrl) => {
            assertJsonResponse(await request(baseUrl, '/api/health/ready'), 503, unavailableBody);
        });
        assert.equal(fake.state.metadataCount, 0);
        assert.equal(fake.state.queryCount, 0);
    });

    await check('ready remote: missing revision skips metadata and query', async () => {
        const environment = remoteEnvironment();
        delete environment.RENDER_GIT_COMMIT;
        const fake = createDatabase(async () => successResult(), () => metadata());
        await withRuntimeServer({ database: fake.database, environment }, async (baseUrl) => {
            assertJsonResponse(await request(baseUrl, '/api/health/ready'), 503, unavailableBody);
        });
        assert.equal(fake.state.metadataCount, 0);
        assert.equal(fake.state.queryCount, 0);
    });

    const configuredLocalEnvironment = {
        NODE_ENV: 'test',
        DB_HOST: '127.0.0.1',
        DB_PORT: '5432',
        DB_NAME: 'novastore_runtime_local_test',
        DB_USER: 'novastore_test',
        DB_PASSWORD: 'novastore_test_only',
        DB_SSL: 'false',
        NOVASTORE_ALLOW_REMOTE_DB: 'false',
        SKIP_SCHEMA_INIT: 'true',
        NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
        RENDER_GIT_COMMIT: renderRevision
    };
    const exactMetadata = (fields) => Object.freeze(Object.assign(Object.create(null), fields));

    await check('ready local: matching active Pool metadata remains compatible', async () => {
        const fake = createDatabase(
            async () => ({ rows: [{ ready: 1 }] }),
            () => exactMetadata({
                host: '127.0.0.1',
                port: 5432,
                database: 'novastore_runtime_local_test',
                local: true,
                remoteRelease: false,
                tlsEnabled: false,
                tlsVerified: false,
                attested: false
            })
        );
        await withRuntimeServer({
            database: fake.database,
            environment: configuredLocalEnvironment
        }, async (baseUrl) => {
            assertJsonResponse(await request(baseUrl, '/api/health/ready'), 200, { status: 'ready' });
        });
        assert.equal(fake.state.queryCount, 1);
    });

    await check('ready local: remote Pool metadata cannot downgrade to local checks', async () => {
        const fake = createDatabase(
            async () => ({ rows: [{ ready: 1 }] }),
            () => exactMetadata({
                host: 'remote-db.example.test',
                port: 5432,
                database: 'novastore_remote',
                local: false,
                remoteRelease: true,
                tlsEnabled: true,
                tlsVerified: true,
                attested: true
            })
        );
        await withRuntimeServer({
            database: fake.database,
            environment: configuredLocalEnvironment
        }, async (baseUrl) => {
            assertJsonResponse(await request(baseUrl, '/api/health/ready'), 503, unavailableBody);
        });
        assert.equal(fake.state.queryCount, 0);
    });
};

const runVersionMatrix = async () => {
    for (const [name, environment, expected] of revisionCases) {
        await check(`version: ${name}`, async () => {
            const fake = createDatabase(async () => { throw new Error('must not query'); });
            await withRuntimeServer({ database: fake.database, environment }, async (baseUrl) => {
                const response = await request(baseUrl, '/api/version');
                assertJsonResponse(response, 200, {
                    revision: expected.revision,
                    provider: expected.provider
                });
                assert.equal(response.headers.get('cache-control'), 'no-store');
            });
            assert.equal(fake.state.queryCount, 0);
        });
    }

    for (const [name, environment] of [
        ['missing revision', {}],
        ['inherited Render revision', Object.create({ RENDER_GIT_COMMIT: renderRevision })],
        ['inherited Railway revision', Object.create({ RAILWAY_GIT_COMMIT_SHA: railwayRevision })],
        ['malformed revision', { RENDER_GIT_COMMIT: 'invalid-RUNTIME-MARKER' }],
        ['dual provider', {
            RENDER_GIT_COMMIT: renderRevision,
            RAILWAY_GIT_COMMIT_SHA: railwayRevision
        }]
    ]) {
        await check(`version: ${name}`, async () => {
            const fake = createDatabase(async () => { throw new Error('must not query'); });
            await withRuntimeServer({ database: fake.database, environment }, async (baseUrl) => {
                const response = await request(baseUrl, '/api/version');
                assertJsonResponse(response, 503, unavailableBody);
                assert.equal(response.headers.get('cache-control'), 'no-store');
                assert.doesNotMatch(response.text, /RUNTIME-MARKER/);
            });
            assert.equal(fake.state.queryCount, 0);
        });
    }

    await check('version: accessor revision is generic without invoking getter', async () => {
        const accessor = createAccessorEnvironment('RENDER_GIT_COMMIT', renderRevision);
        const fake = createDatabase(async () => { throw new Error('must not query'); });
        await withRuntimeServer({ database: fake.database, environment: accessor.environment }, async (baseUrl) => {
            const response = await request(baseUrl, '/api/version');
            assertJsonResponse(response, 503, unavailableBody);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            assert.doesNotMatch(response.text, /RENDER|SENSITIVE/i);
        });
        assert.equal(fake.state.queryCount, 0);
        assert.equal(accessor.getterCalls(), 0);
        assert.equal(accessor.setterCalls(), 0);
    });

    await check('version: unexpected identity error is generic', async () => {
        const fake = createDatabase(async () => { throw new Error('must not query'); });
        const environment = new Proxy({}, {
            get: () => { throw new Error('SENSITIVE-IDENTITY-MARKER'); }
        });
        await withRuntimeServer({ database: fake.database, environment }, async (baseUrl) => {
            const response = await request(baseUrl, '/api/version');
            assertJsonResponse(response, 503, unavailableBody);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            assert.doesNotMatch(response.text, /SENSITIVE|IDENTITY|MARKER/i);
        });
        assert.equal(fake.state.queryCount, 0);
    });
};

const runHeadAndIsolationMatrix = async () => {
    await check('routes: automatic HEAD is status-consistent', async () => {
        const fake = createDatabase(async () => ({ rows: [{ ready: 1 }] }));
        await withRuntimeServer({
            database: fake.database,
            environment: { RENDER_GIT_COMMIT: renderRevision }
        }, async (baseUrl) => {
            for (const [pathname, expectedStatus] of [
                ['/api/health/live', 200],
                ['/api/health/ready', 200],
                ['/api/version', 200]
            ]) {
                const response = await request(baseUrl, pathname, 'HEAD');
                assert.equal(response.status, expectedStatus);
                assert.equal(response.text, '');
            }
            const versionHead = await request(baseUrl, '/api/version', 'HEAD');
            assert.equal(versionHead.headers.get('cache-control'), 'no-store');
        });
        assert.equal(fake.state.queryCount, 1);
    });

    await check('routes: existing API and catch-all remain isolated', async () => {
        const fake = createDatabase(async () => ({ rows: [{ ready: 1 }] }));
        await withRuntimeServer({
            database: fake.database,
            environment: { RENDER_GIT_COMMIT: renderRevision }
        }, async (baseUrl) => {
            assertJsonResponse(await request(baseUrl, '/api/health/live'), 200, { status: 'live' });
            assertJsonResponse(await request(baseUrl, '/api/existing'), 200, { owner: 'existing-api' });
            const fallback = await request(baseUrl, '/not-a-meta-route');
            assert.equal(fallback.status, 418);
            assert.match(fallback.headers.get('content-type') || '', /^text\/html\b/i);
        }, (app) => {
            app.get('/api/existing', (req, res) => res.status(200).json({ owner: 'existing-api' }));
        });
    });
};

const runRealDatabaseReadiness = async () => {
    await check('ready: real local PostgreSQL SELECT 1', async () => {
        const databaseUrl = process.env.P4B1_DATABASE_URL;
        assert.ok(databaseUrl, 'P4B1_DATABASE_URL is required for the real readiness gate');
        const parsed = new URL(databaseUrl);
        assert(['127.0.0.1', 'localhost'].includes(parsed.hostname));
        const databaseName = parsed.pathname.replace(/^\/+/, '');
        assert.ok(databaseName && databaseName !== 'postgres');

        Object.assign(process.env, {
            NODE_ENV: 'test',
            DATABASE_URL: databaseUrl,
            DB_HOST: parsed.hostname,
            DB_PORT: parsed.port || '5432',
            DB_NAME: databaseName,
            DB_USER: decodeURIComponent(parsed.username),
            DB_PASSWORD: decodeURIComponent(parsed.password),
            DB_SSL: 'false',
            NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
            NOVASTORE_ALLOW_REMOTE_DB: 'false',
            SKIP_SCHEMA_INIT: 'true',
            NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
            SUPABASE_USE_POOLER: 'false',
            SUPABASE_POOLER_HOST: '',
            SUPABASE_REGION: '',
            SUPABASE_PROJECT_REF: ''
        });

        const pool = require('../config/db');
        try {
            await withRuntimeServer({
                environment: { RENDER_GIT_COMMIT: renderRevision }
            }, async (baseUrl) => {
                assertJsonResponse(await request(baseUrl, '/api/health/ready'), 200, { status: 'ready' });
            });
        } finally {
            await pool.end();
        }
    });

    await check('ready remote contract: real loopback PostgreSQL identity positive and mismatch', async () => {
        const databaseUrl = process.env.P4B1_DATABASE_URL;
        assert.ok(databaseUrl, 'P4B1_DATABASE_URL is required for the real identity gate');
        const parsed = new URL(databaseUrl);
        assert(['127.0.0.1', 'localhost'].includes(parsed.hostname));
        const actualDatabase = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
        const { Pool } = require('pg');
        const loopbackPool = new Pool({
            connectionString: databaseUrl,
            ssl: false,
            keepAlive: true
        });
        let effectiveDatabase = actualDatabase;
        loopbackPool.getRuntimeTargetMetadata = () => Object.freeze(Object.assign(Object.create(null), {
            host: 'runtime-db.example.test',
            port: 5432,
            database: effectiveDatabase,
            local: false,
            remoteRelease: true,
            tlsEnabled: true,
            tlsVerified: true,
            attested: true
        }));
        const remoteEnvironment = (database) => ({
            NODE_ENV: 'production',
            DATABASE_URL:
                `postgresql://synthetic-user@runtime-db.example.test/${database}` +
                '?sslmode=verify-full',
            NOVASTORE_EXPECTED_DATABASE_HOST: 'runtime-db.example.test',
            NOVASTORE_EXPECTED_DATABASE_NAME: database,
            SKIP_SCHEMA_INIT: 'true',
            NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
            RENDER_GIT_COMMIT: renderRevision
        });

        try {
            await withRuntimeServer({
                database: loopbackPool,
                environment: remoteEnvironment(actualDatabase)
            }, async (baseUrl) => {
                assertJsonResponse(await request(baseUrl, '/api/health/ready'), 200, { status: 'ready' });
            });

            effectiveDatabase = 'novastore_connected_identity_mismatch';
            await withRuntimeServer({
                database: loopbackPool,
                environment: remoteEnvironment(effectiveDatabase)
            }, async (baseUrl) => {
                const response = await request(baseUrl, '/api/health/ready');
                assertJsonResponse(response, 503, unavailableBody);
                assert.doesNotMatch(response.text, /novastore|database|runtime-db/i);
            });
        } finally {
            await loopbackPool.end();
        }
    });
};

(async () => {
    await runRevisionResolutionMatrix();
    await runLiveMatrix();
    await runReadyMatrix();
    await runRemoteReadyMatrix();
    await runVersionMatrix();
    await runHeadAndIsolationMatrix();
    await runRealDatabaseReadiness();

    console.log(`runtime identity smoke summary: ${results.pass} PASS, ${results.fail} FAIL, ${results.skip} SKIP`);
    if (results.fail > 0) process.exitCode = 1;
})().catch((error) => {
    results.fail += 1;
    console.error(`FAIL runtime identity smoke harness: ${error.message}`);
    console.log(`runtime identity smoke summary: ${results.pass} PASS, ${results.fail} FAIL, ${results.skip} SKIP`);
    process.exitCode = 1;
});
