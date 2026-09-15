'use strict';

// R21 disposable PostgreSQL + canonical regression and system order delivery proof. This harness never opens an
// existing database and never permits outbound provider HTTP.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { format } = require('node:util');
const { Client } = require('pg');

const EXPECTED_BACKEND_HEAD = 'd3e5fdadf961429c6860f18bd1706fac23add9e7';
const EXPECTED_BACKEND_TREE = 'b4004e0856ac0902374d8c04026a05bc9bb3c4dc';
const execute = process.argv.includes('--execute-disposable-db');
const postgresBinArgument = process.argv.find((value) => value.startsWith('--postgres-bin='));
const postgresBin = postgresBinArgument ? path.resolve(postgresBinArgument.slice('--postgres-bin='.length)) : null;
const runId = crypto.randomBytes(8).toString('hex');
const containerName = `novastore-r21-commerce-${runId}`;
const databaseName = `novastore_pc1_system_commerce_${runId}_test`;
const databaseUser = 'r21_local_test';
const databasePassword = crypto.randomBytes(32).toString('base64url');
const jwtSecret = crypto.randomBytes(48).toString('base64url');
const sellerSecret = crypto.randomBytes(48).toString('base64url');
const sensitive = new Set([databasePassword, jwtSecret, sellerSecret]);
const capturedLogs = [];
const originalConsole = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map((key) => [key, console[key]]));
for (const key of Object.keys(originalConsole)) console[key] = (...args) => capturedLogs.push(format(...args));

const root = path.resolve(__dirname, '..');


let ownedClusterRoot = null;
let nativePgCtl = null;
let nativePgData = null;
let nativeStopProven = false;
let dockerCreated = false;
let pool = null;
let originalFetch = global.fetch;
let outboundAttemptCount = 0;

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
    ownedClusterRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'novastore-r21-postgres-'));
    assert.equal(path.resolve(path.dirname(ownedClusterRoot)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase(), 'Owned cluster must be directly under the OS temporary directory.');
    assert(/^novastore-r21-postgres-[A-Za-z0-9._-]+$/u.test(path.basename(ownedClusterRoot)), 'Owned cluster name guard.');
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
    const baseline=registry.slice(0,-1);
    assert.deepEqual((await runApply({env:migrationEnv,registry:baseline,output:()=>{}})).applied,baseline.map(x=>x.id));
    assert.deepEqual((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, [registry.at(-1).id]);
    assert.deepEqual((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, []);
    const serverModule = require.resolve('../server');
    require.cache[serverModule] = { id: serverModule, filename: serverModule, loaded: true, exports: { io: null } };
    pool = require('../config/db');
    global.fetch = async (url, options) => {
        const parsed = new URL(url);
        if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
            outboundAttemptCount += 1;
            throw new Error('Outbound provider HTTP is forbidden in R21 local UAT.');
        }
        return originalFetch(url, options);
    };

    await require('./helpers/canonicalCommerceUat')({ pool, sensitive, originalConsole });
    await require('./helpers/purchasableVariantUat')({pool,sensitive,originalConsole});
    await require('./helpers/stockySystemCommerceUat')({pool,sensitive,originalConsole});
    for (const text of capturedLogs) for (const secret of sensitive) assert(!text.includes(secret), 'no logged secret');
    assert.equal(outboundAttemptCount, 0);
})().catch((error) => {
    originalConsole.error(`stockySystemCommercePostgresSmoke FAIL: ${redact(error.stack || error.message)}`);
    process.exitCode = 1;
}).finally(async () => {
    global.fetch = originalFetch;
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
        assert(/^novastore-r21-postgres-[A-Za-z0-9._-]+$/u.test(path.basename(resolved)));
        fs.rmSync(resolved, { recursive: true, force: true });
    } else if (ownedClusterRoot && fs.existsSync(ownedClusterRoot) && !nativeStopProven) {
        originalConsole.error(`R21 cleanup preserved unproven PostgreSQL cluster: ${ownedClusterRoot}`);
    }
    if (dockerCreated) {
        assert(/^novastore-r21-commerce-[a-f0-9]{16}$/u.test(containerName));
        try { run('docker', ['rm', '-f', containerName]); }
        catch (error) { originalConsole.error(redact(error.message)); process.exitCode = 1; }
    }
    for (const [key, value] of Object.entries(originalConsole)) console[key] = value;
});
