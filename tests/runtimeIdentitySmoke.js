const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { resolveRuntimeIdentity } = require('../services/runtimeIdentityService');
const { createRuntimeMetaRouter } = require('../routes/runtimeMetaRoutes');

const repositoryRoot = path.resolve(__dirname, '..');
const renderRevision = 'a'.repeat(40);
const railwayRevision = 'b'.repeat(40);
const unavailableBody = { status: 'unavailable' };
const results = { pass: 0, fail: 0, skip: 0 };

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

const createDatabase = (queryImplementation) => {
    const state = { queryCount: 0, statements: [] };
    return {
        state,
        database: {
            query: async (statement) => {
                state.queryCount += 1;
                state.statements.push(statement);
                return queryImplementation(statement);
            }
        }
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
};

(async () => {
    await runRevisionResolutionMatrix();
    await runLiveMatrix();
    await runReadyMatrix();
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
