const assert = require('assert');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const {
    buildLocalServerEnv,
    spawnLocalServer,
    stopServerProcess
} = require('./helpers/localServerProcess');

const root = path.join(__dirname, '..');
const localPort = 5204;
const failedDatabasePort = 5205;
const previewPort = 5206;

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
        previewServer = spawnLocalServer({
            root,
            port: previewPort,
            env: {
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
            }
        });
        const previewOutput = await waitForServer(previewServer);
        assert.match(previewOutput, /Startup preview: UI-only localhost modu etkin/);
        assert.match(previewOutput, /Veritabani hedefi: 127\.0\.0\.1:55432\/novastore_preview/);
        assert.match(previewOutput, /Veritabani baglantisi ve schema init SKIP_SCHEMA_INIT=true ile atlandi/);
        assert.doesNotMatch(previewOutput, /Veritabani baglantisi dogrulandi/);
        assert.strictEqual(await isPortOpen(previewPort), true);
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

    if (await isPortOpen(55432)) {
        let localServer;
        try {
            localServer = spawnLocalServer({
                root,
                port: localPort,
                env: { NOVASTORE_LOCAL_PREVIEW: 'false' }
            });
            await waitForServer(localServer);
            assert.strictEqual(await isPortOpen(localPort), true);
        } finally {
            await stopServerProcess(localServer);
        }
        assert.strictEqual(await isPortOpen(localPort), false);
    } else {
        console.log('server startup safety local DB branch skipped: 127.0.0.1:55432 is unavailable');
    }

    console.log('server startup safety smoke passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
