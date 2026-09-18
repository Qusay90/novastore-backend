'use strict';

// Owns exactly one newly created PostgreSQL container. Never accepts a database URL.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { format } = require('node:util');
const http = require('node:http');
const https = require('node:https');
const { Client } = require('pg');

module.exports = async function themePlatformDisposableDb() {
    assert(process.argv.includes('--execute-disposable-db'), 'Use --execute-disposable-db.');
    const suffix = crypto.randomBytes(8).toString('hex');
    const container = `novastore-theme-wave1-${suffix}`;
    const databaseName = `novastore_theme_wave1_${suffix}_test`;
    const databaseUser = 'theme_wave1_test';
    const password = crypto.randomBytes(32).toString('base64url');
    const jwtSecret = crypto.randomBytes(48).toString('base64url');
    const sellerSecret = crypto.randomBytes(48).toString('base64url');
    const sensitive = new Set([password, jwtSecret, sellerSecret]);
    const logs = [];
    const originalConsole = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map((key) => [key, console[key]]));
    for (const key of Object.keys(originalConsole)) console[key] = (...args) => logs.push(format(...args));
    const redact = (value) => {
        let text = String(value);
        for (const secret of sensitive) if (secret) text = text.split(secret).join('[REDACTED]');
        return text;
    };
    let created = false;
    let pool;
    let outboundAttempts = 0;
    const originalFetch = global.fetch;
    const originalHttpRequest = http.request;
    const originalHttpsRequest = https.request;
    const docker = (args, env = process.env) => {
        const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 60000, env });
        if (result.status !== 0) throw new Error(`Docker failed: ${redact(result.stderr || result.error?.code)}`);
        return result.stdout.trim();
    };
    const localOnly = (value) => {
        const hostname = typeof value === 'string' || value instanceof URL
            ? new URL(value).hostname
            : value?.hostname || String(value?.host || '').split(':')[0];
        if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname)) {
            outboundAttempts += 1;
            throw new Error('External HTTP is forbidden in Theme Platform disposable tests.');
        }
    };
    global.fetch = (target, options) => { localOnly(target); return originalFetch(target, options); };
    http.request = function (target, ...args) { localOnly(target); return originalHttpRequest.call(this, target, ...args); };
    https.request = function (target, ...args) { localOnly(target); return originalHttpsRequest.call(this, target, ...args); };
    const cleanup = async () => {
        let failure;
        try {
            if (pool) await pool.end().catch((error) => { failure = error; });
            if (created) {
                assert(/^novastore-theme-wave1-[a-f0-9]{16}$/.test(container));
                docker(['rm', '-f', container]);
                created = false;
            }
            assert.equal(outboundAttempts, 0, 'No attempted external provider HTTP.');
            for (const log of logs) for (const secret of sensitive) assert(!log.includes(secret), 'No credentials in logs.');
        } catch (error) { failure = error; }
        finally {
            global.fetch = originalFetch;
            http.request = originalHttpRequest;
            https.request = originalHttpsRequest;
            for (const [key, value] of Object.entries(originalConsole)) console[key] = value;
        }
        if (failure) throw new Error(redact(failure.message));
        return { ownedContainerRemoved: !created, outboundAttempts, credentialLogChecks: 'PASS' };
    };
    try {
        docker(['run', '--pull', 'never', '--rm', '--name', container, '-d', '-p', '127.0.0.1::5432',
            '-e', 'POSTGRES_DB', '-e', 'POSTGRES_USER', '-e', 'POSTGRES_PASSWORD', 'postgres:16-bookworm'],
        { ...process.env, POSTGRES_DB: databaseName, POSTGRES_USER: databaseUser, POSTGRES_PASSWORD: password });
        created = true;
        const port = /^127\.0\.0\.1:(\d+)$/u.exec(docker(['port', container, '5432/tcp']))?.[1];
        assert(port, 'Fresh PostgreSQL must bind only to loopback.');
        const url = `postgresql://${databaseUser}:${password}@127.0.0.1:${port}/${databaseName}`;
        sensitive.add(url);
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const client = new Client({ connectionString: url, ssl: false, connectionTimeoutMillis: 1000 });
            try {
                await client.connect();
                assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, databaseName);
                await client.end();
                break;
            } catch (error) {
                await client.end().catch(() => {});
                if (attempt === 99) throw new Error(`Disposable PostgreSQL unavailable: ${error.code || 'UNKNOWN'}`);
                await new Promise((resolve) => setTimeout(resolve, 150));
            }
        }
        Object.assign(process.env, {
            NODE_ENV: 'test', NOVASTORE_DEPLOY_ENV: 'local', NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
            NOVASTORE_ALLOW_REMOTE_DB: 'false', SKIP_SCHEMA_INIT: 'true', NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
            DATABASE_URL: url, DB_HOST: '127.0.0.1', DB_PORT: port, DB_NAME: databaseName,
            DB_USER: databaseUser, DB_PASSWORD: password, DB_SSL: 'false', SUPABASE_USE_POOLER: 'false',
            SUPABASE_POOLER_HOST: '', SUPABASE_REGION: '', SUPABASE_PROJECT_REF: '', JWT_SECRET: jwtSecret,
            SELLER_ACCESS_TOKEN_SECRET: sellerSecret, NOVASTORE_NOTIFICATION_WORKER_ENABLED: 'false',
            NOVASTORE_REQUEST_LOGGING_ENABLED: 'false', NOVASTORE_THEME_PLATFORM_ENABLED: 'false',
            CLOUDINARY_CLOUD_NAME: 'theme-wave1-disposable', PAYTR_LIVE_REQUESTS_ALLOWED: 'false'
        });
        const root = path.resolve(__dirname, '../..');
        const { LOCAL_TEST_CAPABILITY } = require(path.join(root, 'scripts/staging-migrations/guard'));
        const { loadRegistry } = require(path.join(root, 'scripts/staging-migrations/registry'));
        const { runApply } = require(path.join(root, 'scripts/staging-migrations/runner'));
        const registry = loadRegistry();
        const migrationEnv = {
            NODE_ENV: 'test', NOVASTORE_DEPLOY_ENV: 'staging', NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
            NOVASTORE_ALLOW_REMOTE_DB: 'true', NOVASTORE_EXPECTED_DATABASE_HOST: '127.0.0.1',
            NOVASTORE_EXPECTED_DATABASE_NAME: databaseName, [LOCAL_TEST_CAPABILITY]: 'true', DATABASE_URL: url
        };
        assert.deepEqual((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, registry.map((entry) => entry.id));
        assert.deepEqual((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, [], 'Migration rerun is a no-op.');
        const serverPath = require.resolve(path.join(root, 'server'));
        require.cache[serverPath] = { id: serverPath, filename: serverPath, loaded: true, exports: { io: null } };
        pool = require(path.join(root, 'config/db'));
        assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, databaseName);
        const postgresVersion = (await pool.query("SELECT current_setting('server_version_num')::integer AS version")).rows[0].version;
        assert(postgresVersion >= 160000 && postgresVersion < 170000, 'PostgreSQL 16 required');
        return { pool, sensitive, originalConsole, redact, cleanup, postgresVersion, migrations: registry.map((entry) => entry.id) };
    } catch (error) {
        const safe = new Error(redact(error.stack || error.message));
        await cleanup();
        throw safe;
    }
};
