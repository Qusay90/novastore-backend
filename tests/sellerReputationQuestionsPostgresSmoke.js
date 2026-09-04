'use strict';

// A complete HTTP/SQL proof against a fresh, uniquely owned PostgreSQL container.
// Credentials are generated in memory; the existing local demo is never opened.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { format } = require('node:util');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const express = require('express');

const suffix = crypto.randomBytes(8).toString('hex');
const containerName = `novastore-r10-questions-${suffix}`;
const databaseName = `novastore_pc1_seller_questions_${suffix}_test`;
const password = crypto.randomBytes(32).toString('base64url');
const jwtSecret = crypto.randomBytes(48).toString('base64url');
const sellerSecret = crypto.randomBytes(48).toString('base64url');
const sensitive = new Set([password, jwtSecret, sellerSecret]);
const logs = [];
const originals = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map((key) => [key, console[key]]));
for (const key of Object.keys(originals)) console[key] = (...args) => logs.push(format(...args));
const clean = (text) => {
    let result = String(text);
    for (const value of sensitive) if (value) result = result.split(value).join('[REDACTED]');
    return result;
};
const docker = (args, options = {}) => {
    const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 60000, ...options });
    if (result.status !== 0) throw new Error(`Disposable PostgreSQL command failed: ${clean(result.stderr || result.error?.code || '')}`);
    return result.stdout.trim();
};
const rememberTokens = (body) => {
    for (const key of ['token', 'access_token', 'refresh_token', 'refreshToken']) {
        if (typeof body?.[key] === 'string') sensitive.add(body[key]);
    }
};
let pool;
let server;
let created = false;
let checks = 0;
const okStatus = (response, status, label) => {
    assert.equal(response.status, status, `${label}: status ${response.status}, safe code ${response.body?.code || 'none'}`);
    checks += 1;
    return response.body;
};
const errorCode = (response, status, code, label) => {
    okStatus(response, status, label);
    assert.equal(response.body.code, code, `${label}: error code`);
};
const dto = (item) => {
    for (const key of ['item_id', 'type', 'product_id', 'product_name', 'store_id', 'store_name', 'question', 'answer', 'status', 'revision', 'created_at', 'answered_at', 'can_reply']) {
        assert(Object.hasOwn(item, key), `Required Seller DTO field ${key}`);
    }
    for (const key of Object.keys(item)) {
        assert(!/(?:email|phone|address|user_id|customer_id|identity|document|token|session|password)/iu.test(key), `Private Seller DTO field ${key}`);
    }
    assert.equal(item.type, 'product_question');
    assert(['unanswered', 'answered'].includes(item.status));
    assert.equal(typeof item.can_reply, 'boolean');
    return item;
};

(async () => {
    assert(process.argv.includes('--execute-disposable-db'), 'Use --execute-disposable-db to create/remove the isolated local test container.');
    assert(/^novastore-r10-questions-[a-f0-9]{16}$/u.test(containerName));
    assert(/^novastore_pc1_seller_questions_[a-f0-9]{16}_test$/u.test(databaseName));
    docker(['run', '--pull', 'never', '--rm', '--name', containerName, '-d', '-p', '127.0.0.1::5432',
        '-e', 'POSTGRES_DB', '-e', 'POSTGRES_USER', '-e', 'POSTGRES_PASSWORD', 'postgres:16-bookworm'], {
        env: { ...process.env, POSTGRES_DB: databaseName, POSTGRES_USER: 'r10_local_test', POSTGRES_PASSWORD: password }
    });
    created = true;
    const published = docker(['port', containerName, '5432/tcp']);
    const portMatch = /^127\.0\.0\.1:(\d+)$/u.exec(published);
    assert(portMatch, 'Disposable PostgreSQL must bind only loopback.');
    const port = Number(portMatch[1]);
    const connectionString = `postgresql://r10_local_test:${encodeURIComponent(password)}@127.0.0.1:${port}/${databaseName}`;
    sensitive.add(connectionString);
    for (let attempt = 0; attempt < 80; attempt += 1) {
        const client = new Client({ connectionString, ssl: false, connectionTimeoutMillis: 1000 });
        try {
            await client.connect();
            assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, databaseName);
            await client.end();
            break;
        } catch (error) {
            await client.end().catch(() => {});
            if (attempt === 79) throw new Error(`Disposable PostgreSQL did not become ready: ${error.code || 'unknown'}`);
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }
    Object.assign(process.env, {
        NODE_ENV: 'test', NOVASTORE_DEPLOY_ENV: 'local', NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
        NOVASTORE_ALLOW_REMOTE_DB: 'false', SKIP_SCHEMA_INIT: 'true', NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
        DATABASE_URL: connectionString, DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName,
        DB_USER: 'r10_local_test', DB_PASSWORD: password, DB_SSL: 'false', SUPABASE_USE_POOLER: 'false',
        SUPABASE_POOLER_HOST: '', SUPABASE_REGION: '', SUPABASE_PROJECT_REF: '',
        JWT_SECRET: jwtSecret, NOVASTORE_NOTIFICATION_WORKER_ENABLED: 'false',
        NOVASTORE_ADMIN_QUESTION_ANSWER_WRITE_ENABLED: 'true', NOVASTORE_REQUEST_LOGGING_ENABLED: 'false'
    });
    const { LOCAL_TEST_CAPABILITY } = require('../scripts/staging-migrations/guard');
    const { loadRegistry } = require('../scripts/staging-migrations/registry');
    const { runApply } = require('../scripts/staging-migrations/runner');
    const registry = loadRegistry();
    assert(registry.some((entry) => entry.id.includes('seller_reputation_questions')), 'R10 migration must be in the canonical manifest.');
    const migrationEnv = {
        NODE_ENV: 'test', NOVASTORE_DEPLOY_ENV: 'staging', NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
        NOVASTORE_ALLOW_REMOTE_DB: 'true', NOVASTORE_EXPECTED_DATABASE_HOST: '127.0.0.1',
        NOVASTORE_EXPECTED_DATABASE_NAME: databaseName, [LOCAL_TEST_CAPABILITY]: 'true', DATABASE_URL: connectionString
    };
    const applied = await runApply({ env: migrationEnv, registry, output: () => {} });
    assert.deepEqual(applied.applied, registry.map((entry) => entry.id));
    assert.deepEqual((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, []);
    const serverPath = require.resolve('../server');
    require.cache[serverPath] = { id: serverPath, filename: serverPath, loaded: true, exports: { io: null } };
    pool = require('../config/db');
    const originalFetch = global.fetch;
    let outboundAttemptCount = 0;
    global.fetch = (url, options) => {
        if (new URL(url).hostname !== '127.0.0.1') {
            outboundAttemptCount += 1;
            throw new Error('External HTTP is forbidden in local reputation UAT.');
        }
        return originalFetch(url, options);
    };

    const seeded = (await pool.query(`INSERT INTO users (full_name, email, phone, password, role, auth_enabled)
        VALUES ('R10 Customer Private Name', 'r10-customer-a@example.test', '+905000000001', $1, 'customer', TRUE),
               ('R10 Customer B', 'r10-customer-b@example.test', '+905000000002', $1, 'customer', TRUE),
               ('R10 Seller A', 'r10-seller-a@example.test', NULL, $1, 'customer', TRUE),
               ('R10 Seller B', 'r10-seller-b@example.test', NULL, $1, 'customer', TRUE),
               ('R10 Same Organization Other Store', 'r10-seller-c@example.test', NULL, $1, 'customer', TRUE),
               ('R10 Viewer', 'r10-viewer@example.test', NULL, $1, 'customer', TRUE),
               ('R10 Admin', 'r10-admin@example.test', NULL, $1, 'admin', TRUE) RETURNING id,email`,
    [await bcrypt.hash(password, 4)])).rows;
    const users = Object.fromEntries(seeded.map((row) => [row.email, Number(row.id)]));
    const orgA = Number((await pool.query('INSERT INTO seller_organizations (external_key,display_name) VALUES ($1,$2) RETURNING id', [crypto.randomUUID(), 'R10 Seller A'])).rows[0].id);
    const orgB = Number((await pool.query('INSERT INTO seller_organizations (external_key,display_name) VALUES ($1,$2) RETURNING id', [crypto.randomUUID(), 'R10 Seller B'])).rows[0].id);
    const roles = Object.fromEntries((await pool.query("SELECT id,code FROM seller_roles WHERE organization_id IS NULL")).rows.map((row) => [row.code, Number(row.id)]));
    for (const role of ['owner', 'manager', 'operator']) {
        const permissions = (await pool.query('SELECT permission_code FROM seller_role_permissions WHERE role_id=$1', [roles[role]])).rows.map((row) => row.permission_code);
        assert(permissions.includes('reputation.read') && permissions.includes('reputation.reply'), `R10 ${role} migration permission grant`);
    }
    const fixtureStore = async (organizationId, label, ownerId) => {
        const legacyId = Number((await pool.query('INSERT INTO stores(name,slug,owner_user_id,is_active) VALUES($1,$2,$3,TRUE) RETURNING id', [label, `r10-${label.toLowerCase().replace(/ /gu, '-')}`, ownerId])).rows[0].id);
        const id = Number((await pool.query('INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,$3) RETURNING id', [organizationId, legacyId, label])).rows[0].id);
        await pool.query('INSERT INTO seller_store_profiles(organization_id,store_id) VALUES($1,$2)', [organizationId, id]);
        return { organizationId, id, legacyId, name: label };
    };
    const a = await fixtureStore(orgA, 'Store A', users['r10-seller-a@example.test']);
    const b = await fixtureStore(orgB, 'Store B', users['r10-seller-b@example.test']);
    const c = await fixtureStore(orgA, 'Other Store A', users['r10-seller-c@example.test']);
    const member = async (store, email, roleId) => {
        const id = Number((await pool.query('INSERT INTO seller_memberships(organization_id,user_id,role_id,security_stamp) VALUES($1,$2,$3,$4) RETURNING id', [store.organizationId, users[email], roleId, crypto.randomUUID()])).rows[0].id);
        await pool.query('INSERT INTO seller_membership_store_scopes(membership_id,organization_id,store_id) VALUES($1,$2,$3)', [id, store.organizationId, store.id]);
        return id;
    };
    a.membershipId = await member(a, 'r10-seller-a@example.test', roles.owner);
    b.membershipId = await member(b, 'r10-seller-b@example.test', roles.owner);
    c.membershipId = await member(c, 'r10-seller-c@example.test', roles.owner);
    await member(a, 'r10-viewer@example.test', roles.viewer);
    const fixtureProduct = async (store, label) => Number((await pool.query(`INSERT INTO products(name,description,price,stock,store_id,publication_status,is_customer_visible)
        VALUES($1,'Disposable local reputation fixture',100,20,$2,'active',TRUE) RETURNING id`, [label, store.legacyId])).rows[0].id);
    a.productId = await fixtureProduct(a, 'R10 A product');
    b.productId = await fixtureProduct(b, 'R10 B product');
    c.productId = await fixtureProduct(c, 'R10 same org other product');
    for (const store of [a, b, c]) store.offerId = Number((await pool.query("INSERT INTO seller_offers(organization_id,store_id,product_id,status,visibility) VALUES($1,$2,$3,'active','seller_visible') RETURNING id", [store.organizationId, store.id, store.productId])).rows[0].id);

    const { createSellerAccessTokenService } = require('../services/sellerAccessTokenService');
    const { createSellerAuthMiddleware } = require('../middlewares/sellerAuthMiddleware');
    const { createSellerTenantContextMiddleware } = require('../middlewares/sellerTenantContext');
    const { createSellerAuthController } = require('../controllers/sellerAuthController');
    const { createSellerAuthRouter } = require('../routes/sellerAuthRoutes');
    const { createSellerBusinessRouter } = require('../routes/sellerBusinessRoutes');
    const { createSellerBusinessController } = require('../controllers/sellerBusinessController');
    const tokenService = createSellerAccessTokenService({ secret: sellerSecret });
    const auth = createSellerAuthMiddleware({ verifyAccessToken: tokenService.verify });
    const tenant = createSellerTenantContextMiddleware();
    const controller = createSellerBusinessController({
        storeService: require('../services/sellerStoreService'),
        offerInventoryService: require('../services/sellerOfferInventoryService'),
        orderService: require('../services/sellerOrderFulfillmentService'),
        financeService: require('../services/sellerFinanceService'),
        supportService: require('../services/sellerSupportService'),
        reputationService: require('../services/sellerReputationService')
    });
    const app = express();
    app.use(express.json({ limit: '32kb' }));
    app.locals.sellerDatabase = pool;
    app.use('/api/users', require('../routes/userRoutes'));
    app.use('/api/auth', require('../routes/authRoutes'));
    app.use('/api/questions', require('../routes/questionRoutes'));
    app.use('/api/seller/v1', createSellerAuthRouter({ auth, controller: createSellerAuthController({ loginService: require('../services/sellerLoginService'), tokenService }) }));
    app.use('/api/seller/v1', createSellerBusinessRouter({ enabled: true, auth, tenant, controller }));
    server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, { method = 'GET', token, body, key, headers = {} } = {}) => {
        const response = await fetch(base + path, {
            method, redirect: 'error', headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                ...(key === undefined ? {} : { 'Idempotency-Key': key }), ...headers
            }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const value = await response.json();
        rememberTokens(value);
        return { status: response.status, body: value, headers: response.headers };
    };
    const loginCustomer = async (email) => okStatus(await request('/api/users/login', { method: 'POST', body: { email, password } }), 200, 'Real Customer login').token;
    const loginSeller = async (email) => okStatus(await request('/api/seller/v1/auth/login', { method: 'POST', body: { identifier: email, password } }), 200, 'Real Seller login');
    const customer = await loginCustomer('r10-customer-a@example.test');
    const customerB = await loginCustomer('r10-customer-b@example.test');
    const admin = okStatus(await request('/api/auth/login', { method: 'POST', body: { email: 'r10-admin@example.test', password } }), 200, 'Real Admin login').token;
    const sellerA = await loginSeller('r10-seller-a@example.test');
    const sellerB = await loginSeller('r10-seller-b@example.test');
    const sellerC = await loginSeller('r10-seller-c@example.test');
    const viewer = await loginSeller('r10-viewer@example.test');
    const inbox = (token, query = '') => request(`/api/seller/v1/reputation/inbox${query}`, { token });
    const detail = (token, id) => request(`/api/seller/v1/reputation/items/${id}`, { token });
    const reply = (token, id, body, key) => request(`/api/seller/v1/reputation/items/${id}/commands`, { method: 'POST', token, body, key });
    let questionSequence = 0;
    const ask = async (productId = a.productId, label = 'Customer A question', token = customer) => {
        const payload = okStatus(await request('/api/questions/ask', { method: 'POST', token, body: { product_id: productId, question: `${label} ${++questionSequence} ${suffix}` } }), 201, 'Customer canonical ask');
        return Number(payload.question.id);
    };
    const snapshot = async (id) => {
        const row = (await pool.query('SELECT answer,answered_at,answered_by,revision FROM product_questions WHERE id=$1', [id])).rows[0];
        const counts = (await pool.query(`SELECT
            (SELECT COUNT(*)::INT FROM notification_outbox_events WHERE aggregate_type='product_question' AND aggregate_id=$1 AND event_type='QUESTION_ANSWERED') AS events,
            (SELECT COUNT(*)::INT FROM seller_audit_events WHERE target_type='product_question' AND target_id=$1) AS audits,
            (SELECT COUNT(*)::INT FROM seller_outbox_events WHERE aggregate_type='product_question' AND aggregate_id=$1) AS seller_events,
            (SELECT COUNT(*)::INT FROM seller_mutation_receipts WHERE aggregate_type='product_question' AND aggregate_id=$1) AS receipts`, [String(id)])).rows[0];
        return { row, counts };
    };
    const id = await ask();
    const foreignId = await ask(b.productId, 'Foreign Seller B question', customerB);
    const sameOrgId = await ask(c.productId, 'Same organization other store question');
    a.questionId = id;
    const listedResponse = await inbox(sellerA.access_token);
    const listed = okStatus(listedResponse, 200, 'REP01 canonical inbox');
    assert.match(listedResponse.headers.get('cache-control'), /no-store/u);
    assert.deepEqual(listed.items.map((item) => Number(dto(item).item_id)), [id]);
    assert.equal(listed.next_cursor, null);
    const item = dto(okStatus(await detail(sellerA.access_token, id), 200, 'REP detail').item);
    assert.equal(Number(item.store_id), a.id);
    assert.equal(Number(item.product_id), a.productId);
    assert.equal(item.store_name, a.name);
    assert.equal(item.can_reply, true);
    assert.equal(item.status, 'unanswered');
    const safeSellerJson = JSON.stringify({ listed, item });
    for (const value of ['r10-customer-a@example.test', '+905000000001', 'R10 Customer Private Name']) assert(!safeSellerJson.includes(value), 'Customer private fixture data must not reach Seller DTO.');
    assert.equal(dto(okStatus(await detail(viewer.access_token, id), 200, 'Viewer detail').item).can_reply, false);
    errorCode(await reply(viewer.access_token, id, { command: 'reply', body: 'Not authorized', revision: 1 }, 'viewer-reply-0001'), 403, 'PERMISSION_DENIED', 'Read-only role reply');
    for (const token of [undefined, customer, admin]) {
        okStatus(await inbox(token), 401, 'Audience list isolation');
        okStatus(await detail(token, id), 401, 'Audience detail isolation');
        okStatus(await reply(token, id, { command: 'reply', body: 'Wrong audience', revision: 1 }, 'wrong-audience-01'), 401, 'Audience write isolation');
    }
    for (const other of [sellerB, sellerC]) {
        const ownList = okStatus(await inbox(other.access_token), 200, 'Other Seller scoped list');
        assert(!ownList.items.some((entry) => Number(entry.item_id) === id), 'Other Seller must not list A question.');
        errorCode(await detail(other.access_token, id), 404, 'RESOURCE_NOT_FOUND', 'Foreign detail IDOR');
        errorCode(await reply(other.access_token, id, { command: 'reply', body: 'Foreign write denied', revision: 1 }, 'foreign-reply-0001'), 404, 'RESOURCE_NOT_FOUND', 'Foreign reply IDOR');
    }
    for (const foreign of [foreignId, sameOrgId]) errorCode(await detail(sellerA.access_token, foreign), 404, 'RESOURCE_NOT_FOUND', 'Reciprocal detail IDOR');
    for (const authorityKey of ['sellerId', 'organizationId', 'storeId', 'ownerId', 'seller_id', 'organization_id', 'store_id', 'owner_id']) {
        const attempted = await inbox(sellerA.access_token, `?${authorityKey}=${b.id}`);
        assert([200, 400].includes(attempted.status));
        if (attempted.status === 200) assert(attempted.body.items.every((entry) => Number(entry.store_id) === a.id));
        const malicious = await reply(sellerA.access_token, foreignId, { command: 'reply', body: 'Client authority rejected', revision: 1, [authorityKey]: b.id }, `authority-${authorityKey}`);
        assert([400, 404].includes(malicious.status), 'Client-selected owner must not grant write authority.');
    }
    errorCode(await reply(sellerA.access_token, id, { command: 'reply', body: 'Valid answer', revision: 1 }), 428, 'IDEMPOTENCY_KEY_REQUIRED', 'Mandatory idempotency');
    errorCode(await reply(sellerA.access_token, id, { command: 'reply', body: 'Valid answer' }, 'missing-revision-01'), 428, 'PRECONDITION_REQUIRED', 'Mandatory revision');
    errorCode(await reply(sellerA.access_token, id, { command: 'reply', body: 'Valid answer', revision: 99 }, 'stale-revision-0001'), 409, 'REVISION_CONFLICT', 'Stale revision');
    for (const value of ['', '  \n ', 'x'.repeat(2001), 'bad\u0000text']) okStatus(await reply(sellerA.access_token, id, { command: 'reply', body: value, revision: 1 }, `invalid-body-${crypto.randomUUID()}`), 400, 'Invalid answer body');
    for (const revision of [0, -1, 1.2, 'wrong', null]) {
        const invalid = await reply(sellerA.access_token, id, { command: 'reply', body: 'Answer', revision }, `invalid-revision-${crypto.randomUUID()}`);
        assert([400, 428].includes(invalid.status), 'Invalid revisions must be rejected.');
    }
    okStatus(await reply(sellerA.access_token, id, { command: 'reply', body: 'Answer', revision: 1 }, 'tiny'), 400, 'Short key rejected');
    errorCode(await reply(sellerA.access_token, id, { command: 'report', body: 'Report', revision: 1 }, 'unsupported-report-01'), 403, 'PERMISSION_DENIED', 'Report permission is not granted');
    for (const value of ['See https://example.test/help', 'Email user@example.test', '+905550001122', '<b>Answer</b>', 'TR00 0000 0000 0000 0000 0000 00']) {
        errorCode(await reply(sellerA.access_token, id, { command: 'reply', body: value, revision: 1 }, `content-policy-${crypto.randomUUID()}`), 400, 'CONTENT_POLICY_VIOLATION', 'Public reply content guard');
    }
    const before = await snapshot(id);
    assert.equal(before.row.answer, null);
    const answer = 'Ürünümüz iki yıl garanti kapsamındadır.';
    const command = { command: 'reply', body: `  ${answer}  `, revision: 1 };
    const answered = okStatus(await reply(sellerA.access_token, id, command, 'canonical-reply-0001'), 200, 'REP02 canonical reply');
    assert.equal(dto(answered.item).answer, answer);
    assert.equal(answered.status, 'answered');
    assert.equal(Number(answered.revision), 2);
    assert.equal(answered.item.can_reply, false);
    const after = await snapshot(id);
    assert.equal(after.row.answer, answer);
    assert.equal(Number(after.row.revision), 2);
    assert(after.row.answered_at);
    assert.equal(Number(after.row.answered_by), users['r10-seller-a@example.test']);
    assert.deepEqual(after.counts, { events: 1, audits: 1, seller_events: 1, receipts: 1 });
    const replay = okStatus(await reply(sellerA.access_token, id, command, 'canonical-reply-0001'), 200, 'Network retry');
    assert.equal(replay.item.answer, answer);
    assert.deepEqual(await snapshot(id), after, 'Same key/request must not duplicate write/event/audit.');
    errorCode(await reply(sellerA.access_token, id, { ...command, body: 'Incompatible answer' }, 'canonical-reply-0001'), 409, 'IDEMPOTENCY_KEY_REUSED', 'Incompatible key reuse');
    errorCode(await reply(sellerA.access_token, id, command, 'different-key-after-01'), 409, 'REVISION_CONFLICT', 'Different key stale reply');
    errorCode(await reply(sellerA.access_token, id, { ...command, revision: 2 }, 'already-answered-0001'), 409, 'REVISION_CONFLICT', 'Already answered cannot overwrite');
    assert.equal(dto(okStatus(await detail(sellerA.access_token, id), 200, 'Detail persisted refetch').item).answer, answer);
    const ownQuestions = okStatus(await request('/api/questions/user', { token: customer }), 200, 'Customer canonical propagation');
    assert.equal(ownQuestions.find((entry) => Number(entry.id) === id)?.answer, answer);
    const customerBQuestions = okStatus(await request('/api/questions/user', { token: customerB }), 200, 'Customer ownership read');
    assert(!customerBQuestions.some((entry) => Number(entry.id) === id));
    const publicQuestions = okStatus(await request(`/api/questions/product/${a.productId}`), 200, 'Public answered propagation');
    assert.equal(publicQuestions.find((entry) => Number(entry.id) === id)?.answer, answer);
    // Materialize the existing canonical event into the Customer inbox only; no provider worker runs.
    const { resolveNotificationRecipients } = require('../services/notificationRecipientService');
    const createdRecipients = await resolveNotificationRecipients(pool, { eventType: 'QUESTION_CREATED', aggregateType: 'product_question', aggregateId: String(id) });
    assert(createdRecipients.some((recipient) => Number(recipient.userId) === users['r10-seller-a@example.test']), 'Question-created targets current Seller A.');
    assert(!createdRecipients.some((recipient) => [users['r10-seller-b@example.test'], users['r10-seller-c@example.test']].includes(Number(recipient.userId))), 'Question-created must not target another Seller scope.');
    const answeredEventId = (await pool.query("SELECT id FROM notification_outbox_events WHERE aggregate_type='product_question' AND aggregate_id=$1 AND event_type='QUESTION_ANSWERED'", [String(id)])).rows[0].id;
    const { dispatchOneNotificationEvent } = require('../services/notificationOutboxService');
    const delivered = await dispatchOneNotificationEvent({ database: pool, eventId: answeredEventId });
    assert.equal(delivered.processed, true);
    assert.equal(delivered.notificationCount, 1);
    const answerNotifications = (await pool.query("SELECT user_id,entity_type,entity_id FROM notifications WHERE type='QUESTION_ANSWERED' AND entity_id=$1", [id])).rows;
    assert.equal(answerNotifications.length, 1);
    assert.equal(Number(answerNotifications[0].user_id), users['r10-customer-a@example.test']);
    assert.equal(answerNotifications[0].entity_type, 'product_question');
    assert.equal((await dispatchOneNotificationEvent({ database: pool, eventId: answeredEventId })).processed, false);
    assert.equal(Number((await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE type='QUESTION_ANSWERED' AND entity_id=$1", [id])).rows[0].n), 1, 'Outbox retry cannot duplicate Customer notification.');
    const adminQuestions = okStatus(await request('/api/questions/admin/all', { token: admin }), 200, 'Admin Seller question read');
    assert(adminQuestions.some((entry) => Number(entry.id) === id), 'Admin sees Seller question on non-platform canonical store.');
    errorCode(await request(`/api/questions/admin/answer/${id}`, { method: 'PATCH', token: admin, body: { answer: 'Forbidden Admin replacement', expected_revision: 2 } }), 404, 'QUESTION_NOT_FOUND', 'Admin Seller answer boundary');
    assert.deepEqual(await snapshot(id), after);

    // Real concurrent HTTP requests: one canonical answer, event, audit and receipt.
    for (const sameKey of [true, false]) {
        const raceId = await ask(a.productId, sameKey ? 'Same key race' : 'Different key race');
        const body = { command: 'reply', body: 'Concurrent canonical answer', revision: 1 };
        const key = `race-${sameKey ? 'same' : 'different'}-key-001`;
        const race = await Promise.all([reply(sellerA.access_token, raceId, body, key), reply(sellerA.access_token, raceId, body, sameKey ? key : `${key}-2`)]);
        assert.deepEqual(race.map((entry) => entry.status).sort(), sameKey ? [200, 200] : [200, 409]);
        if (!sameKey) assert.equal(race.find((entry) => entry.status === 409).body.code, 'REVISION_CONFLICT');
        assert.deepEqual((await snapshot(raceId)).counts, { events: 1, audits: 1, seller_events: 1, receipts: 1 });
    }
    for (const bound of [1, 2000]) {
        const lengthId = await ask(a.productId, `Answer exact length ${bound}`);
        const result = okStatus(await reply(sellerA.access_token, lengthId, { command: 'reply', body: 'x'.repeat(bound), revision: 1 }, `answer-bound-${bound}`), 200, 'Inclusive answer length bound');
        assert.equal(result.item.answer.length, bound);
    }
    // Database trigger fault injection proves transaction rollback after the answer SQL.
    for (const table of ['seller_audit_events', 'seller_outbox_events', 'notification_outbox_events', 'seller_mutation_receipts']) {
        const failureId = await ask(a.productId, `Rollback ${table}`);
        const beforeFailure = await snapshot(failureId);
        await pool.query(`CREATE FUNCTION r10_injected_failure() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'R10_INJECTED_FAILURE'; END; $$`);
        await pool.query(`CREATE TRIGGER r10_injected_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION r10_injected_failure()`);
        try {
            const failed = await reply(sellerA.access_token, failureId, { command: 'reply', body: 'Must roll back', revision: 1 }, `rollback-${table}`);
            assert(failed.status >= 500, 'Injected transaction failure must reject reply.');
            assert.deepEqual(await snapshot(failureId), beforeFailure, `${table} failure must roll back answer, audit, outbox and receipt.`);
        } finally {
            await pool.query(`DROP TRIGGER r10_injected_failure ON ${table}`);
            await pool.query('DROP FUNCTION r10_injected_failure()');
        }
    }
    // Stable bounded keyset pages, with matching query context and foreign cursor rejection.
    for (let index = 0; index < 54; index += 1) await ask(a.productId, 'Pagination question');
    assert.equal(okStatus(await inbox(sellerA.access_token), 200, 'Default page').items.length, 25);
    assert.equal(okStatus(await inbox(sellerA.access_token, '?limit=50'), 200, 'Maximum page').items.length, 50);
    okStatus(await inbox(sellerA.access_token, '?limit=51'), 400, 'Limit overflow rejected');
    for (const query of ['?limit=0', '?limit=-1', '?limit=word', '?type=review', '?status=all']) okStatus(await inbox(sellerA.access_token, query), 400, 'Invalid inbox filter');
    errorCode(await inbox(sellerA.access_token, '?cursor=not-a-cursor'), 400, 'INVALID_CURSOR', 'Cursor validity');
    const page1 = okStatus(await inbox(sellerA.access_token, '?limit=7&type=product_question&status=unanswered'), 200, 'First cursor page');
    assert(page1.next_cursor);
    const page2 = okStatus(await inbox(sellerA.access_token, `?limit=7&type=product_question&status=unanswered&cursor=${encodeURIComponent(page1.next_cursor)}`), 200, 'Second cursor page');
    assert(!page2.items.some((entry) => page1.items.some((previous) => Number(previous.item_id) === Number(entry.item_id))));
    assert(Number(page1.items.at(-1).item_id) > Number(page2.items[0].item_id));
    const allPageIds = page1.items.map((entry) => Number(entry.item_id));
    let cursor = page1.next_cursor;
    while (cursor) {
        const page = okStatus(await inbox(sellerA.access_token, `?limit=7&type=product_question&status=unanswered&cursor=${encodeURIComponent(cursor)}`), 200, 'Complete keyset traversal');
        assert(page.items.length <= 7);
        allPageIds.push(...page.items.map((entry) => Number(entry.item_id)));
        cursor = page.next_cursor;
    }
    assert.equal(new Set(allPageIds).size, allPageIds.length, 'No duplicate item across all cursor pages.');
    const canonicalUnansweredIds = (await pool.query("SELECT id FROM product_questions WHERE product_id=$1 AND NULLIF(BTRIM(answer),'') IS NULL ORDER BY id DESC", [a.productId])).rows.map((row) => Number(row.id));
    assert.deepEqual(allPageIds, canonicalUnansweredIds, 'Cursor traversal is complete and stable.');
    errorCode(await inbox(sellerA.access_token, `?status=answered&cursor=${encodeURIComponent(page1.next_cursor)}`), 400, 'INVALID_CURSOR', 'Cursor cannot switch filters');
    const tamperedCursor = page1.next_cursor.slice(0, -1) + (page1.next_cursor.endsWith('A') ? 'B' : 'A');
    errorCode(await inbox(sellerA.access_token, `?status=unanswered&cursor=${encodeURIComponent(tamperedCursor)}`), 400, 'INVALID_CURSOR', 'Signed cursor tamper');
    for (const other of [sellerB, sellerC]) {
        const foreignCursor = await inbox(other.access_token, `?limit=7&type=product_question&status=unanswered&cursor=${encodeURIComponent(page1.next_cursor)}`);
        errorCode(foreignCursor, 400, 'INVALID_CURSOR', 'Cursor cannot cross Seller/membership scope');
    }
    assert(okStatus(await inbox(sellerA.access_token, '?status=answered'), 200, 'Answered filter').items.every((entry) => entry.status === 'answered' && entry.answer));
    assert(page1.items.every((entry) => entry.status === 'unanswered' && !entry.answer));
    assert(okStatus(await inbox(sellerA.access_token, `?offer_id=${a.offerId}`), 200, 'Own offer filter').items.every((entry) => Number(entry.product_id) === a.productId));
    const foreignOffer = await inbox(sellerA.access_token, `?offer_id=${b.offerId}`);
    errorCode(foreignOffer, 404, 'RESOURCE_NOT_FOUND', 'Foreign offer is scoped before disclosure');

    // Current Customer ask visibility must fail closed, with no orphan creation event.
    const blockedAsk = async (label) => {
        const count = Number((await pool.query('SELECT COUNT(*) AS n FROM product_questions')).rows[0].n);
        const events = Number((await pool.query("SELECT COUNT(*) AS n FROM notification_outbox_events WHERE event_type='QUESTION_CREATED'")).rows[0].n);
        okStatus(await request('/api/questions/ask', { method: 'POST', token: customer, body: { product_id: a.productId, question: `Blocked ${label} question` } }), 404, `Ask rejects ${label}`);
        okStatus(await request(`/api/questions/product/${a.productId}`), 404, `Public Q&A rejects ${label}`);
        assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM product_questions')).rows[0].n), count);
        assert.equal(Number((await pool.query("SELECT COUNT(*) AS n FROM notification_outbox_events WHERE event_type='QUESTION_CREATED'")).rows[0].n), events);
    };
    await pool.query('UPDATE products SET is_customer_visible=FALSE WHERE id=$1', [a.productId]);
    await blockedAsk('private product');
    await pool.query('UPDATE products SET is_customer_visible=TRUE WHERE id=$1', [a.productId]);
    await pool.query("UPDATE seller_store_profiles SET operational_status='paused' WHERE store_id=$1", [a.id]);
    await blockedAsk('paused store');
    await pool.query("UPDATE seller_store_profiles SET operational_status='open' WHERE store_id=$1", [a.id]);
    await pool.query('UPDATE stores SET is_active=FALSE WHERE id=$1', [a.legacyId]);
    await blockedAsk('inactive canonical store');
    await pool.query('UPDATE stores SET is_active=TRUE WHERE id=$1', [a.legacyId]);
    const platform = (await pool.query("SELECT id FROM stores WHERE slug='novastore-platform'")).rows[0];
    const adminProductId = await fixtureProduct({ legacyId: Number(platform.id) }, 'R10 Admin-owned platform product');
    const adminQuestionId = await ask(adminProductId, 'Allowed platform Admin question');
    const allowedAdmin = okStatus(await request(`/api/questions/admin/answer/${adminQuestionId}`, { method: 'PATCH', token: admin, body: { answer: 'Canonical Admin reply remains supported.', expected_revision: 1 } }), 200, 'Allowed Admin answer regression');
    assert.equal(allowedAdmin.question.answer, 'Canonical Admin reply remains supported.');

    const openId = await ask(a.productId, 'Live authorization question');
    // A revocation transaction holding authority locks must not deadlock a reply.
    for (const table of ['seller_organizations', 'seller_memberships']) {
        const authorityId = table === 'seller_organizations' ? orgA : a.membershipId;
        const lockClient = await pool.connect();
        try {
            await lockClient.query('BEGIN');
            await lockClient.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`, [authorityId]);
            const beforeLocked = await snapshot(openId);
            const started = Date.now();
            for (const attempt of [
                () => inbox(sellerA.access_token),
                () => detail(sellerA.access_token, openId),
                () => reply(sellerA.access_token, openId, { command: 'reply', body: 'Authority lock must reject', revision: 1 }, `locked-${table}`)
            ]) errorCode(await attempt(), 503, 'SELLER_BUSINESS_UNAVAILABLE', 'Concurrent authority lock rejects promptly');
            assert(Date.now() - started < 4000, 'Authority contention must fail promptly, without blocking behind revocation.');
            assert.deepEqual(await snapshot(openId), beforeLocked);
            assert.equal((await lockClient.query('SELECT 1 AS usable')).rows[0].usable, 1, 'Revocation transaction remains usable.');
            await lockClient.query('ROLLBACK');
        } finally { await lockClient.query('ROLLBACK').catch(() => {}); lockClient.release(); }
        okStatus(await detail(sellerA.access_token, openId), 200, 'Authority lock release restores safe access');
    }
    const noAccess = async (label, { status } = {}) => {
        const list = await inbox(sellerA.access_token);
        if (status) okStatus(list, status, `${label} list`);
        else {
            assert([200, 403, 404].includes(list.status), `${label} list is bounded or denied`);
            if (list.status === 200) assert.equal(list.body.items.length, 0, `${label} no data`);
        }
        const read = await detail(sellerA.access_token, openId);
        const write = await reply(sellerA.access_token, openId, { command: 'reply', body: 'Must be denied live', revision: 1 }, `revocation-${crypto.randomUUID()}`);
        assert([401, 403, 404].includes(read.status), `${label} detail denial`);
        assert([401, 403, 404].includes(write.status), `${label} reply denial`);
        assert.equal((await snapshot(openId)).row.answer, null);
    };
    await pool.query('UPDATE seller_membership_store_scopes SET revoked_at=CURRENT_TIMESTAMP WHERE membership_id=$1', [a.membershipId]);
    await noAccess('Removed store scope');
    errorCode(await inbox(sellerA.access_token, `?status=unanswered&cursor=${encodeURIComponent(page1.next_cursor)}`), 400, 'INVALID_CURSOR', 'Previously signed cursor is invalid after live scope change');
    await pool.query('UPDATE seller_membership_store_scopes SET revoked_at=NULL WHERE membership_id=$1', [a.membershipId]);
    await pool.query("UPDATE seller_stores SET status='closed',closed_at=CURRENT_TIMESTAMP WHERE id=$1", [a.id]);
    await noAccess('Closed binding');
    await blockedAsk('closed binding');
    await pool.query("UPDATE seller_stores SET status='active',closed_at=NULL WHERE id=$1", [a.id]);
    await pool.query('UPDATE seller_stores SET closed_at=CURRENT_TIMESTAMP WHERE id=$1', [a.id]);
    await noAccess('Closed timestamp on active binding');
    await pool.query('UPDATE seller_stores SET closed_at=NULL WHERE id=$1', [a.id]);
    await pool.query("UPDATE seller_store_profiles SET operational_status='paused' WHERE store_id=$1", [a.id]);
    await noAccess('Paused current store profile');
    await pool.query("UPDATE seller_store_profiles SET operational_status='open' WHERE store_id=$1", [a.id]);
    await pool.query("DELETE FROM seller_role_permissions WHERE role_id=$1 AND permission_code='reputation.reply'", [roles.owner]);
    assert.equal(dto(okStatus(await detail(sellerA.access_token, openId), 200, 'Live permission revoke detail').item).can_reply, false);
    errorCode(await reply(sellerA.access_token, openId, { command: 'reply', body: 'Denied permission', revision: 1 }, 'live-permission-denied'), 403, 'PERMISSION_DENIED', 'Live permission reply revoke');
    await pool.query("INSERT INTO seller_role_permissions(role_id,permission_code) VALUES($1,'reputation.reply')", [roles.owner]);
    await pool.query("DELETE FROM seller_role_permissions WHERE role_id=$1 AND permission_code='reputation.read'", [roles.owner]);
    errorCode(await inbox(sellerA.access_token), 403, 'PERMISSION_DENIED', 'Live read permission revoke');
    errorCode(await detail(sellerA.access_token, openId), 403, 'PERMISSION_DENIED', 'Live detail permission revoke');
    await pool.query("INSERT INTO seller_role_permissions(role_id,permission_code) VALUES($1,'reputation.read')", [roles.owner]);
    await pool.query("UPDATE seller_memberships SET status='revoked',revoked_at=CURRENT_TIMESTAMP WHERE id=$1", [a.membershipId]);
    await noAccess('Membership revoked after token issuance', { status: 403 });
    // Successful old receipt cannot be replayed after revocation either.
    errorCode(await reply(sellerA.access_token, id, command, 'canonical-reply-0001'), 403, 'NO_ACTIVE_MEMBERSHIP', 'Revoked membership receipt replay');

    const safePersistence = (await pool.query(`SELECT metadata_redacted AS payload FROM seller_audit_events WHERE target_type='product_question'
        UNION ALL SELECT payload FROM notification_outbox_events WHERE aggregate_type='product_question'
        UNION ALL SELECT payload_redacted FROM seller_outbox_events WHERE aggregate_type='product_question'`)).rows;
    const persistedJson = JSON.stringify(safePersistence);
    for (const secret of sensitive) assert(!persistedJson.includes(secret), 'Audit/outbox must not store bearer credentials.');
    for (const privateValue of ['r10-customer-a@example.test', '+905000000001', 'R10 Customer Private Name']) assert(!persistedJson.includes(privateValue), 'Audit/outbox Customer PII leak');
    assert(!persistedJson.includes(answer), 'Audit/outbox must not copy answer body.');
    assert.equal(outboundAttemptCount, 0, 'No provider HTTP attempt.');
    for (const entry of logs) for (const secret of sensitive) assert(!entry.includes(secret), 'Secret log exposure');
    originals.log(`sellerReputationQuestionsPostgresSmoke PASS: ${checks} HTTP checks; real Customer/Seller/Admin auth, ownership, reply, idempotency, concurrency, rollback, live revocation and canonical propagation; production writes=0; provider calls=0; secret exposure=0`);
})().catch((error) => {
    originals.error(`sellerReputationQuestionsPostgresSmoke FAIL: ${clean(error.stack || error.message)}`);
    process.exitCode = 1;
}).finally(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
    if (created) {
        // Only this process-created, exact-name disposable container is removed.
        assert(/^novastore-r10-questions-[a-f0-9]{16}$/u.test(containerName));
        try { docker(['rm', '-f', containerName]); }
        catch (error) { originals.error(clean(error.message)); process.exitCode = 1; }
    }
    for (const [key, value] of Object.entries(originals)) console[key] = value;
});
