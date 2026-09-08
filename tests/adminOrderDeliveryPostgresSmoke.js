'use strict';

// R17 disposable PostgreSQL + real HTTP proof. This harness never opens an
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

const EXPECTED_BACKEND_HEAD = 'af8c808995c2bca6f36a11236f96fcaa213b630f';
const EXPECTED_BACKEND_TREE = 'ca1b97ad24b333302230361b9b8085274e4366f7';
const execute = process.argv.includes('--execute-disposable-db');
const serveBrowser = process.argv.includes('--serve-browser');
const postgresBinArgument = process.argv.find((value) => value.startsWith('--postgres-bin='));
const postgresBin = postgresBinArgument ? path.resolve(postgresBinArgument.slice('--postgres-bin='.length)) : null;
const runId = crypto.randomBytes(8).toString('hex');
const containerName = `novastore-r17-returns-${runId}`;
const databaseName = `novastore_pc1_admin_returns_${runId}_test`;
const databaseUser = 'r17_local_test';
const databasePassword = crypto.randomBytes(32).toString('base64url');
const jwtSecret = crypto.randomBytes(48).toString('base64url');
const sellerSecret = crypto.randomBytes(48).toString('base64url');
const sensitive = new Set([databasePassword, jwtSecret, sellerSecret]);
const capturedLogs = [];
const originalConsole = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map((key) => [key, console[key]]));
for (const key of Object.keys(originalConsole)) console[key] = (...args) => capturedLogs.push(format(...args));

const root = path.resolve(__dirname, '..');
const sourceParent = path.dirname(root);


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
    ownedClusterRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'novastore-r17-postgres-'));
    assert.equal(path.resolve(path.dirname(ownedClusterRoot)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase(), 'Owned cluster must be directly under the OS temporary directory.');
    assert(/^novastore-r17-postgres-[A-Za-z0-9._-]+$/u.test(path.basename(ownedClusterRoot)), 'Owned cluster name guard.');
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
    app.use('/api/admin', require('../routes/adminRoutes'));
    app.use('/api/orders', require('../routes/orderRoutes'));
    app.use('/api/addresses', require('../routes/addressRoutes'));
    app.get('/__r17/bootstrap/admin', (_req, res) => {
        if (!serveBrowser || !browserAdminToken) return res.sendStatus(404);
        const token = browserAdminToken; browserAdminToken = null;
        res.set('cache-control', 'no-store');
        return res.type('html').send(`<!doctype html><script>localStorage.setItem("nova_admin_token",${JSON.stringify(token)});location.replace("/admin-commerce-pro-live.html");</script>`);
    });
    app.use(express.static(path.join(root, 'frontend'), { etag: false, maxAge: 0 }));
    app.use((_error, _req, res, _next) => res.status(500).json({ code: 'R17_HTTP_ERROR' }));
    server = await new Promise((resolve) => {
        const instance = http.createServer(app);
        instance.listen(0, '127.0.0.1', () => resolve(instance));
    });
};
const waitForBrowserStop = async () => {
    browserStopFile = path.join(os.tmpdir(), `novastore-r17-stop-${runId}.signal`);
    fs.rmSync(browserStopFile, { force: true });
    originalConsole.log(`R17_BROWSER_BASE_URL=http://127.0.0.1:${server.address().port}`);
    originalConsole.log(`R17_BROWSER_BOOTSTRAP=http://127.0.0.1:${server.address().port}/__r17/bootstrap/admin`);
    originalConsole.log(`R17_BROWSER_STOP_FILE=${browserStopFile}`);
    originalConsole.log('R17 browser fixture ready; create the stop file or press Enter to clean up.');
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
    assert(execute, 'Use --execute-disposable-db.');
    assert.equal(run('git',['rev-parse',`${EXPECTED_BACKEND_HEAD}^{tree}`]),EXPECTED_BACKEND_TREE);
    run('git',['merge-base','--is-ancestor',EXPECTED_BACKEND_HEAD,'HEAD']);
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
            throw new Error('Outbound provider HTTP is forbidden in R17 local UAT.');
        }
        return originalFetch(url, options);
    };

    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 4);
    const userRows = (await pool.query(
        `INSERT INTO users (full_name,email,password,role,auth_enabled) VALUES
         ('R17 Admin','r17-admin@example.test',$1,'admin',TRUE),
         ('R17 Lower Admin','r17-lower@example.test',$1,'admin',TRUE),
         ('R17 Revoked Admin','r17-revoked@example.test',$1,'admin',TRUE),
         ('R17 Customer A','r17-customer-a@example.test',$1,'customer',TRUE),
         ('R17 Customer B','r17-customer-b@example.test',$1,'customer',TRUE)
         RETURNING id,email`, [passwordHash]
    )).rows;
    const users = Object.fromEntries(userRows.map((row) => [row.email, Number(row.id)]));
    const { issueAccessSession } = require('../services/authSessionService');
    const issue = (userId, role, principal) => issueAccessSession({ userId, role, principal, queryable: pool });
    const admin = await issue(users['r17-admin@example.test'], 'admin', 'admin');
    const lower = await issue(users['r17-lower@example.test'], 'admin', 'admin');
    const revoked = await issue(users['r17-revoked@example.test'], 'admin', 'admin');
    const customerA = await issue(users['r17-customer-a@example.test'], 'customer', 'customer');
    const customerB = await issue(users['r17-customer-b@example.test'], 'customer', 'customer');
    for (const session of [admin, lower, revoked, customerA, customerB]) sensitive.add(session.token);
    await pool.query("UPDATE users SET role='customer' WHERE id=$1", [users['r17-lower@example.test']]);
    await pool.query("UPDATE auth_sessions SET revoked_at=NOW(),revoke_reason='r17_test' WHERE id=$1", [revoked.sessionId]);
    const expiredToken = jwt.sign(
        { id: users['r17-admin@example.test'], role: 'admin', principal: 'admin' },
        jwtSecret,
        { algorithm: 'HS256', audience: 'novastore-admin', issuer: 'novastore-api', subject: String(users['r17-admin@example.test']), jwtid: crypto.randomBytes(32).toString('base64url'), expiresIn: -10 }
    );
    sensitive.add(expiredToken);
    const { createSellerAccessTokenService } = require('../services/sellerAccessTokenService');
    const sellerToken = createSellerAccessTokenService({ secret: sellerSecret }).issue({
        sessionId: crypto.randomUUID(), userId: users['r17-customer-b@example.test']
    });
    sensitive.add(sellerToken);


    await startHttpHarness();
    const customerId = users['r17-customer-a@example.test'];
    const addressA = { title:'Yerel A', fullName:'Sentetik Alıcı A', phone:'05551110001', city:'İstanbul', district:'Kadıköy', addressLine:'Yalnız sentetik teslimat adresi A No: 1', isDefault:true };
    const addressB = { ...addressA, title:'Yerel B', fullName:'Sentetik Alıcı B', phone:'05551110002', district:'Beşiktaş', addressLine:'Yalnız sentetik teslimat adresi B No: 2' };
    for (const address of [addressA, addressB]) for (const key of ['fullName','phone','addressLine']) sensitive.add(address[key]);
    const createdAddress = expectStatus(await request('/api/addresses', {method:'POST', token:customerA.token, body:addressA}),201,'address A');
    const addressId = Number(createdAddress.id || createdAddress.address?.id);
    assert(Number.isInteger(addressId));
    const platform = (await pool.query("SELECT id FROM stores WHERE slug='novastore-platform'")).rows[0];
    assert(platform);
    const productId = Number((await pool.query(`INSERT INTO products (name,price,stock,publication_status,is_customer_visible,store_id,sku,normalized_sku) VALUES ('R17 local product',100,20,'active',TRUE,$1,'R17-LOCAL','R17-LOCAL') RETURNING id`,[platform.id])).rows[0].id);
    const {loadOwnedCheckoutAddress,formatCheckoutAddress} = require('../controllers/paymentController').__test;
    const {createPendingPaymentOrder} = require('../services/orderService');
    const createSnapshotOrder = async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const owned = await loadOwnedCheckoutAddress(client,addressId,customerId);
            assert(owned);
            const result = await createPendingPaymentOrder({client,userId:customerId,fullName:owned.full_name,email:owned.email,phone:owned.phone,address:formatCheckoutAddress(owned),cartItems:[{id:productId,quantity:1}]});
            await client.query('COMMIT');
            return Number(result.order.id);
        } catch(error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    };
    const orderA = await createSnapshotOrder();
    const exact = (id,token=admin.token) => request(`/api/admin/orders/${id}`,{token});
    const before = expectStatus(await exact(orderA),200,'exact A');
    const matches = (detail,address) => detail.deliveryRecipient.name===address.fullName && detail.deliveryRecipient.phone===address.phone && detail.deliveryRecipient.addressLine.includes(address.addressLine) && detail.deliveryRecipient.addressLine.includes(address.district) && detail.deliveryRecipient.addressLine.includes(address.city);
    assert(matches(before,addressA),'original snapshot is A');
    expectStatus(await request(`/api/addresses/${addressId}`,{method:'PUT',token:customerA.token,body:addressB}),200,'change same mutable address to B');
    await pool.query('UPDATE users SET full_name=$1,phone=$2 WHERE id=$3',[addressB.fullName,addressB.phone,customerId]);
    const orderB = await createSnapshotOrder();
    const afterA = expectStatus(await exact(orderA),200,'A after customer edit');
    const afterB = expectStatus(await exact(orderB),200,'second B');
    assert(matches(afterA,addressA) && matches(afterB,addressB),'two independent historical snapshots');
    assert(!JSON.stringify(afterA).includes(addressB.phone),'no cross-order phone');
    assert(!JSON.stringify(afterB).includes(addressA.addressLine),'no cross-order address');
    const missingOrderId = Number((await pool.query(`INSERT INTO orders (user_id,total_amount,status,items) VALUES ($1,0,'Ödeme Bekliyor','[]') RETURNING id`,[customerId])).rows[0].id);
    const missing = expectStatus(await exact(missingOrderId),200,'missing legacy snapshot');
    assert.equal(missing.missingDeliveryFields.length,3);
    assert.equal(missing.deliveryRecipient.name,null,'must never fall back to current profile');
    const maliciousAddress = '<img src=x onerror=alert(1)> '+ 'Uzun-sentetik-adres-'.repeat(28);
    const maliciousPhone = '55555'.repeat(4);
    sensitive.add(maliciousAddress); sensitive.add(maliciousPhone);
    const hostileOrderId = Number((await pool.query(`INSERT INTO orders (user_id,total_amount,status,customer_name,phone,address,items) VALUES ($1,0,'Ödeme Bekliyor','R17 text rendering fixture',$2,$3,'[]') RETURNING id`,[customerId,maliciousPhone,maliciousAddress])).rows[0].id);
    assert.equal(expectStatus(await exact(hostileOrderId),200,'text-only hostile fixture').deliveryRecipient.addressLine===maliciousAddress,true);
    for (const token of [null,customerA.token,customerB.token,sellerToken,lower.token,revoked.token,expiredToken]) {
        const response = await exact(orderA,token);
        assert([401,403].includes(response.status),'unauthorized role denied');
        assert(!JSON.stringify(response.body).includes(addressA.phone),'denial has no recipient');
    }
    expectStatus(await exact(2147483647),404,'missing order');
    for (const id of ['0','-1','1e0','1abc','2147483648','01']) expectStatus(await exact(id),400,'invalid exact id');
    for (const selector of ['userId','customerId','storeId']) expectStatus(await request(`/api/admin/orders/${orderA}?${selector}=${customerId}`,{token:admin.token}),400,'client owner selector rejected');
    const list = expectStatus(await request('/api/admin/orders/summary',{token:admin.token}),200,'summary unchanged');
    for (const row of list.items) {
        assert(!Object.hasOwn(row,'phone') && !Object.hasOwn(row,'address') && !Object.hasOwn(row,'deliveryRecipient'));
        assert(!JSON.stringify(row).includes(addressA.phone) && !JSON.stringify(row).includes(addressA.addressLine));
    }
    assert.equal(afterA.paymentStatus,'REQUIRES_ACTION','payment truth remains pending');
    assert.equal(afterA.refundStatus,'NONE','refund truth unchanged');
    const {createGetAdminOrderDetail} = require('../services/adminOrderDetailService');
    const fakeResponse = {status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
    await createGetAdminOrderDetail({query:async()=>{throw new Error(addressA.phone+addressA.addressLine);}})({currentAdmin:{id:1},params:{id:'1'},query:{}},fakeResponse);
    assert.equal(fakeResponse.statusCode,500);
    assert(!JSON.stringify(fakeResponse.body).includes(addressA.phone));
    const result = await exact(orderA);
    assert.match(result.headers.get('cache-control'),/no-store/);
    for (const text of capturedLogs) for (const secret of sensitive) assert(!text.includes(secret),'no logged secret or recipient');
    assert.equal(outboundAttemptCount,0);
    browserAdminToken=admin.token;
    originalConsole.log(JSON.stringify({test:'adminOrderDeliveryPostgresSmoke',result:'PASS',httpChecks,snapshotPreserved:true,multiOrderCorrect:true,wrongRoleAccess:0,listPhoneAddressExposure:0,loggedRecipientCount:0,providerCalls:0,productionWrites:0,browserOrderIds:serveBrowser?{original:orderA,second:orderB,missing:missingOrderId,hostile:hostileOrderId}:undefined}));
    if (serveBrowser) await waitForBrowserStop();
})().catch((error) => {
    originalConsole.error(`adminOrderDeliveryPostgresSmoke FAIL: ${redact(error.stack || error.message)}`);
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
        assert(/^novastore-r17-postgres-[A-Za-z0-9._-]+$/u.test(path.basename(resolved)));
        fs.rmSync(resolved, { recursive: true, force: true });
    } else if (ownedClusterRoot && fs.existsSync(ownedClusterRoot) && !nativeStopProven) {
        originalConsole.error(`R17 cleanup preserved unproven PostgreSQL cluster: ${ownedClusterRoot}`);
    }
    if (dockerCreated) {
        assert(/^novastore-r17-returns-[a-f0-9]{16}$/u.test(containerName));
        try { run('docker', ['rm', '-f', containerName]); }
        catch (error) { originalConsole.error(redact(error.message)); process.exitCode = 1; }
    }
    if (browserStopFile) fs.rmSync(browserStopFile, { force: true });
    for (const [key, value] of Object.entries(originalConsole)) console[key] = value;
});
