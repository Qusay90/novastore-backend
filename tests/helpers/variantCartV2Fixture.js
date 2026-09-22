'use strict';

// Fixture data only. Caller must first create and own the disposable database.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

async function seedVariantCartV2(pool, sensitive = new Set(), { loginPassword } = {}) {
    const databaseName = (await pool.query('SELECT current_database() AS name')).rows[0].name;
    assert(/^novastore_theme_wave1_[a-f0-9]{16}_test$/u.test(databaseName), 'B03 requires an owned disposable database.');
    const auth = require('../../services/authSessionService');
    const passwordHash = loginPassword ? await require('bcrypt').hash(loginPassword, 10) : 'fixture-no-password-login';
    if (loginPassword) { sensitive.add(loginPassword); sensitive.add(passwordHash); }
    const createCustomer = async (label) => {
        const email = `${label}-${crypto.randomUUID()}@example.test`;
        const userId = Number((await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES($1,$2,$3,'customer',TRUE) RETURNING id", [label, email, passwordHash])).rows[0].id);
        const session = await auth.issueAccessSession({ queryable: pool, userId, role: 'customer', principal: 'customer' });
        sensitive.add(session.token);
        return { userId, email, ...session };
    };
    const createStore = async (label, productId, simpleProductId, variantIds) => {
        const organizationId = Number((await pool.query('INSERT INTO seller_organizations(external_key,display_name) VALUES($1,$2) RETURNING id', [crypto.randomUUID(), label])).rows[0].id);
        const storeId = Number((await pool.query('INSERT INTO stores(name,slug) VALUES($1,$2) RETURNING id', [label, label.toLowerCase()])).rows[0].id);
        const sellerStoreId = Number((await pool.query('INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,$3) RETURNING id', [organizationId, storeId, label])).rows[0].id);
        await pool.query("INSERT INTO products(id,name,price,old_price,stock,store_id,publication_status,is_customer_visible,variant_selection_required,image_url) VALUES($1,$2,111,130,200,$3,'active',TRUE,TRUE,'/uploads/local-products/b03-fixture.webp')", [productId, `${label} Variant Product`, storeId]);
        await pool.query("INSERT INTO products(id,name,price,stock,store_id,publication_status,is_customer_visible,variant_selection_required,image_url) VALUES($1,$2,45,100,$3,'active',TRUE,FALSE,'/uploads/local-products/b03-simple.webp')", [simpleProductId, `${label} Simple Product`, storeId]);
        const offerId = Number((await pool.query("INSERT INTO seller_offers(organization_id,store_id,product_id,status) VALUES($1,$2,$3,'active') RETURNING id", [organizationId, sellerStoreId, productId])).rows[0].id);
        for (const [index, variantId] of variantIds.entries()) {
            await pool.query("INSERT INTO seller_offer_variants(id,organization_id,store_id,offer_id,product_id,seller_sku,price_minor,currency,selections,publication_status) VALUES($1,$2,$3,$4,$5,$6,$7,'TRY',$8::jsonb,'published')", [variantId, organizationId, sellerStoreId, offerId, productId, `${label}-${variantId}`, index ? 22500 : 11100, JSON.stringify([{ group: 'Renk', value: index ? 'Mavi' : 'Kırmızı' }])]);
            await pool.query('INSERT INTO seller_inventory_items(organization_id,store_id,variant_id,quantity) VALUES($1,$2,$3,100)', [organizationId, sellerStoreId, variantId]);
        }
        return { organizationId, storeId, sellerStoreId, productId, simpleProductId, variantIds, offerId };
    };
    const a = await createStore('B03-A', 501, 502, [901, 902]);
    const b = await createStore('B03-B', 601, 602, [903]);
    const alice = await createCustomer('b03-alice');
    const bob = await createCustomer('b03-bob');
    const createOrder = async (userId, items, { paid = false } = {}) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await require('../../services/orderService').createPendingPaymentOrder({ client, userId, fullName: 'B03 Test Customer', email: 'b03@example.test', phone: '', address: 'Disposable fixture', cartItems: items, paymentMethod: 'card' });
            // Explicit local settlement fixture; never a provider call or payment UAT.
            if (paid) await client.query("UPDATE orders SET payment_status='PAID' WHERE id=$1", [result.order.id]);
            await client.query('COMMIT');
            return { ...result.order, payment_status: paid ? 'PAID' : result.order.payment_status, pricing: result.pricing };
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    };
    return { a, b, alice, bob, createCustomer, createOrder, auth };
}

module.exports = { seedVariantCartV2 };
