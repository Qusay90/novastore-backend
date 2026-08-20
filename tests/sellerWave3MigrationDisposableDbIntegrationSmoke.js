'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client, Pool } = require('pg');
const registry = require('../models/sellerWave3MigrationRegistry');
const helper = require('./helpers/sellerWave3DisposableDb');
const storeService = require('../services/sellerStoreService');
const offerInventoryService = require('../services/sellerOfferInventoryService');
const orderService = require('../services/sellerOrderFulfillmentService');
const financeService = require('../services/sellerFinanceService');
const supportService = require('../services/sellerSupportService');
const teamReadService = require('../services/sellerTeamReadService');

const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const required = (flag) => { const index = process.argv.indexOf(flag); if (index < 0 || !process.argv[index + 1]) fail('SELLER_WAVE3_DB_DIRECT_CONNECTION_REQUIRED'); return process.argv[index + 1]; };
const parseConnection = (value) => {
    let url;
    try { url = new URL(value); } catch (_) { fail('SELLER_WAVE3_DB_DIRECT_CONNECTION_REJECTED'); }
    const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const host = url.hostname.replace(/^\[|\]$/gu, '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !database) fail('SELLER_WAVE3_DB_DIRECT_CONNECTION_REJECTED');
    return Object.freeze({ host, database, port: url.port ? Number(url.port) : 5432, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), ssl: false });
};
const commandFlags = () => {
    for (const flag of ['--db-enabled', '--allow-db-operation', '--allow-migration-apply', '--allow-db-cleanup', '--execute-disposable-db']) if (!process.argv.includes(flag)) fail('SELLER_WAVE3_DB_EXPLICIT_OPT_IN_REQUIRED');
    const config = parseConnection(required('--connection'));
    helper.authorizeMigrationApply({ allowDbOperation: true, applyAuthorization: true, connection: config, migrationPaths: helper.allowedMigrationNames });
    helper.authorizeDisposableDbCleanup({ allowDbOperation: true, cleanupAuthorization: true, connection: config });
    return config;
};
const query = (client, sql, values = []) => client.query(sql, values);
const expectCode = async (promise, code) => {
    await assert.rejects(promise, (error) => error && error.code === code);
};
const anchorSchema = `
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT, full_name TEXT, name TEXT);
CREATE TABLE IF NOT EXISTS stores (id BIGINT PRIMARY KEY, owner_user_id INTEGER);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, user_id INTEGER, total_amount NUMERIC, status TEXT, items JSONB);
CREATE TABLE IF NOT EXISTS returns (id INTEGER PRIMARY KEY, order_id INTEGER, user_id INTEGER, reason_code TEXT, status TEXT);
`;
const seedFoundation = async (pool) => {
    await query(pool, "INSERT INTO users (id, email, full_name) VALUES (1, 'a@example.test', 'Store A Owner'), (2, 'b@example.test', 'Store B Owner'), (3, 'a-foreign@example.test', 'Store A Foreign Owner')");
    await query(pool, 'INSERT INTO stores (id, owner_user_id) VALUES (101, 1), (202, 2), (303, 3)');
    await query(pool, "INSERT INTO products (id, name) VALUES (1, 'Canonical A'), (2, 'Canonical B')");
    await query(pool, "INSERT INTO orders (id, user_id, total_amount, status, items) VALUES (1, 1, 100, 'pending', '[]'::jsonb)");
    await query(pool, "INSERT INTO returns (id, order_id, user_id, reason_code, status) VALUES (1, 1, 1, 'test', 'REQUESTED')");
    const orgA = await query(pool, "INSERT INTO seller_organizations (external_key, display_name) VALUES ('11111111-1111-4111-8111-111111111111', 'Seller A') RETURNING id");
    const orgB = await query(pool, "INSERT INTO seller_organizations (external_key, display_name) VALUES ('22222222-2222-4222-8222-222222222222', 'Seller B') RETURNING id");
    const owner = await query(pool, "SELECT id FROM seller_roles WHERE organization_id IS NULL AND code = 'owner'");
    const roleId = Number(owner.rows[0].id);
    const memberA = await query(pool, "INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp) VALUES ($1, 1, $2, '11111111-1111-4111-8111-111111111112') RETURNING id", [Number(orgA.rows[0].id), roleId]);
    const memberB = await query(pool, "INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp) VALUES ($1, 2, $2, '22222222-2222-4222-8222-222222222223') RETURNING id", [Number(orgB.rows[0].id), roleId]);
    const memberAForeign = await query(pool, "INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp) VALUES ($1, 3, $2, '33333333-3333-4333-8333-333333333334') RETURNING id", [Number(orgA.rows[0].id), roleId]);
    const storeA = await query(pool, "INSERT INTO seller_stores (organization_id, legacy_store_id, display_name) VALUES ($1, 101, 'Store A') RETURNING id", [Number(orgA.rows[0].id)]);
    const storeB = await query(pool, "INSERT INTO seller_stores (organization_id, legacy_store_id, display_name) VALUES ($1, 202, 'Store B') RETURNING id", [Number(orgB.rows[0].id)]);
    const storeAForeign = await query(pool, "INSERT INTO seller_stores (organization_id, legacy_store_id, display_name) VALUES ($1, 303, 'Store A Foreign') RETURNING id", [Number(orgA.rows[0].id)]);
    await query(pool, 'INSERT INTO seller_membership_store_scopes (membership_id, organization_id, store_id) VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)', [Number(memberA.rows[0].id), Number(orgA.rows[0].id), Number(storeA.rows[0].id), Number(memberB.rows[0].id), Number(orgB.rows[0].id), Number(storeB.rows[0].id), Number(memberAForeign.rows[0].id), Number(orgA.rows[0].id), Number(storeAForeign.rows[0].id)]);
    const sessionA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const sessionB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
    const sessionAForeign = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
    await query(pool, `INSERT INTO seller_sessions (id, user_id, organization_id, membership_id, membership_revision, security_stamp, expires_at) VALUES
        ($1, 1, $2, $3, 1, '11111111-1111-4111-8111-111111111112', CURRENT_TIMESTAMP + INTERVAL '1 day'),
        ($4, 2, $5, $6, 1, '22222222-2222-4222-8222-222222222223', CURRENT_TIMESTAMP + INTERVAL '1 day'),
        ($7, 3, $2, $8, 1, '33333333-3333-4333-8333-333333333334', CURRENT_TIMESTAMP + INTERVAL '1 day')`, [sessionA, Number(orgA.rows[0].id), Number(memberA.rows[0].id), sessionB, Number(orgB.rows[0].id), Number(memberB.rows[0].id), sessionAForeign, Number(memberAForeign.rows[0].id)]);
    return Object.freeze({
        a: Object.freeze({ sessionId: sessionA, organizationId: Number(orgA.rows[0].id), membershipId: Number(memberA.rows[0].id), userId: 1, storeIds: [Number(storeA.rows[0].id)] }),
        b: Object.freeze({ sessionId: sessionB, organizationId: Number(orgB.rows[0].id), membershipId: Number(memberB.rows[0].id), userId: 2, storeIds: [Number(storeB.rows[0].id)] }),
        foreign: Object.freeze({ sessionId: sessionAForeign, organizationId: Number(orgA.rows[0].id), membershipId: Number(memberAForeign.rows[0].id), userId: 3, storeIds: [Number(storeAForeign.rows[0].id)] })
    });
};
const apply = async (pool) => {
    const descriptors = registry.verifyMigrationFiles();
    for (const descriptor of descriptors) await query(pool, fs.readFileSync(path.resolve(__dirname, '..', descriptor.relativePath), 'utf8'));
};
const proveForeignStoreMutationMatrix = async (pool, contexts, targets) => {
    const foreignOfferCreate = {
        product_id: 2,
        seller_sku: 'A-FOREIGN-1',
        price_minor: 5000,
        currency: 'TRY',
        initial_quantity: 7,
        idempotency_key: 'offer-create-a-foreign'
    };
    const foreignSupportCreate = {
        category: 'technical',
        subject: 'Foreign store fixture',
        body: 'Synthetic foreign store support',
        client_message_id: 'support-message-foreign',
        idempotency_key: 'support-create-foreign'
    };
    await expectCode(
        offerInventoryService.createOffer(pool, contexts.a, foreignOfferCreate),
        'IDEMPOTENCY_KEY_REUSED'
    );
    await expectCode(
        supportService.createConversation(pool, contexts.a, foreignSupportCreate),
        'IDEMPOTENCY_KEY_REUSED'
    );
    const foreignAdjustment = {
        idempotency_key: 'foreign-inventory-receipt-replay',
        items: [{
            inventory_item_id: targets.inventoryItemId,
            delta: 1,
            reason_code: 'foreign_receipt_seed',
            revision: targets.inventoryRevision
        }]
    };
    const adjusted = await offerInventoryService.adjustInventory(pool, contexts.foreign, foreignAdjustment);
    const foreignThreshold = {
        threshold: 11,
        revision: adjusted.inventory[0].revision,
        idempotency_key: 'foreign-threshold-receipt-replay'
    };
    const thresholdUpdated = await offerInventoryService.updateThreshold(
        pool,
        contexts.foreign,
        targets.inventoryItemId,
        foreignThreshold
    );
    await expectCode(
        offerInventoryService.adjustInventory(pool, contexts.a, foreignAdjustment),
        'RESOURCE_NOT_FOUND'
    );
    await expectCode(
        offerInventoryService.updateThreshold(pool, contexts.a, targets.inventoryItemId, foreignThreshold),
        'RESOURCE_NOT_FOUND'
    );
    const securedTargets = {
        ...targets,
        inventoryRevision: thresholdUpdated.inventory.revision
    };
    const snapshot = async () => {
        const store = await storeService.readStore(pool, contexts.foreign, securedTargets.storeId);
        const offer = await offerInventoryService.loadOffer(pool, contexts.foreign, securedTargets.offerId);
        const order = await orderService.readOrder(pool, contexts.foreign, securedTargets.orderId);
        const support = await supportService.loadConversation(pool, contexts.foreign, securedTargets.conversationId);
        const counters = await query(pool, `SELECT
            (SELECT COUNT(*)::integer FROM seller_inventory_movements WHERE organization_id = $1 AND inventory_item_id = $2) AS inventory_movements,
            (SELECT COUNT(*)::integer FROM seller_order_transitions WHERE organization_id = $1 AND seller_order_id = $3) AS order_transitions,
            (SELECT COUNT(*)::integer FROM seller_mutation_receipts WHERE organization_id = $1) AS receipts,
            (SELECT COUNT(*)::integer FROM seller_audit_events WHERE organization_id = $1) AS audits,
            (SELECT COUNT(*)::integer FROM seller_outbox_events WHERE organization_id = $1) AS outbox`, [contexts.a.organizationId, securedTargets.inventoryItemId, securedTargets.orderId]);
        return {
            store: { description: store.description, revision: store.revision },
            offer: { sellerSku: offer.variant.seller_sku, priceMinor: offer.variant.price_minor, visibility: offer.visibility, revision: offer.revision, inventoryQuantity: offer.inventory.quantity, inventoryRevision: offer.inventory.revision },
            order: { status: order.status, revision: order.revision, packageStatus: order.packages[0].status, packageRevision: order.packages[0].revision },
            support: { revision: support.revision, messageCount: support.messages.length },
            counters: counters.rows[0]
        };
    };
    const before = await snapshot();
    await expectCode(storeService.updateStore(pool, contexts.a, securedTargets.storeId, { description: 'blocked foreign write', revision: securedTargets.storeRevision, idempotency_key: 'foreign-store-update-denied' }), 'RESOURCE_NOT_FOUND');
    await expectCode(offerInventoryService.updateOffer(pool, contexts.a, securedTargets.offerId, { seller_sku: 'FOREIGN-DENIED', price_minor: 1, visibility: 'private', revision: securedTargets.offerRevision, idempotency_key: 'foreign-offer-update-denied' }), 'RESOURCE_NOT_FOUND');
    await expectCode(offerInventoryService.offerCommand(pool, contexts.a, securedTargets.offerId, { command: 'publish', revision: securedTargets.offerRevision, idempotency_key: 'foreign-offer-command-denied' }), 'RESOURCE_NOT_FOUND');
    await expectCode(offerInventoryService.adjustInventory(pool, contexts.a, { idempotency_key: 'foreign-inventory-adjust-denied', items: [{ inventory_item_id: securedTargets.inventoryItemId, delta: 1, reason_code: 'foreign_denied', revision: securedTargets.inventoryRevision }] }), 'RESOURCE_NOT_FOUND');
    await expectCode(offerInventoryService.updateThreshold(pool, contexts.a, securedTargets.inventoryItemId, { threshold: 9, revision: securedTargets.inventoryRevision, idempotency_key: 'foreign-inventory-threshold-denied' }), 'RESOURCE_NOT_FOUND');
    await expectCode(orderService.orderCommand(pool, contexts.a, securedTargets.orderId, { command: 'prepare', package_id: securedTargets.orderPackageId, revision: securedTargets.orderRevision, idempotency_key: 'foreign-order-command-denied' }), 'RESOURCE_NOT_FOUND');
    await expectCode(supportService.addMessage(pool, contexts.a, { conversation_id: securedTargets.conversationId, body: 'foreign tenant write denied', client_message_id: 'foreign-support-message-client', revision: securedTargets.conversationRevision, idempotency_key: 'foreign-support-message-denied' }), 'RESOURCE_NOT_FOUND');
    await expectCode(supportService.rateConversation(pool, contexts.a, securedTargets.conversationId, { score: 5, comment: 'foreign rating denied', revision: securedTargets.conversationRevision, idempotency_key: 'foreign-support-rating-denied' }), 'RESOURCE_NOT_FOUND');
    assert.deepEqual(await snapshot(), before, 'foreign-store mutation denial must leave target, receipt, audit and outbox state unchanged');
};
const prove = async (pool, contexts) => {
    const storeATeam = await teamReadService.listMembersForStoreScope(pool, contexts.a, { limit: 50 });
    assert.deepEqual(storeATeam.map((member) => member.id), [contexts.a.membershipId]);
    const foreignStoreTeam = await teamReadService.listMembersForStoreScope(pool, contexts.foreign, { limit: 50 });
    assert.deepEqual(foreignStoreTeam.map((member) => member.id), [contexts.foreign.membershipId]);
    const overlappingTeam = await teamReadService.listMembersForStoreScope(pool, { ...contexts.a, storeIds: [...contexts.a.storeIds, ...contexts.foreign.storeIds] }, { limit: 50 });
    assert.deepEqual(overlappingTeam.map((member) => member.id), [contexts.a.membershipId, contexts.foreign.membershipId]);
    const updatedStore = await storeService.updateStore(pool, contexts.a, contexts.a.storeIds[0], { description: 'Safe profile', revision: 1, idempotency_key: 'store-update-a' });
    assert.equal(updatedStore.store.description, 'Safe profile');
    const offerCreated = await offerInventoryService.createOffer(pool, contexts.a, { product_id: 1, seller_sku: 'A-1', price_minor: 10000, currency: 'TRY', initial_quantity: 10, idempotency_key: 'offer-create-a' });
    const offer = offerCreated.offer;
    const foreignOffer = (await offerInventoryService.createOffer(pool, contexts.foreign, { product_id: 2, seller_sku: 'A-FOREIGN-1', price_minor: 5000, currency: 'TRY', initial_quantity: 7, idempotency_key: 'offer-create-a-foreign' })).offer;
    await expectCode(offerInventoryService.loadOffer(pool, contexts.b, offer.id), 'RESOURCE_NOT_FOUND');
    const activated = await offerInventoryService.offerCommand(pool, contexts.a, offer.id, { command: 'publish', revision: offer.revision, idempotency_key: 'offer-publish-a' });
    const firstAdjustment = await offerInventoryService.adjustInventory(pool, contexts.a, { idempotency_key: 'inventory-adjust-a', items: [{ inventory_item_id: activated.offer.inventory.id, delta: -2, reason_code: 'sale', revision: activated.offer.inventory.revision }] });
    assert.equal(firstAdjustment.inventory[0].quantity, 8);
    const replay = await offerInventoryService.adjustInventory(pool, contexts.a, { idempotency_key: 'inventory-adjust-a', items: [{ inventory_item_id: activated.offer.inventory.id, delta: -2, reason_code: 'sale', revision: activated.offer.inventory.revision }] });
    assert.equal(replay.reused, true);
    const beforeRace = (await offerInventoryService.readInventory(pool, contexts.a))[0];
    const race = await Promise.allSettled([
        offerInventoryService.adjustInventory(pool, contexts.a, { idempotency_key: 'inventory-race-a1', items: [{ inventory_item_id: beforeRace.id, delta: 1, reason_code: 'count', revision: beforeRace.revision }] }),
        offerInventoryService.adjustInventory(pool, contexts.a, { idempotency_key: 'inventory-race-a2', items: [{ inventory_item_id: beforeRace.id, delta: 1, reason_code: 'count', revision: beforeRace.revision }] })
    ]);
    assert.equal(race.filter((entry) => entry.status === 'fulfilled').length, 1, 'only one stale stock adjustment may succeed');
    await expectCode(offerInventoryService.adjustInventory(pool, contexts.a, { idempotency_key: 'inventory-negative-a', items: [{ inventory_item_id: beforeRace.id, delta: -999, reason_code: 'count', revision: beforeRace.revision + 1 }] }), 'NEGATIVE_STOCK_FORBIDDEN');
    const sellerOrder = await query(pool, 'INSERT INTO seller_orders (organization_id, store_id, canonical_order_id, currency, gross_minor) VALUES ($1, $2, 1, $3, 10000) RETURNING id', [contexts.a.organizationId, contexts.a.storeIds[0], 'TRY']);
    const sellerOrderB = await query(pool, 'INSERT INTO seller_orders (organization_id, store_id, canonical_order_id, currency, gross_minor) VALUES ($1, $2, 1, $3, 5000) RETURNING id', [contexts.b.organizationId, contexts.b.storeIds[0], 'TRY']);
    const sellerOrderForeign = await query(pool, 'INSERT INTO seller_orders (organization_id, store_id, canonical_order_id, currency, gross_minor) VALUES ($1, $2, 1, $3, 7500) RETURNING id', [contexts.foreign.organizationId, contexts.foreign.storeIds[0], 'TRY']);
    await query(pool, 'INSERT INTO seller_order_items (organization_id, seller_order_id, offer_id, variant_id, product_id, quantity, unit_price_minor) VALUES ($1, $2, $3, $4, 1, 1, 10000)', [contexts.a.organizationId, Number(sellerOrder.rows[0].id), offer.id, offer.variant.id]);
    const packageRow = await query(pool, 'INSERT INTO seller_fulfillment_packages (organization_id, store_id, seller_order_id) VALUES ($1, $2, $3) RETURNING id', [contexts.a.organizationId, contexts.a.storeIds[0], Number(sellerOrder.rows[0].id)]);
    const foreignPackageRow = await query(pool, 'INSERT INTO seller_fulfillment_packages (organization_id, store_id, seller_order_id) VALUES ($1, $2, $3) RETURNING id', [contexts.foreign.organizationId, contexts.foreign.storeIds[0], Number(sellerOrderForeign.rows[0].id)]);
    const readA = await orderService.readOrder(pool, contexts.a, Number(sellerOrder.rows[0].id));
    assert.equal(readA.items.length, 1);
    await expectCode(orderService.readOrder(pool, contexts.b, Number(sellerOrder.rows[0].id)), 'RESOURCE_NOT_FOUND');
    const prepared = await orderService.orderCommand(pool, contexts.a, readA.id, { command: 'prepare', package_id: Number(packageRow.rows[0].id), revision: readA.revision, idempotency_key: 'prepare-a' });
    const shipped = await orderService.orderCommand(pool, contexts.a, readA.id, { command: 'ship', package_id: Number(packageRow.rows[0].id), carrier_name: 'Local', tracking_number: 'TRACK-1', revision: prepared.order.revision, idempotency_key: 'ship-a' });
    assert.equal(shipped.order.status, 'shipped');
    await expectCode(orderService.orderCommand(pool, contexts.a, readA.id, { command: 'prepare', package_id: Number(packageRow.rows[0].id), revision: shipped.order.revision, idempotency_key: 'invalid-state-a' }), 'INVALID_STATE_TRANSITION');
    await query(pool, "INSERT INTO seller_returns (organization_id, store_id, seller_order_id, canonical_return_id) VALUES ($1, $2, $3, 1)", [contexts.a.organizationId, contexts.a.storeIds[0], readA.id]);
    assert.equal((await orderService.listReturns(pool, contexts.a)).length, 1);
    assert.equal((await orderService.listReturns(pool, contexts.b)).length, 0);
    await query(pool, "INSERT INTO seller_ledger_entries (organization_id, store_id, seller_order_id, entry_type, balance_bucket, amount_minor, currency, source_type, source_id) VALUES ($1, $2, $3, 'sale', 'available', 10000, 'TRY', 'order', 'sale-1'), ($1, $2, $3, 'commission', 'available', -1000, 'TRY', 'order', 'commission-1'), ($1, $2, $3, 'refund', 'available', -500, 'TRY', 'return', 'refund-1')", [contexts.a.organizationId, contexts.a.storeIds[0], readA.id]);
    const cursor = await query(pool, 'SELECT MAX(id) AS id FROM seller_ledger_entries WHERE organization_id = $1', [contexts.a.organizationId]);
    await query(pool, "INSERT INTO seller_settlements (organization_id, store_id, currency, ledger_through_id, gross_minor, commission_minor, refund_minor, net_minor) VALUES ($1, $2, 'TRY', $3, 10000, 1000, 500, 8500)", [contexts.a.organizationId, contexts.a.storeIds[0], Number(cursor.rows[0].id)]);
    const finance = await financeService.financeSummary(pool, contexts.a, { currency: 'TRY' });
    assert.deepEqual({ gross: finance.gross_minor, commission: finance.commission_minor, refund: finance.refund_minor, net: finance.net_receivable_minor }, { gross: 10000, commission: 1000, refund: 500, net: 8500 });
    assert.equal((await financeService.listLedger(pool, contexts.b, { currency: 'TRY' })).length, 0);
    const support = await supportService.createConversation(pool, contexts.a, { category: 'billing', subject: 'Need local help', body: 'No external provider', client_message_id: 'support-message-a', idempotency_key: 'support-create-a' });
    const foreignSupport = await supportService.createConversation(pool, contexts.foreign, { category: 'technical', subject: 'Foreign store fixture', body: 'Synthetic foreign store support', client_message_id: 'support-message-foreign', idempotency_key: 'support-create-foreign' });
    await proveForeignStoreMutationMatrix(pool, contexts, {
        storeId: contexts.foreign.storeIds[0], storeRevision: 1,
        offerId: foreignOffer.id, offerRevision: foreignOffer.revision,
        inventoryItemId: foreignOffer.inventory.id, inventoryRevision: foreignOffer.inventory.revision,
        orderId: Number(sellerOrderForeign.rows[0].id), orderRevision: 1, orderPackageId: Number(foreignPackageRow.rows[0].id),
        conversationId: foreignSupport.conversation.id, conversationRevision: foreignSupport.conversation.revision
    });
    assert.equal((await supportService.listConversations(pool, contexts.b)).length, 0);
    await query(pool, 'UPDATE seller_support_conversations SET status = $1, revision = revision + 1, closed_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3', ['closed', contexts.a.organizationId, support.conversation.id]);
    const closed = await supportService.loadConversation(pool, contexts.a, support.conversation.id);
    const rating = await supportService.rateConversation(pool, contexts.a, closed.id, { score: 5, comment: 'Safe', revision: closed.revision, idempotency_key: 'support-rate-a' });
    assert.equal(rating.rating.rated, true);
    await assert.rejects(query(pool, 'UPDATE seller_ledger_entries SET amount_minor = 1 WHERE organization_id = $1', [contexts.a.organizationId]));
    const audit = await query(pool, 'SELECT COUNT(*)::integer AS count FROM seller_audit_events WHERE organization_id = $1', [contexts.a.organizationId]);
    const unattributedAudit = await query(pool, 'SELECT COUNT(*)::integer AS count FROM seller_audit_events WHERE organization_id = $1 AND session_id IS NULL', [contexts.a.organizationId]);
    const outbox = await query(pool, 'SELECT COUNT(*)::integer AS count FROM seller_outbox_events WHERE organization_id = $1', [contexts.a.organizationId]);
    assert.ok(Number(audit.rows[0].count) >= 6);
    assert.equal(Number(unattributedAudit.rows[0].count), 0, 'seller mutations must retain their live session audit identity');
    assert.ok(Number(outbox.rows[0].count) >= 6);
    assert.equal(Number(sellerOrderB.rows[0].id) > 0, true);
};

const run = async () => {
    const config = commandFlags();
    const admin = new Client({ ...config, database: 'postgres' });
    const quotedDatabase = `"${config.database}"`;
    let pool;
    try {
        await admin.connect();
        await query(admin, `DROP DATABASE IF EXISTS ${quotedDatabase}`);
        await query(admin, `CREATE DATABASE ${quotedDatabase}`);
        pool = new Pool(config);
        await query(pool, anchorSchema);
        await apply(pool);
        const contexts = await seedFoundation(pool);
        await prove(pool, contexts);
        await apply(pool);
        const tableCheck = await query(pool, "SELECT COUNT(*)::integer AS count FROM information_schema.tables WHERE table_name IN ('seller_offers', 'seller_orders', 'seller_ledger_entries', 'seller_support_conversations')");
        assert.equal(Number(tableCheck.rows[0].count), 4);
        console.log('sellerWave3MigrationDisposableDbIntegrationSmoke PASS fresh-apply second-apply seller-vs-foreign-store-mutation-matrix tenant inventory order finance support rollback cleanup');
    } finally {
        if (pool) await pool.end().catch(() => {});
        if (admin._connected !== false) {
            await query(admin, `DROP DATABASE IF EXISTS ${quotedDatabase}`).catch(() => {});
            await admin.end().catch(() => {});
        }
    }
};

if (require.main === module) run().catch((error) => { console.error(error.code || 'SELLER_WAVE3_DB_TEST_FAILED'); process.exitCode = 1; });
module.exports = Object.freeze({ run });
