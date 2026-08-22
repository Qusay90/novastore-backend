'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const {
    PublicStoreError,
    loadPublicStoreBySlug,
    loadSellerPublicPreview
} = require('../services/publicStoreProjectionService');
const sellerStoreService = require('../services/sellerStoreService');

const connectionString = String(process.env.MAIN6V_TEST_DATABASE_URL || '').trim();
assert(connectionString, 'MAIN6V_TEST_DATABASE_URL is required.');
const parsed = new URL(connectionString);
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname), 'Main-6V PostgreSQL target must be loopback.');
assert.equal(databaseName, 'novastore_main6v_test', 'Main-6V PostgreSQL target must use the named disposable database.');

const pool = new Pool({ connectionString, application_name: 'novastore_main6v_public_store_test' });
const runTag = `${process.pid}-${Date.now()}`;
const fixtureSlugs = Object.freeze({
    a: `main6v-nova-${runTag}`,
    b: `main6v-diger-${runTag}`,
    empty: `main6v-empty-${runTag}`,
    inactive: `main6v-inactive-${runTag}`,
    unbound: `main6v-unbound-${runTag}`,
    missing: `main6v-missing-${runTag}`
});
const organizationKeys = Object.freeze({
    a: crypto.randomUUID(),
    b: crypto.randomUUID(),
    empty: crypto.randomUUID(),
    inactive: crypto.randomUUID()
});

const seed = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const users = await client.query(
            `INSERT INTO users (full_name, email, password)
             VALUES
                ('Main6V Seller A', $1, 'not-used'),
                ('Main6V Seller B', $2, 'not-used'),
                ('Main6V Customer', $3, 'not-used')
             RETURNING id, email`,
            [`main6v-seller-a-${runTag}@local.invalid`, `main6v-seller-b-${runTag}@local.invalid`, `main6v-customer-${runTag}@local.invalid`]
        );
        const userByEmail = new Map(users.rows.map((row) => [row.email, Number(row.id)]));
        const sellerUserA = userByEmail.get(`main6v-seller-a-${runTag}@local.invalid`);
        const sellerUserB = userByEmail.get(`main6v-seller-b-${runTag}@local.invalid`);
        const customerUser = userByEmail.get(`main6v-customer-${runTag}@local.invalid`);
        const stores = await client.query(
            `INSERT INTO stores (name, slug, is_active)
             VALUES
                ('Main6V Platform A', $1, TRUE),
                ('Main6V Platform B', $2, TRUE),
                ('Main6V Empty', $3, TRUE),
                ('Main6V Inactive', $4, FALSE),
                ('Main6V Unbound', $5, TRUE)
             RETURNING id, slug`,
            [fixtureSlugs.a, fixtureSlugs.b, fixtureSlugs.empty, fixtureSlugs.inactive, fixtureSlugs.unbound]
        );
        const bySlug = new Map(stores.rows.map((row) => [row.slug, Number(row.id)]));
        const organizations = await client.query(
            `INSERT INTO seller_organizations (external_key, display_name)
             VALUES
                ($1, 'Main6V Organization A'),
                ($2, 'Main6V Organization B'),
                ($3, 'Main6V Organization Empty'),
                ($4, 'Main6V Organization Inactive')
             RETURNING id, external_key`,
            [organizationKeys.a, organizationKeys.b, organizationKeys.empty, organizationKeys.inactive]
        );
        const orgByKey = new Map(organizations.rows.map((row) => [row.external_key, Number(row.id)]));
        const orgA = orgByKey.get(organizationKeys.a);
        const orgB = orgByKey.get(organizationKeys.b);
        const orgEmpty = orgByKey.get(organizationKeys.empty);
        const orgInactive = orgByKey.get(organizationKeys.inactive);
        const role = await client.query("SELECT id FROM seller_roles WHERE organization_id IS NULL AND code = 'owner'");
        const roleId = Number(role.rows[0].id);
        const memberships = await client.query(
            `INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp)
             VALUES
                ($1, $3, $5, $6),
                ($2, $4, $5, $7)
             RETURNING id, organization_id`,
            [orgA, orgB, sellerUserA, sellerUserB, roleId, crypto.randomUUID(), crypto.randomUUID()]
        );
        const memberA = Number(memberships.rows.find((row) => Number(row.organization_id) === orgA).id);
        const memberB = Number(memberships.rows.find((row) => Number(row.organization_id) === orgB).id);
        const sellerStores = await client.query(
            `INSERT INTO seller_stores (organization_id, legacy_store_id, display_name)
             VALUES
                ($1, $5, 'Nova Stil'),
                ($2, $6, 'Diğer Mağaza'),
                ($3, $7, 'Boş Mağaza'),
                ($4, $8, 'Kapalı Mağaza')
             RETURNING id, organization_id`,
            [
                orgA,
                orgB,
                orgEmpty,
                orgInactive,
                bySlug.get(fixtureSlugs.a),
                bySlug.get(fixtureSlugs.b),
                bySlug.get(fixtureSlugs.empty),
                bySlug.get(fixtureSlugs.inactive)
            ]
        );
        const sellerStoreByOrg = new Map(sellerStores.rows.map((row) => [Number(row.organization_id), Number(row.id)]));
        const sellerStoreA = sellerStoreByOrg.get(orgA);
        const sellerStoreB = sellerStoreByOrg.get(orgB);
        await client.query(
            `INSERT INTO seller_membership_store_scopes (membership_id, organization_id, store_id)
             VALUES ($1, $2, $3), ($4, $5, $6)`,
            [memberA, orgA, sellerStoreA, memberB, orgB, sellerStoreB]
        );
        await client.query(
            `INSERT INTO seller_store_profiles (organization_id, store_id, description, shipping_policy, return_policy, operational_status)
             VALUES
                ($1, $5, 'Yerel teknoloji mağazası', 'Saat 15.00 öncesi aynı gün kargo', '14 gün içinde iade', 'open'),
                ($2, $6, 'Diğer tenant mağazası', '2 iş gününde kargo', '10 gün içinde iade', 'open'),
                ($3, $7, 'Henüz ürünü olmayan mağaza', 'Standart teslimat', '14 gün içinde iade', 'open'),
                ($4, $8, 'Platform kaydı kapalı mağaza', 'Teslimat yok', 'İade yok', 'open')`,
            [orgA, orgB, orgEmpty, orgInactive, sellerStoreA, sellerStoreB, sellerStoreByOrg.get(orgEmpty), sellerStoreByOrg.get(orgInactive)]
        );
        const products = await client.query(
            `INSERT INTO products (name, description, price, old_price, stock, image_url, category, categories, publication_status, is_customer_visible, store_id)
             VALUES
                ('Zümrüt Krep Ferace Takım', 'Günlük kullanıma uygun rahat takım', 3499.90, 3999.90, 14, '/uploads/local-products/zumrut-krep-ferace-takim.jpg', 'P4D Synthetic Catalog', ARRAY['P4D Synthetic Catalog'], 'active', TRUE, $1),
                ('Yıldızlı Tüllü Kız Çocuk Takım', 'Özel günler için yıldız detaylı takım', 2899.00, NULL, 8, '/uploads/local-products/yildizli-tullu-gri-kiz-cocuk-takim.jpg', 'P4D Synthetic Catalog', ARRAY['P4D Synthetic Catalog'], 'active', TRUE, $1),
                ('Gri Design Şortlu Erkek Çocuk Takım', 'Günlük hareket özgürlüğü sağlayan takım', 849.00, NULL, 0, '/uploads/local-products/gri-design-sortlu-erkek-cocuk-takim.jpg', 'P4D Synthetic Catalog', ARRAY['P4D Synthetic Catalog'], 'active', TRUE, $1),
                ('Taslak Ürün', 'Müşteriye çıkmamalı', 1.00, NULL, 1, NULL, 'P4D Synthetic Catalog', ARRAY['P4D Synthetic Catalog'], 'draft', TRUE, $1),
                ('Diğer Mağaza Ürünü', 'A mağazasına sızmamalı', 9999.00, NULL, 3, NULL, 'P4D Synthetic Catalog', ARRAY['P4D Synthetic Catalog'], 'active', TRUE, $2)
             RETURNING id, name`,
            [bySlug.get(fixtureSlugs.a), bySlug.get(fixtureSlugs.b)]
        );
        const productByName = new Map(products.rows.map((row) => [row.name, Number(row.id)]));
        await client.query(
            `INSERT INTO product_media (product_id, media_url, media_type, is_main, sort_order)
             VALUES
                ($1, '/uploads/local-products/zumrut-krep-ferace-takim.jpg', 'image', TRUE, 0),
                ($2, '/uploads/local-products/yildizli-tullu-gri-kiz-cocuk-takim.jpg', 'image', TRUE, 0),
                ($3, '/uploads/local-products/gri-design-sortlu-erkek-cocuk-takim.jpg', 'image', TRUE, 0)`,
            [
                productByName.get('Zümrüt Krep Ferace Takım'),
                productByName.get('Yıldızlı Tüllü Kız Çocuk Takım'),
                productByName.get('Gri Design Şortlu Erkek Çocuk Takım')
            ]
        );
        await client.query(
            `INSERT INTO reviews (product_id, user_id, rating, comment, status)
             VALUES ($1, $2, 5, 'Yerel doğrulama yorumu', 'PUBLISHED')`,
            [productByName.get('Zümrüt Krep Ferace Takım'), customerUser]
        );
        await client.query('COMMIT');
        return Object.freeze({
            orgA,
            memberA,
            sellerStoreA,
            sellerStoreB,
            sellerUserA,
            platformStoreA: bySlug.get(fixtureSlugs.a),
            platformStoreB: bySlug.get(fixtureSlugs.b)
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const run = async () => {
    const fixture = await seed();
    const contextA = Object.freeze({
        organizationId: fixture.orgA,
        membershipId: fixture.memberA,
        userId: fixture.sellerUserA,
        storeIds: [fixture.sellerStoreA],
        sessionId: null
    });
    const publicBefore = await loadPublicStoreBySlug(fixtureSlugs.a, { queryable: pool });
    assert.equal(publicBefore.store.name, 'Nova Stil');
    assert.deepEqual(publicBefore.products.map((product) => product.name), [
        'Yıldızlı Tüllü Kız Çocuk Takım',
        'Zümrüt Krep Ferace Takım',
        'Gri Design Şortlu Erkek Çocuk Takım'
    ]);
    assert.equal(publicBefore.products.some((product) => product.name === 'Diğer Mağaza Ürünü'), false);
    assert.equal(publicBefore.products.some((product) => product.name === 'Taslak Ürün'), false);
    const reviewed = publicBefore.products.find((product) => product.name === 'Zümrüt Krep Ferace Takım');
    assert.equal(reviewed.average_rating, 5);
    assert.equal(reviewed.review_count, 1);

    const sellerBefore = await loadSellerPublicPreview(pool, contextA, fixture.sellerStoreA);
    assert.deepEqual(sellerBefore, publicBefore);
    await assert.rejects(
        () => loadSellerPublicPreview(pool, contextA, fixture.sellerStoreB),
        (error) => error instanceof PublicStoreError && error.code === 'RESOURCE_NOT_FOUND'
    );

    const updated = await sellerStoreService.updateStore(pool, contextA, fixture.sellerStoreA, {
        display_name: 'Nova Stil Güncel',
        description: 'Seller kaydından yenilenen müşteri açıklaması',
        shipping_policy: 'Saat 16.00 öncesi aynı gün ücretsiz kargo',
        return_policy: '30 gün içinde NovaStore destekli iade',
        revision: 1,
        idempotency_key: `main6v-public-store-refresh-${runTag}`
    });
    assert.equal(updated.store.revision, 2);
    const publicAfter = await loadPublicStoreBySlug(fixtureSlugs.a, { queryable: pool });
    assert.equal(publicAfter.store.name, 'Nova Stil Güncel');
    assert.equal(publicAfter.store.description, 'Seller kaydından yenilenen müşteri açıklaması');
    assert.equal(publicAfter.store.shipping_summary, 'Saat 16.00 öncesi aynı gün ücretsiz kargo');
    assert.equal(publicAfter.store.return_summary, '30 gün içinde NovaStore destekli iade');
    assert.deepEqual(publicAfter.products, publicBefore.products);
    const sellerAfter = await loadSellerPublicPreview(pool, contextA, fixture.sellerStoreA);
    assert.deepEqual(sellerAfter, publicAfter);

    const empty = await loadPublicStoreBySlug(fixtureSlugs.empty, { queryable: pool });
    assert.equal(empty.products.length, 0);
    for (const slug of [fixtureSlugs.inactive, fixtureSlugs.unbound, fixtureSlugs.missing]) {
        await assert.rejects(
            () => loadPublicStoreBySlug(slug, { queryable: pool }),
            (error) => error instanceof PublicStoreError && error.code === 'STORE_NOT_FOUND',
            slug
        );
    }
    const ownershipEvidence = await pool.query(
        `SELECT
            (SELECT COUNT(*)::INTEGER FROM products WHERE store_id = $1 AND publication_status = 'active' AND is_customer_visible = TRUE AND deleted_at IS NULL) AS store_a_products,
            (SELECT COUNT(*)::INTEGER FROM products WHERE store_id = $4 AND name = 'Diğer Mağaza Ürünü') AS foreign_products,
            (SELECT COUNT(*)::INTEGER FROM seller_audit_events WHERE organization_id = $2 AND store_id = $3 AND event_type = 'seller.store.updated') AS audit_events,
            (SELECT COUNT(*)::INTEGER FROM seller_outbox_events WHERE organization_id = $2 AND store_id = $3 AND event_type = 'seller.store.updated') AS outbox_events`,
        [fixture.platformStoreA, fixture.orgA, fixture.sellerStoreA, fixture.platformStoreB]
    );
    assert.deepEqual(ownershipEvidence.rows[0], {
        store_a_products: 3,
        foreign_products: 1,
        audit_events: 1,
        outbox_events: 1
    });
    console.log(`public store PostgreSQL integration PASS: slug=${fixtureSlugs.a} sellerStoreId=${fixture.sellerStoreA} products=3 emptySlug=${fixtureSlugs.empty}`);
};

run().finally(async () => {
    await pool.end().catch(() => {});
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
