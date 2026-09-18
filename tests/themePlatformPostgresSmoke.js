'use strict';

// Integration proof: real PostgreSQL migrations, real signed sessions and HTTP.
// Not browser, native Android, provider, staging or production UAT.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const startDisposable = require('./helpers/themePlatformDisposableDb');

const gates = [];
const expectedGateCount = 39;
let db;
let server;
let cleanupResult = null;
const gate = async (name, run) => {
    try { await run(); gates.push({ name, status: 'PASS' }); db.originalConsole.log(`PASS ${name}`); }
    catch (error) { gates.push({ name, status: 'FAIL' }); throw new Error(`${name}: ${error.stack || error.message}`); }
};

(async () => {
    db = await startDisposable();
    const { pool, sensitive } = db;
    const adminPrefix = '/api/admin/theme-platform';
    const sellerPrefix = '/api/seller/v1/theme-platform';
    const reason = 'Disposable integration verification';
    const start = '2026-01-01T00:00:00.000Z';
    const farFuture = '2099-01-01T00:00:00.000Z';
    const tokenService = require('../services/sellerAccessTokenService').createSellerAccessTokenService({ secret: process.env.SELLER_ACCESS_TOKEN_SECRET });
    const issueAdmin = async (label, role) => {
        const userId = Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES($1,$2,'unused','admin',TRUE) RETURNING id", [label, `${label}@example.test`])).rows[0].id);
        const session = await require('../services/authSessionService').issueAccessSession({ queryable: pool, userId, role: 'admin', principal: 'admin' });
        sensitive.add(session.token);
        if (role) await pool.query('INSERT INTO theme_admin_roles(user_id,role) VALUES($1,$2)', [userId, role]);
        return { ...session, userId };
    };
    const issueSeller = async (label, store, role) => {
        const userId = Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES($1,$2,'unused','customer',TRUE) RETURNING id", [label, `${label}@example.test`])).rows[0].id);
        const roleId = Number((await pool.query("SELECT id FROM seller_roles WHERE code='owner' AND organization_id IS NULL")).rows[0].id);
        const stamp = crypto.randomUUID();
        const membershipId = Number((await pool.query('INSERT INTO seller_memberships(organization_id,user_id,role_id,security_stamp) VALUES($1,$2,$3,$4) RETURNING id', [store.org, userId, roleId, stamp])).rows[0].id);
        await pool.query('INSERT INTO seller_membership_store_scopes(membership_id,organization_id,store_id) VALUES($1,$2,$3)', [membershipId, store.org, store.id]);
        const sessionId = crypto.randomUUID();
        await pool.query("INSERT INTO seller_sessions(id,user_id,organization_id,membership_id,membership_revision,security_stamp,expires_at) VALUES($1,$2,$3,$4,1,$5,NOW()+INTERVAL '1 day')", [sessionId, userId, store.org, membershipId, stamp]);
        if (role) await pool.query('INSERT INTO theme_seller_roles(organization_id,membership_id,role) VALUES($1,$2,$3)', [store.org, membershipId, role]);
        const token = tokenService.issue({ sessionId, userId }); sensitive.add(token);
        return { userId, membershipId, sessionId, token, store };
    };
    const makeStore = async (slug) => {
        const org = Number((await pool.query('INSERT INTO seller_organizations(external_key,display_name) VALUES($1,$2) RETURNING id', [crypto.randomUUID(), slug])).rows[0].id);
        const legacyId = Number((await pool.query('INSERT INTO stores(name,slug) VALUES($1,$1) RETURNING id', [slug])).rows[0].id);
        const id = Number((await pool.query('INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,$3) RETURNING id', [org, legacyId, slug])).rows[0].id);
        return { id, org, legacyId };
    };
    const admin = await issueAdmin('theme-super', 'super_admin');
    const themeAdmin = await issueAdmin('theme-catalog-admin', 'theme_admin');
    const support = await issueAdmin('theme-support', 'support');
    const unbound = await issueAdmin('theme-unbound', null);
    const storeA = await makeStore('theme-test-a'), storeB = await makeStore('theme-test-b');
    const a = await issueSeller('theme-owner-a', storeA), b = await issueSeller('theme-owner-b', storeB);
    const editor = await issueSeller('theme-editor-a', storeA, 'seller_editor');
    const viewer = await issueSeller('theme-viewer-a', storeA, 'seller_viewer');
    const sellerAdmin = await issueSeller('theme-admin-a', storeA, 'seller_admin');
    const customerSession = await require('../services/authSessionService').issueAccessSession({ queryable: pool, userId: a.userId, role: 'customer', principal: 'customer' });
    sensitive.add(customerSession.token);
    const { createAdminThemeRouter, createSellerThemeRouter } = require('../routes/themePlatformRoutes');
    const auth = require('../middlewares/sellerAuthMiddleware').createSellerAuthMiddleware({ verifyAccessToken: tokenService.verify });
    const tenant = require('../middlewares/sellerTenantContext').createSellerTenantContextMiddleware();
    const app = express(); app.use(express.json({ limit: '1mb' })); app.locals.sellerDatabase = pool;
    app.use('/api/admin/theme-platform-disabled', createAdminThemeRouter({ database: pool, enabled: false }));
    app.use(adminPrefix, createAdminThemeRouter({ database: pool, enabled: true }));
    app.use(sellerPrefix, createSellerThemeRouter({ database: pool, enabled: true, auth, tenant }));
    app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND' }));
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const request = async (url, { actor = admin, method = 'GET', body, key, headers = {} } = {}) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
            method, headers: { ...(actor ? { authorization: `Bearer ${actor.token}` } : {}),
                ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                ...(key ? { 'idempotency-key': key } : {}), ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        return { status: response.status, body: await response.json() };
    };
    const ok = (response, expected = 200) => {
        assert.equal(response.status, expected, `HTTP ${expected}; received ${response.status}, code=${response.body?.code || response.body?.error || 'none'}`);
        return response.body;
    };
    const write = (url, body, actor = admin, method = 'POST', key = crypto.randomUUID(), headers = {}) => request(url, { actor, method, body, key, headers });
    const result = async (...args) => ok(await write(...args)).result;
    const baseDocument = { schemaVersion: 1, tokens: { accent: '#ee7700', background: '#ffffff', text: '#172a3a', fontFamily: 'system', radius: 12 },
        components: [{ id: 'hero-main', type: 'hero', props: { title: 'Nova Store', subtitle: 'Disposable private fixture', target: '/shop' } },
            { id: 'products-main', type: 'product_grid', props: { title: 'Products', productIds: [], columns: 3 } }], assetIds: [] };
    const overrides = (title = 'Seller A draft') => ({ tokens: { accent: '#ff6600' }, components: [{ componentId: 'hero-main', props: { title } }], assetIds: [] });
    let theme, version, serviceA, serviceB, assignmentA, assignmentB, draftA, draftB, previewA, previewB, assetA, assetB, publicationA, publicationB;
    let saveOperation, saveKey, saveBody;
    const getService = async (id) => ok(await request(`${adminPrefix}/services/${id}`));
    const getDraft = async (id, actor = a) => ok(await request(`${sellerPrefix}/drafts/${id}`, { actor }));
    const entitle = async (feature, effect, quota = null, serviceId = serviceA.id, expiry = null) => {
        const service = await getService(serviceId);
        return result(`${adminPrefix}/services/${serviceId}/entitlements/${feature}`, { expectedRevision: service.policy_revision, effect, quota, startsAt: start, expiresAt: expiry, reason }, admin, 'PUT');
    };
    await gate('G00 full migration registry applies once and reruns without changes', async () => assert(db.migrations.some((id) => /theme/i.test(id))));
    await gate('G01 runtime feature default disables routes', async () => ok(await request('/api/admin/theme-platform-disabled/themes'), 404));
    await gate('G02 anonymous and wrong-principal access denied', async () => {
        ok(await request(`${adminPrefix}/themes`, { actor: null }), 401);
        ok(await request(`${sellerPrefix}/assignments`, { actor: null }), 401);
        ok(await request(`${adminPrefix}/themes`, { actor: a }), 401);
        ok(await request(`${sellerPrefix}/assignments`, { actor: admin }), 401);
        ok(await request(`${sellerPrefix}/assignments`, { actor: customerSession }), 401);
        ok(await request(`${sellerPrefix}/assignments`, { actor: null, headers: { 'x-novastore-signature': 'fixture', 'x-seller-organization-id': String(storeA.org) } }), 401);
    });
    await gate('G03 existing admin has no implicit theme privilege', async () => ok(await request(`${adminPrefix}/themes`, { actor: unbound }), 403));
    await gate('G04 catalog roles and strict request allowlists', async () => {
        theme = await result(`${adminPrefix}/themes`, { slug: 'wave1-fixture', name: 'Nova Store fixture', reason }, themeAdmin);
        assert(theme.id);
        ok(await request(`${adminPrefix}/themes`, { actor: support }));
        ok(await write(`${adminPrefix}/themes`, { slug: 'support-forbidden', name: 'No', reason }, support), 403);
        ok(await write(`${adminPrefix}/themes`, { slug: 'forged', name: 'No', role: 'super_admin', reason }), 400);
        ok(await request(`${adminPrefix}/themes`, { actor: a }), 401);
    });
    await gate('G05 typed base documents reject inline code, URLs and commerce mutation', async () => {
        for (const patch of [{ html: '<script>bad()</script>' }, { price: 1 }, { imageKey: 'https://external.invalid/a.png' }]) {
            const document = structuredClone(baseDocument); Object.assign(document.components[0].props, patch);
            ok(await write(`${adminPrefix}/themes/${theme.id}/versions`, { version: crypto.randomUUID(), document, status: 'DRAFT', reason }), 400);
        }
        version = await result(`${adminPrefix}/themes/${theme.id}/versions`, { version: '1.0.0', document: baseDocument, status: 'PUBLISHED', reason });
        assert.equal(version.status, 'PUBLISHED');
        const draftVersion = await result(`${adminPrefix}/themes/${theme.id}/versions`, { version: '2.0.0', document: baseDocument, status: 'DRAFT', reason });
        for (const row of [version, draftVersion]) {
            const metadata = ok(await request(`${adminPrefix}/versions/${row.id}`, { actor: support }));
            assert.equal(metadata.id, row.id); assert(!Object.hasOwn(metadata, 'document'), 'Support receives metadata only');
        }
    });
    await gate('G06 published version immutable at database boundary', async () => {
        await assert.rejects(pool.query("UPDATE theme_versions SET document='{}'::jsonb WHERE id=$1", [version.id]));
        await assert.rejects(pool.query('DELETE FROM theme_versions WHERE id=$1', [version.id]));
        const read = ok(await request(`${adminPrefix}/versions/${version.id}`)); assert.equal(read.digest, version.digest);
    });
    await gate('G07 server derives service organization and seller-store identity', async () => {
        const body = (storeId) => ({ storeId, plan: 'pro', status: 'ACTIVE', startsAt: start, expiresAt: farFuture, reason });
        ok(await write(`${adminPrefix}/services`, body(storeA.id), themeAdmin), 403);
        ok(await write(`${adminPrefix}/services`, { ...body(storeA.id), organizationId: storeB.org }), 400);
        const key = crypto.randomUUID();
        const created = ok(await write(`${adminPrefix}/services`, body(storeA.id), admin, 'POST', key));
        serviceA = created.result;
        assert.deepEqual(ok(await write(`${adminPrefix}/services`, body(storeA.id), admin, 'POST', key)), created);
        ok(await write(`${adminPrefix}/services`, { ...body(storeA.id), plan: 'basic' }, admin, 'POST', key), 409);
        ok(await write(`${adminPrefix}/services`, body(storeA.id)), 409);
        serviceB = await result(`${adminPrefix}/services`, body(storeB.id));
        assert.equal(Number(serviceA.organization_id), storeA.org); assert.equal(Number(serviceA.store_id), storeA.id);
        assert.equal(Number(serviceB.organization_id), storeB.org);
        const operation = (await pool.query('SELECT service_id,organization_id,store_id,scope_key FROM theme_operations WHERE id=$1', [created.operationId])).rows[0];
        assert.equal(operation.service_id, serviceA.id); assert.equal(operation.scope_key, serviceA.id);
        assert.equal(Number(operation.organization_id), storeA.org); assert.equal(Number(operation.store_id), storeA.id);
        const outbox = (await pool.query('SELECT service_id,payload FROM theme_outbox WHERE operation_id=$1', [created.operationId])).rows;
        assert.equal(outbox.length, 1); assert.equal(outbox[0].service_id, serviceA.id);
        assert.equal(outbox[0].payload.result.status, 'ACTIVE');
        const audit = (await pool.query('SELECT service_id FROM theme_audit_events WHERE target_id=$1 AND action=$2', [serviceA.id, 'theme.createService'])).rows;
        assert.equal(audit.length, 1); assert.equal(audit[0].service_id, serviceA.id);
        const storeC = await makeStore('theme-test-concurrent-provision');
        const concurrentKey = crypto.randomUUID();
        const concurrent = await Promise.all([1, 2].map(() => write(`${adminPrefix}/services`, body(storeC.id), admin, 'POST', concurrentKey)));
        concurrent.forEach((response) => ok(response)); assert.deepEqual(concurrent[0].body, concurrent[1].body);
        const createdId = concurrent[0].body.result.id;
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM seller_theme_services WHERE organization_id=$1 AND store_id=$2', [storeC.org, storeC.id])).rows[0].n, 1);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM theme_operations WHERE service_id=$1', [createdId])).rows[0].n, 1);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM theme_outbox WHERE service_id=$1', [createdId])).rows[0].n, 1);
        // Fault injection belongs only to this owned disposable database. It
        // proves the pre-ledger service insert cannot survive an outbox failure.
        const storeD = await makeStore('theme-test-failed-provision');
        await pool.query(`CREATE FUNCTION theme_test_reject_provision_event() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW.event_type='theme.createService' AND NEW.store_id=${storeD.id} THEN
                RAISE EXCEPTION 'disposable outbox failure' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$`);
        await pool.query('CREATE TRIGGER theme_test_fail_outbox BEFORE INSERT ON theme_outbox FOR EACH ROW EXECUTE FUNCTION theme_test_reject_provision_event()');
        try {
            ok(await write(`${adminPrefix}/services`, body(storeD.id)), 409);
            assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM seller_theme_services WHERE organization_id=$1 AND store_id=$2', [storeD.org, storeD.id])).rows[0].n, 0);
            for (const table of ['theme_operations', 'theme_outbox', 'theme_audit_events'])
                assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE organization_id=$1 AND store_id=$2`, [storeD.org, storeD.id])).rows[0].n, 0);
        } finally {
            await pool.query('DROP TRIGGER theme_test_fail_outbox ON theme_outbox');
            await pool.query('DROP FUNCTION theme_test_reject_provision_event()');
        }
    });
    await gate('G08 assignment creates separate isolated editable drafts', async () => {
        ({ assignment: assignmentA, draft: draftA } = await result(`${adminPrefix}/services/${serviceA.id}/assignments`, { themeVersionId: version.id, channel: 'web', reason }));
        ({ assignment: assignmentB, draft: draftB } = await result(`${adminPrefix}/services/${serviceB.id}/assignments`, { themeVersionId: version.id, channel: 'web', reason }));
        assert.notEqual(draftA.id, draftB.id); assert.notEqual(assignmentA.id, assignmentB.id);
        const own = ok(await request(`${sellerPrefix}/assignments`, { actor: a }));
        assert(JSON.stringify(own).includes(assignmentA.id)); assert(!JSON.stringify(own).includes(assignmentB.id));
        ok(await write(`${sellerPrefix}/assignments/${assignmentA.id}/accept`, { expectedRevision: assignmentA.revision, reason }, viewer), 403);
        assert.equal((await pool.query('SELECT status FROM theme_assignments WHERE id=$1', [assignmentA.id])).rows[0].status, 'ASSIGNED');
        assignmentA = await result(`${sellerPrefix}/assignments/${assignmentA.id}/accept`, { expectedRevision: assignmentA.revision, reason }, a);
        assert.equal(assignmentA.status, 'ACCEPTED');
    });
    await gate('G09 idempotent save replay returns one immutable operation', async () => {
        saveKey = crypto.randomUUID(); saveBody = { expectedRevision: draftA.revision, overrides: overrides(), reason };
        saveOperation = ok(await write(`${sellerPrefix}/drafts/${draftA.id}`, saveBody, a, 'PUT', saveKey)); draftA = saveOperation.result;
        const replay = ok(await write(`${sellerPrefix}/drafts/${draftA.id}`, saveBody, a, 'PUT', saveKey));
        assert.deepEqual(replay, saveOperation);
        ok(await write(`${sellerPrefix}/drafts/${draftA.id}`, { ...saveBody, reason: 'Different canonical request' }, a, 'PUT', saveKey), 409);
    });
    await gate('G10 optimistic concurrency allows exactly one same-revision winner', async () => {
        const current = await getDraft(draftA.id);
        const responses = await Promise.all(['Concurrent A', 'Concurrent B'].map((title) => write(`${sellerPrefix}/drafts/${draftA.id}`, { expectedRevision: current.revision, overrides: overrides(title), reason }, a, 'PUT')));
        assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
        draftA = await getDraft(draftA.id); assert.equal(draftA.revision, current.revision + 1);
    });
    await gate('G11 strict revision and If-Match cannot bypass compare-and-swap', async () => {
        const current = await getDraft(draftA.id);
        for (const expectedRevision of [0, '1', 1.5]) ok(await write(`${sellerPrefix}/drafts/${draftA.id}`, { expectedRevision, overrides: overrides(), reason }, a, 'PUT'), 400);
        ok(await write(`${sellerPrefix}/drafts/${draftA.id}`, { expectedRevision: current.revision, overrides: overrides(), reason }, a, 'PUT', crypto.randomUUID(), { 'if-match': '"999999"' }), 409);
        ok(await write(`${sellerPrefix}/drafts/${draftA.id}`, { expectedRevision: current.revision - 1, overrides: overrides(), reason }, a, 'PUT'), 409);
    });
    await gate('G12 overrides cannot mutate source schema or inject arbitrary components', async () => {
        const current = await getDraft(draftA.id);
        for (const invalid of [{ ...overrides(), customCss: '*{display:none}' }, { ...overrides(), components: [{ componentId: 'unknown', props: { title: 'No' } }] }, { ...overrides(), tokens: { accent: 'url(https://external.invalid)' } }])
            ok(await write(`${sellerPrefix}/drafts/${draftA.id}`, { expectedRevision: current.revision, overrides: invalid, reason }, a, 'PUT'), 400);
    });
    await gate('G13 previews bind exact draft revision and authenticated artifact', async () => {
        draftA = await getDraft(draftA.id); draftB = await getDraft(draftB.id, b);
        previewA = await result(`${sellerPrefix}/drafts/${draftA.id}/previews`, { expectedRevision: draftA.revision, reason }, a);
        previewB = await result(`${sellerPrefix}/drafts/${draftB.id}/previews`, { expectedRevision: draftB.revision, reason }, b);
        assert.equal(previewA.draft_revision, draftA.revision); assert.equal(previewA.status, 'READY');
        assert.equal(previewA.digest, require('../services/themePlatformValidation').digest(previewA.artifact));
        assert(!Object.hasOwn(previewA, 'publicUrl')); ok(await request(`${sellerPrefix}/previews/${previewA.id}`, { actor: null }), 401);
    });
    await gate('G14 asset bytes are sniffed, bounded and quarantined', async () => {
        const bytes = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT1kAAAAASUVORK5CYII=';
        assetA = await result(`${sellerPrefix}/services/${serviceA.id}/assets`, { bytesBase64: bytes, reason }, a);
        assetB = await result(`${sellerPrefix}/services/${serviceB.id}/assets`, { bytesBase64: bytes, reason }, b);
        assert.equal(assetA.status, 'QUARANTINED'); assert.equal(assetA.detected_mime, 'image/png');
        assert.equal(Number(assetA.byte_size), Buffer.from(bytes, 'base64').length);
        assert(!Object.hasOwn(assetA, 'bytesBase64'));
        ok(await write(`${sellerPrefix}/services/${serviceA.id}/assets`, { bytesBase64: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'), reason }, a), 400);
        ok(await write(`${sellerPrefix}/services/${serviceA.id}/assets`, { bytesBase64: bytes, detectedMime: 'image/png', status: 'READY', reason }, a), 400);
        ok(await write(`${sellerPrefix}/services/${serviceA.id}/assets`, { bytesBase64: 'not base64', reason }, a), 400);
    });
    await gate('G15 quarantined and foreign asset references cannot enter draft', async () => {
        draftA = await getDraft(draftA.id);
        for (const id of [assetA.id, assetB.id]) {
            const response = await write(`${sellerPrefix}/drafts/${draftA.id}`, { expectedRevision: draftA.revision, overrides: { ...overrides(), assetIds: [id] }, reason }, a, 'PUT');
            ok(response, 404);
        }
    });
    await gate('G16 default seller publication never claims live deployment', async () => {
        draftA = await getDraft(draftA.id);
        publicationA = await result(`${sellerPrefix}/drafts/${draftA.id}/publications`, { expectedRevision: draftA.revision, reason }, a);
        publicationB = await result(`${sellerPrefix}/drafts/${draftB.id}/publications`, { expectedRevision: draftB.revision, reason }, b);
        assert.equal(publicationA.status, 'PUBLICATION_REQUESTED');
        assert.equal(publicationA.draft_revision, draftA.revision);
        assert.equal(publicationA.digest, require('../services/themePlatformValidation').digest(publicationA.artifact));
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM theme_deployments WHERE status NOT IN ('REQUESTED','BLOCKED')")).rows[0].n, 0);
    });
    await gate('G17 every scoped read rejects foreign tenant IDs without disclosure', async () => {
        const urls = [`assignments/${assignmentB.id}`, `services/${serviceB.id}/capabilities`, `services/${serviceB.id}/entitlements`, `drafts/${draftB.id}`, `previews/${previewB.id}`, `assets/${assetB.id}`, `publications/${publicationB.id}`];
        for (const url of urls) {
            const foreign = ok(await request(`${sellerPrefix}/${url}`, { actor: a }), 404);
            const absentUrl = url.replace(/[a-f0-9]{8}-[a-f0-9-]{27}/i, crypto.randomUUID());
            const absent = ok(await request(`${sellerPrefix}/${absentUrl}`, { actor: a }), 404);
            assert.deepEqual(foreign, absent, 'Foreign and nonexistent resources have identical public error body');
        }
        const foreignOperation = (await pool.query('SELECT id FROM theme_operations WHERE service_id=$1 ORDER BY created_at LIMIT 1', [serviceB.id])).rows[0].id;
        assert.deepEqual(ok(await request(`${sellerPrefix}/operations/${foreignOperation}`, { actor: a }), 404),
            ok(await request(`${sellerPrefix}/operations/${crypto.randomUUID()}`, { actor: a }), 404));
        ok(await request(`${adminPrefix}/services/${serviceB.id}/entitlements`, { actor: a }), 401);
    });
    await gate('G18 every scoped write rejects foreign tenant IDs', async () => {
        for (const [url, body, method] of [
            [`assignments/${assignmentB.id}/accept`, { expectedRevision: assignmentB.revision, reason }, 'POST'],
            [`drafts/${draftB.id}`, { expectedRevision: draftB.revision, overrides: overrides(), reason }, 'PUT'],
            [`drafts/${draftB.id}/previews`, { expectedRevision: draftB.revision, reason }, 'POST'],
            [`drafts/${draftB.id}/publications`, { expectedRevision: draftB.revision, reason }, 'POST'],
            [`publications/${publicationB.id}/rollback`, { reason }, 'POST'],
            [`services/${serviceB.id}/assets`, { bytesBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT1kAAAAASUVORK5CYII=', reason }, 'POST']
        ]) ok(await write(`${sellerPrefix}/${url}`, body, a, method), 404);
    });
    await gate('G19 all seller roles obey read, edit and explicit publish permissions', async () => {
        draftA = await getDraft(draftA.id);
        ok(await request(`${sellerPrefix}/drafts/${draftA.id}`, { actor: viewer }));
        ok(await write(`${sellerPrefix}/drafts/${draftA.id}`, { expectedRevision: draftA.revision, overrides: overrides(), reason }, viewer, 'PUT'), 403);
        for (const actor of [editor, sellerAdmin]) {
            draftA = await result(`${sellerPrefix}/drafts/${draftA.id}`, { expectedRevision: draftA.revision, overrides: overrides('Role checked'), reason }, actor, 'PUT');
            ok(await write(`${sellerPrefix}/drafts/${draftA.id}/publications`, { expectedRevision: draftA.revision, reason }, actor), 403);
        }
        await assert.rejects(pool.query('UPDATE theme_seller_roles SET publish_allowed=TRUE WHERE organization_id=$1 AND membership_id=$2', [storeA.org, viewer.membershipId]));
        await pool.query('UPDATE theme_seller_roles SET publish_allowed=TRUE WHERE organization_id=$1 AND membership_id=$2', [storeA.org, editor.membershipId]);
        ok(await write(`${sellerPrefix}/drafts/${draftA.id}/publications`, { expectedRevision: draftA.revision, reason }, viewer), 403);
        const published = await result(`${sellerPrefix}/drafts/${draftA.id}/publications`, { expectedRevision: draftA.revision, reason }, editor);
        assert.equal(published.status, 'PUBLICATION_REQUESTED');
    });
    await gate('G20 explicit deny defeats plan grant and revoked permission defeats retry', async () => {
        await entitle('theme.editor', 'DENY');
        ok(await write(`${sellerPrefix}/drafts/${draftA.id}/publications`, { expectedRevision: draftA.revision, reason }, a), 403);
        ok(await write(`${sellerPrefix}/drafts/${draftA.id}`, saveBody, a, 'PUT', saveKey), 403);
        ok(await request(`${sellerPrefix}/operations/${saveOperation.operationId}`, { actor: a }), 403);
        ok(await request(`${sellerPrefix}/drafts/${draftA.id}`, { actor: a }), 403);
        ok(await request(`${sellerPrefix}/publications/${publicationA.id}`, { actor: a }), 403);
        await entitle('theme.editor', 'ALLOW');
        await entitle('theme.publish', 'DENY');
        ok(await request(`${sellerPrefix}/publications/${publicationA.id}`, { actor: a }), 403);
        await entitle('theme.publish', 'ALLOW');
        await pool.query('UPDATE theme_seller_roles SET active=FALSE WHERE organization_id=$1 AND membership_id=$2', [storeA.org, editor.membershipId]);
        ok(await request(`${sellerPrefix}/drafts/${draftA.id}`, { actor: editor }), 403);
        await pool.query('UPDATE theme_seller_roles SET active=TRUE WHERE organization_id=$1 AND membership_id=$2', [storeA.org, editor.membershipId]);
    });
    await gate('G21 unknown feature and expired service fail closed', async () => {
        const service = await getService(serviceA.id);
        ok(await write(`${adminPrefix}/services/${serviceA.id}/entitlements/theme.unknown`, { expectedRevision: service.policy_revision, effect: 'ALLOW', quota: null, startsAt: start, expiresAt: null, reason }, admin, 'PUT'), 404);
        const unknown = await require('../services/themePlatformService').effective(pool, service, 'theme.unknown'); assert.equal(unknown.allowed, false);
        const expired = await result(`${adminPrefix}/services/${serviceA.id}`, { expectedRevision: service.revision, plan: service.plan, status: 'ACTIVE', startsAt: start, expiresAt: '2026-01-02T00:00:00.000Z', reason }, admin, 'PATCH');
        ok(await request(`${sellerPrefix}/drafts/${draftA.id}`, { actor: a }), 403);
        await result(`${adminPrefix}/services/${serviceA.id}`, { expectedRevision: expired.revision, plan: expired.plan, status: 'ACTIVE', startsAt: start, expiresAt: farFuture, reason }, admin, 'PATCH');
    });
    await gate('G22 service suspension revokes current and cached mutation authority', async () => {
        let current = await getService(serviceA.id);
        current = await result(`${adminPrefix}/services/${serviceA.id}`, { expectedRevision: current.revision, plan: current.plan, status: 'SUSPENDED', startsAt: start, expiresAt: farFuture, reason }, admin, 'PATCH');
        ok(await write(`${sellerPrefix}/drafts/${draftA.id}`, saveBody, a, 'PUT', saveKey), 403);
        await result(`${adminPrefix}/services/${serviceA.id}`, { expectedRevision: current.revision, plan: current.plan, status: 'ACTIVE', startsAt: start, expiresAt: farFuture, reason }, admin, 'PATCH');
    });
    await gate('G23 rollback request is durably blocked without verified live deployment', async () => {
        const response = ok(await write(`${sellerPrefix}/publications/${publicationA.id}/rollback`, { reason }, a));
        assert.equal(response.status, 'BLOCKED');
        const operation = ok(await request(`${sellerPrefix}/operations/${response.operationId}`, { actor: a }));
        assert.equal(operation.status, 'BLOCKED');
    });
    await gate('G24 concurrent identical mutation creates one operation and one domain revision', async () => {
        draftA = await getDraft(draftA.id); const revision = draftA.revision;
        const key = crypto.randomUUID(), body = { expectedRevision: revision, overrides: overrides('Concurrent identical'), reason };
        const responses = await Promise.all([1, 2].map(() => write(`${sellerPrefix}/drafts/${draftA.id}`, body, a, 'PUT', key)));
        responses.forEach((response) => ok(response));
        assert.deepEqual(responses[0].body, responses[1].body);
        assert.equal((await getDraft(draftA.id)).revision, revision + 1);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM theme_operations WHERE idempotency_key=$1', [key])).rows[0].n, 1);
    });
    await gate('G25 successful mutations atomically record audit, revision and outbox', async () => {
        const operations = await pool.query('SELECT id FROM theme_operations WHERE service_id=$1', [serviceA.id]); assert(operations.rows.length > 0);
        const outbox = await pool.query('SELECT operation_id,status,payload FROM theme_outbox WHERE service_id=$1', [serviceA.id]);
        assert(outbox.rows.length > 0); assert(outbox.rows.every((row) => row.status === 'PENDING'));
        const audit = await pool.query('SELECT * FROM theme_audit_events WHERE service_id=$1', [serviceA.id]); assert(audit.rows.length > 0);
        const history = await pool.query('SELECT * FROM theme_draft_revisions WHERE draft_id=$1 ORDER BY revision', [draftA.id]); assert(history.rows.length >= 3);
        assert(!JSON.stringify(audit.rows).includes('Concurrent identical'), 'Audit cannot include raw draft text');
        await assert.rejects(pool.query("UPDATE theme_draft_revisions SET overrides='{}'::jsonb WHERE draft_id=$1", [draftA.id]));
        await assert.rejects(pool.query('DELETE FROM theme_audit_events WHERE service_id=$1', [serviceA.id]));
    });
    await gate('G26 live admin binding/session revocation prevents cached authority', async () => {
        await pool.query('UPDATE theme_admin_roles SET active=FALSE WHERE user_id=$1', [themeAdmin.userId]);
        ok(await request(`${adminPrefix}/themes`, { actor: themeAdmin }), 403);
        await pool.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1', [support.sessionId]);
        ok(await request(`${adminPrefix}/themes`, { actor: support }), 401);
    });
    await gate('G27 live seller store scope and membership revision invalidate authority', async () => {
        await pool.query('UPDATE seller_membership_store_scopes SET revoked_at=NOW() WHERE organization_id=$1 AND membership_id=$2', [storeA.org, sellerAdmin.membershipId]);
        ok(await request(`${sellerPrefix}/drafts/${draftA.id}`, { actor: sellerAdmin }), 404);
        await pool.query('UPDATE seller_memberships SET membership_revision=membership_revision+1 WHERE id=$1', [viewer.membershipId]);
        ok(await request(`${sellerPrefix}/drafts/${draftA.id}`, { actor: viewer }), 401);
        await pool.query("UPDATE seller_sessions SET status='revoked',revoked_at=NOW() WHERE id=$1", [editor.sessionId]);
        ok(await request(`${sellerPrefix}/drafts/${draftA.id}`, { actor: editor }), 401);
    });
    await gate('G28 caller cannot inject identity or promote publication to live', async () => {
        draftA = await getDraft(draftA.id);
        for (const field of ['organizationId', 'storeId', 'role', 'status']) {
            ok(await write(`${sellerPrefix}/drafts/${draftA.id}`, { expectedRevision: draftA.revision, overrides: overrides(), reason, [field]: 'forged' }, a, 'PUT'), 400);
        }
        ok(await write(`${sellerPrefix}/publications/${publicationA.id}/promote`, { status: 'LIVE', reason }, a), 404);
    });
    await gate('G29 missing idempotency key and malformed reason reject before mutation', async () => {
        ok(await request(`${adminPrefix}/themes`, { method: 'POST', body: { slug: 'no-key', name: 'No', reason } }), 400);
        ok(await write(`${adminPrefix}/themes`, { slug: 'no-reason', name: 'No' }), 400);
        ok(await write(`${adminPrefix}/themes`, { slug: 'short-key', name: 'No', reason }, admin, 'POST', 'a'), 400);
    });
    await gate('G30 persisted API response and audit never contain credentials', async () => {
        const markers = ['demo-private-bearer-marker', 'demo-private-token-marker'];
        markers.forEach((marker) => sensitive.add(marker));
        const item = await result(`${adminPrefix}/themes`, { slug: 'credential-redaction', name: 'Redaction fixture', reason: `Bearer ${markers[0]} token=${markers[1]}` });
        const redactedReason = (await pool.query('SELECT reason FROM theme_audit_events WHERE target_id=$1', [item.id])).rows[0].reason;
        assert(redactedReason.includes('[REDACTED]'));
        for (const marker of markers) assert(!redactedReason.includes(marker));
        const rows = (await pool.query('SELECT result FROM theme_operations')).rows;
        const audit = (await pool.query('SELECT before_state,after_state,reason FROM theme_audit_events')).rows;
        const text = JSON.stringify({ rows, audit });
        for (const secret of sensitive) assert(!text.includes(secret));
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM theme_publications WHERE status NOT IN ('PUBLICATION_REQUESTED','BLOCKED')")).rows[0].n, 0);
    });
    await gate('G31 quota check is serialized for concurrent uploads', async () => {
        const bytes = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT1kAAAAASUVORK5CYII=';
        const used = Number((await pool.query("SELECT COALESCE(SUM(byte_size),0) AS n FROM theme_assets WHERE service_id=$1 AND status<>'REJECTED'", [serviceA.id])).rows[0].n);
        await entitle('theme.asset_bytes', 'ALLOW', used + Buffer.from(bytes, 'base64').length);
        const uploads = await Promise.all([1, 2].map(() => write(`${sellerPrefix}/services/${serviceA.id}/assets`, { bytesBase64: bytes, reason }, a)));
        assert.deepEqual(uploads.map((response) => response.status).sort(), [200, 403]);
        const total = Number((await pool.query("SELECT COALESCE(SUM(byte_size),0) AS n FROM theme_assets WHERE service_id=$1 AND status<>'REJECTED'", [serviceA.id])).rows[0].n);
        assert.equal(total, used + Buffer.from(bytes, 'base64').length);
        await entitle('theme.asset_bytes', 'ALLOW', 52428800);
    });
    await gate('G32 inbox logical event replay is durable, scoped and payload-bound', async () => {
        const service = require('../services/themePlatformService').createThemePlatformService(pool);
        const event = { serviceId: serviceA.id, source: 'stocky', eventId: crypto.randomUUID(), payload: { operationId: saveOperation.operationId, status: 'RECEIVED', digest: 'a'.repeat(64) } };
        const first = await service.receiveInbox(event); const replay = await service.receiveInbox(event); assert.equal(first.id, replay.id);
        await assert.rejects(service.receiveInbox({ ...event, payload: { ...event.payload, digest: 'b'.repeat(64) } }), (error) => error.statusCode === 409);
        await assert.rejects(service.receiveInbox({ ...event, serviceId: serviceB.id }), (error) => error.statusCode === 404);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM theme_inbox WHERE event_id=$1', [event.eventId])).rows[0].n, 1);
        assert.equal(first.receipt.deliveryVerified, false);
    });
    await gate('G33 database schema independently enforces cross-scope and immutable constraints', async () => {
        const check = require('./themePlatformSchemaExtraSmoke');
        const report = await check({ pool, fixtures: { admin, a, b, serviceA, serviceB, version, draftA, draftB, assignmentA, assignmentB, previewA, previewB, publicationA, publicationB, assetA, assetB, saveOperation } });
        assert(report.checks > 0); db.originalConsole.log(`Independent schema negative checks: ${report.checks}`);
    });
    await gate('G34 failed transactional mutation leaves no ledger, outbox, audit or partial draft', async () => {
        const snapshot = async () => ({
            draft: (await pool.query('SELECT revision,overrides FROM theme_drafts WHERE id=$1', [draftA.id])).rows,
            counts: (await pool.query(`SELECT (SELECT COUNT(*) FROM theme_operations) AS operations,
                (SELECT COUNT(*) FROM theme_outbox) AS outbox,(SELECT COUNT(*) FROM theme_audit_events) AS audit,
                (SELECT COUNT(*) FROM theme_draft_revisions) AS revisions`)).rows
        });
        const before = await snapshot();
        const current = await getDraft(draftA.id);
        const failed = await write(`${sellerPrefix}/drafts/${draftA.id}`, { expectedRevision: current.revision,
            overrides: { ...overrides(), assetIds: [assetB.id] }, reason }, a, 'PUT');
        ok(failed, 404); assert.deepEqual(await snapshot(), before);
        const missing = (await pool.query(`SELECT COUNT(*)::int AS n FROM theme_operations operation
            WHERE operation.service_id=$1 AND NOT EXISTS(SELECT 1 FROM theme_outbox event WHERE event.operation_id=operation.id)`, [serviceA.id])).rows[0].n;
        assert.equal(missing, 0, 'Every committed scoped operation has an atomic outbox event');
    });
    await gate('G35 policy changes invalidate old preview and expiration is enforced by database time', async () => {
        ok(await request(`${sellerPrefix}/previews/${previewA.id}`, { actor: a }), 410);
        const current = await getDraft(draftA.id);
        const key = crypto.randomUUID(), body = { expectedRevision: current.revision, reason };
        const operation = ok(await write(`${sellerPrefix}/drafts/${draftA.id}/previews`, body, a, 'POST', key));
        const preview = operation.result;
        ok(await request(`${sellerPrefix}/previews/${preview.id}`, { actor: a }));
        await pool.query("UPDATE theme_previews SET created_at=NOW()-INTERVAL '2 minutes',expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1", [preview.id]);
        ok(await request(`${sellerPrefix}/previews/${preview.id}`, { actor: a }), 410);
        ok(await write(`${sellerPrefix}/drafts/${draftA.id}/previews`, body, a, 'POST', key), 410);
        ok(await request(`${sellerPrefix}/operations/${operation.operationId}`, { actor: a }), 410);
    });
    await gate('G36 entitlement validity windows cannot invent grants beyond plan policy', async () => {
        await pool.query("INSERT INTO feature_catalog(code,kind,enabled) VALUES('theme.fixture_expiring','boolean',TRUE)");
        const effective = require('../services/themePlatformService').effective;
        let current = await getService(serviceA.id);
        assert.equal((await effective(pool, current, 'theme.fixture_expiring')).allowed, false);
        await entitle('theme.fixture_expiring', 'ALLOW', null, serviceA.id, '2026-01-02T00:00:00.000Z');
        assert.equal((await effective(pool, current, 'theme.fixture_expiring')).allowed, false, 'Expired grant absent from decision');
        await entitle('theme.fixture_expiring', 'ALLOW');
        assert.equal((await effective(pool, current, 'theme.fixture_expiring')).allowed, true);
        await pool.query("UPDATE seller_feature_entitlements SET starts_at=NOW()+INTERVAL '1 day' WHERE service_id=$1 AND feature_code='theme.fixture_expiring'", [serviceA.id]);
        assert.equal((await effective(pool, current, 'theme.fixture_expiring')).allowed, false, 'Future grant absent from decision');
        current = await getService(serviceA.id);
        current = await result(`${adminPrefix}/services/${serviceA.id}`, { expectedRevision: current.revision, plan: 'basic', status: 'ACTIVE', startsAt: start, expiresAt: farFuture, reason }, admin, 'PATCH');
        await entitle('theme.publish', 'ALLOW');
        current = await getService(serviceA.id);
        assert.equal((await effective(pool, current, 'theme.publish')).allowed, false, 'Plan DENY remains ceiling over per-service ALLOW');
        await result(`${adminPrefix}/services/${serviceA.id}`, { expectedRevision: current.revision, plan: 'pro', status: 'ACTIVE', startsAt: start, expiresAt: farFuture, reason }, admin, 'PATCH');
    });
    await gate('G37 assignment withdrawal closes draft, preview and replay access', async () => {
        const other = await result(`${adminPrefix}/services/${serviceB.id}/assignments`, { themeVersionId: version.id, channel: 'app', reason });
        const key = crypto.randomUUID(), body = { expectedRevision: other.draft.revision, overrides: overrides('Will be withdrawn'), reason };
        const saved = ok(await write(`${sellerPrefix}/drafts/${other.draft.id}`, body, b, 'PUT', key)).result;
        const preview = await result(`${sellerPrefix}/drafts/${saved.id}/previews`, { expectedRevision: saved.revision, reason }, b);
        await result(`${adminPrefix}/assignments/${other.assignment.id}/withdraw`, { expectedRevision: other.assignment.revision, reason });
        ok(await request(`${sellerPrefix}/drafts/${saved.id}`, { actor: b }), 409);
        ok(await request(`${sellerPrefix}/previews/${preview.id}`, { actor: b }), 409);
        ok(await write(`${sellerPrefix}/drafts/${saved.id}`, body, b, 'PUT', key), 409);
    });
    await gate('G38 independent real-session revocation race and owner fallback checks', async () => {
        const check = require('./themePlatformAuthIntegrationExtra');
        const report = await check({ pool, fixtures: { admin, a, b, editor, viewer, sellerAdmin, serviceA, serviceB, version, draftA, draftB,
            assignmentA, assignmentB, saveOperation, saveBody, saveKey }, request, write, ok, adminPrefix, sellerPrefix, reason });
        assert(report.checks > 0); db.originalConsole.log(`Independent real auth checks: ${report.checks}`);
    });
})().catch((error) => {
    const print = db?.originalConsole.error || console.error;
    print(`themePlatformPostgresSmoke FAIL: ${db ? db.redact(error.stack || error.message) : error.message}`);
    process.exitCode = 1;
}).finally(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    try { if (db) cleanupResult = await db.cleanup(); }
    catch (error) { console.error(`Theme disposable cleanup FAIL: ${error.message}`); process.exitCode = 1; }
    console.log(JSON.stringify({ suite: 'themePlatformPostgresSmoke', result: process.exitCode ? 'FAIL' : 'PASS', pass: gates.filter((row) => row.status === 'PASS').length,
        fail: gates.filter((row) => row.status === 'FAIL').length, skip: expectedGateCount - gates.length, gates, cleanup: cleanupResult,
        migrationCount: db?.migrations.length || 0, postgresVersion: db?.postgresVersion || null,
        scope: 'disposable PostgreSQL and real signed HTTP; no provider/browser/native/staging/production UAT' }));
});
