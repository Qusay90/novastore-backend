'use strict';

// R14 disposable PostgreSQL + real HTTP proof. This harness never opens an
// existing database and never permits outbound provider HTTP.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { format } = require('node:util');
const { pathToFileURL } = require('node:url');
const bcrypt = require('bcrypt');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const EXPECTED_BACKEND_HEAD = '63e604627bca919d2f38143e7d2a65eb82364695';
const EXPECTED_BACKEND_TREE = '0ea2a645f7fd3216a5369bd37e858a45ad1024e1';
const EXPECTED_WEB_HEAD = 'ce76b3ed45576d721fc250cad989f00c27d31690';
const EXPECTED_WEB_TREE = '6af785c48e3fb961e6bef127c6cbfe35029f1ab2';
const EXPECTED_ANDROID_HEAD = '3a00c4b6c5cf1e35fa837c67b8567ebd1a5b28f3';
const EXPECTED_ANDROID_TREE = '8624c358783700ec7c152c9ffcee886532333a53';
const execute = process.argv.includes('--execute-disposable-db');
const serveBrowser = process.argv.includes('--serve-browser');
const postgresBinArgument = process.argv.find((value) => value.startsWith('--postgres-bin='));
const postgresBin = postgresBinArgument ? path.resolve(postgresBinArgument.slice('--postgres-bin='.length)) : null;
const runId = crypto.randomBytes(8).toString('hex');
const containerName = `novastore-r14-returns-${runId}`;
const databaseName = `novastore_pc1_admin_returns_${runId}_test`;
const databaseUser = 'r14_local_test';
const databasePassword = crypto.randomBytes(32).toString('base64url');
const jwtSecret = crypto.randomBytes(48).toString('base64url');
const sellerSecret = crypto.randomBytes(48).toString('base64url');
const sensitive = new Set([databasePassword, jwtSecret, sellerSecret]);
const capturedLogs = [];
const originalConsole = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map((key) => [key, console[key]]));
for (const key of Object.keys(originalConsole)) console[key] = (...args) => capturedLogs.push(format(...args));

const root = path.resolve(__dirname, '..');
const sourceParent = path.dirname(root);
const webRoot = path.join(sourceParent, 'pc1-customer-web-r7-novabot-modes');
const androidRoot = path.join(sourceParent, 'android-customer-r8-r3-carousel-wrap');
let ownedClusterRoot = null;
let nativePgCtl = null;
let nativePgData = null;
let nativeStopProven = false;
let dockerCreated = false;
let pool = null;
let server = null;
let originalFetch = global.fetch;
let outboundAttemptCount = 0;
let browserAdminToken = null;
let browserStopFile = null;
let httpChecks = 0;

const redact = (value) => {
    let text = String(value || '');
    for (const secret of sensitive) if (secret) text = text.split(secret).join('[REDACTED]');
    return text;
};

const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, {
        encoding: 'utf8',
        windowsHide: true,
        timeout: options.timeout || 120000,
        env: options.env || process.env,
        cwd: options.cwd || root
    });
    if (result.status !== 0) {
        throw new Error(`${path.basename(command)} failed: ${redact(result.stderr || result.stdout || result.error?.code)}`);
    }
    return String(result.stdout || '').trim();
};

const gitIdentity = (target) => ({
    head: run('git', ['rev-parse', 'HEAD'], { cwd: target }),
    tree: run('git', ['rev-parse', 'HEAD^{tree}'], { cwd: target })
});

const getFreePort = () => new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
        const port = probe.address().port;
        probe.close((error) => error ? reject(error) : resolve(port));
    });
});

const waitForPostgres = async (connectionString) => {
    let lastCode = 'unknown';
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const client = new Client({ connectionString, ssl: false, connectionTimeoutMillis: 1000 });
        try {
            await client.connect();
            assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, databaseName);
            await client.end();
            return;
        } catch (error) {
            lastCode = error.code || error.message;
            await client.end().catch(() => {});
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
    }
    throw new Error(`Disposable PostgreSQL did not become ready: ${redact(lastCode)}`);
};

const startDockerPostgres = async () => {
    run('docker', [
        'run', '--pull', 'never', '--rm', '--name', containerName, '-d', '-p', '127.0.0.1::5432',
        '-e', 'POSTGRES_DB', '-e', 'POSTGRES_USER', '-e', 'POSTGRES_PASSWORD', 'postgres:16-bookworm'
    ], {
        env: { ...process.env, POSTGRES_DB: databaseName, POSTGRES_USER: databaseUser, POSTGRES_PASSWORD: databasePassword }
    });
    dockerCreated = true;
    const published = run('docker', ['port', containerName, '5432/tcp']);
    const match = /^127\.0\.0\.1:(\d+)$/u.exec(published);
    assert(match, 'Disposable PostgreSQL Docker port must bind only to loopback.');
    return Number(match[1]);
};

const startNativePostgres = async () => {
    assert(postgresBin && path.isAbsolute(postgresBin), '--postgres-bin must be absolute.');
    const initdb = path.join(postgresBin, 'initdb.exe');
    const pgCtl = path.join(postgresBin, 'pg_ctl.exe');
    const createdb = path.join(postgresBin, 'createdb.exe');
    for (const executable of [initdb, pgCtl, createdb]) assert(fs.existsSync(executable), `Missing PostgreSQL binary: ${path.basename(executable)}`);
    ownedClusterRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'novastore-r14-postgres-'));
    assert.equal(path.resolve(path.dirname(ownedClusterRoot)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase(), 'Owned cluster must be directly under the OS temporary directory.');
    assert(/^novastore-r14-postgres-[A-Za-z0-9._-]+$/u.test(path.basename(ownedClusterRoot)), 'Owned cluster name guard.');
    nativePgData = path.join(ownedClusterRoot, 'data');
    const passwordFile = path.join(ownedClusterRoot, 'pwfile');
    const logFile = path.join(ownedClusterRoot, 'postgres.log');
    fs.writeFileSync(passwordFile, databasePassword, { encoding: 'utf8', mode: 0o600 });
    run(initdb, ['-D', nativePgData, '-U', databaseUser, '--pwfile', passwordFile, '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--encoding=UTF8', '--no-locale']);
    fs.rmSync(passwordFile, { force: true });
    const port = await getFreePort();
    nativePgCtl = pgCtl;
    run(pgCtl, ['-D', nativePgData, '-l', logFile, '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    run(createdb, ['-h', '127.0.0.1', '-p', String(port), '-U', databaseUser, databaseName], {
        env: { ...process.env, PGPASSWORD: databasePassword }
    });
    return port;
};

const parseBody = async (response) => {
    const raw = await response.text();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return raw; }
};

const request = async (pathname, { method = 'GET', token = null, body = undefined } = {}) => {
    const response = await global.fetch(`http://127.0.0.1:${server.address().port}${pathname}`, {
        method,
        headers: {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    httpChecks += 1;
    return { status: response.status, body: await parseBody(response), headers: response.headers };
};

const expectStatus = (response, status, label) => {
    assert.equal(response.status, status, `${label}: HTTP ${response.status}, code=${response.body?.code || 'none'}`);
    return response.body;
};

const expectError = (response, status, code, label) => {
    expectStatus(response, status, label);
    if (code) assert.equal(response.body?.code, code, `${label}: canonical error code`);
};

const startHttpHarness = async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/returns', require('../routes/returnRoutes'));
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/admin', require('../routes/adminRoutes'));
    app.get('/__r14/bootstrap/admin', (req, res) => {
        if (!serveBrowser || !browserAdminToken) return res.status(404).type('text/plain').send('Not found');
        const oneTimeToken = browserAdminToken;
        browserAdminToken = null;
        res.set('cache-control', 'no-store');
        return res.type('html').send(`<!doctype html><meta charset="utf-8"><script>localStorage.setItem("nova_admin_token",${JSON.stringify(oneTimeToken)});location.replace("/admin-commerce-pro-live.html");</script>`);
    });
    app.post('/__r14/capability/return-write/:state', (req, res) => {
        if (!serveBrowser || !['on', 'off'].includes(req.params.state)) return res.status(404).json({ code: 'NOT_FOUND' });
        process.env.NOVASTORE_ADMIN_RETURN_WRITE_ENABLED = req.params.state === 'on' ? 'true' : 'false';
        return res.status(200).json({ returnWrite: req.params.state === 'on' });
    });
    app.use(express.static(path.join(root, 'frontend'), { etag: false, maxAge: 0 }));
    app.use((error, _req, res, _next) => res.status(Number(error?.statusCode) || 500).json({ code: error?.code || 'R14_HTTP_ERROR', error: 'Local UAT request failed.' }));
    server = await new Promise((resolve) => {
        const instance = http.createServer(app);
        instance.listen(0, '127.0.0.1', () => resolve(instance));
    });
};

const snapshot = async (returnId) => {
    const result = await pool.query(
        `SELECT r.status, r.revision, r.decision_note, o.refund_status,
                (SELECT COUNT(*)::int FROM return_events e WHERE e.return_id=r.id) AS return_events,
                (SELECT COUNT(*)::int FROM notification_outbox_events e WHERE e.aggregate_type='return_request' AND e.aggregate_id=r.id::text) AS outbox_events
           FROM returns r JOIN orders o ON o.id=r.order_id WHERE r.id=$1`,
        [returnId]
    );
    return result.rows[0] || null;
};

const seedOrder = async (userId, marker) => Number((await pool.query(
    `INSERT INTO orders (user_id,total_amount,status,customer_name,email,items,payment_status,refund_status,delivered_at,currency)
     VALUES ($1,4299.00,'Teslim Edildi',$2,$3,'[]'::jsonb,'PAID','NONE',NOW()-INTERVAL '1 day','TRY') RETURNING id`,
    [userId, `R14 Customer ${marker}`, `r14-${marker}@example.test`]
)).rows[0].id);

const createReturn = (token, orderId, note) => request('/api/returns', {
    method: 'POST', token, body: { order_id: orderId, reason_code: 'DAMAGED', note }
});

const patchReturn = (token, returnId, status, expectedRevision, decisionNote = undefined) => request(`/api/returns/${returnId}/status`, {
    method: 'PATCH', token, body: {
        status,
        expected_revision: expectedRevision,
        ...(decisionNote === undefined ? {} : { decision_note: decisionNote })
    }
});

const loadAndroidNormalizer = async () => {
    const sourcePath = path.join(androidRoot, 'v413-ui', 'src', 'account', 'customerAccountApi.ts');
    const vitePath = path.join(androidRoot, 'v413-ui', 'node_modules', 'vite', 'dist', 'node', 'index.js');
    const vite = await import(pathToFileURL(vitePath).href);
    const loaded = await vite.runnerImport(sourcePath, { root: path.join(androidRoot, 'v413-ui'), logLevel: 'silent' });
    return loaded.module.customerAccountApiTestUtils.normalizeCustomerReturn;
};

const waitForBrowserStop = async () => {
    browserStopFile = path.join(os.tmpdir(), `novastore-r14-stop-${runId}.signal`);
    fs.rmSync(browserStopFile, { force: true });
    originalConsole.log(`R14_BROWSER_BASE_URL=http://127.0.0.1:${server.address().port}`);
    originalConsole.log(`R14_BROWSER_BOOTSTRAP=http://127.0.0.1:${server.address().port}/__r14/bootstrap/admin`);
    originalConsole.log(`R14_BROWSER_STOP_FILE=${browserStopFile}`);
    originalConsole.log('R14 browser fixture ready; create the stop file or press Enter to clean up.');
    await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            clearInterval(interval);
            process.stdin.removeListener('data', finish);
            process.removeListener('SIGINT', finish);
            resolve();
        };
        const interval = setInterval(() => { if (fs.existsSync(browserStopFile)) finish(); }, 500);
        process.stdin.once('data', finish);
        process.once('SIGINT', finish);
    });
    fs.rmSync(browserStopFile, { force: true });
};

(async () => {
    assert(execute, 'Use --execute-disposable-db to authorize creation and cleanup of an isolated local PostgreSQL target.');
    assert(/^novastore-r14-returns-[a-f0-9]{16}$/u.test(containerName));
    assert(/^novastore_pc1_admin_returns_[a-f0-9]{16}_test$/u.test(databaseName));
    assert.equal(run('git', ['rev-parse', `${EXPECTED_BACKEND_HEAD}^{tree}`], { cwd: root }), EXPECTED_BACKEND_TREE, 'Accepted backend base tree identity.');
    run('git', ['merge-base', '--is-ancestor', EXPECTED_BACKEND_HEAD, 'HEAD'], { cwd: root });
    assert.deepEqual(gitIdentity(webRoot), { head: EXPECTED_WEB_HEAD, tree: EXPECTED_WEB_TREE });
    assert.deepEqual(gitIdentity(androidRoot), { head: EXPECTED_ANDROID_HEAD, tree: EXPECTED_ANDROID_TREE });

    const port = postgresBin ? await startNativePostgres() : await startDockerPostgres();
    const connectionString = `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@127.0.0.1:${port}/${databaseName}`;
    sensitive.add(connectionString);
    await waitForPostgres(connectionString);
    Object.assign(process.env, {
        NODE_ENV: 'test', NOVASTORE_DEPLOY_ENV: 'local', NOVASTORE_SAFE_LOCAL_BACKEND: 'true', NOVASTORE_ALLOW_REMOTE_DB: 'false',
        SKIP_SCHEMA_INIT: 'true', NOVASTORE_ALLOW_SCHEMA_INIT: 'false', DATABASE_URL: connectionString,
        DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName, DB_USER: databaseUser, DB_PASSWORD: databasePassword,
        DB_SSL: 'false', SUPABASE_USE_POOLER: 'false', SUPABASE_POOLER_HOST: '', SUPABASE_REGION: '', SUPABASE_PROJECT_REF: '',
        JWT_SECRET: jwtSecret, SELLER_ACCESS_TOKEN_SECRET: sellerSecret, NOVASTORE_NOTIFICATION_WORKER_ENABLED: 'false',
        NOVASTORE_ADMIN_RETURN_WRITE_ENABLED: 'true', NOVASTORE_RETURN_WINDOW_DAYS: '14', NOVASTORE_REQUEST_LOGGING_ENABLED: 'false',
        PAYMENT_PROVIDER: 'paytr', PAYTR_LIVE_REQUESTS_ALLOWED: 'false'
    });
    const { LOCAL_TEST_CAPABILITY } = require('../scripts/staging-migrations/guard');
    const { loadRegistry } = require('../scripts/staging-migrations/registry');
    const { runApply } = require('../scripts/staging-migrations/runner');
    const registry = loadRegistry();
    const migrationEnv = {
        NODE_ENV: 'test', NOVASTORE_DEPLOY_ENV: 'staging', NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
        NOVASTORE_ALLOW_REMOTE_DB: 'true', NOVASTORE_EXPECTED_DATABASE_HOST: '127.0.0.1',
        NOVASTORE_EXPECTED_DATABASE_NAME: databaseName, [LOCAL_TEST_CAPABILITY]: 'true', DATABASE_URL: connectionString
    };
    assert.deepEqual((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, registry.map((entry) => entry.id));
    assert.deepEqual((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, []);
    const serverModule = require.resolve('../server');
    require.cache[serverModule] = { id: serverModule, filename: serverModule, loaded: true, exports: { io: null } };
    pool = require('../config/db');
    global.fetch = async (url, options) => {
        const parsed = new URL(url);
        if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
            outboundAttemptCount += 1;
            throw new Error('Outbound provider HTTP is forbidden in R14 local UAT.');
        }
        return originalFetch(url, options);
    };

    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 4);
    const userRows = (await pool.query(
        `INSERT INTO users (full_name,email,password,role,auth_enabled) VALUES
         ('R14 Admin','r14-admin@example.test',$1,'admin',TRUE),
         ('R14 Lower Admin','r14-lower@example.test',$1,'admin',TRUE),
         ('R14 Revoked Admin','r14-revoked@example.test',$1,'admin',TRUE),
         ('R14 Customer A','r14-customer-a@example.test',$1,'customer',TRUE),
         ('R14 Customer B','r14-customer-b@example.test',$1,'customer',TRUE)
         RETURNING id,email`, [passwordHash]
    )).rows;
    const users = Object.fromEntries(userRows.map((row) => [row.email, Number(row.id)]));
    const { issueAccessSession } = require('../services/authSessionService');
    const issue = (userId, role, principal) => issueAccessSession({ userId, role, principal, queryable: pool });
    const admin = await issue(users['r14-admin@example.test'], 'admin', 'admin');
    const lower = await issue(users['r14-lower@example.test'], 'admin', 'admin');
    const revoked = await issue(users['r14-revoked@example.test'], 'admin', 'admin');
    const customerA = await issue(users['r14-customer-a@example.test'], 'customer', 'customer');
    const customerB = await issue(users['r14-customer-b@example.test'], 'customer', 'customer');
    for (const session of [admin, lower, revoked, customerA, customerB]) sensitive.add(session.token);
    await pool.query("UPDATE users SET role='customer' WHERE id=$1", [users['r14-lower@example.test']]);
    await pool.query("UPDATE auth_sessions SET revoked_at=NOW(),revoke_reason='r14_test' WHERE id=$1", [revoked.sessionId]);
    const expiredToken = jwt.sign(
        { id: users['r14-admin@example.test'], role: 'admin', principal: 'admin' },
        jwtSecret,
        { algorithm: 'HS256', audience: 'novastore-admin', issuer: 'novastore-api', subject: String(users['r14-admin@example.test']), jwtid: crypto.randomBytes(32).toString('base64url'), expiresIn: -10 }
    );
    sensitive.add(expiredToken);
    const { createSellerAccessTokenService } = require('../services/sellerAccessTokenService');
    const sellerToken = createSellerAccessTokenService({ secret: sellerSecret }).issue({
        sessionId: crypto.randomUUID(), userId: users['r14-customer-b@example.test']
    });
    sensitive.add(sellerToken);

    await startHttpHarness();
    const maliciousNote = '<img src=x onerror=alert(1)> R14 müşteri notu';
    const orderA = await seedOrder(users['r14-customer-a@example.test'], 'approved');
    const orderB = await seedOrder(users['r14-customer-a@example.test'], 'rejected');
    const orderC = await seedOrder(users['r14-customer-a@example.test'], 'payload');
    const orderD = await seedOrder(users['r14-customer-a@example.test'], 'in-review');
    const sellerOrganizationId = Number((await pool.query(
        "INSERT INTO seller_organizations (external_key,display_name) VALUES ($1,'R14 Seller-owned Return Organization') RETURNING id",
        [crypto.randomUUID()]
    )).rows[0].id);
    const sellerStoreId = Number((await pool.query(
        "INSERT INTO seller_stores (organization_id,display_name) VALUES ($1,'R14 Seller-owned Return Store') RETURNING id",
        [sellerOrganizationId]
    )).rows[0].id);
    await pool.query(
        "INSERT INTO seller_orders (organization_id,store_id,canonical_order_id,status,currency,gross_minor) VALUES ($1,$2,$3,'delivered','TRY',429900)",
        [sellerOrganizationId, sellerStoreId, orderA]
    );
    const tooLongCreateBefore = Number((await pool.query('SELECT COUNT(*) AS n FROM returns WHERE order_id=$1', [orderB])).rows[0].n);
    expectError(await createReturn(customerA.token, orderB, 'n'.repeat(1001)), 400, 'RETURN_VALIDATION_FAILED', 'Customer note max+1');
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM returns WHERE order_id=$1', [orderB])).rows[0].n), tooLongCreateBefore);
    expectError(await request('/api/returns', { method: 'POST', token: customerA.token, body: { order_id: orderC, reason_code: 'DAMAGED', note: 'valid', owner_id: users['r14-customer-b@example.test'] } }), 400, 'RETURN_VALIDATION_FAILED', 'Strict return payload');

    const createdA = expectStatus(await createReturn(customerA.token, orderA, maliciousNote), 201, 'Customer creates approved-path return');
    const returnA = Number(createdA.return.id);
    assert.equal(createdA.return.status, 'REQUESTED');
    assert.equal(createdA.return.note, maliciousNote);
    const adminDetail = expectStatus(await request(`/api/returns/${returnA}`, { token: admin.token }), 200, 'Admin exact detail');
    assert.equal(adminDetail.id, returnA);
    assert.equal(adminDetail.note, maliciousNote);
    for (const key of ['order_id', 'reason_code', 'status', 'revision', 'decision_note', 'decided_at', 'created_at', 'updated_at', 'refund_amount', 'order_status', 'payment_status', 'refund_status']) assert(Object.hasOwn(adminDetail, key), `Admin exact detail field ${key}`);
    expectError(await request(`/api/returns/${returnA}`, { token: customerB.token }), 404, null, 'Return detail IDOR');
    for (const [label, token] of [
        ['seller exact detail', sellerToken], ['expired exact detail', expiredToken],
        ['revoked exact detail', revoked.token], ['live-demoted lower Admin exact detail', lower.token]
    ]) {
        const response = await request(`/api/returns/${returnA}`, { token });
        assert([401, 403].includes(response.status), `${label} must be denied`);
    }
    assert.equal(expectStatus(await request(`/api/returns/${returnA}`, { token: customerA.token }), 200, 'Customer exact return').status, 'REQUESTED');
    assert(expectStatus(await request('/api/returns/mine', { token: customerA.token }), 200, 'Customer return history').some((row) => Number(row.id) === returnA));

    const deniedBefore = await snapshot(returnA);
    for (const [label, body, expectedCode] of [
        ['missing expected_revision', { status: 'IN_REVIEW' }, 'RETURN_REVISION_REQUIRED'],
        ['zero expected_revision', { status: 'IN_REVIEW', expected_revision: 0 }, 'RETURN_REVISION_REQUIRED'],
        ['fractional expected_revision', { status: 'IN_REVIEW', expected_revision: 1.5 }, 'RETURN_REVISION_REQUIRED'],
        ['forged owner field', { status: 'IN_REVIEW', expected_revision: 1, owner_id: users['r14-customer-b@example.test'] }, 'RETURN_VALIDATION_FAILED']
    ]) {
        expectError(await request(`/api/returns/${returnA}/status`, { method: 'PATCH', token: admin.token, body }), 400, expectedCode, label);
        assert.deepEqual(await snapshot(returnA), deniedBefore, `${label} DML/event=0`);
    }
    for (const [label, token] of [
        ['customer token', customerA.token], ['seller token', sellerToken], ['expired admin', expiredToken],
        ['revoked admin', revoked.token], ['live-demoted lower admin', lower.token]
    ]) {
        const response = await patchReturn(token, returnA, 'IN_REVIEW', 1);
        assert([401, 403].includes(response.status), `${label} must be denied before mutation`);
        assert.deepEqual(await snapshot(returnA), deniedBefore, `${label} DML=0`);
    }

    process.env.NOVASTORE_ADMIN_RETURN_WRITE_ENABLED = 'false';
    expectError(await patchReturn(admin.token, returnA, 'IN_REVIEW', 1), 503, 'ADMIN_COMMERCE_CAPABILITY_DISABLED', 'Capability-disabled mutation');
    assert.deepEqual(await snapshot(returnA), deniedBefore, 'Capability-disabled DML=0');
    process.env.NOVASTORE_ADMIN_RETURN_WRITE_ENABLED = 'true';

    const reviewA = expectStatus(await patchReturn(admin.token, returnA, 'IN_REVIEW', 1), 200, 'Admin REQUESTED to IN_REVIEW');
    assert.equal(reviewA.return.revision, 2);
    assert.equal(expectStatus(await request(`/api/returns/${returnA}`, { token: customerA.token }), 200, 'Customer observes IN_REVIEW').status, 'IN_REVIEW');
    const reusedBefore = await snapshot(returnA);
    const reused = expectStatus(await patchReturn(admin.token, returnA, 'IN_REVIEW', 2), 200, 'Same-state replay');
    assert.equal(reused.reused, true);
    assert.deepEqual(await snapshot(returnA), reusedBefore, 'Same-state replay event/DML=0');
    expectError(await patchReturn(admin.token, returnA, 'APPROVED', 1, 'stale'), 409, 'RETURN_REVISION_CONFLICT', 'Stale revision');
    assert.deepEqual(await snapshot(returnA), reusedBefore, 'Stale revision DML=0');
    expectError(await patchReturn(admin.token, returnA, 'APPROVED', 2), 400, 'RETURN_VALIDATION_FAILED', 'Required decision note');
    assert.deepEqual(await snapshot(returnA), reusedBefore, 'Missing decision note DML=0');
    const approvedA = expectStatus(await patchReturn(admin.token, returnA, 'APPROVED', 2, 'İnceleme tamamlandı; iade talebi onaylandı.'), 200, 'Admin IN_REVIEW to APPROVED');
    assert.equal(approvedA.refundProviderExecuted, false);
    assert.equal(approvedA.refundProviderRequired, true);
    const approvedCustomer = expectStatus(await request(`/api/returns/${returnA}`, { token: customerA.token }), 200, 'Customer observes APPROVED');
    assert.equal(approvedCustomer.status, 'APPROVED');
    assert.equal(approvedCustomer.refund_status, 'PENDING');
    assert.equal(approvedCustomer.payment_status, 'PAID');
    assert.deepEqual(
        (await pool.query('SELECT status,revision FROM seller_returns WHERE canonical_return_id=$1', [returnA])).rows[0],
        { status: 'closed', revision: '3' },
        'Owner-confirmed Platform Admin decision propagates to the Seller-owned projection.'
    );

    const createdB = expectStatus(await createReturn(customerA.token, orderB, 'b'.repeat(1000)), 201, 'Customer note exact max');
    const returnB = Number(createdB.return.id);
    expectStatus(await patchReturn(admin.token, returnB, 'IN_REVIEW', 1), 200, 'Rejected path enters review');
    const decisionBoundBefore = await snapshot(returnB);
    expectError(await patchReturn(admin.token, returnB, 'REJECTED', 2, 'd'.repeat(1001)), 400, 'RETURN_VALIDATION_FAILED', 'Decision note max+1');
    expectError(await patchReturn(admin.token, returnB, 'REJECTED', 2, 'control\ncharacter'), 400, 'RETURN_VALIDATION_FAILED', 'Decision note control character');
    assert.deepEqual(await snapshot(returnB), decisionBoundBefore, 'Rejected decision validation DML=0');
    const rejectedB = expectStatus(await patchReturn(admin.token, returnB, 'REJECTED', 2, 'd'.repeat(1000)), 200, 'Admin IN_REVIEW to REJECTED');
    assert.equal(rejectedB.return.status, 'REJECTED');
    assert.equal(expectStatus(await request(`/api/returns/${returnB}`, { token: customerA.token }), 200, 'Customer observes REJECTED').status, 'REJECTED');
    const reapplied = expectStatus(await createReturn(customerA.token, orderB, 'Aynı sipariş için yeni ve ayrı başvuru.'), 201, 'Rejected-order reapplication');
    assert.notEqual(Number(reapplied.return.id), returnB);
    assert.equal((await pool.query('SELECT status FROM returns WHERE id=$1', [returnB])).rows[0].status, 'REJECTED');
    const createdD = expectStatus(await createReturn(customerA.token, orderD, 'Tarafsız inceleme bekleyen tarayıcı fixture kaydı.'), 201, 'IN_REVIEW browser fixture create');
    expectStatus(await patchReturn(admin.token, Number(createdD.return.id), 'IN_REVIEW', 1), 200, 'IN_REVIEW browser fixture transition');

    await pool.query(
        `WITH inserted_orders AS (
           INSERT INTO orders (user_id,total_amount,status,customer_name,email,items,payment_status,refund_status,delivered_at,currency,created_at)
           SELECT $1,10.00,'Teslim Edildi','R14 Page Customer','r14-page@example.test','[]'::jsonb,'PAID','REQUESTED',NOW()-INTERVAL '1 day','TRY',NOW()-(n||' minutes')::interval
           FROM generate_series(1,102) n RETURNING id,created_at
         )
         INSERT INTO returns (order_id,user_id,reason_code,note,status,refund_amount,revision,created_at,updated_at)
         SELECT id,$1,'OTHER','pagination fixture','REQUESTED',10.00,1,created_at,created_at FROM inserted_orders`,
        [users['r14-customer-a@example.test']]
    );
    const canonicalIds = (await pool.query(
        `SELECT r.id FROM returns r ORDER BY CASE r.status WHEN 'REQUESTED' THEN 0 WHEN 'IN_REVIEW' THEN 1 WHEN 'APPROVED' THEN 2 WHEN 'COMPLETED' THEN 3 ELSE 4 END, r.created_at DESC NULLS LAST, r.id DESC`
    )).rows.map((row) => Number(row.id));
    const traversed = [];
    let cursor = null;
    do {
        const page = expectStatus(await request(`/api/admin/returns/summary?limit=17${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { token: admin.token }), 200, 'Admin keyset return page');
        assert(page.items.length <= 17);
        traversed.push(...page.items.map((row) => Number(row.id)));
        cursor = page.nextCursor;
        assert.equal(page.hasMore, Boolean(cursor));
    } while (cursor);
    assert.deepEqual(traversed, canonicalIds, 'Keyset traversal reaches every return exactly once in canonical order.');
    assert(traversed.length >= 106, 'Admin return record 101 is reachable.');
    assert.equal(new Set(traversed).size, traversed.length, 'No duplicate across Admin return pages.');
    expectError(await request('/api/admin/returns/summary?limit=17&cursor=not-a-cursor', { token: admin.token }), 400, 'ADMIN_RETURN_CURSOR_INVALID', 'Invalid Admin return cursor');

    const webModule = await import(`${pathToFileURL(path.join(webRoot, 'storefront-commerce-pro', 'src', 'adapters', 'customerAccountAdapter.js')).href}?r14=${runId}`);
    const webAdapter = webModule.createCustomerAccountAdapter({
        http: {
            async request(target, options = {}) {
                const response = await request(target, { method: options.method || 'GET', token: customerA.token, body: options.body });
                if (response.status < 200 || response.status >= 300) throw new Error(`Web adapter HTTP ${response.status}`);
                return response.body;
            }
        },
        storage: { getItem: () => null, setItem() {}, removeItem() {} },
        eventTarget: { dispatchEvent() {} }
    });
    const webOrder = (await webAdapter.listOrders({ user: { id: users['r14-customer-a@example.test'] } })).find((row) => row.id === orderA);
    assert.equal(webOrder.returnId, returnA);
    assert.equal(webOrder.returnStatus, 'APPROVED');
    assert.equal(webOrder.returnDecisionNote, 'İnceleme tamamlandı; iade talebi onaylandı.');
    assert.equal(webOrder.refundStatus, 'PENDING');

    const normalizeAndroidReturn = await loadAndroidNormalizer();
    const androidReturn = normalizeAndroidReturn(approvedCustomer);
    assert(androidReturn, 'Accepted Android return normalizer must accept canonical HTTP detail.');
    assert.equal(androidReturn.id, returnA);
    assert.equal(androidReturn.status, 'APPROVED');
    assert.equal(androidReturn.revision, 3);
    assert.equal(androidReturn.decisionNote, 'İnceleme tamamlandı; iade talebi onaylandı.');
    assert.equal(androidReturn.refundStatus, 'PENDING');
    assert.equal(androidReturn.paymentStatus, 'PAID');

    const eventTruth = (await pool.query(
        `SELECT r.id,r.status,r.revision,o.refund_status,o.payment_status,
                (SELECT COUNT(*)::int FROM return_events e WHERE e.return_id=r.id) AS transition_events,
                (SELECT COUNT(*)::int FROM notification_outbox_events e WHERE e.aggregate_type='return_request' AND e.aggregate_id=r.id::text AND e.event_type='RETURN_STATUS_CHANGED') AS status_notifications
           FROM returns r JOIN orders o ON o.id=r.order_id
          WHERE r.id=ANY($1::int[]) ORDER BY r.id`,
        [[returnA, returnB]]
    )).rows;
    assert.deepEqual(eventTruth.map((row) => Number(row.transition_events)), [3, 3]);
    assert.deepEqual(eventTruth.map((row) => Number(row.status_notifications)), [2, 2]);
    assert.equal(eventTruth.find((row) => Number(row.id) === returnA).refund_status, 'PENDING');
    assert.equal(eventTruth.find((row) => Number(row.id) === returnA).payment_status, 'PAID', 'Approval must preserve truthful paid state.');
    assert.equal(outboundAttemptCount, 0, 'Provider/refund outbound HTTP calls=0.');
    for (const entry of capturedLogs) for (const secret of sensitive) assert(!entry.includes(secret), 'Secret exposure in captured logs.');

    browserAdminToken = (await issue(users['r14-admin@example.test'], 'admin', 'admin')).token;
    sensitive.add(browserAdminToken);
    originalConsole.log(`adminReturnProcessingPostgresSmoke PASS: ${httpChecks} real HTTP checks; approved+rejected propagation, auth/live revocation, IDOR, stale revision, bounded notes, capability DML=0, record 101, Web+Android canonical adapters; provider calls=0; production writes=0; secret exposure=0`);
    if (serveBrowser) await waitForBrowserStop();
})().catch((error) => {
    originalConsole.error(`adminReturnProcessingPostgresSmoke FAIL: ${redact(error.stack || error.message)}`);
    process.exitCode = 1;
}).finally(async () => {
    global.fetch = originalFetch;
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end().catch(() => {});
    if (nativePgCtl && nativePgData && fs.existsSync(nativePgData)) {
        try {
            run(nativePgCtl, ['-D', nativePgData, '-m', 'fast', '-w', 'stop']);
            nativeStopProven = true;
        }
        catch (error) { originalConsole.error(redact(error.message)); process.exitCode = 1; }
    }
    if (ownedClusterRoot && fs.existsSync(ownedClusterRoot) && nativeStopProven) {
        const resolved = path.resolve(ownedClusterRoot);
        assert.equal(path.resolve(path.dirname(resolved)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
        assert(/^novastore-r14-postgres-[A-Za-z0-9._-]+$/u.test(path.basename(resolved)));
        fs.rmSync(resolved, { recursive: true, force: true });
    } else if (ownedClusterRoot && fs.existsSync(ownedClusterRoot) && !nativeStopProven) {
        originalConsole.error(`R14 cleanup preserved unproven PostgreSQL cluster: ${ownedClusterRoot}`);
    }
    if (dockerCreated) {
        assert(/^novastore-r14-returns-[a-f0-9]{16}$/u.test(containerName));
        try { run('docker', ['rm', '-f', containerName]); }
        catch (error) { originalConsole.error(redact(error.message)); process.exitCode = 1; }
    }
    if (browserStopFile) fs.rmSync(browserStopFile, { force: true });
    for (const [key, value] of Object.entries(originalConsole)) console[key] = value;
});
