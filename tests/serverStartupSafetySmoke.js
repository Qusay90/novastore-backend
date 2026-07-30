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

const streamIsDrained = (stream) => (
    !stream || stream.readableEnded || stream.destroyed || stream.readable === false
);

const getExitResult = (child, code = child.exitCode, signal = child.signalCode) => Object.freeze({
    code: code ?? null,
    signal: signal ?? null
});

const childHasExitedAndStreamsDrained = (child) => (
    (child.exitCode !== null || child.signalCode !== null) &&
    streamIsDrained(child.stdout) &&
    streamIsDrained(child.stderr)
);

const getChildLifecycleDiagnostics = (child) => (
    `pid=${child?.pid ?? 'unknown'} ` +
    `exitCode=${child?.exitCode ?? 'null'} ` +
    `signalCode=${child?.signalCode ?? 'null'} ` +
    `stdoutDrained=${streamIsDrained(child?.stdout)} ` +
    `stderrDrained=${streamIsDrained(child?.stderr)}`
);

const waitForExit = (child, timeoutMs = 5000, label = 'child') => new Promise((resolve, reject) => {
    if (!child || typeof child.once !== 'function') {
        reject(new TypeError('Child process is required.'));
        return;
    }

    let settled = false;
    let timer;
    let terminalResult = child.exitCode !== null || child.signalCode !== null
        ? getExitResult(child)
        : null;
    const streams = [child.stdout, child.stderr].filter(Boolean);
    const cleanup = () => {
        clearTimeout(timer);
        child.removeListener('exit', onExit);
        child.removeListener('close', onClose);
        child.removeListener('error', onError);
        for (const stream of streams) {
            stream.removeListener('end', onStreamTerminal);
            stream.removeListener('close', onStreamTerminal);
        }
    };
    const settle = (error, result) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(result);
    };
    const settleIfTerminalAndDrained = () => {
        if (!terminalResult && (child.exitCode !== null || child.signalCode !== null)) {
            terminalResult = getExitResult(child);
        }
        if (!terminalResult || !streams.every(streamIsDrained)) return false;
        settle(null, terminalResult);
        return true;
    };
    const onExit = (code, signal) => {
        terminalResult = getExitResult(child, code, signal);
        settleIfTerminalAndDrained();
    };
    const onClose = (code, signal) => {
        terminalResult ??= getExitResult(child, code, signal);
        settle(null, terminalResult);
    };
    const onError = (error) => {
        settle(error);
    };
    const onStreamTerminal = () => {
        settleIfTerminalAndDrained();
    };

    if (settleIfTerminalAndDrained()) return;

    child.once('exit', onExit);
    child.once('close', onClose);
    child.once('error', onError);
    for (const stream of streams) {
        stream.once('end', onStreamTerminal);
        stream.once('close', onStreamTerminal);
    }
    timer = setTimeout(
        () => settle(new Error(
            `Blocked server did not exit in time (${label}; ${getChildLifecycleDiagnostics(child)})`
        )),
        timeoutMs
    );

    settleIfTerminalAndDrained();
});

const assertExitCode = (result, expectedCode, message) => {
    assert.strictEqual(result.signal, null, message);
    assert.strictEqual(result.code, expectedCode, message);
};

const assertNonZeroExit = (result, message) => {
    assert.strictEqual(result.signal, null, message);
    assert.notStrictEqual(result.code, 0, message);
};

const spawnHarnessChild = (source, options = {}) => spawn(process.execPath, ['-e', source], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...options
});

const waitForChildClose = (child) => new Promise((resolve, reject) => {
    if (childHasExitedAndStreamsDrained(child)) {
        resolve();
        return;
    }
    child.once('close', resolve);
    child.once('error', reject);
});

const waitForStreamMarker = (stream, marker) => new Promise((resolve, reject) => {
    let output = '';
    const cleanup = () => {
        stream.removeListener('data', onData);
        stream.removeListener('error', onError);
        stream.removeListener('end', onEnd);
    };
    const onData = (chunk) => {
        output += chunk.toString();
        if (output.includes(marker)) {
            cleanup();
            resolve();
        }
    };
    const onError = (error) => {
        cleanup();
        reject(error);
    };
    const onEnd = () => {
        cleanup();
        reject(new Error(`Expected child marker was not written: ${marker}`));
    };

    stream.on('data', onData);
    stream.once('error', onError);
    stream.once('end', onEnd);
});

const runWaitForExitMatrix = async () => {
    const earlyExit = spawnHarnessChild('process.exit(17)');
    await waitForChildClose(earlyExit);
    assertExitCode(await waitForExit(earlyExit, 100, 'early-exit'), 17);

    const postListenerExit = spawnHarnessChild(
        "process.stdin.resume(); process.stdin.once('data', () => process.exit(18)); process.stdout.write('WAIT_HELPER_READY')",
        { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    await waitForStreamMarker(postListenerExit.stdout, 'WAIT_HELPER_READY');
    postListenerExit.stdin.end('exit');
    assertExitCode(await waitForExit(postListenerExit, 500, 'post-listener-exit'), 18);

    const nonZeroExit = spawnHarnessChild('process.exit(19)');
    assertNonZeroExit(await waitForExit(nonZeroExit, 500, 'non-zero-exit'));

    const signalledChild = spawnHarnessChild('setInterval(() => {}, 1000)');
    const signalledResult = waitForExit(signalledChild, 500, 'signalled-child');
    assert.equal(signalledChild.kill('SIGTERM'), true);
    assert.deepStrictEqual(await signalledResult, { code: null, signal: 'SIGTERM' });

    let stderrOutput = '';
    const stderrChild = spawnHarnessChild(
        "process.stderr.write('WAIT_HELPER_STDERR_MARKER'); process.exit(20)"
    );
    stderrChild.stderr.on('data', (chunk) => { stderrOutput += chunk.toString(); });
    assertExitCode(await waitForExit(stderrChild, 500, 'stderr-child'), 20);
    assert.match(stderrOutput, /WAIT_HELPER_STDERR_MARKER/);

    const missingExecutable = spawn(path.join(root, 'missing-child-executable'));
    await assert.rejects(
        () => waitForExit(missingExecutable, 500, 'missing-executable'),
        (error) => error && error.code === 'ENOENT'
    );

    const hangingChild = spawnHarnessChild('setInterval(() => {}, 1000)');
    const listenerTargets = [
        ['child.exit', hangingChild, 'exit'],
        ['child.close', hangingChild, 'close'],
        ['child.error', hangingChild, 'error'],
        ['stdout.end', hangingChild.stdout, 'end'],
        ['stdout.close', hangingChild.stdout, 'close'],
        ['stderr.end', hangingChild.stderr, 'end'],
        ['stderr.close', hangingChild.stderr, 'close']
    ];
    const baselineListeners = listenerTargets.map(([label, target, event]) => ({
        label,
        target,
        event,
        count: target.listenerCount(event)
    }));
    await assert.rejects(
        () => waitForExit(hangingChild, 50, 'intentional-hanging-child'),
        /Blocked server did not exit in time/
    );
    for (const { label, target, event, count } of baselineListeners) {
        assert.strictEqual(target.listenerCount(event), count, label);
    }
    assert.equal(hangingChild.kill('SIGTERM'), true);
    assert.deepStrictEqual(await waitForExit(hangingChild, 500, 'terminated-hanging-child'), {
        code: null,
        signal: 'SIGTERM'
    });

    console.log('wait-for-exit race-safe matrix passed');
};

const sanitizeStartupOutput = (output, maxLength = 1024) => String(output)
    .replace(/postgresql:\/\/[^\s'"`]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/\r?\n/g, '\\n')
    .slice(0, maxLength);

const waitForServer = (child, port, timeoutMs = 30000) => new Promise((resolve, reject) => {
    if (!child || typeof child.once !== 'function') {
        reject(new TypeError('Child process is required.'));
        return;
    }

    const expectedPort = Number(port);
    if (!Number.isInteger(expectedPort) || expectedPort < 1 || expectedPort > 65535) {
        reject(new RangeError('A valid loopback port is required.'));
        return;
    }

    let output = '';
    let startupOutputObserved = false;
    let portReady = false;
    let settled = false;
    let timer;
    let retryTimer;
    let activeSocket;
    const deadline = Date.now() + timeoutMs;
    const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(retryTimer);
        child.removeListener('exit', onExit);
        child.removeListener('error', onError);
        child.stdout?.removeListener('data', onData);
        child.stderr?.removeListener('data', onData);
        if (activeSocket && !activeSocket.destroyed) activeSocket.destroy();
    };
    const settle = (error, result) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(result);
    };
    const lifecycleSummary = () => getChildLifecycleDiagnostics(child);
    const failForExit = (code = child.exitCode, signal = child.signalCode) => settle(new Error(
        `Local server exited before readiness: pid=${child.pid ?? 'unknown'} ` +
        `exitCode=${code ?? 'null'} signalCode=${signal ?? 'null'} ` +
        `startupOutput=${startupOutputObserved} portReady=${portReady} ` +
        `output=${sanitizeStartupOutput(output)}`
    ));
    const resolveIfReady = () => {
        if (startupOutputObserved && portReady) settle(null, output);
    };
    const schedulePortProbe = () => {
        if (settled || portReady) return;
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) return;
        retryTimer = setTimeout(probePort, Math.min(100, Math.max(1, remainingMs)));
    };
    const probePort = () => {
        retryTimer = undefined;
        if (settled || portReady) return;
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) return;

        const socket = net.createConnection({ host: '127.0.0.1', port: expectedPort });
        activeSocket = socket;
        let probeSettled = false;
        const finishProbe = (ready) => {
            if (probeSettled) return;
            probeSettled = true;
            socket.removeListener('connect', onConnect);
            socket.removeListener('error', onUnavailable);
            socket.removeListener('timeout', onUnavailable);
            if (activeSocket === socket) activeSocket = undefined;
            socket.destroy();
            if (ready) {
                portReady = true;
                resolveIfReady();
            } else {
                schedulePortProbe();
            }
        };
        const onConnect = () => finishProbe(true);
        const onUnavailable = () => finishProbe(false);
        socket.setTimeout(Math.min(750, remainingMs));
        socket.once('connect', onConnect);
        socket.once('error', onUnavailable);
        socket.once('timeout', onUnavailable);
    };
    const onData = (chunk) => {
        output += chunk.toString();
        if (output.includes('NovaStore sunucusu')) {
            startupOutputObserved = true;
            resolveIfReady();
        }
    };
    const onExit = (code, signal) => failForExit(code, signal);
    const onError = () => settle(new Error('Local server spawn failed before readiness.'));

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
    timer = setTimeout(() => settle(new Error(
        `Local server startup timed out: ${lifecycleSummary()} ` +
        `startupOutput=${startupOutputObserved} portReady=${portReady} ` +
        `output=${sanitizeStartupOutput(output)}`
    )), timeoutMs);

    if (child.exitCode !== null || child.signalCode !== null) {
        failForExit();
        return;
    }
    probePort();
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

const createPostgresErrorResponse = () => {
    const fields = Buffer.from('SFATAL\0C57P01\0Mdeterministic local test database failure\0\0');
    const response = Buffer.allocUnsafe(5);
    response.writeUInt8('E'.charCodeAt(0), 0);
    response.writeUInt32BE(fields.length + 4, 1);
    return Buffer.concat([response, fields]);
};

const startLoopbackPostgresErrorServer = () => new Promise((resolve, reject) => {
    const errorResponse = createPostgresErrorResponse();
    const server = net.createServer((socket) => {
        const sendError = () => {
            socket.removeListener('data', sendError);
            socket.end(errorResponse);
        };
        socket.once('data', sendError);
        socket.once('error', () => {});
    });
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        server.removeListener('error', onError);
        if (!address || typeof address === 'string') {
            server.close(() => reject(new Error('Loopback PostgreSQL error server did not expose a numeric port.')));
            return;
        }
        resolve({ server, port: address.port });
    });
});

const stopLoopbackServer = (server) => new Promise((resolve, reject) => {
    if (!server?.listening) {
        resolve();
        return;
    }
    server.close((error) => {
        if (error) reject(error);
        else resolve();
    });
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

const buildRemoteDbModuleEnv = () => {
    const environment = {};
    for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP']) {
        if (process.env[key]) environment[key] = process.env[key];
    }
    return {
        ...environment,
        NODE_ENV: 'production',
        DATABASE_URL:
            'postgresql://synthetic-user@runtime-db.example.test/' +
            'novastore_runtime?sslmode=verify-full',
        NOVASTORE_EXPECTED_DATABASE_HOST: 'runtime-db.example.test',
        NOVASTORE_EXPECTED_DATABASE_NAME: 'novastore_runtime',
        SKIP_SCHEMA_INIT: 'true',
        NOVASTORE_ALLOW_SCHEMA_INIT: 'false'
    };
};

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
    await runWaitForExitMatrix();

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
    const blockedExit = await waitForExit(blocked, 5000, 'blocked-remote-server');
    assertNonZeroExit(blockedExit);
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
    const blockedDirectDbExit = await waitForExit(blockedDirectDb, 5000, 'blocked-direct-db');
    assertNonZeroExit(blockedDirectDbExit);
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
    const blockedSupabaseExit = await waitForExit(blockedSupabase, 5000, 'blocked-supabase-server');
    assertNonZeroExit(blockedSupabaseExit);
    assert.match(blockedSupabaseOutput, /Startup blocked: Remote veritabani/);
    assert.doesNotMatch(blockedSupabaseOutput, /Startup preview:/);
    assert.doesNotMatch(blockedSupabaseOutput, /pg must not load/);
    assert.doesNotMatch(blockedSupabaseOutput, /postgresql:\/\/|postgres:secret/);

    const fakePoolScript = `
        const Module = require('node:module');
        const originalLoad = Module._load;
        let capturedConfig;
        class FakeClient {}
        class FakePool {
            constructor(config) {
                capturedConfig = config;
                this.options = Object.assign({}, config);
                this.Client = this.options.Client || FakeClient;
                this.Promise = this.options.Promise || Promise;
            }
            on() {}
        }
        Module._load = function(request, parent, isMain) {
            if (request === 'pg') return { Client: FakeClient, Pool: FakePool };
            return originalLoad.call(this, request, parent, isMain);
        };
        const pool = require('./config/db');
        const metadata = pool.getRuntimeTargetMetadata();
        const result = {
            configKeys: Object.keys(capturedConfig).sort(),
            host: capturedConfig.host,
            port: capturedConfig.port,
            database: capturedConfig.database,
            userPresent: typeof capturedConfig.user === 'string' && capturedConfig.user.length > 0,
            passwordType: typeof capturedConfig.password,
            ssl: capturedConfig.ssl,
            hasConnectionString: Object.prototype.hasOwnProperty.call(capturedConfig, 'connectionString'),
            metadata,
            metadataFrozen: Object.isFrozen(metadata),
            metadataNullPrototype: Object.getPrototypeOf(metadata) === null,
            metadataKeys: Object.keys(metadata).sort(),
            poolOptionsFrozen: Object.isFrozen(pool.options),
            poolOptionsNullPrototype: Object.getPrototypeOf(pool.options) === null,
            runtimeMetadataMethodLocked: (() => {
                const descriptor = Object.getOwnPropertyDescriptor(pool, 'getRuntimeTargetMetadata');
                return descriptor.writable === false && descriptor.configurable === false;
            })(),
            errorRedacted: !pool.formatError(new Error('SENSITIVE-REMOTE-DSN-MARKER')).includes('SENSITIVE')
        };
        process.stdout.write(JSON.stringify(result));
    `;
    const fakePoolChild = spawn(process.execPath, ['-e', fakePoolScript], {
        cwd: root,
        env: buildRemoteDbModuleEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let fakePoolOutput = '';
    fakePoolChild.stdout.on('data', (chunk) => { fakePoolOutput += chunk.toString(); });
    fakePoolChild.stderr.on('data', (chunk) => { fakePoolOutput += chunk.toString(); });
    const fakePoolExit = await waitForExit(fakePoolChild, 5000, 'fake-pool-child');
    assertExitCode(fakePoolExit, 0, fakePoolOutput);
    const fakePoolResult = JSON.parse(fakePoolOutput);
    assert.deepEqual(fakePoolResult.configKeys, [
        'application_name',
        'client_encoding',
        'connectionTimeoutMillis',
        'database',
        'host',
        'keepAlive',
        'options',
        'password',
        'port',
        'replication',
        'ssl',
        'sslnegotiation',
        'user'
    ]);
    assert.equal(fakePoolResult.host, 'runtime-db.example.test');
    assert.equal(fakePoolResult.port, 5432);
    assert.equal(fakePoolResult.database, 'novastore_runtime');
    assert.equal(fakePoolResult.userPresent, true);
    assert.equal(fakePoolResult.passwordType, 'function');
    assert.deepEqual(fakePoolResult.ssl, { rejectUnauthorized: true });
    assert.equal(fakePoolResult.hasConnectionString, false);
    assert.equal(fakePoolResult.metadataFrozen, true);
    assert.equal(fakePoolResult.metadataNullPrototype, true);
    assert.equal(fakePoolResult.poolOptionsFrozen, true);
    assert.equal(fakePoolResult.poolOptionsNullPrototype, true);
    assert.equal(fakePoolResult.runtimeMetadataMethodLocked, true);
    assert.deepEqual(fakePoolResult.metadataKeys, [
        'attested',
        'database',
        'host',
        'local',
        'port',
        'remoteRelease',
        'tlsEnabled',
        'tlsVerified'
    ]);
    assert.deepEqual(fakePoolResult.metadata, {
        host: 'runtime-db.example.test',
        port: 5432,
        database: 'novastore_runtime',
        local: false,
        remoteRelease: true,
        tlsEnabled: true,
        tlsVerified: true,
        attested: true
    });
    assert.equal(fakePoolResult.errorRedacted, true);

    const prototypePollutionEnv = {
        ...buildRemoteDbModuleEnv(),
        SYNTHETIC_POLLUTION_VALUE:
            'postgresql://attacker@evil-db.example.test/evil_database?sslmode=no-verify',
        NODE_OPTIONS: `--require=${path.join(__dirname, 'helpers', 'blockPgLoad.js')}`
    };
    const prototypePollutionChild = spawn(process.execPath, ['-e', [
        'Object.prototype.connectionString = process.env.SYNTHETIC_POLLUTION_VALUE',
        "require('./config/db')"
    ].join(';')], {
        cwd: root,
        env: prototypePollutionEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let prototypePollutionOutput = '';
    prototypePollutionChild.stdout.on('data', (chunk) => {
        prototypePollutionOutput += chunk.toString();
    });
    prototypePollutionChild.stderr.on('data', (chunk) => {
        prototypePollutionOutput += chunk.toString();
    });
    const prototypePollutionExit = await waitForExit(
        prototypePollutionChild,
        5000,
        'prototype-pollution-child'
    );
    assertNonZeroExit(prototypePollutionExit);
    assert.match(prototypePollutionOutput, /unsafe runtime object state/);
    assert.doesNotMatch(prototypePollutionOutput, /evil-db|evil_database|attacker|pg must not load/);

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
    const stagingPreviewExit = await waitForExit(stagingPreview, 5000, 'blocked-staging-preview');
    assertNonZeroExit(stagingPreviewExit);
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
        const previewOutput = await waitForServer(previewServer, previewPort);
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

    let failedDatabase;
    let databaseFailureServer;
    try {
        databaseFailureServer = await startLoopbackPostgresErrorServer();
        failedDatabase = spawn(process.execPath, ['server.js'], {
            cwd: root,
            env: buildLocalServerEnv({
                PORT: String(failedDatabasePort),
                DATABASE_URL:
                    'postgresql://novastore_test:novastore_test_only@127.0.0.1:' +
                    `${databaseFailureServer.port}/novastore_category_v2_test`,
                DB_PORT: String(databaseFailureServer.port)
            }),
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        let failedDatabaseOutput = '';
        failedDatabase.stdout.on('data', (chunk) => { failedDatabaseOutput += chunk.toString(); });
        failedDatabase.stderr.on('data', (chunk) => { failedDatabaseOutput += chunk.toString(); });
        const failedDatabaseExit = await waitForExit(failedDatabase, 5000, 'failed-database-server');
        assertNonZeroExit(failedDatabaseExit);
        assert.match(failedDatabaseOutput, /Veritabani hazirlama hatasi/);
        assert.doesNotMatch(failedDatabaseOutput, /NovaStore sunucusu/);
    } finally {
        await stopServerProcess(failedDatabase);
        await stopLoopbackServer(databaseFailureServer?.server);
    }
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
        const localOutput = await waitForServer(localServer, localPort);
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
