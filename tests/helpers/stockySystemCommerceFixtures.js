'use strict';

// Synthetic accepted Seller authority for independent S02 validation.
// These fixtures do not represent Stocky publication or provider settlement.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

module.exports = async ({ pool, sensitive }) => {
    const offers = require('../../services/sellerOfferInventoryService');
    const variants = require('../../services/purchasableVariantService');
    const { calculatePricing } = require('../../services/pricingService');
    const { createPendingPaymentOrderFromPricing } = require('../../services/orderService');
    const { buildCheckoutSalesPartyProjection, materializeSellerOrderProjection } = require('../../services/sellerOrderProjectionService');
    const identityService = require('../../services/sellerPublicLegalIdentityService');
    const ownerRole = Number((await pool.query("SELECT id FROM seller_roles WHERE code='owner' AND organization_id IS NULL")).rows[0].id);
    const adminId = Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES('R21 local admin','r21-admin@example.test','unused','admin',TRUE) RETURNING id")).rows[0].id);
    const contexts = [];
    for (const label of ['A', 'B', 'C']) {
        const userId = Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES($1,$2,'unused','customer',TRUE) RETURNING id", [`R21 ${label}`, `r21-${label.toLowerCase()}@example.test`])).rows[0].id);
        const organizationId = Number((await pool.query('INSERT INTO seller_organizations(external_key,display_name) VALUES($1,$2) RETURNING id', [crypto.randomUUID(), `R21 ${label}`])).rows[0].id);
        const legacyId = Number((await pool.query('INSERT INTO stores(name,slug,owner_user_id,is_active) VALUES($1,$2,$3,TRUE) RETURNING id', [`R21 ${label}`, `r21-${label.toLowerCase()}`, userId])).rows[0].id);
        const storeId = Number((await pool.query('INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,$3) RETURNING id', [organizationId, legacyId, `R21 ${label}`])).rows[0].id);
        const stamp = crypto.randomUUID();
        const membershipId = Number((await pool.query('INSERT INTO seller_memberships(organization_id,user_id,role_id,security_stamp) VALUES($1,$2,$3,$4) RETURNING id', [organizationId, userId, ownerRole, stamp])).rows[0].id);
        await pool.query('INSERT INTO seller_membership_store_scopes(membership_id,organization_id,store_id) VALUES($1,$2,$3)', [membershipId, organizationId, storeId]);
        const sessionId = crypto.randomUUID();
        await pool.query("INSERT INTO seller_sessions(id,user_id,organization_id,membership_id,membership_revision,security_stamp,expires_at) VALUES($1,$2,$3,$4,1,$5,NOW()+INTERVAL '1 hour')", [sessionId, userId, organizationId, membershipId, stamp]);
        const identity = { version: 'r21-v1', publicLegalName: `R21 Synthetic ${label}`, publicTradeName: `R21 ${label}`, publicDisclosureText: 'Disposable local test only' };
        await pool.query("INSERT INTO seller_public_legal_identities(organization_id,version,public_legal_name,public_trade_name,public_disclosure_text,content_sha256,status,created_by_admin_user_id) VALUES($1,$2,$3,$4,$5,$6,'draft',$7)", [organizationId, identity.version, identity.publicLegalName, identity.publicTradeName, identity.publicDisclosureText, identityService.buildSellerPublicLegalIdentityContentSha256(identity), adminId]);
        await pool.query("UPDATE seller_public_legal_identities SET status='approved',approved_by_admin_user_id=$2,approved_at=NOW(),revision=revision+1 WHERE organization_id=$1", [organizationId, adminId]);
        const context = { label, organizationId, userId, membershipId, sessionId, storeId, storeIds: [storeId], legacyId };
        context.products = [];
        for (const kind of ['simple', 'variant']) {
            const sku = `R21-${label}-${kind.toUpperCase()}`;
            const productId = Number((await pool.query("INSERT INTO products(name,price,stock,store_id,publication_status,is_customer_visible,sku,normalized_sku) VALUES($1,123.45,20,$2,'active',TRUE,$3,$3) RETURNING id", [sku, legacyId, sku])).rows[0].id);
            const revision = Number((await pool.query('SELECT revision FROM products WHERE id=$1', [productId])).rows[0].revision);
            const created = await offers.createOffer(pool, context, { product_id: productId, seller_sku: sku, price_minor: 12345, currency: 'TRY', initial_quantity: 20, commerce_revision: revision, idempotency_key: `${sku}-attach` });
            const published = await offers.offerCommand(pool, context, created.offer.id, { command: 'publish', revision: created.offer.revision, idempotency_key: `${sku}-publish` });
            const product = { id: productId, kind, sku, offerId: published.offer.id, variantId: null, priceMinor: 12345 };
            if (kind === 'variant') {
                const commerceRevision = Number((await pool.query('SELECT revision FROM products WHERE id=$1', [productId])).rows[0].revision);
                let variant = (await variants.mutate(pool, context, product.offerId, null, { sku: `${sku}-M`, selections: [{ group: 'Size', value: 'M' }], price_minor: 23456, quantity: 20, commerce_revision: commerceRevision, idempotency_key: `${sku}-variant-create` })).variant;
                variant = (await variants.mutate(pool, context, product.offerId, variant.id, { publication_status: 'published', commerce_revision: variant.commerce_revision, idempotency_key: `${sku}-variant-publish` })).variant;
                product.variantId = variant.id;
                product.sku = variant.sku;
                product.priceMinor = 23456;
            }
            context.products.push(product);
        }
        contexts.push(context);
    }

    const createOrder = async (context, { kind = 'simple', quantity = 1, rollback = false } = {}) => {
        const product = context.products.find(item => item.kind === kind);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const pricing = await calculatePricing({ client, cartItems: [{ id: product.id, ...(product.variantId ? { variant_id: product.variantId } : {}), quantity }] });
            const sales = await buildCheckoutSalesPartyProjection(client, pricing.items);
            assert.equal(sales.sellerProjection.length, 1);
            assert.equal(sales.sellerProjection[0].storeId, context.storeId);
            // Sentinel values make accidental recipient disclosure detectable.
            const recipient = { fullName: 'R21-PRIVATE-RECIPIENT', email: 'r21-private@example.test', phone: '+905000000021', address: 'R21-PRIVATE-ADDRESS' };
            Object.values(recipient).forEach(value => sensitive.add(value));
            const result = await createPendingPaymentOrderFromPricing({ client, pricing, userId: context.userId, ...recipient });
            await materializeSellerOrderProjection(client, result.order.id, sales.sellerProjection);
            await client.query("INSERT INTO payments(order_id,provider,payment_ref,amount,currency,status,raw_request,raw_response) VALUES($1,'manual',$2,$3,'TRY','PENDING',$4::jsonb,'{}'::jsonb)", [result.order.id, `R21-local-${result.order.id}`, pricing.totals.total, JSON.stringify({ stockReserved: false, finalizesOnWebhook: false })]);
            await client.query(rollback ? 'ROLLBACK' : 'COMMIT');
            return { id: Number(result.order.id), context, product, items: result.order.items, paymentStatus: result.order.payment_status };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    };

    return { contexts, a: contexts[0], b: contexts[1], c: contexts[2], createOrder };
};
