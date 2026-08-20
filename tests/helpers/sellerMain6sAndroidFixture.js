'use strict';

const bcrypt = require('bcrypt');
const fs = require('node:fs');
const path = require('node:path');
const { Client, Pool } = require('pg');
const registry = require('../../models/sellerWave3MigrationRegistry');
const disposable = require('./sellerWave3DisposableDb');

const fail = (code) => {
    const error = new Error(code);
    error.code = code;
    throw error;
};

const requireFlag = (flag) => {
    if (!process.argv.includes(flag)) fail('SELLER_MAIN6S_FIXTURE_OPT_IN_REQUIRED');
};

const requiredValue = (flag) => {
    const index = process.argv.indexOf(flag);
    if (index < 0 || !process.argv[index + 1]) fail('SELLER_MAIN6S_FIXTURE_CONNECTION_REQUIRED');
    return process.argv[index + 1];
};

const parseConnection = (value) => {
    let url;
    try {
        url = new URL(value);
    } catch (_) {
        fail('SELLER_MAIN6S_FIXTURE_CONNECTION_REJECTED');
    }
    const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const host = url.hostname.replace(/^\[|\]$/gu, '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !database) {
        fail('SELLER_MAIN6S_FIXTURE_CONNECTION_REJECTED');
    }
    return Object.freeze({
        host,
        database,
        port: url.port ? Number(url.port) : 5432,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        ssl: false
    });
};

const authorize = () => {
    for (const flag of [
        '--db-enabled',
        '--allow-db-operation',
        '--allow-migration-apply',
        '--allow-db-cleanup',
        '--prepare-android-fixture'
    ]) requireFlag(flag);
    const connection = parseConnection(requiredValue('--connection'));
    disposable.authorizeMigrationApply({
        allowDbOperation: true,
        applyAuthorization: true,
        connection,
        migrationPaths: disposable.allowedMigrationNames
    });
    disposable.authorizeDisposableDbCleanup({
        allowDbOperation: true,
        cleanupAuthorization: true,
        connection
    });
    return connection;
};

const anchorSchema = `
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT,
    phone TEXT,
    password TEXT,
    full_name TEXT,
    name TEXT
);
CREATE TABLE stores (id BIGINT PRIMARY KEY, owner_user_id INTEGER);
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, total_amount NUMERIC, status TEXT, items JSONB);
CREATE TABLE returns (id INTEGER PRIMARY KEY, order_id INTEGER, user_id INTEGER, reason_code TEXT, status TEXT);
`;

const query = (target, sql, values = []) => target.query(sql, values);

const applyMigrations = async (pool) => {
    const descriptors = registry.verifyMigrationFiles();
    for (const descriptor of descriptors) {
        const sql = fs.readFileSync(path.resolve(__dirname, '..', '..', descriptor.relativePath), 'utf8');
        await query(pool, sql);
    }
};

const roleId = async (pool, code) => {
    const result = await query(
        pool,
        'SELECT id FROM seller_roles WHERE organization_id IS NULL AND code = $1 AND is_active = TRUE',
        [code]
    );
    if (!result.rows?.[0]) fail('SELLER_MAIN6S_FIXTURE_ROLE_MISSING');
    return Number(result.rows[0].id);
};

const seedFixture = async (pool) => {
    const passwordHash = await bcrypt.hash('SellerLocal2026', 10);
    await query(pool, `INSERT INTO users (id, email, phone, password, full_name, name) VALUES
        (1, 'owner@wave4.local.test', NULL, $1, 'Wave 4 Sahibi', 'Wave 4 Sahibi'),
        (2, 'manager@wave4.local.test', NULL, $1, 'Wave 4 Yönetici', 'Wave 4 Yönetici'),
        (3, 'operator@wave4.local.test', NULL, $1, 'Wave 4 Operasyon', 'Wave 4 Operasyon'),
        (4, 'foreign@wave4.local.test', NULL, $1, 'Yabancı Mağaza Sahibi', 'Yabancı Mağaza Sahibi')`, [passwordHash]);
    await query(pool, 'INSERT INTO stores (id, owner_user_id) VALUES (101, 1), (303, 4)');
    await query(pool, "INSERT INTO products (id, name) VALUES (1, 'Yerel UAT Ürünü'), (2, 'Yabancı UAT Ürünü')");
    await query(pool, `INSERT INTO orders (id, user_id, total_amount, status, items) VALUES
        (1, 1, 100, 'pending', '[]'::jsonb),
        (2, 4, 75, 'pending', '[]'::jsonb)`);

    const organization = await query(pool, `INSERT INTO seller_organizations (external_key, display_name)
        VALUES ('44444444-4444-4444-8444-444444444444', 'NovaStore Wave 4 Organizasyonu') RETURNING id`);
    const organizationId = Number(organization.rows[0].id);
    const roles = Object.freeze({
        owner: await roleId(pool, 'owner'),
        manager: await roleId(pool, 'manager'),
        operator: await roleId(pool, 'operator')
    });
    const memberships = [];
    for (const [userId, role, stamp] of [
        [1, roles.owner, '11111111-1111-4111-8111-111111111112'],
        [2, roles.manager, '22222222-2222-4222-8222-222222222223'],
        [3, roles.operator, '33333333-3333-4333-8333-333333333334'],
        [4, roles.owner, '44444444-4444-4444-8444-444444444445']
    ]) {
        const membership = await query(
            pool,
            'INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp) VALUES ($1, $2, $3, $4) RETURNING id',
            [organizationId, userId, role, stamp]
        );
        memberships.push(Number(membership.rows[0].id));
    }
    const ownStore = await query(pool, `INSERT INTO seller_stores (organization_id, legacy_store_id, display_name)
        VALUES ($1, 101, 'NovaStore Wave 4 Mağazası') RETURNING id, revision`, [organizationId]);
    const foreignStore = await query(pool, `INSERT INTO seller_stores (organization_id, legacy_store_id, display_name)
        VALUES ($1, 303, 'Yabancı Store UAT') RETURNING id, revision`, [organizationId]);
    const ownStoreId = Number(ownStore.rows[0].id);
    const foreignStoreId = Number(foreignStore.rows[0].id);
    await query(pool, `INSERT INTO seller_membership_store_scopes (membership_id, organization_id, store_id) VALUES
        ($1, $5, $6), ($2, $5, $6), ($3, $5, $6), ($4, $5, $7)`,
    [memberships[0], memberships[1], memberships[2], memberships[3], organizationId, ownStoreId, foreignStoreId]);

    const createOffer = async (storeId, productId, sku, quantity) => {
        const offer = await query(pool, 'INSERT INTO seller_offers (organization_id, store_id, product_id) VALUES ($1, $2, $3) RETURNING id, revision', [organizationId, storeId, productId]);
        const offerId = Number(offer.rows[0].id);
        const variant = await query(pool, `INSERT INTO seller_offer_variants
            (organization_id, store_id, offer_id, seller_sku, price_minor, currency)
            VALUES ($1, $2, $3, $4, 10000, 'TRY') RETURNING id`, [organizationId, storeId, offerId, sku]);
        const inventory = await query(pool, `INSERT INTO seller_inventory_items
            (organization_id, store_id, variant_id, quantity, low_stock_threshold)
            VALUES ($1, $2, $3, $4, 2) RETURNING id, revision`, [organizationId, storeId, Number(variant.rows[0].id), quantity]);
        return Object.freeze({
            offerId,
            offerRevision: Number(offer.rows[0].revision),
            variantId: Number(variant.rows[0].id),
            inventoryItemId: Number(inventory.rows[0].id),
            inventoryRevision: Number(inventory.rows[0].revision)
        });
    };
    const ownOffer = await createOffer(ownStoreId, 1, 'UAT-OWN-1', 12);
    const foreignOffer = await createOffer(foreignStoreId, 2, 'UAT-FOREIGN-1', 7);

    const createOrder = async (storeId, canonicalOrderId, fixtureOffer, grossMinor) => {
        const order = await query(pool, `INSERT INTO seller_orders
            (organization_id, store_id, canonical_order_id, currency, gross_minor)
            VALUES ($1, $2, $3, 'TRY', $4) RETURNING id, revision`, [organizationId, storeId, canonicalOrderId, grossMinor]);
        const orderId = Number(order.rows[0].id);
        await query(pool, `INSERT INTO seller_order_items
            (organization_id, seller_order_id, offer_id, variant_id, product_id, quantity, unit_price_minor)
            VALUES ($1, $2, $3, $4, $5, 1, $6)`, [organizationId, orderId, fixtureOffer.offerId, fixtureOffer.variantId, canonicalOrderId, grossMinor]);
        const pkg = await query(pool, `INSERT INTO seller_fulfillment_packages
            (organization_id, store_id, seller_order_id) VALUES ($1, $2, $3) RETURNING id`, [organizationId, storeId, orderId]);
        return Object.freeze({ orderId, orderRevision: Number(order.rows[0].revision), packageId: Number(pkg.rows[0].id) });
    };
    await createOrder(ownStoreId, 1, ownOffer, 10000);
    const foreignOrder = await createOrder(foreignStoreId, 2, foreignOffer, 7500);

    await query(pool, `INSERT INTO seller_ledger_entries
        (organization_id, store_id, seller_order_id, entry_type, balance_bucket, amount_minor, currency, source_type, source_id)
        SELECT $1, $2, seller_order.id, 'sale', 'available', 10000, 'TRY', 'order', 'android-uat-sale'
          FROM seller_orders seller_order WHERE seller_order.organization_id = $1 AND seller_order.store_id = $2 LIMIT 1`, [organizationId, ownStoreId]);
    const foreignConversation = await query(pool, `INSERT INTO seller_support_conversations
        (organization_id, store_id, category, subject)
        VALUES ($1, $2, 'technical', 'Yabancı UAT konuşması') RETURNING id, revision`,
    [organizationId, foreignStoreId]);

    return Object.freeze({
        organizationId,
        ownStoreId,
        foreignStoreId,
        foreignStoreRevision: Number(foreignStore.rows[0].revision),
        foreignOfferId: foreignOffer.offerId,
        foreignOfferRevision: foreignOffer.offerRevision,
        foreignInventoryItemId: foreignOffer.inventoryItemId,
        foreignInventoryRevision: foreignOffer.inventoryRevision,
        foreignOrderId: foreignOrder.orderId,
        foreignOrderRevision: foreignOrder.orderRevision,
        foreignOrderPackageId: foreignOrder.packageId,
        foreignConversationId: Number(foreignConversation.rows[0].id),
        foreignConversationRevision: Number(foreignConversation.rows[0].revision)
    });
};

const run = async () => {
    const connection = authorize();
    const admin = new Client({ ...connection, database: 'postgres' });
    const quotedDatabase = `"${connection.database}"`;
    let pool;
    try {
        await admin.connect();
        await query(admin, `DROP DATABASE IF EXISTS ${quotedDatabase}`);
        await query(admin, `CREATE DATABASE ${quotedDatabase}`);
        pool = new Pool(connection);
        await query(pool, anchorSchema);
        await applyMigrations(pool);
        const fixture = await seedFixture(pool);
        process.stdout.write(`${JSON.stringify(fixture)}\n`);
    } finally {
        if (pool) await pool.end().catch(() => {});
        await admin.end().catch(() => {});
    }
};

if (require.main === module) {
    run().catch((error) => {
        console.error(error?.code || 'SELLER_MAIN6S_FIXTURE_FAILED');
        if (error?.message && error.message !== error.code) console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = Object.freeze({ run });
