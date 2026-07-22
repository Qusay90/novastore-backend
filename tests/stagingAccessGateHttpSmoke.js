const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const express = require('express');
const bcrypt = require('bcrypt');
const {
    COOKIE_NAME,
    SESSION_MAX_AGE_SECONDS,
    createSignedSessionToken,
    createStagingAccessGate,
    createStagingEngineAccessGate
} = require('../middlewares/stagingAccessGate');
const { resolveStagingRuntimePolicy } = require('../config/stagingRuntimePolicy');

const rootDir = path.join(__dirname, '..');
const syntheticUsername = 'synthetic-p4d1b-user';
const syntheticPassword = 'synthetic-p4d1b-password';
const syntheticSessionSecret = 'synthetic-p4d1b-session-secret-for-tests-only';
const syntheticHashShape = `$2b$12$${'A'.repeat(53)}`;

const stagingEnv = (overrides = {}) => ({
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_STAGING_ACCESS_GATE_ENABLED: 'true',
    NOVASTORE_STAGING_ACCESS_USERNAME: syntheticUsername,
    NOVASTORE_STAGING_ACCESS_PASSWORD_HASH: syntheticHashShape,
    NOVASTORE_STAGING_ACCESS_SESSION_SECRET: syntheticSessionSecret,
    NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED: 'true',
    NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED: 'false',
    NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED: 'false',
    NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED: 'false',
    NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED: 'false',
    AI_PROVIDER: 'mock',
    AI_PROVIDER_FALLBACK_ENABLED: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    ...overrides
});

const request = ({ port, pathname, method = 'GET', headers = {}, body = null }) => new Promise((resolve, reject) => {
    const req = http.request({
        host: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: {
            ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
            ...headers
        }
    }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8')
        }));
    });
    req.on('error', reject);
    req.end(body);
});

const listen = (app) => new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const close = (server) => new Promise((resolve) => server.close(resolve));

const reservePort = () => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        server.close((error) => error ? reject(error) : resolve(port));
    });
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const counts = { access: 0, loopback: 0 };
const check = async (section, name, fn) => {
    try {
        await fn();
        counts[section] += 1;
    } catch (error) {
        error.message = `${name}: ${error.message}`;
        throw error;
    }
};

const form = (values) => new URLSearchParams(values).toString();

(async () => {
    let nowMs = Date.UTC(2026, 6, 22, 12, 0, 0);
    const app = express();
    const gate = createStagingAccessGate({
        environment: stagingEnv(),
        comparePassword: async (password) => password === syntheticPassword,
        now: () => nowMs,
        randomBytes: (size) => Buffer.alloc(size, 7)
    });
    app.use(gate);
    app.use(express.json());
    app.get('/api/health/live', (_req, res) => res.status(200).json({ status: 'live' }));
    app.get('/api/health/ready', (_req, res) => res.status(200).json({ status: 'ready' }));
    app.options('/api/products', (_req, res) => res.status(204).end());
    app.all('/api/private', (req, res) => res.status(200).json({
        authorization: req.headers.authorization || null,
        accountAuthenticated: Boolean(req.user)
    }));
    app.get('/events', (_req, res) => res.status(200).type('text/event-stream').send('data: unsafe\n\n'));
    app.get('/asset.js', (_req, res) => res.status(200).type('js').send('unsafe'));
    app.get('*path', (_req, res) => res.status(200).type('html').send('<h1>protected</h1>'));

    const server = await listen(app);
    const port = server.address().port;
    let authenticatedCookie = null;

    try {
        await check('access', '1 missing gate flag rejects startup', () => {
            const env = stagingEnv();
            delete env.NOVASTORE_STAGING_ACCESS_GATE_ENABLED;
            assert.equal(resolveStagingRuntimePolicy(env).canStart, false);
        });

        await check('access', '2 false gate flag rejects startup', () => {
            assert.equal(resolveStagingRuntimePolicy(stagingEnv({
                NOVASTORE_STAGING_ACCESS_GATE_ENABLED: 'false'
            })).canStart, false);
        });

        await check('access', '3 missing access identity fields reject startup', () => {
            for (const key of [
                'NOVASTORE_STAGING_ACCESS_USERNAME',
                'NOVASTORE_STAGING_ACCESS_PASSWORD_HASH',
                'NOVASTORE_STAGING_ACCESS_SESSION_SECRET'
            ]) {
                const env = stagingEnv();
                delete env[key];
                assert.equal(resolveStagingRuntimePolicy(env).canStart, false, key);
            }
        });

        await check('access', '4 malformed or weak password hashes reject startup', () => {
            for (const value of ['', '$2b$10$' + 'A'.repeat(53), '$2b$15$' + 'A'.repeat(53), 'plain-text']) {
                assert.equal(resolveStagingRuntimePolicy(stagingEnv({
                    NOVASTORE_STAGING_ACCESS_PASSWORD_HASH: value
                })).canStart, false);
            }
        });

        await check('access', '5 storefront static admin and API paths are protected', async () => {
            const root = await request({ port, pathname: '/', headers: { Accept: 'text/html' } });
            const asset = await request({ port, pathname: '/asset.js' });
            const admin = await request({ port, pathname: '/admin.html', headers: { Accept: 'text/html' } });
            const api = await request({ port, pathname: '/api/private' });
            assert.equal(root.status, 302);
            assert.equal(root.headers.location, '/_staging/access');
            assert.equal(asset.status, 401);
            assert.equal(admin.status, 302);
            assert.equal(api.status, 401);
        });

        await check('access', '6 exact health GET and HEAD bypass the perimeter', async () => {
            for (const pathname of ['/api/health/live', '/api/health/ready']) {
                assert.equal((await request({ port, pathname })).status, 200);
                assert.equal((await request({ port, pathname, method: 'HEAD' })).status, 200);
            }
        });

        await check('access', '7 health prefix trailing encoded and method bypasses fail', async () => {
            const attempts = [
                { pathname: '/api/health/live/' },
                { pathname: '/api/health/live/extra' },
                { pathname: '/api/health/%6cive' },
                { pathname: '/api/health/live', method: 'POST' }
            ];
            for (const attempt of attempts) {
                assert.equal((await request({ port, ...attempt })).status, 401);
            }
        });

        await check('access', '7a unauthenticated OPTIONS never bypasses the perimeter', async () => {
            for (const pathname of [
                '/api/products',
                '/api/version',
                '/api/health/live',
                '/api/health/ready'
            ]) {
                const result = await request({ port, pathname, method: 'OPTIONS' });
                assert.equal(result.status, 401, pathname);
                assert.deepEqual(JSON.parse(result.body), { error: 'Staging access required.' });
            }
        });

        await check('access', '8 wrong credential receives a generic rejection', async () => {
            const body = form({ username: syntheticUsername, password: 'wrong-synthetic-password' });
            const result = await request({
                port,
                pathname: '/_staging/access',
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
            });
            assert.equal(result.status, 401);
            assert.doesNotMatch(result.body, new RegExp(syntheticUsername));
            assert.doesNotMatch(result.body, /wrong-synthetic-password/);
        });

        await check('access', '9 correct synthetic credential receives a signed session', async () => {
            const body = form({ username: syntheticUsername, password: syntheticPassword });
            const result = await request({
                port,
                pathname: '/_staging/access',
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
            });
            assert.equal(result.status, 303);
            assert.equal(result.headers.location, '/');
            assert.ok(result.headers['set-cookie']?.[0]);
            authenticatedCookie = result.headers['set-cookie'][0].split(';')[0];
            assert.match(authenticatedCookie, new RegExp(`^${COOKIE_NAME}=`));
        });

        await check('access', '10 cookie security attributes and lifetime are exact', async () => {
            const body = form({ username: syntheticUsername, password: syntheticPassword });
            const result = await request({
                port,
                pathname: '/_staging/access',
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
            });
            const cookie = result.headers['set-cookie'][0];
            assert.match(cookie, new RegExp(`^${COOKIE_NAME}=`));
            assert.match(cookie, /; HttpOnly/i);
            assert.match(cookie, /; Secure/i);
            assert.match(cookie, /; SameSite=Strict/i);
            assert.match(cookie, /; Path=\//i);
            assert.match(cookie, new RegExp(`; Max-Age=${SESSION_MAX_AGE_SECONDS}(?:;|$)`, 'i'));
            assert.doesNotMatch(cookie, /; Domain=/i);
        });

        await check('access', '10a authenticated OPTIONS reaches the downstream CORS boundary', async () => {
            const result = await request({
                port,
                pathname: '/api/products',
                method: 'OPTIONS',
                headers: { Cookie: authenticatedCookie }
            });
            assert.equal(result.status, 204);
            assert.equal(result.body, '');
        });

        await check('access', '11 tampered cookie fails closed', async () => {
            const tampered = `${authenticatedCookie.slice(0, -1)}x`;
            const result = await request({ port, pathname: '/api/private', headers: { Cookie: tampered } });
            assert.equal(result.status, 401);
        });

        await check('access', '12 expired cookie fails closed', async () => {
            const expired = createSignedSessionToken({
                sessionSecret: syntheticSessionSecret,
                now: () => nowMs - (SESSION_MAX_AGE_SECONDS + 60) * 1000,
                randomBytes: (size) => Buffer.alloc(size, 3)
            });
            const result = await request({
                port,
                pathname: '/api/private',
                headers: { Cookie: `${COOKIE_NAME}=${expired}` }
            });
            assert.equal(result.status, 401);
        });

        await check('access', '13 failed login rate limit is bounded', async () => {
            let last;
            for (let index = 0; index < 6; index += 1) {
                const body = form({ username: 'synthetic-rate-user', password: 'wrong' });
                last = await request({
                    port,
                    pathname: '/_staging/access',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body
                });
            }
            assert.equal(last.status, 429);
            nowMs += 5 * 60 * 1000 + 1;
        });

        await check('access', '14 credentials in query strings are rejected', async () => {
            const result = await request({
                port,
                pathname: '/_staging/access?username=synthetic&password=synthetic',
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: ''
            });
            assert.equal(result.status, 400);
        });

        await check('access', '15 login has no open redirect surface', async () => {
            const body = form({ username: syntheticUsername, password: syntheticPassword, next: 'https://example.test' });
            const result = await request({
                port,
                pathname: '/_staging/access',
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
            });
            assert.equal(result.status, 303);
            assert.equal(result.headers.location, '/');
        });

        await check('access', '16 Bearer authorization survives a valid perimeter session', async () => {
            const bearer = 'Bearer synthetic-account-token';
            const result = await request({
                port,
                pathname: '/api/private',
                headers: { Cookie: authenticatedCookie, Authorization: bearer }
            });
            assert.equal(result.status, 200);
            assert.equal(JSON.parse(result.body).authorization, bearer);
        });

        await check('access', '17 perimeter cookie does not create account authentication', async () => {
            const result = await request({
                port,
                pathname: '/api/private',
                headers: { Cookie: authenticatedCookie }
            });
            assert.equal(result.status, 200);
            assert.equal(JSON.parse(result.body).accountAuthenticated, false);
        });

        await check('access', '18 credentials headers and cookies are not logged or reflected', async () => {
            const logs = [];
            const originalLog = console.log;
            const originalWarn = console.warn;
            const originalError = console.error;
            console.log = (...args) => logs.push(args.join(' '));
            console.warn = (...args) => logs.push(args.join(' '));
            console.error = (...args) => logs.push(args.join(' '));
            try {
                const result = await request({
                    port,
                    pathname: '/api/private',
                    headers: {
                        Cookie: `${COOKIE_NAME}=synthetic-cookie-marker`,
                        Authorization: 'Bearer synthetic-header-marker'
                    }
                });
                assert.equal(result.status, 401);
                const combined = `${logs.join('\n')}\n${result.body}`;
                assert.doesNotMatch(combined, /synthetic-cookie-marker|synthetic-header-marker/);
            } finally {
                console.log = originalLog;
                console.warn = originalWarn;
                console.error = originalError;
            }
        });

        await check('access', '19 custom and provider hostnames behave identically', async () => {
            for (const host of ['staging.novastore.example', 'novastore-api.example-provider.test']) {
                const result = await request({
                    port,
                    pathname: '/api/private',
                    headers: { Cookie: authenticatedCookie, Host: host }
                });
                assert.equal(result.status, 200);
            }
        });

        await check('access', '20 unauthenticated Socket.IO and SSE paths are rejected', async () => {
            const engineGate = createStagingEngineAccessGate({ environment: stagingEnv(), now: () => nowMs });
            let nextCalls = 0;
            const fakeResponse = {
                statusCode: 200,
                headers: {},
                body: '',
                setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
                end(value = '') { this.body += value; }
            };
            engineGate({ headers: {} }, fakeResponse, () => { nextCalls += 1; });
            assert.equal(fakeResponse.statusCode, 401);
            assert.equal(nextCalls, 0);
            assert.equal((await request({ port, pathname: '/socket.io/?EIO=4&transport=polling' })).status, 401);
            assert.equal((await request({ port, pathname: '/events' })).status, 302);
        });
    } finally {
        await close(server);
    }

    assert.equal(counts.access, 22);

    await check('loopback', '44 actual server loopback integration', async () => {
        const port = await reservePort();
        const syntheticHash = await bcrypt.hash(syntheticPassword, 12);
        const safeSystemEnv = {};
        for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP']) {
            if (process.env[key]) safeSystemEnv[key] = process.env[key];
        }

        const childEnv = {
            ...safeSystemEnv,
            NODE_ENV: 'test',
            PORT: String(port),
            DATABASE_URL: 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_p4d1b_test',
            DB_HOST: '127.0.0.1',
            DB_PORT: '55432',
            DB_NAME: 'novastore_p4d1b_test',
            DB_USER: 'novastore_test',
            DB_PASSWORD: 'novastore_test_only',
            DB_SSL: 'false',
            NOVASTORE_ALLOW_REMOTE_DB: 'false',
            SUPABASE_USE_POOLER: 'false',
            SKIP_SCHEMA_INIT: 'true',
            NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
            NOVASTORE_DEPLOY_ENV: 'staging',
            NOVASTORE_STAGING_ACCESS_GATE_ENABLED: 'true',
            NOVASTORE_STAGING_ACCESS_USERNAME: syntheticUsername,
            NOVASTORE_STAGING_ACCESS_PASSWORD_HASH: syntheticHash,
            NOVASTORE_STAGING_ACCESS_SESSION_SECRET: syntheticSessionSecret,
            NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED: 'true',
            NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED: 'false',
            NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED: 'false',
            NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED: 'false',
            NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED: 'false',
            AI_PROVIDER: 'mock',
            AI_PROVIDER_FALLBACK_ENABLED: 'false',
            JWT_SECRET: 'synthetic-account-jwt-secret-for-tests-only',
            RENDER_GIT_COMMIT: '0000000000000000000000000000000000000000',
            CLIENT_ORIGIN: `http://127.0.0.1:${port}`,
            NOVASTORE_STOREFRONT_MODE: 'commerce-pro'
        };

        const child = spawn(process.execPath, ['server.js'], {
            cwd: rootDir,
            env: childEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        let output = '';
        child.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-12000); });
        child.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-12000); });

        try {
            let live = null;
            for (let attempt = 0; attempt < 80; attempt += 1) {
                if (child.exitCode !== null) break;
                try {
                    live = await request({ port, pathname: '/api/health/live' });
                    if (live.status === 200) break;
                } catch (_) {
                    await delay(100);
                }
            }
            assert.equal(child.exitCode, null, output);
            assert.equal(live?.status, 200, output);

            const unauthenticatedRoot = await request({
                port,
                pathname: '/',
                headers: { Accept: 'text/html' }
            });
            assert.equal(unauthenticatedRoot.status, 302);

            const loginBody = form({ username: syntheticUsername, password: syntheticPassword });
            const login = await request({
                port,
                pathname: '/_staging/access',
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: loginBody
            });
            assert.equal(login.status, 303, output);
            const cookie = login.headers['set-cookie'][0].split(';')[0];

            const root = await request({
                port,
                pathname: '/',
                headers: { Cookie: cookie, Accept: 'text/html' }
            });
            const deepRoute = await request({
                port,
                pathname: '/kategori/elektronik/telefon',
                headers: { Cookie: cookie, Accept: 'text/html' }
            });
            const admin = await request({
                port,
                pathname: '/admin.html',
                headers: { Cookie: cookie, Accept: 'text/html' }
            });
            const socket = await request({ port, pathname: '/socket.io/?EIO=4&transport=polling' });
            const unauthenticatedPreflight = await request({
                port,
                pathname: '/api/products',
                method: 'OPTIONS',
                headers: {
                    Origin: `http://127.0.0.1:${port}`,
                    'Access-Control-Request-Method': 'GET'
                }
            });
            const authenticatedPreflight = await request({
                port,
                pathname: '/api/products',
                method: 'OPTIONS',
                headers: {
                    Cookie: cookie,
                    Origin: `http://127.0.0.1:${port}`,
                    'Access-Control-Request-Method': 'GET'
                }
            });

            assert.equal(root.status, 200);
            assert.match(root.body, /<!doctype html>/i);
            assert.equal(deepRoute.status, 200);
            assert.equal(admin.status, 200);
            assert.equal(socket.status, 401);
            assert.equal(unauthenticatedPreflight.status, 401);
            assert.deepEqual(JSON.parse(unauthenticatedPreflight.body), { error: 'Staging access required.' });
            assert.equal(authenticatedPreflight.status, 204);
            assert.equal(authenticatedPreflight.body, '');
            assert.doesNotMatch(output, /models[\\/]initDb|createCoreDb|createNotificationDb|createCommerceDb|createAnalyticsDb/);
        } finally {
            if (child.exitCode === null) child.kill();
            await Promise.race([
                new Promise((resolve) => child.once('close', resolve)),
                delay(5000)
            ]);
            if (child.exitCode === null) child.kill('SIGKILL');
        }
    });

    assert.deepEqual(counts, { access: 22, loopback: 1 });
    console.log(`stagingAccessGateHttpSmoke: PASS access=${counts.access}/22 loopback=${counts.loopback}/1`);
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
