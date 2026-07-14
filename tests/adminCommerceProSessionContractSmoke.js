const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { privateNoStore } = require('../middlewares/privateNoStore');
const { createRequireCurrentAdmin } = require('../services/currentAdminGuard');
const {
    ADMIN_COMMERCE_CAPABILITIES,
    createGetAdminNotificationSummaries,
    createGetAdminOrderSummaries,
    createGetAdminReturnSummaries,
    getAdminCommerceCapabilities,
    getAdminSession,
    parseOrderSummaryLimit
} = require('../services/adminCommerceReadService');

process.env.JWT_SECRET = 'commerce-pro-session-smoke-secret';

const tokenFor = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

const createResponse = () => ({
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(value) {
        this.payload = value;
        return this;
    },
    setHeader(name, value) {
        this.headers[String(name).toLowerCase()] = String(value);
    }
});

const runChain = async (handlers, req) => {
    const res = createResponse();
    const dispatch = async (index) => {
        if (index >= handlers.length) return;
        let nextPromise = null;
        const next = () => {
            nextPromise = dispatch(index + 1);
            return nextPromise;
        };
        await handlers[index](req, res, next);
        if (nextPromise) await nextPromise;
    };
    await dispatch(0);
    return res;
};

const guardForRows = (rows, queries = []) => createRequireCurrentAdmin({
    async query(sql, params) {
        queries.push({ sql, params });
        return { rows };
    }
});

const chainFor = (rows, queries) => [
    privateNoStore,
    authenticate,
    requireAdmin,
    guardForRows(rows, queries),
    getAdminSession
];

(async () => {
    const noToken = await runChain(chainFor([]), { headers: {} });
    assert.equal(noToken.statusCode, 401);
    assert.equal(noToken.headers['cache-control'], 'private, no-store, max-age=0');

    const customer = await runChain(chainFor([]), {
        headers: { authorization: `Bearer ${tokenFor({ id: 9, role: 'customer' })}` }
    });
    assert.equal(customer.statusCode, 403);

    const expired = await runChain(chainFor([]), {
        headers: { authorization: `Bearer ${jwt.sign({ id: 9, role: 'admin', exp: Math.floor(Date.now() / 1000) - 1 }, process.env.JWT_SECRET)}` }
    });
    assert.equal(expired.statusCode, 401);

    const tampered = await runChain(chainFor([]), {
        headers: { authorization: `Bearer ${tokenFor({ id: 9, role: 'admin' })}tampered` }
    });
    assert.equal(tampered.statusCode, 401);

    const missingAdmin = await runChain(chainFor([]), {
        headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'admin' })}` }
    });
    assert.equal(missingAdmin.statusCode, 401);

    const demotedAdmin = await runChain(chainFor([{ id: 17, role: 'customer' }]), {
        headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'admin' })}` }
    });
    assert.equal(demotedAdmin.statusCode, 403);

    const queries = [];
    const validAdmin = await runChain(chainFor([{ id: 17, role: 'admin' }], queries), {
        headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'admin' })}` }
    });
    assert.equal(validAdmin.statusCode, 200);
    assert.equal(validAdmin.payload.user.id, 17);
    assert.equal(validAdmin.payload.user.role, 'admin');
    assert.equal(validAdmin.payload.commerceMode, 'single_vendor');
    assert.equal(validAdmin.payload.capabilities.dashboardRead, true);
    assert.equal(validAdmin.payload.capabilities.ordersRead, true);
    assert.equal(validAdmin.payload.capabilities.returnsRead, true);
    assert.equal(validAdmin.payload.capabilities.firstPartyCatalogRead, true);
    assert.equal(validAdmin.payload.capabilities.notificationsRead, true);
    assert.equal(validAdmin.payload.capabilities.orderStatusWrite, false);
    assert.equal(validAdmin.payload.capabilities.orderCancelWrite, false);
    assert.equal(validAdmin.payload.capabilities.manualShipmentWrite, false);
    assert.equal(validAdmin.payload.capabilities.sellerAdmin, false);
    assert.equal(Object.isFrozen(ADMIN_COMMERCE_CAPABILITIES), true);
    assert.equal(Object.isFrozen(validAdmin.payload.capabilities), true);
    assert.deepEqual(queries[0].params, [17]);

    const enabledWriteCapabilities = getAdminCommerceCapabilities({
        NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED: 'true',
        NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED: 'true'
    });
    assert.equal(enabledWriteCapabilities.orderCancelWrite, true);
    assert.equal(enabledWriteCapabilities.manualShipmentWrite, true);
    assert.equal(enabledWriteCapabilities.orderStatusWrite, false);
    const nonExplicitWriteCapabilities = getAdminCommerceCapabilities({
        NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED: '1',
        NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED: 'yes'
    });
    assert.equal(nonExplicitWriteCapabilities.orderCancelWrite, false);
    assert.equal(nonExplicitWriteCapabilities.manualShipmentWrite, false);

    const guardFailure = await runChain([
        privateNoStore,
        authenticate,
        requireAdmin,
        createRequireCurrentAdmin({ async query() { throw new Error('db unavailable'); } }),
        getAdminSession
    ], { headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'admin' })}` } });
    assert.equal(guardFailure.statusCode, 500);
    assert.equal(guardFailure.headers['cache-control'], 'private, no-store, max-age=0');

    assert.equal(parseOrderSummaryLimit(undefined), 50);
    assert.equal(parseOrderSummaryLimit('0'), 1);
    assert.equal(parseOrderSummaryLimit('1000'), 100);
    assert.equal(parseOrderSummaryLimit('25'), 25);
    assert.equal(parseOrderSummaryLimit('25junk'), 50);

    const summaryQueries = [];
    const summaryHandler = createGetAdminOrderSummaries({
        async query(sql, params) {
            summaryQueries.push({ sql, params });
            return { rows: [{ id: 1, customer_name: 'Müşteri' }] };
        }
    });
    const summaryResponse = createResponse();
    await summaryHandler({ query: { limit: '100' } }, summaryResponse);
    assert.equal(summaryResponse.statusCode, 200);
    assert.equal(summaryResponse.payload.limit, 100);
    assert.equal(summaryResponse.payload.hasMore, false);
    assert.equal(summaryResponse.payload.items.length, 1);
    assert.deepEqual(summaryQueries[0].params, [101]);
    assert.doesNotMatch(summaryQueries[0].sql, /address|phone/i, 'sipariş özeti gereksiz adres/telefon PII seçmemeli');
    assert.match(summaryQueries[0].sql, /LIMIT \$1/);

    const fullSummaryHandler = createGetAdminOrderSummaries({
        async query() {
            return { rows: Array.from({ length: 101 }, (_, index) => ({ id: index + 1 })) };
        }
    });
    const fullSummaryResponse = createResponse();
    await fullSummaryHandler({ query: { limit: '100' } }, fullSummaryResponse);
    assert.equal(fullSummaryResponse.payload.items.length, 100);
    assert.equal(fullSummaryResponse.payload.hasMore, true);

    const demotedSummary = await runChain([
        privateNoStore,
        authenticate,
        requireAdmin,
        guardForRows([{ id: 17, role: 'customer' }]),
        fullSummaryHandler
    ], {
        headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'admin' })}` },
        query: { limit: '100' }
    });
    assert.equal(demotedSummary.statusCode, 403);
    assert.equal(demotedSummary.headers['cache-control'], 'private, no-store, max-age=0');

    const successfulSummary = await runChain([
        privateNoStore,
        authenticate,
        requireAdmin,
        guardForRows([{ id: 17, role: 'admin' }]),
        summaryHandler
    ], {
        headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'admin' })}` },
        query: { limit: '100' }
    });
    assert.equal(successfulSummary.statusCode, 200);
    assert.equal(successfulSummary.headers['cache-control'], 'private, no-store, max-age=0');

    const failingSummaryHandler = createGetAdminOrderSummaries({
        async query() { throw new Error('summary unavailable'); }
    });
    const failedSummary = await runChain([
        privateNoStore,
        authenticate,
        requireAdmin,
        guardForRows([{ id: 17, role: 'admin' }]),
        failingSummaryHandler
    ], {
        headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'admin' })}` },
        query: { limit: '100' }
    });
    assert.equal(failedSummary.statusCode, 500);
    assert.equal(failedSummary.headers['cache-control'], 'private, no-store, max-age=0');

    const returnQueries = [];
    const returnSummaryHandler = createGetAdminReturnSummaries({
        async query(sql, params) {
            returnQueries.push({ sql, params });
            return { rows: [{ id: 1, order_id: 7 }] };
        }
    });
    const returnSummaryResponse = createResponse();
    await returnSummaryHandler({ query: { limit: '50' } }, returnSummaryResponse);
    assert.equal(returnSummaryResponse.statusCode, 200);
    assert.deepEqual(returnQueries[0].params, [51]);
    assert.equal(returnSummaryResponse.payload.hasMore, false);
    const returnProjection = returnQueries[0].sql.match(/SELECT([\s\S]*?)FROM returns/i)?.[1] || '';
    assert.doesNotMatch(returnProjection, /r\.\*|o\.\*|\bemail\b|\bphone\b|\baddress\b|\br\.note\b|\br\.user_id\b/i, 'iade özeti ham satır veya gereksiz PII seçmemeli');
    assert.match(returnQueries[0].sql, /ORDER BY[\s\S]+r\.created_at DESC NULLS LAST[\s\S]+r\.id DESC/);

    const notificationQueries = [];
    const notificationSummaryHandler = createGetAdminNotificationSummaries({
        async query(sql, params) {
            notificationQueries.push({ sql, params });
            return { rows: Array.from({ length: 51 }, (_, index) => ({ id: index + 1 })) };
        }
    });
    const notificationSummaryResponse = createResponse();
    await notificationSummaryHandler({ query: { limit: '50' } }, notificationSummaryResponse);
    assert.equal(notificationSummaryResponse.statusCode, 200);
    assert.equal(notificationSummaryResponse.payload.items.length, 50);
    assert.equal(notificationSummaryResponse.payload.hasMore, true);
    assert.deepEqual(notificationQueries[0].params, [51]);
    assert.match(notificationQueries[0].sql, /WHERE user_id IS NULL/);
    assert.match(notificationQueries[0].sql, /COALESCE\(is_read, FALSE\) AS is_read/);
    assert.doesNotMatch(notificationQueries[0].sql, /SELECT \*/i);

    const routeSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminRoutes.js'), 'utf8');
    assert.match(routeSource, /integratedAdminRead = \[privateNoStore, authenticate, requireAdmin, requireCurrentAdmin\]/);
    assert.match(routeSource, /router\.get\('\/session', \.\.\.integratedAdminRead, getAdminSession\)/);
    assert.match(routeSource, /router\.get\('\/orders\/summary', \.\.\.integratedAdminRead, getAdminOrderSummaries\)/);
    assert.match(routeSource, /router\.get\('\/catalog\/products\/summary', \.\.\.integratedAdminRead, getAdminProductSummaries\)/);
    assert.match(routeSource, /router\.get\('\/returns\/summary', \.\.\.integratedAdminRead, getAdminReturnSummaries\)/);
    assert.match(routeSource, /router\.get\('\/notifications\/summary', \.\.\.integratedAdminRead, getAdminNotificationSummaries\)/);
    assert.match(routeSource, /router\.get\('\/stats', \.\.\.integratedAdminRead, getDashboardStats\)/);
    assert.match(routeSource, /router\.get\('\/behavior', authenticate, requireAdmin, getBehaviorAnalytics\)/);

    console.log('admin Commerce Pro session and bounded summary contract smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
