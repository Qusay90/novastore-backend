const assert = require('assert');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const {
    buildLocalServerEnv,
    stopServerProcess
} = require('./helpers/localServerProcess');

const root = path.join(__dirname, '..');
const localPort = 5204;
const failedDatabasePort = 5205;
const previewPort = 5206;
const validRuntimeRevision = 'c'.repeat(40);

const waitForExit = (child, timeoutMs = 5000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Blocked server did not exit in time')), timeoutMs);
    child.once('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
    });
});

const waitForServer = (child, timeoutMs = 30000) => new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Local server startup timed out: ${output}`)), timeoutMs);
    const onData = (chunk) => {
        output += chunk.toString();
        if (output.includes('NovaStore sunucusu')) {
            clearTimeout(timer);
            resolve(output);
        }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Local server exited before startup: ${code}\n${output}`));
    });
});

const isPortOpen = (port) => new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(750);
    socket.once('connect', () => {
        socket.destroy();
        resolve(true);
    });
    const close = () => {
        socket.destroy();
        resolve(false);
    };
    socket.once('error', close);
    socket.once('timeout', close);
});

const requestRuntimeMeta = async (port, pathname, method = 'GET') => {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(10000)
    });
    const text = await response.text();
    return {
        status: response.status,
        cacheControl: response.headers.get('cache-control'),
        contentType: response.headers.get('content-type') || '',
        text,
        body: text ? JSON.parse(text) : null
    };
};

const spawnServerWithExactEnv = (environment) => spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
});

const withoutRuntimeRevision = (environment) => {
    const sanitized = { ...environment };
    delete sanitized.RENDER_GIT_COMMIT;
    delete sanitized.RAILWAY_GIT_COMMIT_SHA;
    return sanitized;
};

const requiredLocalDatabaseEnv = () => {
    assert.ok(process.env.P4B1_DATABASE_URL, 'P4B1_DATABASE_URL is required; local DB checks may not be skipped');
    const parsed = new URL(process.env.P4B1_DATABASE_URL);
    assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname));
    const databaseName = parsed.pathname.replace(/^\/+/, '');
    assert.ok(databaseName && databaseName !== 'postgres');

    return {
        DATABASE_URL: process.env.P4B1_DATABASE_URL,
        DB_HOST: parsed.hostname,
        DB_PORT: parsed.port || '5432',
        DB_NAME: databaseName,
        DB_USER: decodeURIComponent(parsed.username),
        DB_PASSWORD: decodeURIComponent(parsed.password),
        DB_SSL: 'false'
    };
};

(async () => {
    const remoteEnv = buildLocalServerEnv({
        DATABASE_URL: 'postgresql://test:test@remote.invalid:5432/postgres',
        DB_HOST: 'remote.invalid',
        DB_PORT: '5432',
        DB_NAME: 'postgres',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        NOVASTORE_SAFE_LOCAL_BACKEND: 'false',
        NOVASTORE_ALLOW_REMOTE_DB: 'false',
        NODE_OPTIONS: `--require=${path.join(__dirname, 'helpers', 'blockPgLoad.js')}`
    });
    const blocked = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: remoteEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let blockedOutput = '';
    blocked.stdout.on('data', (chunk) => { blockedOutput += chunk.toString(); });
    blocked.stderr.on('data', (chunk) => { blockedOutput += chunk.toString(); });
    const blockedCode = await waitForExit(blocked);
    assert.notStrictEqual(blockedCode, 0);
    assert.match(blockedOutput, /Startup blocked: Remote veritabani/);
    assert.doesNotMatch(blockedOutput, /Veritabani hedefi|Veritabani baglantisi|Veritabani hazirlama/);
    assert.doesNotMatch(blockedOutput, /postgresql:\/\/|test:test/);

    const blockedDirectDb = spawn(process.execPath, ['-e', "require('./config/db')"], {
        cwd: root,
        env: remoteEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let blockedDirectDbOutput = '';
    blockedDirectDb.stdout.on('data', (chunk) => { blockedDirectDbOutput += chunk.toString(); });
    blockedDirectDb.stderr.on('data', (chunk) => { blockedDirectDbOutput += chunk.toString(); });
    const blockedDirectDbCode = await waitForExit(blockedDirectDb);
    assert.notStrictEqual(blockedDirectDbCode, 0);
    assert.match(blockedDirectDbOutput, /Database startup blocked: Remote veritabani/);
    assert.doesNotMatch(blockedDirectDbOutput, /pg must not load/);

    const supabaseRemoteEnv = buildLocalServerEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://postgres:secret@db.projectref.supabase.co:5432/postgres',
        DB_HOST: '',
        DB_PORT: '',
        DB_NAME: '',
        DB_USER: '',
        DB_PASSWORD: '',
        NOVASTORE_LOCAL_PREVIEW: 'false',
        NOVASTORE_SAFE_LOCAL_BACKEND: 'false',
        NOVASTORE_ALLOW_REMOTE_DB: 'false',
        SKIP_SCHEMA_INIT: 'true',
        NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
        NODE_OPTIONS: `--require=${path.join(__dirname, 'helpers', 'blockPgLoad.js')}`
    });
    const blockedSupabase = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: supabaseRemoteEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let blockedSupabaseOutput = '';
    blockedSupabase.stdout.on('data', (chunk) => { blockedSupabaseOutput += chunk.toString(); });
    blockedSupabase.stderr.on('data', (chunk) => { blockedSupabaseOutput += chunk.toString(); });
    const blockedSupabaseCode = await waitForExit(blockedSupabase);
    assert.notStrictEqual(blockedSupabaseCode, 0);
    assert.match(blockedSupabaseOutput, /Startup blocked: Remote veritabani/);
    assert.doesNotMatch(blockedSupabaseOutput, /Startup preview:/);
    assert.doesNotMatch(blockedSupabaseOutput, /pg must not load/);
    assert.doesNotMatch(blockedSupabaseOutput, /postgresql:\/\/|postgres:secret/);

    const stagingPreview = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: {
            ...supabaseRemoteEnv,
            NODE_ENV: 'staging',
            NOVASTORE_LOCAL_PREVIEW: 'true'
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let stagingPreviewOutput = '';
    stagingPreview.stdout.on('data', (chunk) => { stagingPreviewOutput += chunk.toString(); });
    stagingPreview.stderr.on('data', (chunk) => { stagingPreviewOutput += chunk.toString(); });
    const stagingPreviewCode = await waitForExit(stagingPreview);
    assert.notStrictEqual(stagingPreviewCode, 0);
    assert.match(stagingPreviewOutput, /Startup blocked: Local preview yalnizca acik NODE_ENV=development/);
    assert.doesNotMatch(stagingPreviewOutput, /Startup preview:/);
    assert.doesNotMatch(stagingPreviewOutput, /pg must not load/);

    let previewServer;
    try {
        const previewEnv = withoutRuntimeRevision(buildLocalServerEnv({
                PORT: String(previewPort),
                NODE_ENV: 'development',
                DATABASE_URL: 'postgresql://postgres:secret@db.projectref.supabase.co:5432/postgres',
                DB_HOST: '',
                DB_PORT: '',
                DB_NAME: '',
                DB_USER: '',
                DB_PASSWORD: '',
                NOVASTORE_LOCAL_PREVIEW: 'true',
                NOVASTORE_SAFE_LOCAL_BACKEND: 'false',
                NOVASTORE_ALLOW_REMOTE_DB: 'false',
                SKIP_SCHEMA_INIT: 'true',
                NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
                NODE_OPTIONS: ''
        }));
        previewServer = spawnServerWithExactEnv(previewEnv);
        const previewOutput = await waitForServer(previewServer);
        assert.match(previewOutput, /Startup preview: UI-only localhost modu etkin/);
        assert.match(previewOutput, /Veritabani hedefi: 127\.0\.0\.1:55432\/novastore_preview/);
        assert.match(previewOutput, /Veritabani baglantisi ve schema init SKIP_SCHEMA_INIT=true ile atlandi/);
        assert.doesNotMatch(previewOutput, /Veritabani baglantisi dogrulandi/);
        assert.doesNotMatch(previewOutput, /postgresql:\/\/|postgres:secret/);
        assert.strictEqual(await isPortOpen(previewPort), true);

        const live = await requestRuntimeMeta(previewPort, '/api/health/live');
        assert.strictEqual(live.status, 200);
        assert.deepStrictEqual(live.body, { status: 'live' });

        const ready = await requestRuntimeMeta(previewPort, '/api/health/ready');
        assert.strictEqual(ready.status, 503);
        assert.deepStrictEqual(ready.body, { status: 'unavailable' });

        const version = await requestRuntimeMeta(previewPort, '/api/version');
        assert.strictEqual(version.status, 503);
        assert.deepStrictEqual(version.body, { status: 'unavailable' });
        assert.strictEqual(version.cacheControl, 'no-store');

        for (const [pathname, expectedStatus] of [
            ['/api/health/live', 200],
            ['/api/health/ready', 503],
            ['/api/version', 503]
        ]) {
            const head = await requestRuntimeMeta(previewPort, pathname, 'HEAD');
            assert.strictEqual(head.status, expectedStatus);
            assert.strictEqual(head.text, '');
        }
    } finally {
        await stopServerProcess(previewServer);
    }
    assert.strictEqual(await isPortOpen(previewPort), false);

    const failedDatabase = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: buildLocalServerEnv({
            PORT: String(failedDatabasePort),
            DATABASE_URL: 'postgresql://novastore_test:novastore_test_only@127.0.0.1:1/novastore_category_v2_test',
            DB_PORT: '1'
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let failedDatabaseOutput = '';
    failedDatabase.stdout.on('data', (chunk) => { failedDatabaseOutput += chunk.toString(); });
    failedDatabase.stderr.on('data', (chunk) => { failedDatabaseOutput += chunk.toString(); });
    const failedDatabaseCode = await waitForExit(failedDatabase);
    assert.notStrictEqual(failedDatabaseCode, 0);
    assert.match(failedDatabaseOutput, /Veritabani hazirlama hatasi/);
    assert.doesNotMatch(failedDatabaseOutput, /NovaStore sunucusu/);
    assert.strictEqual(await isPortOpen(failedDatabasePort), false);

    const localDatabase = requiredLocalDatabaseEnv();
    assert.strictEqual(await isPortOpen(Number(localDatabase.DB_PORT)), true);

    let localServer;
    try {
        const localServerEnv = withoutRuntimeRevision(buildLocalServerEnv({
            ...localDatabase,
            PORT: String(localPort),
            NOVASTORE_LOCAL_PREVIEW: 'false',
            RENDER_GIT_COMMIT: validRuntimeRevision
        }));
        localServerEnv.RENDER_GIT_COMMIT = validRuntimeRevision;
        localServer = spawnServerWithExactEnv(localServerEnv);
        const localOutput = await waitForServer(localServer);
        assert.strictEqual(await isPortOpen(localPort), true);
        assert.doesNotMatch(localOutput, /postgresql:\/\//);
        if (localDatabase.DB_PASSWORD) {
            assert.ok(!localOutput.includes(localDatabase.DB_PASSWORD));
        }

        const live = await requestRuntimeMeta(localPort, '/api/health/live');
        assert.strictEqual(live.status, 200);
        assert.deepStrictEqual(live.body, { status: 'live' });

        const ready = await requestRuntimeMeta(localPort, '/api/health/ready');
        assert.strictEqual(ready.status, 200);
        assert.deepStrictEqual(ready.body, { status: 'ready' });

        const version = await requestRuntimeMeta(localPort, '/api/version');
        assert.strictEqual(version.status, 200);
        assert.deepStrictEqual(version.body, {
            revision: validRuntimeRevision,
            provider: 'render'
        });
        assert.strictEqual(version.cacheControl, 'no-store');
    } finally {
        await stopServerProcess(localServer);
    }
    assert.strictEqual(await isPortOpen(localPort), false);

    const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    const runtimeMountIndex = serverSource.indexOf("app.use('/api', runtimeMetaRoutes)");
    const storefrontCutoverIndex = serverSource.indexOf('app.use((req, res, next) =>');
    const staticIndex = serverSource.indexOf('app.use(express.static');
    assert.ok(runtimeMountIndex >= 0);
    assert.ok(runtimeMountIndex < storefrontCutoverIndex);
    assert.ok(runtimeMountIndex < staticIndex);

    console.log('server startup safety smoke passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
