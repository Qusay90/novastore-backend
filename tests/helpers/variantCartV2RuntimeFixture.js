'use strict';

// Actual backend modules against a fresh owned PostgreSQL database. No substitute
// storefront, browser session, external provider, or production connection.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const startDisposable = require('./themePlatformDisposableDb');
const { seedVariantCartV2 } = require('./variantCartV2Fixture');
const arg = (name) => { const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1]; };
let db, server, stopped = false;

(async () => {
    const output = path.resolve(arg('--evidence-dir') || '');
    const webFrontend = path.resolve(arg('--web-frontend') || '');
    assert(arg('--evidence-dir') && arg('--web-frontend'), 'Explicit evidence and actual Web frontend directories required.');
    const entry = path.join(webFrontend, 'commerce-pro-integration-preview/index.html');
    const requestedPort = arg('--port') == null ? 0 : Number(arg('--port'));
    assert(Number.isInteger(requestedPort) && (requestedPort === 0 || (requestedPort >= 1024 && requestedPort <= 65535)), 'Valid loopback test port required.');
    assert(fs.existsSync(entry), 'Build the authorized Web integration entry before starting runtime acceptance.');
    fs.mkdirSync(output, { recursive: true });
    db = await startDisposable();
    // Same-origin browser caches are account-scoped. A fresh disposable database
    // must never impersonate the numeric account identity of a previous fixture
    // with an older revision. Preserve real stale-response guards by allocating
    // a new fixture generation's user IDs, not by clearing consumer storage.
    const previousReceipt = path.join(output, 'runtime-fixture-private.json');
    const previousUsers = fs.existsSync(previousReceipt)
        ? Object.values(JSON.parse(fs.readFileSync(previousReceipt, 'utf8'))).filter((value) => value && typeof value === 'object' && Number.isInteger(value.userId)).map((value) => value.userId)
        : [];
    let userSequence;
    do { userSequence = crypto.randomInt(100000000, 1800000000); } while (previousUsers.some((id) => Math.abs(id - userSequence) < 1000));
    await db.pool.query("SELECT setval(pg_get_serial_sequence('users','id'),$1,FALSE)", [userSequence]);
    const password = `B03-${crypto.randomBytes(12).toString('base64url')}!`;
    const fixtureKey = crypto.randomBytes(24).toString('base64url');
    db.sensitive.add(fixtureKey);
    const fixture = await seedVariantCartV2(db.pool, db.sensitive, { loginPassword: password });
    const root = path.resolve(__dirname, '../..');
    const localImage = '/uploads/local-products/zumrut-krep-ferace-takim.jpg';
    await db.pool.query('UPDATE products SET image_url=$1 WHERE id IN (501,502,601,602)', [localImage]);
    const categoryId = Number((await db.pool.query("INSERT INTO categories(name,slug,path) VALUES('B03 Giyim','b03-giyim','b03-giyim') RETURNING id")).rows[0].id);
    await db.pool.query('INSERT INTO product_categories(product_id,category_id,is_primary) SELECT id,$1,TRUE FROM products WHERE id IN(501,502,601,602)', [categoryId]);
    await require('../../services/categoryStatsService').syncCategoryStatsForProducts(db.pool, [501,502,601,602]);
    const app = express(); app.locals.sellerDatabase = db.pool;
    app.use(require('cors')({ origin: (origin, callback) => callback(null, !origin || /^(https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?|null)$/u.test(origin)), credentials: true }));
    app.use(express.json({ limit: '256kb' }));
    const requests = [];
    app.use((req, res, next) => { res.on('finish', () => { if (requests.length < 2000) requests.push({ method: req.method, path: req.path, status: res.statusCode }); }); next(); });
    const routes = {
        '/api/shared-state': 'sharedStateRoutes', '/api/users': 'userRoutes', '/api/products': 'productRoutes',
        '/api/campaigns': 'campaignRoutes', '/api/addresses': 'addressRoutes', '/api/favorites': 'favoriteRoutes',
        '/api/orders': 'orderRoutes', '/api/questions': 'questionRoutes', '/api/reviews': 'reviewRoutes',
        '/api/notifications': 'notificationRoutes', '/api/store-follows': 'storeFollowRoutes',
        '/api/public/categories': 'publicCategoryRoutes', '/api/public/navigation': 'publicNavigationRoutes',
        '/api/public/collections': 'publicCollectionRoutes', '/api/public/stores': 'publicStoreRoutes',
        '/api/categories': 'categoryRoutes', '/api/assistant': 'assistantRoutes', '/api/returns': 'returnRoutes'
    };
    for (const [mount, module] of Object.entries(routes)) app.use(mount, require(path.join(root, 'routes', module)));
    // Read the real payment-result contract without exposing provider initialize
    // or webhook actions from this disposable acceptance server.
    app.get('/api/payments/status', require('../../middlewares/authMiddleware').authenticateCustomer, require('../../controllers/paymentController').getPaymentStatus);
    app.get('/api/payments/capability', require('../../controllers/paymentController').getPaymentCapability);
    app.use('/api', require(path.join(root, 'routes/runtimeMetaRoutes')));
    const fixtureAuth = (req, res, next) => {
        if (req.headers['x-b03-fixture-key'] !== fixtureKey || !['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(req.socket.remoteAddress)) return res.status(404).json({ error: 'Not found' });
        next();
    };
    app.post('/__b03_fixture/paid-order', fixtureAuth, async (req, res) => {
        try {
            const userId = Number(req.body.userId);
            assert([fixture.alice.userId, fixture.bob.userId].includes(userId), 'Fixture-owned customer only.');
            const result = await fixture.createOrder(userId, req.body.items, { paid: true });
            const paymentRef = `B03-FIXTURE-${result.id}-${crypto.randomBytes(6).toString('hex')}`;
            await db.pool.query('UPDATE orders SET status=$2 WHERE id=$1', [result.id, require('../../constants/orderStatus').ORDER_STATUS.HAZIRLANIYOR]);
            await db.pool.query("INSERT INTO payments(order_id,provider,payment_ref,amount,currency,status,raw_request,raw_response) VALUES($1,'manual',$2,$3,'TRY','PAID',$4::jsonb,'{}'::jsonb)", [result.id, paymentRef, result.total_amount, JSON.stringify({ stockReserved: true, fixtureSettlement: true, finalizesOnWebhook: false })]);
            res.json({ orderId: Number(result.id), paymentRef, items: result.items, fixtureSettlement: true });
        } catch (error) { res.status(400).json({ code: error.code || 'B03_FIXTURE_INVALID' }); }
    });
    const shutdown = async () => {
        if (stopped) return; stopped = true;
        if (server) await new Promise((resolve) => server.close(resolve));
        const cleanup = await db.cleanup();
        fs.writeFileSync(path.join(output, 'runtime-fixture-cleanup.json'), JSON.stringify({ cleanup, requests }, null, 2) + '\n');
        process.exit(0);
    };
    app.post('/__b03_fixture/shutdown', fixtureAuth, (_req, res) => { res.json({ stopping: true }); setTimeout(() => shutdown().catch(() => process.exit(1)), 20); });
    app.get('/__b03_fixture/requests', fixtureAuth, (_req, res) => res.json({ requests }));
    app.get('/', (_req, res) => res.sendFile(entry));
    app.use(express.static(webFrontend, { index: false }));
    app.use('/uploads', express.static(path.join(root, 'frontend/uploads')));
    server = await new Promise((resolve, reject) => { const listener = app.listen(requestedPort, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); });
    const port = server.address().port;
    const privateReceipt = { port, url: `http://127.0.0.1:${port}`, fixtureKey, loginPassword: password,
        alice: { userId: fixture.alice.userId, email: fixture.alice.email }, bob: { userId: fixture.bob.userId, email: fixture.bob.email }, a: fixture.a, b: fixture.b, webFrontend, entry,
        scope: 'Owned disposable-only synthetic customer credentials. Never production credentials. No authentication bypass in application routes.' };
    const privatePath = path.join(output, 'runtime-fixture-private.json');
    fs.writeFileSync(privatePath, JSON.stringify(privateReceipt, null, 2) + '\n');
    db.originalConsole.log(JSON.stringify({ ready: true, port, url: privateReceipt.url, privateReceiptPath: privatePath, productId: 501, variantIds: [901, 902], database: 'owned disposable PostgreSQL', migrations: db.migrations.length }));
    process.on('SIGINT', () => shutdown().catch(() => process.exit(1)));
    process.on('SIGTERM', () => shutdown().catch(() => process.exit(1)));
})().catch(async (error) => {
    (db?.originalConsole.error || console.error)(db ? db.redact(error.stack || error.message) : error.message);
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) await db.cleanup().catch(() => {});
    process.exit(1);
});
