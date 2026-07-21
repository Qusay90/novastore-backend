const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const {
    spawnLocalServer,
    stopServerProcess
} = require('./helpers/localServerProcess');

const repositoryRoot = path.resolve(__dirname, '..');
const frontendRoot = path.join(repositoryRoot, 'frontend');
const artifact = fs.readFileSync(path.join(frontendRoot, 'commerce-pro', 'index.html'));
const legacy = Object.freeze({
    root: fs.readFileSync(path.join(frontendRoot, 'index.html')),
    category: fs.readFileSync(path.join(frontendRoot, 'categories.html')),
    collection: fs.readFileSync(path.join(frontendRoot, 'collections.html')),
    product: fs.readFileSync(path.join(frontendRoot, 'product.html')),
    login: fs.readFileSync(path.join(frontendRoot, 'login.html')),
    payment: fs.readFileSync(path.join(frontendRoot, 'payment-result.html')),
    paytr: fs.readFileSync(path.join(frontendRoot, 'paytr-checkout.html'))
});

const reserveLoopbackPort = () => new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close((error) => error ? reject(error) : resolve(port));
    });
});

const waitForServer = (child, timeoutMs = 30000) => new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
    };
    const onData = (chunk) => {
        output += chunk.toString();
        if (output.includes('NovaStore sunucusu')) finish(resolve);
    };
    const timer = setTimeout(
        () => finish(reject, new Error(`Commerce Pro route server startup timed out:\n${output}`)),
        timeoutMs
    );
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
        finish(reject, new Error(`Commerce Pro route server exited before startup (${code}):\n${output}`));
    });
});

const responseBytes = async (response) => Buffer.from(await response.arrayBuffer());
const fetchLocal = (baseUrl, pathname, options = {}) => fetch(`${baseUrl}${pathname}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    ...options
});

const assertArtifactResponse = async (baseUrl, pathname, method = 'GET') => {
    const response = await fetchLocal(baseUrl, pathname, { method });
    assert.equal(response.status, 200, `${method} ${pathname} must return 200`);
    assert.match(response.headers.get('content-type') || '', /^text\/html\b/i);
    const body = await responseBytes(response);
    if (method === 'HEAD') {
        assert.equal(body.length, 0, `HEAD ${pathname} must not return a body`);
        assert.equal(Number(response.headers.get('content-length')), artifact.length);
    } else {
        assert(body.equals(artifact), `${pathname} must return the exact production artifact bytes`);
    }
};

const assertRedirectToArtifact = async (baseUrl, pathname, status, expectedLocation) => {
    const response = await fetchLocal(baseUrl, pathname);
    assert.equal(response.status, status, `${pathname} must return ${status}`);
    assert.equal(response.headers.get('location'), expectedLocation);
    const followed = await fetch(`${baseUrl}${pathname}`, {
        redirect: 'follow',
        signal: AbortSignal.timeout(10000)
    });
    assert.equal(followed.status, 200, `${pathname} redirect target must return 200`);
    assert((await responseBytes(followed)).equals(artifact), `${pathname} must reach the production artifact`);
};

const assertHeadRedirect = async (baseUrl, pathname, status, expectedLocation) => {
    const response = await fetchLocal(baseUrl, pathname, { method: 'HEAD' });
    assert.equal(response.status, status, `HEAD ${pathname} must return ${status}`);
    assert.equal(response.headers.get('location'), expectedLocation);
    assert.equal((await responseBytes(response)).length, 0, `HEAD ${pathname} must not return a body`);
};

const assertNotArtifact = async (baseUrl, pathname, options = {}) => {
    const response = await fetchLocal(baseUrl, pathname, options);
    const body = await responseBytes(response);
    assert(!body.equals(artifact), `${options.method || 'GET'} ${pathname} must not return Commerce Pro HTML`);
    return { response, body };
};

const withServer = async (mode, verify) => {
    const port = await reserveLoopbackPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let server;
    try {
        server = spawnLocalServer({
            root: repositoryRoot,
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
                NOVASTORE_STOREFRONT_MODE: mode,
                NODE_OPTIONS: ''
            }
        });
        await waitForServer(server);
        await verify(baseUrl);
    } finally {
        await stopServerProcess(server);
    }
};

(async () => {
    const artifactText = artifact.toString('utf8');
    assert(artifactText.includes('novastore-artifact-kind'));
    assert(artifactText.includes('production-candidate'));
    assert(artifactText.includes('IntegratedApp:createCommerceRuntime'));
    assert(!/createCanonicalFixtureRuntime|main-integrated-fixture|fixture-integrated/i.test(artifactText));
    assert(!/commerce-pro-(?:preview|integration-preview)|noindex|nofollow/i.test(artifactText));

    await withServer('commerce-pro', async (baseUrl) => {
        for (const pathname of [
            '/',
            '/?campaign=route-smoke',
            '/index.html',
            '/kategori/kadin/giyim/pantolon',
            '/kategori/kadin/giyim/pantolon?sort=price-low',
            '/urun/kanonik-pantolon',
            '/koleksiyon/firsatlar',
            '/login.html',
            '/forgot-password.html',
            '/reset-password.html?token=local-only',
            '/checkout.html',
            '/profile.html?tab=favorites',
            '/product.html?id=101'
        ]) {
            await assertArtifactResponse(baseUrl, pathname);
        }

        for (const pathname of ['/', '/kategori/kadin/giyim/pantolon', '/product.html?id=101']) {
            await assertArtifactResponse(baseUrl, pathname, 'HEAD');
        }

        await assertRedirectToArtifact(
            baseUrl,
            '/category/kadin/giyim/pantolon?sort=price-low',
            301,
            '/kategori/kadin/giyim/pantolon?sort=price-low'
        );
        await assertHeadRedirect(
            baseUrl,
            '/category/kadin/giyim/pantolon?sort=price-low',
            301,
            '/kategori/kadin/giyim/pantolon?sort=price-low'
        );

        for (const [pathname, location] of [
            ['/urun-id/101', '/#/urun-id/101'],
            ['/arama?q=pantolon', '/#/arama?q=pantolon'],
            ['/favoriler?from=home', '/#/favoriler?from=home'],
            ['/favoriler/', '/#/favoriler'],
            ['/sepet', '/#/sepet'],
            ['/hesabim', '/#/hesabim'],
            ['/hesabim/siparisler/42', '/#/hesabim/siparisler/42'],
            ['/giris', '/#/giris'],
            ['/kayit', '/#/kayit'],
            ['/sifremi-unuttum', '/#/sifremi-unuttum'],
            ['/sifre-sifirla?token=local-only', '/#/sifre-sifirla?token=local-only'],
            ['/odeme/teslimat', '/#/odeme/teslimat'],
            ['/odeme/odeme', '/#/odeme/odeme'],
            ['/odeme/onay', '/#/odeme/onay'],
            ['/yardim', '/#/yardim'],
            ['/siparis-takibi', '/#/siparis-takibi'],
            ['/iletisim', '/#/iletisim']
        ]) {
            await assertRedirectToArtifact(baseUrl, pathname, 302, location);
        }
        await assertHeadRedirect(baseUrl, '/favoriler?from=home', 302, '/#/favoriler?from=home');
        await assertHeadRedirect(baseUrl, '/odeme/teslimat', 302, '/#/odeme/teslimat');

        for (const pathname of [
            '/api/route-smoke-not-found',
            '/socket.io/?EIO=4&transport=polling',
            '/admin.html',
            '/admin-login.html',
            '/admin-commerce-pro.html',
            '/admin/route-smoke-not-found',
            '/paytr-checkout.html',
            '/payment-result.html?merchant_oid=local-only',
            '/favicon.ico',
            '/shared-state-sync.js',
            '/route-smoke-not-found',
            '/odeme/sonuc',
            '/siparis/tamamlandi',
            '/merchant/route-smoke-not-found',
            '/category/%E0%A4%A'
        ]) {
            await assertNotArtifact(baseUrl, pathname);
        }
        await assertNotArtifact(baseUrl, '/favoriler', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}'
        });

        const paymentResult = await fetchLocal(baseUrl, '/payment-result.html?merchant_oid=local-only');
        assert((await responseBytes(paymentResult)).equals(legacy.payment));
        const paytrCheckout = await fetchLocal(baseUrl, '/paytr-checkout.html');
        assert((await responseBytes(paytrCheckout)).equals(legacy.paytr));
    });

    await withServer('legacy', async (baseUrl) => {
        const legacyRoot = await fetchLocal(baseUrl, '/');
        assert.equal(legacyRoot.status, 200);
        assert((await responseBytes(legacyRoot)).equals(legacy.root));

        const legacyCategory = await fetchLocal(baseUrl, '/kategori/kadin/giyim/pantolon');
        assert.equal(legacyCategory.status, 200);
        assert((await responseBytes(legacyCategory)).equals(legacy.category));

        for (const [pathname, expected] of [
            ['/collections.html', legacy.collection],
            ['/product.html?id=101', legacy.product],
            ['/login.html', legacy.login],
            ['/payment-result.html?merchant_oid=local-only', legacy.payment],
            ['/paytr-checkout.html', legacy.paytr]
        ]) {
            const response = await fetchLocal(baseUrl, pathname);
            assert.equal(response.status, 200, `${pathname} must retain its legacy owner`);
            assert((await responseBytes(response)).equals(expected));
        }

        await assertNotArtifact(baseUrl, '/favoriler');
        await assertNotArtifact(baseUrl, '/api/route-smoke-not-found');
        await assertNotArtifact(baseUrl, '/admin.html');
    });

    console.log('Commerce Pro cutover route smoke passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
