const assert = require('assert');
const net = require('net');
const path = require('path');
const {
    spawnLocalServer,
    stopServerProcess
} = require('./helpers/localServerProcess');

const root = path.join(__dirname, '..');

const reserveLoopbackPort = () => new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close((error) => {
            if (error) reject(error);
            else resolve(port);
        });
    });
});

const waitForServer = (child, timeoutMs = 30000) => new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(
        () => reject(new Error(`Admin response header server startup timed out: ${output}`)),
        timeoutMs
    );
    const onData = (chunk) => {
        output += chunk.toString();
        if (output.includes('NovaStore sunucusu')) {
            clearTimeout(timer);
            resolve();
        }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Admin response header server exited before startup: ${code}\n${output}`));
    });
});

const fetchHtml = (baseUrl, pathname) => fetch(`${baseUrl}${pathname}`, {
    headers: { Origin: 'https://attacker.invalid' }
});

(async () => {
    const port = await reserveLoopbackPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let server;

    try {
        server = spawnLocalServer({
            root,
            port,
            env: {
                NODE_ENV: 'development',
                DATABASE_URL: 'postgresql://novastore_preview:novastore_preview@127.0.0.1:55432/novastore_preview',
                DB_HOST: '127.0.0.1',
                DB_PORT: '55432',
                DB_NAME: 'novastore_preview',
                DB_USER: 'novastore_preview',
                DB_PASSWORD: 'novastore_preview',
                NOVASTORE_LOCAL_PREVIEW: 'true',
                NOVASTORE_SAFE_LOCAL_BACKEND: 'false',
                NODE_OPTIONS: ''
            }
        });
        await waitForServer(server);

        for (const pathname of [
            '/admin-commerce-pro.html',
            '/admin-commerce-pro-live.html'
        ]) {
            const response = await fetchHtml(baseUrl, pathname);
            assert.equal(response.status, 200, `${pathname} sunulmalı`);
            assert.match(
                response.headers.get('content-security-policy') || '',
                /(?:^|;)\s*frame-ancestors\s+'none'\s*(?:;|$)/i,
                `${pathname} response-level frame-ancestors 'none' taşımalı`
            );
            assert.equal(
                response.headers.get('x-frame-options'),
                'DENY',
                `${pathname} X-Frame-Options: DENY taşımalı`
            );
        }

        for (const pathname of ['/index.html', '/checkout.html', '/admin.html']) {
            const response = await fetchHtml(baseUrl, pathname);
            assert.equal(response.status, 200, `${pathname} sunulmalı`);
            assert.equal(
                response.headers.get('content-security-policy'),
                null,
                `${pathname} Commerce Pro CSP başlığını devralmamalı`
            );
            assert.equal(
                response.headers.get('x-frame-options'),
                null,
                `${pathname} Commerce Pro X-Frame-Options başlığını devralmamalı`
            );
        }
    } finally {
        await stopServerProcess(server);
    }

    console.log('admin Commerce Pro response header smoke passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
