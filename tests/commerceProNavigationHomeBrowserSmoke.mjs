import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { spawnLocalServer, stopServerProcess } = require('./helpers/localServerProcess.js');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commerceRoot = path.join(repositoryRoot, 'storefront-commerce-pro');
const commerceRequire = createRequire(path.join(commerceRoot, 'package.json'));
const puppeteer = commerceRequire('puppeteer-core');
const artifactPath = path.join(repositoryRoot, 'frontend', 'commerce-pro', 'index.html');
const deepPath = '/kategori/kadin/giyim/pantolon';
const brandSelector = 'a.brand[aria-label="NovaStore ana sayfa"]';
const browserTimeoutMs = 20_000;

const scenarios = Object.freeze([
    {
        name: 'desktop',
        viewport: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
    },
    {
        name: 'mobile',
        viewport: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
    }
]);

const reserveLoopbackPort = () => new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close((error) => error ? reject(error) : resolve(port));
    });
});

const findChromeExecutable = () => {
    const candidates = [
        process.env.NOVASTORE_CHROME_PATH,
        process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
    ].filter(Boolean);
    const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
    assert.ok(executablePath, 'Google Chrome executable must be available for navigation regression');
    return executablePath;
};

const waitForServer = async (child, baseUrl) => {
    const output = [];
    child.stdout.on('data', (chunk) => output.push(chunk.toString()));
    child.stderr.on('data', (chunk) => output.push(chunk.toString()));
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`Commerce Pro route server exited before startup (${child.exitCode}):\n${output.join('').slice(-4000)}`);
        }
        try {
            const response = await fetch(`${baseUrl}/`, {
                method: 'HEAD',
                signal: AbortSignal.timeout(1000)
            });
            if (response.status === 200) return output;
        } catch (_) {
            // The loopback listener is not ready yet.
        }
        await delay(100);
    }
    throw new Error(`Commerce Pro route server startup timed out:\n${output.join('').slice(-4000)}`);
};

const waitForUrlChange = async (page, previousUrl) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        if (page.url() !== previousUrl) return;
        await delay(50);
    }
    throw new Error(`brand click did not change the URL from ${previousUrl}`);
};

const removeOwnedBrowserDirectory = (temporaryDirectory) => {
    const resolvedDirectory = path.resolve(temporaryDirectory);
    const resolvedTempRoot = path.resolve(os.tmpdir());
    const normalizeCase = (value) => (
        process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value
    );
    assert.equal(
        normalizeCase(path.dirname(resolvedDirectory)),
        normalizeCase(resolvedTempRoot),
        'browser cleanup may only remove a direct child of os.tmpdir()'
    );
    assert.match(
        path.basename(resolvedDirectory),
        /^novastore-navigation-browser-[A-Za-z0-9_-]+$/,
        'browser cleanup must verify its task-owned directory prefix'
    );
    assert.equal(fs.existsSync(resolvedDirectory), true, 'browser cleanup target must exist');
    fs.rmSync(resolvedDirectory, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
    assert.equal(fs.existsSync(resolvedDirectory), false, 'browser temporary directory must be removed');
};

const configureRequestGuard = async (page, baseUrl) => {
    const baseOrigin = new URL(baseUrl).origin;
    const evidence = {
        externalRequests: [],
        mutationRequests: [],
        paymentRequests: [],
        blockedLocalReads: []
    };
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const requestUrl = request.url();
        const method = request.method().toUpperCase();
        const finish = (operation) => operation.catch(() => {});

        if (/^(?:data|blob|about):/i.test(requestUrl)) {
            finish(request.continue());
            return;
        }

        let parsed;
        try {
            parsed = new URL(requestUrl);
        } catch (_) {
            evidence.externalRequests.push(`${method} ${requestUrl}`);
            finish(request.abort('blockedbyclient'));
            return;
        }

        if (parsed.origin !== baseOrigin) {
            evidence.externalRequests.push(`${method} ${requestUrl}`);
            finish(request.abort('blockedbyclient'));
            return;
        }

        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            evidence.mutationRequests.push(`${method} ${parsed.pathname}`);
            finish(request.abort('blockedbyclient'));
            return;
        }

        if (/\/(?:api\/payments|paytr|payment)(?:\/|$)/i.test(parsed.pathname)) {
            evidence.paymentRequests.push(`${method} ${parsed.pathname}`);
            finish(request.abort('blockedbyclient'));
            return;
        }

        if (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/socket.io/')) {
            evidence.blockedLocalReads.push(`${method} ${parsed.pathname}`);
            finish(request.abort('blockedbyclient'));
            return;
        }

        finish(request.continue());
    });
    return evidence;
};

const exerciseScenario = async (browser, baseUrl, scenario) => {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewport(scenario.viewport);
    await page.setCacheEnabled(false);
    const requestEvidence = await configureRequestGuard(page, baseUrl);

    try {
        const response = await page.goto(`${baseUrl}${deepPath}`, {
            waitUntil: 'domcontentloaded',
            timeout: browserTimeoutMs
        });
        assert.ok(response, `${scenario.name} deep route must return a document response`);
        assert.equal(response.status(), 200, `${scenario.name} deep route must return HTTP 200`);
        await page.waitForSelector(brandSelector, { visible: true, timeout: browserTimeoutMs });

        const beforeUrl = page.url();
        const before = new URL(beforeUrl);
        assert.equal(before.pathname, deepPath, `${scenario.name} must begin on the deep category document path`);
        const hrefBeforeClick = await page.$eval(brandSelector, (node) => node.getAttribute('href'));

        await page.click(brandSelector);
        await waitForUrlChange(page, beforeUrl);
        await delay(250);
        const finalUrl = page.url();
        const final = new URL(finalUrl);
        const render = await page.evaluate(() => ({
            brandVisible: Boolean(document.querySelector('a.brand')),
            mainVisible: Boolean(document.querySelector('main')),
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        }));

        return {
            scenario: scenario.name,
            hrefBeforeClick,
            beforeUrl,
            finalUrl,
            finalPathname: final.pathname,
            finalHash: final.hash,
            finalSearch: final.search,
            routePass: final.pathname === '/' && final.hash === '' && final.search === '',
            render,
            pageErrors,
            ...requestEvidence
        };
    } finally {
        await page.close();
    }
};

const run = async () => {
    const artifact = fs.readFileSync(artifactPath, 'utf8');
    assert(artifact.includes('novastore-artifact-kind'), 'browser regression must use the production artifact');
    assert(artifact.includes('production-candidate'), 'browser regression must use the production candidate');
    assert(artifact.includes('IntegratedApp:createCommerceRuntime'), 'browser regression must use the integrated runtime');
    assert(!/createCanonicalFixtureRuntime|main-integrated-fixture|fixture-integrated/i.test(artifact));

    const port = await reserveLoopbackPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const browserDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'novastore-navigation-browser-'));
    let server;
    let browser;
    let operationError;
    const cleanupErrors = [];

    try {
        server = spawnLocalServer({
            root: repositoryRoot,
            port,
            env: {
                NODE_ENV: 'development',
                DATABASE_URL: '',
                DB_HOST: '127.0.0.1',
                DB_PORT: '55432',
                DB_NAME: 'novastore_preview',
                DB_USER: 'novastore_preview',
                NOVASTORE_STOREFRONT_MODE: 'commerce-pro',
                NOVASTORE_LOCAL_PREVIEW: 'true',
                NOVASTORE_ALLOW_REMOTE_DB: 'false',
                NOVASTORE_SAFE_LOCAL_BACKEND: 'false',
                SKIP_SCHEMA_INIT: 'true',
                NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
                NODE_OPTIONS: ''
            }
        });
        await waitForServer(server, baseUrl);

        browser = await puppeteer.launch({
            executablePath: findChromeExecutable(),
            headless: true,
            userDataDir: path.join(browserDirectory, 'profile'),
            args: [
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-background-networking',
                '--disable-component-update',
                '--disable-sync',
                '--metrics-recording-only'
            ],
            timeout: browserTimeoutMs
        });
        assert.match(await browser.version(), /^Chrome\//, 'navigation regression must run in Google Chrome');

        const results = [];
        for (const scenario of scenarios) {
            results.push(await exerciseScenario(browser, baseUrl, scenario));
        }

        for (const result of results) {
            assert.deepEqual(result.pageErrors, [], `${result.scenario} must have zero page errors`);
            assert.deepEqual(result.externalRequests, [], `${result.scenario} must make zero external requests`);
            assert.deepEqual(result.mutationRequests, [], `${result.scenario} must make zero mutation requests`);
            assert.deepEqual(result.paymentRequests, [], `${result.scenario} must make zero payment requests`);
            assert.equal(result.render.brandVisible, true, `${result.scenario} brand must remain rendered`);
            assert.equal(result.render.mainVisible, true, `${result.scenario} main content must remain rendered`);
            assert.equal(result.render.horizontalOverflow, false, `${result.scenario} must not overflow horizontally`);
        }

        const routeFailures = results.filter((result) => !result.routePass);
        assert.deepEqual(
            routeFailures,
            [],
            `home brand click must reach document root without a hash: ${JSON.stringify(results)}`
        );
        console.log(`NAVIGATION_BROWSER_RESULTS=${JSON.stringify(results)}`);
        console.log(`NAVIGATION_FINAL_HOME_URL=${baseUrl}/`);
        console.log('NAVIGATION_HOME_BROWSER_SMOKE=PASS');
    } catch (error) {
        operationError = error;
    }

    if (browser) {
        try {
            await browser.close();
        } catch (error) {
            cleanupErrors.push(error);
        }
    }
    try {
        await stopServerProcess(server);
    } catch (error) {
        cleanupErrors.push(error);
    }
    try {
        removeOwnedBrowserDirectory(browserDirectory);
    } catch (error) {
        cleanupErrors.push(error);
    }

    if (operationError && cleanupErrors.length) {
        throw new AggregateError([operationError, ...cleanupErrors], 'browser regression and cleanup failed');
    }
    if (operationError) throw operationError;
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, 'browser cleanup failed');
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
