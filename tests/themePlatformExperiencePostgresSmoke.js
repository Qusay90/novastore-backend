'use strict';

// Actual PostgreSQL + existing live-session middleware + HTTP. No provider/browser claims.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const sharp = require('sharp');
const startDisposable = require('./helpers/themePlatformDisposableDb');
const { seedWave2 } = require('./helpers/themePlatformWave2Fixtures');
const historicalAssignment = require('./helpers/themeHistoricalAssignmentFixture');
const gates = [], expectedGateCount = 49;
let db, server, storageRoot, cleanupResult;
const gate = async (name, run) => {
    try { await run(); gates.push({ name, status: 'PASS' }); db.originalConsole.log(`PASS ${name}`); }
    catch (error) { gates.push({ name, status: 'FAIL' }); throw new Error(`${name}: ${error.stack || error.message}`); }
};
(async () => {
    db = await startDisposable();
    const { pool } = db;
    const fixture = await seedWave2(pool, db.sensitive);
    const { admin, themeAdmin, support, unbound, a, b, viewer, storeA, storeB, tokenService } = fixture;
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'novastore-wave2-http-assets-'));
    const { createAdminThemeRouter, createSellerThemeRouter } = require('../routes/themePlatformRoutes');
    const auth = require('../middlewares/sellerAuthMiddleware').createSellerAuthMiddleware({ verifyAccessToken: tokenService.verify });
    const tenant = require('../middlewares/sellerTenantContext').createSellerTenantContextMiddleware();
    const ap = '/api/admin/theme-platform', sp = '/api/seller/v1/theme-platform';
    const app = express(); app.use(express.json({ limit: '24mb' })); app.locals.sellerDatabase = pool;
    app.use(ap, createAdminThemeRouter({ database: pool, enabled: true, storageRoot }));
    app.use(sp, createSellerThemeRouter({ database: pool, enabled: true, auth, tenant, storageRoot }));
    app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND' }));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const request = async (url, { actor = admin, method = 'GET', body, key, headers = {} } = {}) => {
        const res = await fetch(`http://127.0.0.1:${server.address().port}${url}`, { method,
            headers: { ...(actor ? { authorization: `Bearer ${actor.token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(key ? { 'idempotency-key': key } : {}), ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: res.status, headers: res.headers, body: (res.headers.get('content-type') || '').includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
    };
    const ok = (res, expected = 200) => { assert.equal(res.status, expected, `HTTP ${expected}; got ${res.status} ${res.body?.code || 'none'}`); return res.body; };
    const write = (url, body, actor = admin, method = 'POST', key = crypto.randomUUID()) => request(url, { actor, method, body, key });
    const result = async (...args) => ok(await write(...args)).result;
    const reason = 'Owned disposable Wave 2 verification';
    const serviceRead = async id => ok(await request(`${ap}/services/${id}`));
    const policyRead = async (id, actor = a) => ok(await request(`${sp}/services/${id}/experience`, { actor }));
    const configure = async (serviceId, profileCode, overrides = {}) => result(`${ap}/services/${serviceId}/experience`, { expectedRevision: Number((await serviceRead(serviceId)).policy_revision), profileCode, overrides, reason }, admin, 'PUT');
    const packageRead = async slug => JSON.parse(await fs.readFile(path.join(__dirname, '../theme-platform/packages', `${slug}.json`), 'utf8'));
    const files = async (dir = storageRoot) => {
        const found = [];
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name); if (entry.isDirectory()) found.push(...await files(full)); else found.push(full);
        }
        return found.sort();
    };
    const count = async table => Number((await pool.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
    let serviceA, serviceB, nativePackage, imported, legacyImported, offerA, preparedA, draftA, assignmentA, assetA;
    let savedPolicy, savedBody, saveKey, saveResponse, prepareKey, prepareBody;
    const offerBody = async (serviceId, extra = {}) => ({ themeVersionId: imported.id, channel: 'web', commerceMode: 'SINGLE_STORE', profileCode: 'BASIC', overrides: {}, expectedRevision: Number((await serviceRead(serviceId)).policy_revision), reason, ...extra });
    const draftBody = async (changes, policyRevision = undefined) => {
        const draft = ok(await request(`${sp}/drafts/${draftA.id}`, { actor: a }));
        return { expectedRevision: Number(draft.revision), policyRevision: policyRevision ?? (await policyRead(serviceA.id)).policyRevision, overrides: { studio: changes }, reason };
    };
    await gate('W00 all 48 migrations apply and rerun without changes', async () => assert.equal(db.migrations.length, 48));
    await gate('W01 authenticated profiles expose defaults and supported capability catalog', async () => {
        const data = ok(await request(`${ap}/experience/profiles`));
        assert.deepEqual(data.items.map(item => item.code).sort(), ['ADVANCED', 'BASIC', 'CUSTOM', 'PRO']);
        for (const profile of data.items) assert.deepEqual(profile.capabilities, require('../services/themePlatformExperiencePolicy').defaultProfile(profile.code));
        assert(data.catalog.length >= 24); assert.equal(data.catalog.find(item => item.code === 'theme.custom_js').supported, false);
    });
    await gate('W02 anonymous, wrong principal, unbound role and seller Admin route denied', async () => {
        ok(await request(`${ap}/experience/profiles`, { actor: null }), 401);
        ok(await request(`${ap}/experience/profiles`, { actor: a }), 401);
        ok(await request(`${ap}/experience/profiles`, { actor: unbound }), 403);
        ok(await request(`${sp}/experience/profiles`, { actor: a }), 404);
        ok(await request(`${ap}/experience/profiles?role=super_admin`), 400);
    });
    await gate('W44 original workshop launch is fixed same-origin and requires current Admin authority', async () => {
        assert.deepEqual(ok(await request(`${ap}/workshop-launch`)), {
            url: '/studio-pro/?surface=admin', mode: 'AUTHORING_WITH_SCOPED_OFFERS', liveData: false, uiPreserved: true, sellerOffers: 'SERVER_SCOPED'
        });
        ok(await request(`${ap}/workshop-launch`, { actor: null }), 401);
        ok(await request(`${ap}/workshop-launch`, { actor: unbound }), 403);
        ok(await request(`${ap}/workshop-launch`, { actor: a }), 401);
        ok(await request(`${sp}/workshop-launch`, { actor: a }), 404);
        ok(await request(`${ap}/workshop-launch?url=https%3A%2F%2Foutside.invalid`), 400);
    });
    await gate('W03 custom profiles reject unsupported grants and preserve strict schema', async () => {
        for (const capabilities of [{ 'theme.custom_js': 'MANAGE' }, { 'theme.direct_publish': 'PUBLISH' }, { 'theme.banner': 'PUBLISH' }, { unknown: 'EDITABLE' }])
            ok(await write(`${ap}/experience/profiles`, { expectedRevision: 0, code: 'QA_BAD', name: 'No', capabilities, reason }, admin, 'PUT'), 400);
        const custom = await result(`${ap}/experience/profiles`, { expectedRevision: 0, code: 'QA_LIMITED', name: 'Local limited', capabilities: { 'theme.colors': 'EDITABLE', 'theme.save_draft': 'EDITABLE' }, reason }, admin, 'PUT');
        assert.equal(custom.revision, 1);
        ok(await write(`${ap}/experience/profiles`, { expectedRevision: 0, code: 'QA_LIMITED', name: 'Stale', capabilities: {}, reason }, admin, 'PUT'), 409);
        ok(await write(`${ap}/experience/profiles`, { expectedRevision: 0, code: 'QA_OTHER', name: 'No', capabilities: {}, reason }, themeAdmin, 'PUT'), 403);
    });
    await gate('W04 create isolated services and server-owned store inventory', async () => {
        for (const store of [storeA, storeB]) {
            const service = await result(`${ap}/services`, { storeId: store.id, plan: 'pro', status: 'ACTIVE', startsAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', reason });
            if (store === storeA) serviceA = service; else serviceB = service;
        }
        const stores = ok(await request(`${ap}/experience/stores`));
        assert(stores.some(store => store.service_id === serviceA.id)); assert(stores.some(store => store.service_id === serviceB.id));
    });
    await gate('W05 BASIC effective policy, foreign-service isolation and CAS', async () => {
        const configuration = await configure(serviceA.id, 'BASIC');
        const policy = await policyRead(serviceA.id);
        assert.equal(policy.profileCode, 'BASIC'); assert.equal(policy.capabilities['theme.header'].state, 'READ_ONLY');
        assert.equal(policy.capabilities['theme.colors'].state, 'EDITABLE'); assert.equal(policy.capabilities['theme.mobile_editor'].state, 'HIDDEN');
        ok(await request(`${sp}/services/${serviceA.id}/experience`, { actor: b }), 404);
        ok(await write(`${ap}/services/${serviceA.id}/experience`, { expectedRevision: configuration.policyRevision - 1, profileCode: 'PRO', overrides: {}, reason }, admin, 'PUT'), 409);
    });
    await gate('W06 real native package import is atomic and idempotent', async () => {
        nativePackage = await packageRead('nova-classic-studio-web'); const key = crypto.randomUUID();
        const first = ok(await write(`${ap}/experience/packages`, { package: nativePackage, reason }, admin, 'POST', key)); imported = first.result;
        assert.equal(imported.status, 'PUBLISHED'); assert.equal(imported.assetCount, 2);
        assert.deepEqual(ok(await write(`${ap}/experience/packages`, { package: nativePackage, reason }, admin, 'POST', key)), first);
        const row = (await pool.query('SELECT * FROM theme_version_packages WHERE theme_version_id=$1', [imported.id])).rows[0];
        assert.equal(row.manifest.schemaVersion, 2); assert.equal(row.package_digest, imported.package_digest);
        assert(!JSON.stringify(row.manifest).includes('bytesBase64'));
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM theme_package_assets WHERE theme_version_id=$1', [imported.id])).rows[0].n, 2);
    });
    await gate('W07 package catalog and actual bytes preserve private headers', async () => {
        const catalog = ok(await request(`${ap}/experience/catalog`)); const entry = catalog.find(item => item.id === imported.id);
        assert.equal(entry.document.schemaVersion, 2); assert.equal(entry.thumbnails[0].stale, true);
        const supportCatalog = ok(await request(`${ap}/experience/catalog`, { actor: support }));
        assert(supportCatalog.every(item => !Object.hasOwn(item, 'document')), 'Support retains accepted metadata-only boundary');
        const asset = nativePackage.assets[0];
        const response = await request(`${ap}/versions/${imported.id}/assets/${encodeURIComponent(asset.key)}`); const bytes = ok(response);
        assert(Buffer.isBuffer(bytes)); assert.equal((await sharp(bytes).metadata()).width, asset.width);
        assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert(response.headers.get('content-security-policy').includes("default-src 'none'"));
    });
    await gate('W08 package mutation, invalid renderer and Seller import denied without side effects', async () => {
        const before = await count('theme_versions'), disk = await files();
        const bad = structuredClone(nativePackage); bad.renderer.id = 'unsafe';
        ok(await write(`${ap}/experience/packages`, { package: bad, reason }), 400);
        ok(await write(`${ap}/experience/packages`, { package: nativePackage, reason }, support), 403);
        ok(await write(`${sp}/experience/packages`, { package: nativePackage, reason }, a), 404);
        assert.equal(await count('theme_versions'), before); assert.deepEqual(await files(), disk);
    });
    await gate('W09 offer validates package channel and policy revision', async () => {
        ok(await write(`${ap}/services/${serviceA.id}/offers`, await offerBody(serviceA.id, { channel: 'app' })), 400);
        const body = await offerBody(serviceA.id); body.expectedRevision -= 1;
        ok(await write(`${ap}/services/${serviceA.id}/offers`, body), 409);
        offerA = await result(`${ap}/services/${serviceA.id}/offers`, await offerBody(serviceA.id));
        assert.equal(offerA.status, 'CONFIGURED'); assert.equal(offerA.commerce_mode, 'SINGLE_STORE');
    });
    await gate('W10 Seller-view preview projects real limited role without mutable impersonation', async () => {
        const preview = ok(await request(`${ap}/offers/${offerA.id}/seller-preview`));
        assert.equal(preview.readOnly, true); assert.equal(preview.mode, 'seller-preview');
        assert.equal(preview.capabilities['theme.header'].state, 'HIDDEN'); assert.equal(preview.channels.web.document.schemaVersion, 2);
        assert.equal(preview.capabilities['theme.header'].rendererStatus,'UNSUPPORTED');
        assert.equal(preview.channels.web.assignmentId, null);
    });
    await gate('W11 unknown renderer cannot prepare or mutate; historical reviewed Classic supports regression only', async () => {
        const key = crypto.randomUUID(), body = { expectedRevision: offerA.revision, reason };
        prepareKey = key; prepareBody = body;
        const counts=await Promise.all(['theme_assignments','theme_drafts','theme_outbox','theme_operations'].map(count));
        assert.equal(ok(await write(`${ap}/offers/${offerA.id}/prepare`, body, admin, 'POST', key),409).code,'THEME_PRESENTATION_NOT_READY');
        assert.deepEqual(await Promise.all(['theme_assignments','theme_drafts','theme_outbox','theme_operations'].map(count)),counts);
        const legacy=await historicalAssignment(pool,{service:serviceA,versionId:imported.id,status:'ACCEPTED'});
        const legacyContext=ok(await request(`${sp}/services/${serviceA.id}/editor-context`,{actor:a}));
        assert.equal(legacyContext.channels.web.presentation,null);assert.equal(legacyContext.capabilities['theme.save_draft'].state,'HIDDEN');
        ok(await write(`${sp}/drafts/${legacy.draft.id}`,{expectedRevision:legacy.draft.revision,policyRevision:legacyContext.policyRevision,overrides:{studio:{theme:{accent:'#123456'}}},reason},a,'PUT'),403);
        assert.equal((await pool.query('SELECT revision FROM theme_drafts WHERE id=$1',[legacy.draft.id])).rows[0].revision,legacy.draft.revision);
        await result(`${ap}/assignments/${legacy.assignment.id}/withdraw`,{expectedRevision:legacy.assignment.revision,reason});
        legacyImported=imported;nativePackage=await packageRead('nova-classic-studio-web-v1_1');
        imported=await result(`${ap}/experience/packages`,{package:nativePackage,reason});
        preparedA=await historicalAssignment(pool,{service:serviceA,versionId:imported.id});
        draftA = preparedA.draft; assignmentA = preparedA.assignment;
        assert.deepEqual(draftA.overrides, { studio: {} });
        assert.equal(ok(await write(`${ap}/offers/${offerA.id}/prepare`, body, admin, 'POST', key),409).code,'THEME_PRESENTATION_NOT_READY');
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM theme_draft_revisions WHERE draft_id=$1', [draftA.id])).rows[0].n, 1);
    });
    await gate('W12 assignment acceptance and shared native context work over real Seller auth', async () => {
        assignmentA = await result(`${sp}/assignments/${assignmentA.id}/accept`, { expectedRevision: assignmentA.revision, reason }, a);
        const context = ok(await request(`${sp}/services/${serviceA.id}/editor-context`, { actor: a }));
        assert.equal(context.mode, 'seller'); assert.equal(context.channels.web.document.schemaVersion, 2); assert.equal(context.channels.web.draftId, draftA.id);
        ok(await request(`${sp}/services/${serviceA.id}/editor-context`, { actor: b }), 404);
    });
    await gate('W13 native allowed edit persists and history remains immutable', async () => {
        savedBody = await draftBody({ theme: { accent: '#ef6800' } }); savedPolicy = savedBody.policyRevision; saveKey = crypto.randomUUID();
        saveResponse = ok(await write(`${sp}/drafts/${draftA.id}`, savedBody, a, 'PUT', saveKey)); draftA = saveResponse.result;
        assert.equal(draftA.revision, 2);
        const history = ok(await request(`${sp}/services/${serviceA.id}/drafts/${draftA.id}/history`, { actor: a })); assert.equal(history.length, 2);
        await assert.rejects(pool.query("UPDATE theme_draft_revisions SET digest=repeat('0',64) WHERE draft_id=$1", [draftA.id]));
        assert.deepEqual(ok(await write(`${sp}/drafts/${draftA.id}`, savedBody, a, 'PUT', saveKey)), saveResponse);
    });
    await gate('W14 CAS stale draft and unsupported header edit are refused', async () => {
        ok(await write(`${sp}/drafts/${draftA.id}`, savedBody, a, 'PUT'), 409);
        ok(await write(`${sp}/drafts/${draftA.id}`, await draftBody({ chrome: { header: { tagline: 'forbidden' } } }), a, 'PUT'), 403);
        ok(await write(`${sp}/drafts/${draftA.id}`, await draftBody({ theme: { accent: '#ee5500' } }), viewer, 'PUT'), 403);
    });
    await gate('W15 revocation invalidates old policy and replay before accepting another write', async () => {
        await configure(serviceA.id, 'BASIC', { 'theme.colors': { effect: 'DENY' } });
        ok(await write(`${sp}/drafts/${draftA.id}`, await draftBody({ theme: { accent: '#008800' } }, savedPolicy), a, 'PUT'), 409);
        ok(await write(`${sp}/drafts/${draftA.id}`, await draftBody({ theme: { accent: '#008800' } }), a, 'PUT'), 403);
        const replay = await write(`${sp}/drafts/${draftA.id}`, savedBody, a, 'PUT', saveKey); assert([403, 409].includes(replay.status));
        assert.equal((await policyRead(serviceA.id)).capabilities['theme.colors'].state, 'HIDDEN');
    });
    await gate('W16 explicit grant changes future editing but unsupported code stays hidden', async () => {
        await configure(serviceA.id, 'BASIC', { 'theme.colors': { effect: 'ALLOW', state: 'EDITABLE' } });
        draftA = await result(`${sp}/drafts/${draftA.id}`, await draftBody({ theme: { accent: '#d95000' } }), a, 'PUT');
        const policy = await policyRead(serviceA.id); assert.equal(policy.capabilities['theme.colors'].reason, 'SERVICE_GRANT');
        assert.equal(policy.capabilities['theme.custom_js'].state, 'HIDDEN');
        ok(await write(`${ap}/services/${serviceA.id}/experience`, { expectedRevision: policy.policyRevision, profileCode: 'PRO', overrides: { 'theme.custom_js': { effect: 'ALLOW', state: 'MANAGE' } }, reason }, admin, 'PUT'), 400);
    });
    await gate('W17 profile mutation invalidates outstanding offer snapshot', async () => {
        const offer = await result(`${ap}/services/${serviceB.id}/offers`, await offerBody(serviceB.id, { profileCode: 'QA_LIMITED' }));
        const profile = (ok(await request(`${ap}/experience/profiles`))).items.find(item => item.code === 'QA_LIMITED');
        await result(`${ap}/experience/profiles`, { expectedRevision: profile.revision, code: profile.code, name: 'Updated local', capabilities: { 'theme.colors': 'READ_ONLY' }, reason }, admin, 'PUT');
        ok(await write(`${ap}/offers/${offer.id}/prepare`, { expectedRevision: offer.revision, reason }), 409);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM theme_assignments WHERE service_id=$1', [serviceB.id])).rows[0].n, 0);
    });
    await gate('W18 BASIC asset write is denied and PRO enables durable bytes', async () => {
        const bytes = await sharp({ create: { width: 28, height: 19, channels: 4, background: '#f57920' } }).png().toBuffer();
        const body = { bytesBase64: bytes.toString('base64'), reason };
        ok(await write(`${sp}/services/${serviceA.id}/stored-assets`, body, a), 403);
        await configure(serviceA.id, 'PRO');
        assetA = await result(`${sp}/services/${serviceA.id}/stored-assets`, body, a);
        assert.equal(assetA.status, 'READY'); assert.equal(assetA.storage_backend, 'local-v1'); assert.equal(assetA.width, 28); assert.equal(assetA.height, 19);
        assert.equal(assetA.original_digest, crypto.createHash('sha256').update(bytes).digest('hex'));
    });
    await gate('W19 actual asset bytes are owner-scoped and hash-verified', async () => {
        const read = await request(`${sp}/assets/${assetA.id}/content`, { actor: a }); const bytes = ok(read);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), assetA.digest);
        ok(await request(`${sp}/assets/${assetA.id}/content`, { actor: b }), 404);
        ok(await request(`${sp}/assets/${assetA.id}/content`, { actor: null }), 401);
    });
    await gate('W20 packaged artwork requires current owned assignment', async () => {
        const suffix = `/versions/${imported.id}/assets/${encodeURIComponent(nativePackage.assets[0].key)}`;
        assert(Buffer.isBuffer(ok(await request(`${sp}/services/${serviceA.id}${suffix}`, { actor: a }))));
        ok(await request(`${sp}/services/${serviceA.id}${suffix}`, { actor: b }), 404);
        ok(await request(`${sp}/services/${serviceB.id}${suffix}`, { actor: b }), 404);
    });
    await gate('W21 invalid raster body cannot leave database rows or filesystem files', async () => {
        const before = await count('theme_assets'), disk = await files();
        ok(await write(`${sp}/services/${serviceA.id}/stored-assets`, { bytesBase64: Buffer.from('<svg onload="bad()"/>').toString('base64'), reason }, a), 400);
        assert.equal(await count('theme_assets'), before); assert.deepEqual(await files(), disk);
    });
    await gate('W22 native asset overrides persist and foreign asset reuse fails', async () => {
        const block = structuredClone(nativePackage.document.studio.blocks[0]); block.image = `asset:${assetA.id}`;
        const blocks=nativePackage.document.studio.blocks.map((row,index)=>index===0?block:row);
        draftA = await result(`${sp}/drafts/${draftA.id}`, await draftBody({ blocks }), a, 'PUT');
        const context = ok(await request(`${sp}/services/${serviceA.id}/editor-context`, { actor: a })); assert.equal(context.channels.web.document.studio.blocks[0].image, `asset:${assetA.id}`);
        const second = await result(`${ap}/services/${serviceB.id}/offers`, await offerBody(serviceB.id, { profileCode: 'PRO' }));
        const prepared = await result(`${ap}/offers/${second.id}/prepare`,{expectedRevision:second.revision,reason});
        assert.equal(prepared.assignment.theme_version_id,imported.id);assert.equal(prepared.deliveryVerified,false);
        await result(`${sp}/assignments/${prepared.assignment.id}/accept`, { expectedRevision: prepared.assignment.revision, reason }, b);
        const bp = await policyRead(serviceB.id, b);
        ok(await write(`${sp}/drafts/${prepared.draft.id}`, { expectedRevision: prepared.draft.revision, policyRevision: bp.policyRevision, overrides: { studio: { blocks } }, reason }, b, 'PUT'), 404);
    });
    await gate('W23 profile saves advance dependent policy revisions', async () => {
        const before = await serviceRead(serviceA.id), profile = (ok(await request(`${ap}/experience/profiles`))).items.find(item => item.code === 'PRO');
        await result(`${ap}/experience/profiles`, { expectedRevision: profile.revision, code: 'PRO', name: profile.name, capabilities: profile.capabilities, reason }, admin, 'PUT');
        assert.equal(Number((await serviceRead(serviceA.id)).policy_revision), Number(before.policy_revision) + 1);
    });
    await gate('W24 outbox failure rolls back policy, audit and operation atomically', async () => {
        const previous = await serviceRead(serviceA.id), counts = await Promise.all(['theme_operations', 'theme_audit_events', 'theme_outbox'].map(count));
        await pool.query("CREATE FUNCTION wave2_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='theme.configureExperience' THEN RAISE EXCEPTION 'owned fault' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$");
        await pool.query('CREATE TRIGGER wave2_fault BEFORE INSERT ON theme_outbox FOR EACH ROW EXECUTE FUNCTION wave2_reject_event()');
        try {
            const response = await write(`${ap}/services/${serviceA.id}/experience`, { expectedRevision: previous.policy_revision, profileCode: 'BASIC', overrides: {}, reason }, admin, 'PUT'); assert([409, 503].includes(response.status));
            assert.equal((await serviceRead(serviceA.id)).policy_revision, previous.policy_revision);
            assert.deepEqual(await Promise.all(['theme_operations', 'theme_audit_events', 'theme_outbox'].map(count)), counts);
        } finally { await pool.query('DROP TRIGGER wave2_fault ON theme_outbox'); await pool.query('DROP FUNCTION wave2_reject_event()'); }
    });
    await gate('W25 asset transaction failure removes real bytes and leaves no partial row', async () => {
        const disk = await files(), before = await count('theme_assets');
        await pool.query("CREATE FUNCTION wave2_reject_asset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='theme.storeAsset' THEN RAISE EXCEPTION 'owned fault' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$");
        await pool.query('CREATE TRIGGER wave2_asset_fault BEFORE INSERT ON theme_outbox FOR EACH ROW EXECUTE FUNCTION wave2_reject_asset()');
        try {
            const bytes = await sharp({ create: { width: 7, height: 11, channels: 4, background: '#aadd00' } }).png().toBuffer();
            const response = await write(`${sp}/services/${serviceA.id}/stored-assets`, { bytesBase64: bytes.toString('base64'), reason }, a); assert([409, 503].includes(response.status));
            assert.equal(await count('theme_assets'), before); assert.deepEqual(await files(), disk);
        } finally { await pool.query('DROP TRIGGER wave2_asset_fault ON theme_outbox'); await pool.query('DROP FUNCTION wave2_reject_asset()'); }
    });
    await gate('W26 global package audit failure rolls back all package rows and bytes', async () => {
        const disk = await files(), counts = await Promise.all(['themes', 'theme_versions', 'theme_version_packages', 'theme_package_assets', 'theme_operations'].map(count));
        await pool.query("CREATE FUNCTION wave2_reject_package() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='theme.importPackage' THEN RAISE EXCEPTION 'owned fault' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$");
        await pool.query('CREATE TRIGGER wave2_package_fault BEFORE INSERT ON theme_audit_events FOR EACH ROW EXECUTE FUNCTION wave2_reject_package()');
        try {
            const response = await write(`${ap}/experience/packages`, { package: await packageRead('nova-pocket-studio-app'), reason }); assert([409, 503].includes(response.status));
            assert.deepEqual(await Promise.all(['themes', 'theme_versions', 'theme_version_packages', 'theme_package_assets', 'theme_operations'].map(count)), counts);
            assert.deepEqual(await files(), disk);
        } finally { await pool.query('DROP TRIGGER wave2_package_fault ON theme_audit_events'); await pool.query('DROP FUNCTION wave2_reject_package()'); }
    });
    await gate('W27 current session revocation closes context and asset access', async () => {
        await pool.query("UPDATE seller_sessions SET status='revoked',revoked_at=NOW() WHERE id=$1", [b.sessionId]);
        ok(await request(`${sp}/services/${serviceB.id}/editor-context`, { actor: b }), 401);
        ok(await request(`${sp}/assets/${assetA.id}/content`, { actor: b }), 401);
    });
    await gate('W28 service state and role remain ceilings above profile grant', async () => {
        const service = await serviceRead(serviceA.id);
        await result(`${ap}/services/${serviceA.id}`, { expectedRevision: service.revision, plan: 'pro', status: 'SUSPENDED', startsAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', reason }, admin, 'PATCH');
        ok(await request(`${sp}/services/${serviceA.id}/editor-context`, { actor: a }), 403);
        ok(await request(`${sp}/assets/${assetA.id}/content`, { actor: a }), 403);
        const suspended = await serviceRead(serviceA.id);
        await result(`${ap}/services/${serviceA.id}`, { expectedRevision: suspended.revision, plan: 'pro', status: 'ACTIVE', startsAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', reason }, admin, 'PATCH');
    });
    await gate('W29 all successful scoped Experience operations have one matching outbox and audit', async () => {
        const operations = (await pool.query("SELECT * FROM theme_operations WHERE type IN ('configureExperience','createOffer','prepareOffer','storeAsset')")).rows;
        assert(operations.length >= 8);
        for (const operation of operations) {
            assert.equal(operation.status, 'COMPLETED');
            const events = (await pool.query('SELECT * FROM theme_outbox WHERE operation_id=$1', [operation.id])).rows;
            assert.equal(events.length, 1); assert.equal(events[0].service_id, operation.service_id);
            const audit = (await pool.query('SELECT * FROM theme_audit_events WHERE correlation_id=$1', [operation.correlation_id])).rows;
            assert.equal(audit.length, 1); assert.equal(audit[0].action, `theme.${operation.type}`);
        }
    });
    await gate('W30 coarse billing plan DENY remains above explicit profile ALLOW', async () => {
        const current = await serviceRead(serviceA.id);
        await result(`${ap}/services/${serviceA.id}`, { expectedRevision: current.revision, plan: 'basic', status: 'ACTIVE', startsAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', reason }, admin, 'PATCH');
        await configure(serviceA.id, 'PRO', { 'theme.header': { effect: 'ALLOW', state: 'MANAGE' }, 'theme.publish': { effect: 'ALLOW', state: 'PUBLISH' } });
        const policy = await policyRead(serviceA.id);
        assert.equal(policy.capabilities['theme.header'].state, 'HIDDEN'); assert.equal(policy.capabilities['theme.publish'].state, 'HIDDEN');
        ok(await write(`${sp}/drafts/${draftA.id}`, await draftBody({ chrome: { header: { tagline: 'denied by plan' } } }), a, 'PUT'), 403);
        const basic = await serviceRead(serviceA.id);
        await result(`${ap}/services/${serviceA.id}`, { expectedRevision: basic.revision, plan: 'pro', status: 'ACTIVE', startsAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', reason }, admin, 'PATCH');
    });
    await gate('W31 legacy metadata registration cannot bypass hidden asset capability', async () => {
        await configure(serviceA.id, 'BASIC');
        const bytes = await sharp({ create: { width: 4, height: 4, channels: 4, background: '#000000' } }).png().toBuffer();
        const before = await count('theme_assets');
        ok(await write(`${sp}/services/${serviceA.id}/assets`, { bytesBase64: bytes.toString('base64'), reason }, a), 403);
        assert.equal(await count('theme_assets'), before);
    });
    await gate('W32 current draft remains readable when editing becomes READ_ONLY', async () => {
        await configure(serviceA.id, 'PRO', { 'theme.colors': { effect: 'ALLOW', state: 'READ_ONLY' } });
        const context = ok(await request(`${sp}/services/${serviceA.id}/editor-context`, { actor: a }));
        assert.equal(context.capabilities['theme.colors'].state, 'READ_ONLY'); assert.equal(context.channels.web.draftId, draftA.id);
        ok(await write(`${sp}/drafts/${draftA.id}`, await draftBody({ theme: { accent: '#119944' } }), a, 'PUT'), 403);
    });
    await gate('W38 new block CTA cannot bypass READ_ONLY navigation capability', async () => {
        await configure(serviceA.id, 'PRO', { 'theme.navigation': { effect: 'ALLOW', state: 'READ_ONLY' } });
        const context = ok(await request(`${sp}/services/${serviceA.id}/editor-context`, { actor: a }));
        const blocks = structuredClone(context.channels.web.document.studio.blocks);
        blocks.push({ ...structuredClone(blocks[0]), id: 'added-cart-hero', target: 'cart', buttonText: 'Sepete git' });
        ok(await write(`${sp}/drafts/${draftA.id}`, await draftBody({ blocks }), a, 'PUT'), 403);
        await configure(serviceA.id, 'PRO');
        const current=ok(await request(`${sp}/drafts/${draftA.id}`,{actor:a}));
        assert.equal(ok(await write(`${sp}/drafts/${draftA.id}`, await draftBody({ blocks }), a, 'PUT'),400).code,'THEME_PRESENTATION_EDIT_UNSUPPORTED');
        assert.deepEqual(ok(await request(`${sp}/drafts/${draftA.id}`,{actor:a})),current);
    });
    await gate('W40 reviewed block type replacement cannot bypass revoked original capability', async () => {
        await configure(serviceA.id, 'PRO', {
            'theme.banner': { effect: 'ALLOW', state: 'READ_ONLY' },
            'theme.text': { effect: 'ALLOW', state: 'EDITABLE' }
        });
        const context = ok(await request(`${sp}/services/${serviceA.id}/editor-context`, { actor: a }));
        const blocks = structuredClone(context.channels.web.document.studio.blocks);
        const added = blocks.find(block => block.id === 'classic-hero');
        assert.equal(added.type, 'hero');
        assert(context.channels.web.base.studio.blocks.some(block => block.id === added.id), 'Reviewed immutable block identity is retained');
        added.type = 'text';
        const before = ok(await request(`${sp}/drafts/${draftA.id}`, { actor: a }));
        const rowsBefore = await count('theme_draft_revisions');
        assert.equal(ok(await write(`${sp}/drafts/${draftA.id}`, await draftBody({ blocks }), a, 'PUT'),400).code,'THEME_IMMUTABLE_COMPONENT_TYPE');
        const after = ok(await request(`${sp}/drafts/${draftA.id}`, { actor: a }));
        assert.equal(after.revision, before.revision); assert.deepEqual(after.overrides, before.overrides);
        assert.equal(await count('theme_draft_revisions'), rowsBefore);
        await configure(serviceA.id, 'PRO');
    });
    await gate('W41 advanced blocks cannot hide READ_ONLY header, footer or navigation', async () => {
        await configure(serviceA.id, 'PRO', {
            'theme.advanced_blocks': { effect: 'ALLOW', state: 'EDITABLE' },
            'theme.header': { effect: 'ALLOW', state: 'READ_ONLY' },
            'theme.footer': { effect: 'ALLOW', state: 'READ_ONLY' },
            'theme.navigation': { effect: 'ALLOW', state: 'READ_ONLY' }
        });
        const context = ok(await request(`${sp}/services/${serviceA.id}/editor-context`, { actor: a }));
        const before = ok(await request(`${sp}/drafts/${draftA.id}`, { actor: a }));
        const rowsBefore = await count('theme_draft_revisions');
        for (const key of ['header', 'footer', 'navigation']) {
            const design = structuredClone(context.channels.web.document.studio.design);
            design[key] = !design[key];
            const changes = { ...structuredClone(before.overrides.studio), design };
            ok(await write(`${sp}/drafts/${draftA.id}`, await draftBody(changes), a, 'PUT'), 403);
        }
        const after = ok(await request(`${sp}/drafts/${draftA.id}`, { actor: a }));
        assert.equal(after.revision, before.revision); assert.deepEqual(after.overrides, before.overrides);
        assert.equal(await count('theme_draft_revisions'), rowsBefore);
        await configure(serviceA.id, 'PRO');
    });
    await require('./themePlatformCampaignIntegrationExtra')({pool,gate,fixture,serviceA,serviceB,draftA,request,write,result,ok,configure,ap,sp,reason});
    await gate('W33 withdrawn assignment prevents prepare replay and old draft replay', async () => {
        const current = (await pool.query('SELECT * FROM theme_assignments WHERE id=$1', [assignmentA.id])).rows[0];
        await result(`${ap}/assignments/${assignmentA.id}/withdraw`, { expectedRevision: current.revision, reason });
        ok(await write(`${ap}/offers/${offerA.id}/prepare`, prepareBody, admin, 'POST', prepareKey), 409);
        ok(await write(`${sp}/drafts/${draftA.id}`, savedBody, a, 'PUT', saveKey), 409);
    });
    await gate('W34 actual service quota rejects new bytes and cleans prepared storage', async () => {
        const current = await serviceRead(serviceA.id);
        await result(`${ap}/services/${serviceA.id}/entitlements/theme.asset_bytes`, {
            expectedRevision: current.policy_revision, effect: 'ALLOW', quota: 1,
            startsAt: '2026-01-01T00:00:00Z', expiresAt: null, reason
        }, admin, 'PUT');
        const disk = await files(), before = await count('theme_assets');
        const bytes = await sharp({ create: { width: 5, height: 5, channels: 4, background: '#115599' } }).png().toBuffer();
        const response = await write(`${sp}/services/${serviceA.id}/stored-assets`, { bytesBase64: bytes.toString('base64'), reason }, a);
        ok(response, 403); assert.equal(response.body.code, 'THEME_ASSET_QUOTA_EXCEEDED');
        assert.equal(await count('theme_assets'), before); assert.deepEqual(await files(), disk);
    });
    await gate('W35 restricted theme Admin cannot grant profiles through offer workflow', async () => {
        const body = await offerBody(serviceA.id, { profileCode: 'PRO', overrides: { 'theme.header': { effect: 'ALLOW', state: 'MANAGE' } } });
        const previous = await serviceRead(serviceA.id);
        ok(await write(`${ap}/services/${serviceA.id}/offers`, body, themeAdmin), 403);
        const offer = await result(`${ap}/services/${serviceA.id}/offers`, body);
        ok(await write(`${ap}/offers/${offer.id}/prepare`, { expectedRevision: offer.revision, reason }, themeAdmin), 403);
        assert.equal((await serviceRead(serviceA.id)).policy_revision, previous.policy_revision);
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM theme_assignments WHERE service_id=$1 AND status<>'WITHDRAWN'", [serviceA.id])).rows[0].n, 0);
    });
    await gate('W36 foundation assignment route rejects unaccepted app channel before side effects', async () => {
        assert.equal(ok(await write(`${ap}/services/${serviceA.id}/assignments`, { themeVersionId: imported.id, channel: 'app', reason }, themeAdmin),400).code,'THEME_PRESENTATION_UNSUPPORTED');
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM theme_assignments WHERE service_id=$1 AND channel='app'", [serviceA.id])).rows[0].n, 0);
    });
    await gate('W37 genuinely READY preparation still rechecks disabled package feature before assignment', async () => {
        const store = await fixture.makeStore('wave2-stale-feature');
        const service = await result(`${ap}/services`, { storeId: store.id, plan: 'pro', status: 'ACTIVE', startsAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', reason });
        const offer = await result(`${ap}/services/${service.id}/offers`, await offerBody(service.id));
        await pool.query("UPDATE feature_catalog SET enabled=FALSE WHERE code='theme.editor'");
        try {
            assert.equal(ok(await write(`${ap}/offers/${offer.id}/prepare`, { expectedRevision: offer.revision, reason }),403).code,'THEME_FEATURE_DENIED');
            ok(await write(`${ap}/services/${service.id}/offers`,await offerBody(service.id)),403);
            assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM theme_assignments WHERE service_id=$1', [service.id])).rows[0].n, 0);
        } finally { await pool.query("UPDATE feature_catalog SET enabled=TRUE WHERE code='theme.editor'"); }
    });
    await gate('W39 policy audit records actual before and after decisions without editor content', async () => {
        const profileWrites = (await pool.query("SELECT before_state,after_state FROM theme_audit_events WHERE action='theme.saveProfile' AND target_id='QA_LIMITED' ORDER BY created_at,id")).rows;
        assert.equal(profileWrites.length, 2); assert.equal(profileWrites[0].before_state, null);
        assert.equal(profileWrites[0].after_state.editor_policy.capabilities['theme.colors'], 'EDITABLE');
        assert.equal(profileWrites[1].before_state.editor_policy.capabilities['theme.colors'], 'EDITABLE');
        assert.equal(profileWrites[1].after_state.editor_policy.capabilities['theme.colors'], 'READ_ONLY');
        assert.equal(profileWrites[1].before_state.revision, 1); assert.equal(profileWrites[1].after_state.revision, 2);
        const configurationWrites = (await pool.query("SELECT before_state,after_state FROM theme_audit_events WHERE action='theme.configureExperience' AND service_id=$1 ORDER BY created_at,id", [serviceA.id])).rows;
        assert.equal(configurationWrites[0].before_state, null, 'No fabricated persisted BASIC configuration');
        const revoked = configurationWrites.find(row => row.after_state.editor_policy.overrides['theme.colors']?.effect === 'DENY');
        assert.deepEqual(revoked.before_state.editor_policy.overrides, {});
        assert.equal(revoked.before_state.profile_code, 'BASIC');
        assert.equal(revoked.after_state.editor_policy.overrides['theme.colors'].effect, 'DENY');
        assert.equal(revoked.after_state.policy_revision, revoked.before_state.policy_revision + 1);
        const before = await serviceRead(serviceA.id);
        // The legacy package has no reviewed presentation; genuine Classic
        // readiness cannot authorize this separate unknown-renderer offer.
        const offer = await result(`${ap}/services/${serviceA.id}/offers`, await offerBody(serviceA.id, { themeVersionId:legacyImported.id, overrides: { 'theme.colors': { effect: 'DENY' } } }));
        const ledgerBefore=await Promise.all(['theme_operations','theme_audit_events','theme_outbox'].map(count));
        assert.equal(ok(await write(`${ap}/offers/${offer.id}/prepare`, { expectedRevision: offer.revision, reason }),409).code,'THEME_PRESENTATION_NOT_READY');
        assert.deepEqual(await Promise.all(['theme_operations','theme_audit_events','theme_outbox'].map(count)),ledgerBefore);
        const configured=ok(await write(`${ap}/services/${serviceA.id}/experience`,{expectedRevision:Number(before.policy_revision),profileCode:'BASIC',overrides:{'theme.colors':{effect:'DENY'}},reason},admin,'PUT'));
        const audit = (await pool.query("SELECT before_state,after_state FROM theme_audit_events WHERE action='theme.configureExperience' AND correlation_id=(SELECT correlation_id FROM theme_operations WHERE id=$1)", [configured.operationId])).rows[0];
        assert.equal(audit.before_state.profile_code, 'PRO'); assert.deepEqual(audit.before_state.editor_policy.overrides, {});
        assert.equal(audit.before_state.policy_revision, Number(before.policy_revision));
        assert.equal(audit.after_state.profile_code, 'BASIC');
        assert.equal(audit.after_state.editor_policy.overrides['theme.colors'].effect, 'DENY');
        assert.equal(audit.after_state.policy_revision, audit.before_state.policy_revision + 1);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM theme_outbox WHERE operation_id=$1', [configured.operationId])).rows[0].n, 1);
        const all = (await pool.query('SELECT before_state,after_state FROM theme_audit_events')).rows;
        for (const row of all) for (const state of [row.before_state, row.after_state].filter(Boolean)) {
            for (const field of ['overrides', 'capabilities', 'document', 'bytesBase64', 'name', 'draft', 'password', 'token'])
                assert(!Object.hasOwn(state, field), `No unprojected ${field} in audit`);
            if (state.editor_policy) assert(Object.keys(state.editor_policy).every(key => ['capabilities', 'overrides', 'profile_revision'].includes(key)));
        }
        const countBefore = await count('theme_audit_events');
        await assert.rejects(require('../services/themePlatformService').transaction(pool, client => require('../services/themePlatformService').appendAudit(client, {
            actor: { actorId: `admin:${admin.userId}` }, action: 'theme.saveProfile', target: { type: 'theme_profile', id: 'QA_INVALID' },
            after: { editor_policy: { capabilities: { 'theme.colors': 'SECRET_EDITOR_TEXT' } } }, correlationId: crypto.randomUUID(), reason
        })), error => error.code === 'THEME_INVALID_CHOICE');
        assert.equal(await count('theme_audit_events'), countBefore);
    });
    await require('./themePlatformPresentationIntegrationExtra')({pool,gate,serviceA,imported:legacyImported,reviewedImported:imported,a,request,write,result,ok,serviceRead,configure,ap,sp,reason});
})().catch(error => {
    (db?.originalConsole.error || console.error)(`themePlatformExperiencePostgresSmoke FAIL: ${db ? db.redact(error.stack || error.message) : error.message}`); process.exitCode = 1;
}).finally(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
        if (storageRoot) { assert.equal(path.dirname(storageRoot), path.resolve(os.tmpdir())); assert(path.basename(storageRoot).startsWith('novastore-wave2-http-assets-')); await fs.rm(storageRoot, { recursive: true, force: true }); }
        if (db) cleanupResult = await db.cleanup();
    } catch (error) { console.error(`Wave 2 disposable cleanup FAIL: ${error.message}`); process.exitCode = 1; }
    console.log(JSON.stringify({ suite: 'themePlatformExperiencePostgresSmoke', result: process.exitCode ? 'FAIL' : 'PASS', pass: gates.filter(gate => gate.status === 'PASS').length,
        fail: gates.filter(gate => gate.status === 'FAIL').length, skip: expectedGateCount - gates.length, gates, cleanup: cleanupResult, migrationCount: db?.migrations.length || 0,
        postgresVersion: db?.postgresVersion || null, scope: 'actual disposable PostgreSQL, real signed sessions, HTTP and disk; no provider/browser/native/staging/production UAT' }));
});
