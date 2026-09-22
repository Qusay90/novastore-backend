'use strict';

const { buildPublicProductSqlPredicate } = require('../constants/productVisibility');
const variants = require('./purchasableVariantService');
const MAX_LINES = 200;
const MAX_QUANTITY = 999;
const fail = (code, statusCode = 400, extra = {}) => {
    throw Object.assign(new Error(code), { code, statusCode, ...extra });
};
const positiveId = (value) => {
    if (!['number', 'string'].includes(typeof value) || !/^[1-9]\d{0,9}$/.test(String(value)) || Number(value) > 2147483647) fail('CART_ID_INVALID');
    return Number(value);
};
const quantity = (value) => {
    if (!Number.isInteger(value) || value < 1 || value > MAX_QUANTITY) fail('CART_QUANTITY_INVALID');
    return value;
};
const lineKey = (item) => `${item.storeId}:${item.productId}:${item.variantId ?? 'none'}`;
const header = (headers, name) => String(headers?.[name.toLowerCase()] ?? '').trim();
const schemaOf = (payload, column = 1) => {
    const supplied = [payload?.cartSchemaVersion, payload?.version].filter(x => x !== undefined);
    if (supplied.some(x => ![1, 2].includes(x)) || new Set(supplied).size > 1 || ![1, 2].includes(Number(column))) fail('CART_SCHEMA_UNSUPPORTED');
    if (Number(column) === 2 && supplied.some(x => x !== 2)) fail('CART_SCHEMA_UNSUPPORTED');
    return Number(column) === 2 || supplied.includes(2) ? 2 : 1;
};
const capabilities = (headers, body) => {
    const requested = header(headers, 'x-cart-schema-version');
    if (requested && !['1', '2'].includes(requested)) fail('CART_SCHEMA_UNSUPPORTED');
    const suppliedSchema = schemaOf(body?.payload ?? body ?? {});
    const v2 = requested === '2';
    if ((suppliedSchema === 2 || v2) && !(v2 && header(headers, 'x-cart-variant-line-identity') === 'true' && header(headers, 'x-cart-cas') === 'true')) {
        fail('CART_CLIENT_UPGRADE_REQUIRED', 426);
    }
    return v2;
};
const revisionOf = (body) => {
    if (!Number.isSafeInteger(body?.expectedRevision) || body.expectedRevision < 0) fail('CART_REVISION_REQUIRED', 428);
    return body.expectedRevision;
};
const migrationOf = (pending = []) => ({ status: pending.length ? 'REVIEW_REQUIRED' : 'NONE', unresolvedItems: pending });
const copyCheckoutFields = (payload) => {
    const result = {};
    if (payload.selectedAddressId != null) result.selectedAddressId = positiveId(payload.selectedAddressId);
    for (const [field, limit] of [['couponCode', 64], ['paymentMethod', 40]]) {
        if (payload[field] != null) {
            if (typeof payload[field] !== 'string' || payload[field].length > limit) fail('CART_CHECKOUT_FIELD_INVALID');
            result[field] = payload[field].trim();
        }
    }
    return result;
};

async function canonicalLine(client, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('CART_LINE_INVALID');
    const productId = positiveId(input.productId);
    const variantId = input.variantId == null ? null : positiveId(input.variantId);
    const amount = quantity(input.quantity);
    const product = (await client.query(`SELECT p.id, p.name, p.price, p.old_price, p.stock, p.image_url,
        p.store_id, p.variant_selection_required, s.name AS store_name
        FROM products p JOIN stores s ON s.id = p.store_id
        WHERE p.id = $1 AND ${buildPublicProductSqlPredicate('p')}
          AND s.is_active = TRUE AND s.deleted_at IS NULL`, [productId])).rows[0];
    if (!product) fail('CART_PRODUCT_UNAVAILABLE', 409);
    const storeId = positiveId(product.store_id);
    if (input.storeId != null && positiveId(input.storeId) !== storeId) fail('CART_STORE_IDENTITY_MISMATCH', 409);
    let selected;
    if (product.variant_selection_required) {
        if (variantId == null) fail('VARIANT_REQUIRED', 409);
        selected = await variants.resolve(client, productId, variantId);
        if (Number(selected.canonical_store_id) !== storeId) fail('CART_STORE_IDENTITY_MISMATCH', 409);
    } else if (variantId != null) fail('VARIANT_NOT_ALLOWED', 409);
    const price = selected ? Number(selected.price_minor) / 100 : Number(product.price);
    const stock = Number(selected ? selected.quantity : product.stock);
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) fail('CART_PRODUCT_UNAVAILABLE', 409);
    return {
        storeId, storeName: product.store_name, productId, variantId, quantity: amount,
        name: product.name, price, oldPrice: product.old_price == null ? null : Number(product.old_price),
        imageUrl: product.image_url || null, stock,
        variantSelections: selected?.selections || [],
        variantLabel: (selected?.selections || []).map(x => `${x.group}: ${x.value}`).join(' / '),
        unavailable: stock < amount
    };
}

async function canonicalItems(client, inputs, previous = []) {
    if (!Array.isArray(inputs) || inputs.length > MAX_LINES) fail('CART_ITEMS_INVALID');
    const known = new Map(previous.map(x => [lineKey(x), x]));
    const byIdentity = new Map();
    for (const input of inputs) {
        // Only identities and quantity are accepted as inputs. Display fields
        // always come from the canonical product/variant services.
        if (!input || Object.keys(input).some(k => !['productId', 'variantId', 'quantity', 'storeId'].includes(k))) fail('CART_LINE_INVALID');
        let item;
        try { item = await canonicalLine(client, input); }
        catch (error) {
            const key = `${input.storeId}:${input.productId}:${input.variantId ?? 'none'}`;
            // storeId is optional on input. A globally canonical product/variant
            // may recover its store only from this account's saved server row.
            const prior = input.storeId == null
                ? previous.find(saved => saved.productId === Number(input.productId)
                    && saved.variantId === (input.variantId == null ? null : Number(input.variantId)))
                : known.get(key);
            if (!prior || !['CART_PRODUCT_UNAVAILABLE', 'VARIANT_NOT_PURCHASABLE', 'VARIANT_REQUIRED', 'VARIANT_NOT_ALLOWED'].includes(error.code)) throw error;
            // A now-unpublished line remains removable and visible after reload.
            // It cannot be increased or purchased on cached display authority.
            if (quantity(input.quantity) > prior.quantity) throw error;
            item = { ...prior, quantity: input.quantity, unavailable: true, stock: 0 };
        }
        const key = lineKey(item);
        const existing = byIdentity.get(key);
        if (existing) existing.quantity = quantity(existing.quantity + item.quantity);
        else byIdentity.set(key, item);
    }
    return [...byIdentity.values()].map(item => {
        const prior = known.get(lineKey(item));
        if (item.unavailable && item.stock === 0 && prior && item.quantity > prior.quantity) fail('CART_PRODUCT_UNAVAILABLE', 409);
        return { ...item, unavailable: item.unavailable || item.quantity > item.stock };
    });
}

async function readV2(client, row, key) {
    if (!row) return { payload: { cartSchemaVersion: 2, items: [] }, revision: 0, migration: migrationOf(), updatedAt: null, exists: false };
    const schema = schemaOf(row.payload, row.cart_schema_version);
    const revision = Number(row.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) fail('CART_REVISION_INVALID', 503);
    if (schema === 2) {
        const source = row.payload;
        if (source.cartSchemaVersion !== 2 || !Array.isArray(source.items)) fail('CART_SCHEMA_UNSUPPORTED');
        const refreshed = [];
        for (const item of source.items) {
            try { refreshed.push(await canonicalLine(client, item)); }
            catch (error) {
                if (!['CART_PRODUCT_UNAVAILABLE', 'VARIANT_NOT_PURCHASABLE', 'VARIANT_REQUIRED', 'VARIANT_NOT_ALLOWED'].includes(error.code)) throw error;
                refreshed.push({ ...item, unavailable: true, stock: 0 });
            }
        }
        return { payload: { ...source, items: refreshed }, revision, migration: migrationOf(source.pendingLegacyItems || []), updatedAt: row.updated_at, exists: true };
    }
    const payload = row.payload;
    const raw = Array.isArray(payload) ? payload : payload?.items ?? payload?.cartItems ?? [];
    if (!Array.isArray(raw) || raw.length > MAX_LINES) fail('CART_LEGACY_STATE_INVALID', 409);
    const items = [], unresolved = [];
    for (const item of raw) {
        const productId = positiveId(item.productId ?? item.product_id ?? item.id);
        const amount = quantity(item.quantity ?? 1);
        // Persisted legacy explicit identities can be validated. Missing
        // identities on variant-required products are never guessed.
        const candidate = { productId, variantId: item.variantId ?? item.variant_id ?? null, quantity: amount };
        try { items.push(await canonicalLine(client, candidate)); }
        catch (error) {
            if (!['VARIANT_REQUIRED', 'VARIANT_NOT_ALLOWED', 'VARIANT_NOT_PURCHASABLE', 'CART_PRODUCT_UNAVAILABLE'].includes(error.code)) throw error;
            unresolved.push({ productId, quantity: amount, reason: error.code });
        }
    }
    const merged = new Map();
    for (const item of items) {
        const previous = merged.get(lineKey(item));
        if (previous) previous.quantity = quantity(previous.quantity + item.quantity);
        else merged.set(lineKey(item), item);
    }
    return { payload: { cartSchemaVersion: 2, items: [...merged.values()], ...(key === 'checkout' ? copyCheckoutFields(payload) : {}) },
        revision, migration: migrationOf(unresolved), updatedAt: row.updated_at, exists: true };
}

async function saveV2(client, userId, key, payload, revision, original, pending) {
    if (original && schemaOf(original.payload, original.cart_schema_version) === 1) {
        await client.query(`INSERT INTO user_shared_state_v1_archive(user_id,state_key,payload)
            VALUES($1,$2,$3::jsonb) ON CONFLICT(user_id,state_key) DO NOTHING`, [userId, key, JSON.stringify(original.payload)]);
    }
    const saved = { ...payload, pendingLegacyItems: pending };
    const row = (await client.query(`INSERT INTO user_shared_state(user_id,state_key,payload,cart_schema_version,revision,updated_at)
        VALUES($1,$2,$3::jsonb,2,$4,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,state_key) DO UPDATE SET payload=EXCLUDED.payload,cart_schema_version=2,
        revision=EXCLUDED.revision,updated_at=CURRENT_TIMESTAMP RETURNING payload,revision,updated_at`,
    [userId, key, JSON.stringify(saved), revision + 1])).rows[0];
    return { key, exists: true, revision: Number(row.revision), payload: row.payload, migration: migrationOf(pending), updatedAt: row.updated_at };
}

// Optional server-only scope resolver runs on the same locked transaction as
// the canonical cart. HTTP payloads cannot supply or override this function.
async function execute({ database, userId, key, method, headers = {}, body = {}, legacyNormalize, storeScopeResolver }) {
    positiveId(userId);
    if (!['cart', 'checkout'].includes(key)) fail('CART_STATE_KEY_INVALID');
    const v2 = capabilities(headers, body);
    if (method === 'FINALIZE' && (!v2 || key !== 'cart')) fail('CART_CLIENT_UPGRADE_REQUIRED', 426);
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        // One account lock covers cart AND checkout, including absent-row races.
        await client.query('SELECT pg_advisory_xact_lock(73192, $1)', [userId]);
        const scopedStoreId=storeScopeResolver?positiveId((await storeScopeResolver(client)).storeId):null;
        if(scopedStoreId&&!v2)fail('CART_CLIENT_UPGRADE_REQUIRED',426);
        const rows = (await client.query('SELECT state_key,payload,cart_schema_version,revision,updated_at FROM user_shared_state WHERE user_id=$1 ORDER BY state_key FOR UPDATE', [userId])).rows;
        const activeV2 = rows.some(row => schemaOf(row.payload, row.cart_schema_version) === 2);
        const row = rows.find(x => x.state_key === key);
        if (!v2 && activeV2) fail('CART_CLIENT_UPGRADE_REQUIRED', 426);
        if (!v2) {
            if (method === 'GET') {
                const result = { key, exists: Boolean(row), payload: row?.payload || legacyNormalize(key, {}), updatedAt: row?.updated_at || null };
                await client.query('COMMIT'); return result;
            }
            if (method === 'DELETE') {
                await client.query('DELETE FROM user_shared_state WHERE user_id=$1 AND state_key=$2', [userId, key]);
                await client.query('COMMIT'); return { key, exists: false, deleted: true };
            }
            const incoming = body.payload ?? body;
            // A legacy writer must not pass variant data to a lossy normalizer.
            const inputs = Array.isArray(incoming) ? incoming : incoming?.items ?? incoming?.cartItems ?? [];
            if (Array.isArray(inputs) && inputs.some(x => x?.variantId != null || x?.variant_id != null)) fail('CART_CLIENT_UPGRADE_REQUIRED', 426);
            const saved = (await client.query(`INSERT INTO user_shared_state(user_id,state_key,payload,updated_at)
                VALUES($1,$2,$3::jsonb,CURRENT_TIMESTAMP) ON CONFLICT(user_id,state_key)
                DO UPDATE SET payload=EXCLUDED.payload,revision=user_shared_state.revision+1,updated_at=CURRENT_TIMESTAMP
                RETURNING payload,updated_at`, [userId, key, JSON.stringify(legacyNormalize(key, incoming))])).rows[0];
            await client.query('COMMIT'); return { key, exists: true, payload: saved.payload, updatedAt: saved.updated_at };
        }
        const state = await readV2(client, row, key);
        const ownPendingIds=scopedStoreId?new Set((await client.query('SELECT id FROM products WHERE store_id=$1 AND id=ANY($2::int[])',
            [scopedStoreId,state.migration.unresolvedItems.map(item=>item.productId)])).rows.map(item=>Number(item.id))):null;
        const project=result=>{
            if(!scopedStoreId)return result;
            const payload={...result.payload,items:result.payload.items.filter(item=>item.storeId===scopedStoreId)};
            const pending=result.migration.unresolvedItems.filter(item=>ownPendingIds.has(item.productId));
            if(payload.pendingLegacyItems)payload.pendingLegacyItems=pending;
            return{...result,payload,migration:migrationOf(pending)};
        };
        if (method === 'GET') { const result=project({key,...state});await client.query('COMMIT'); return result; }
        const expected = revisionOf(body);
        let order, purchased;
        if (method === 'FINALIZE') {
            const orderId = positiveId(body.orderId);
            if(scopedStoreId){
                const scopedOrder=(await client.query('SELECT items FROM orders WHERE id=$1 AND user_id=$2',[orderId,userId])).rows[0];
                const items=typeof scopedOrder?.items==='string'?JSON.parse(scopedOrder.items):scopedOrder?.items;
                if(!Array.isArray(items)||!items.length||items.some(item=>Number(item.store_id)!==scopedStoreId))fail('CART_ORDER_NOT_FOUND',404);
            }
            const receipt = (await client.query('SELECT order_id FROM user_cart_finalizations WHERE user_id=$1 AND order_id=$2', [userId, orderId])).rows[0];
            if (receipt) { const result=project({key,...state,finalizedOrderId:orderId,reused:true});await client.query('COMMIT'); return result; }
            order = (await client.query('SELECT id,items,payment_status FROM orders WHERE id=$1 AND user_id=$2', [orderId, userId])).rows[0];
            if (!order) fail('CART_ORDER_NOT_FOUND', 404);
            if (order.payment_status !== 'PAID') fail('CART_ORDER_NOT_PAID', 409);
        }
        if (expected !== state.revision) fail('CART_REVISION_CONFLICT', 409, { revision: state.revision });
        let pending = state.migration.unresolvedItems;
        if (body.resolveLegacyProductIds !== undefined) {
            if (!Array.isArray(body.resolveLegacyProductIds)) fail('CART_MIGRATION_RESOLUTION_INVALID');
            const resolved = new Set(body.resolveLegacyProductIds.map(positiveId));
            if(scopedStoreId&&[...resolved].some(id=>!ownPendingIds.has(id)))fail('CART_MIGRATION_RESOLUTION_INVALID');
            if ([...resolved].some(id => !pending.some(x => x.productId === id))) fail('CART_MIGRATION_RESOLUTION_INVALID');
            pending = pending.filter(x => !resolved.has(x.productId));
        }
        let payload;
        if (method === 'FINALIZE') {
            const raw = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            if (!Array.isArray(raw) || raw.length > MAX_LINES) fail('CART_ORDER_IDENTITY_INVALID', 409);
            purchased = new Map();
            for (const item of raw) {
                const line = { storeId: positiveId(item.store_id), productId: positiveId(item.id ?? item.product_id),
                    variantId: item.variant_id == null ? null : positiveId(item.variant_id), quantity: quantity(item.quantity) };
                const key = lineKey(line);
                purchased.set(key, { ...line, quantity: quantity((purchased.get(key)?.quantity || 0) + line.quantity) });
            }
            payload = { ...state.payload, items: state.payload.items.map(item => {
                const remaining = Math.max(0, item.quantity - (purchased.get(lineKey(item))?.quantity || 0));
                return { ...item, quantity: remaining, unavailable: remaining > item.stock };
            }).filter(x => x.quantity > 0) };
        } else if (method === 'DELETE') payload = { cartSchemaVersion: 2, items: scopedStoreId?state.payload.items.filter(item=>item.storeId!==scopedStoreId):[] };
        else {
            if (body.payload?.cartSchemaVersion !== 2) fail('CART_SCHEMA_UNSUPPORTED');
            const incoming=await canonicalItems(client,body.payload.items,scopedStoreId?state.payload.items.filter(item=>item.storeId===scopedStoreId):state.payload.items);
            if(scopedStoreId&&incoming.some(item=>item.storeId!==scopedStoreId))fail('CART_PRODUCT_UNAVAILABLE',404);
            const combined=scopedStoreId?[...state.payload.items.filter(item=>item.storeId!==scopedStoreId),...incoming]:incoming;
            if(combined.length>MAX_LINES)fail('CART_ITEMS_INVALID');
            payload = { cartSchemaVersion: 2, items: combined,
                ...(key === 'checkout' ? copyCheckoutFields(body.payload) : {}) };
        }
        const result = await saveV2(client, userId, key, payload, state.revision, row, pending);
        if (order) {
            await client.query('INSERT INTO user_cart_finalizations(user_id,order_id,cart_revision,purchased_lines) VALUES($1,$2,$3,$4::jsonb)',
                [userId, order.id, result.revision, JSON.stringify([...purchased.values()])]);
            result.finalizedOrderId = Number(order.id); result.reused = false;
        }
        const projected=project(result);
        await client.query('COMMIT'); return projected;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally { client.release(); }
}

module.exports = { execute, schemaOf, capabilities, canonicalLine, canonicalItems, lineKey };
