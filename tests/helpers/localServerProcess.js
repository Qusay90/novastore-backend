const { spawn, spawnSync } = require('child_process');

const LOCAL_DATABASE_ENV = Object.freeze({
    DATABASE_URL: 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_category_v2_test',
    DB_HOST: '127.0.0.1',
    DB_PORT: '55432',
    DB_NAME: 'novastore_category_v2_test',
    DB_USER: 'novastore_test',
    DB_PASSWORD: 'novastore_test_only',
    DB_SSL: 'false',
    PGHOST: '',
    PGPORT: '',
    PGDATABASE: '',
    PGUSER: '',
    PGPASSWORD: '',
    SUPABASE_USE_POOLER: 'false',
    SUPABASE_POOLER_HOST: '',
    SUPABASE_REGION: '',
    SUPABASE_PROJECT_REF: '',
    SUPABASE_POOLER_MODE: '',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false'
});

const managedChildren = new Set();

const buildLocalServerEnv = (overrides = {}) => ({
    ...process.env,
    ...LOCAL_DATABASE_ENV,
    NODE_ENV: 'test',
    ...overrides
});

const forceKillProcessTree = (child) => {
    if (!child?.pid || child.exitCode !== null) return;

    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true
        });
        return;
    }

    try {
        process.kill(-child.pid, 'SIGKILL');
    } catch (_) {
        try {
            child.kill('SIGKILL');
        } catch (_) {
            // Process already exited.
        }
    }
};

const stopServerProcess = async (child, timeoutMs = 5000) => {
    if (!child || child.exitCode !== null) {
        managedChildren.delete(child);
        return;
    }

    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');

    let timer;
    const timedOut = await Promise.race([
        exited.then(() => false),
        new Promise((resolve) => {
            timer = setTimeout(() => resolve(true), timeoutMs);
        })
    ]);
    clearTimeout(timer);

    if (timedOut) {
        forceKillProcessTree(child);
        await exited;
    }
    managedChildren.delete(child);
};

const spawnLocalServer = ({ root, port, env = {} }) => {
    const child = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: buildLocalServerEnv({
            PORT: String(port),
            ...env
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true
    });
    managedChildren.add(child);
    child.once('exit', () => managedChildren.delete(child));
    return child;
};

process.once('exit', () => {
    for (const child of managedChildren) {
        forceKillProcessTree(child);
    }
});

module.exports = {
    LOCAL_DATABASE_ENV,
    buildLocalServerEnv,
    spawnLocalServer,
    stopServerProcess
};
