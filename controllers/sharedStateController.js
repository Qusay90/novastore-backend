const pool = require('../config/db');
const cartV2 = require('../services/variantCartV2Service');

const ALLOWED_STATE_KEYS = new Set(['cart', 'checkout']);
const MAX_ITEMS = 200;
const SHARED_STATE_SCHEMA_ERROR = '42P01';

const sendSharedStateError = (res, error, fallbackMessage) => {
    if (error?.statusCode && error?.code) {
        return res.status(error.statusCode).json({
            error: error.code === 'CART_CLIENT_UPGRADE_REQUIRED'
                ? 'Sepetinizi korumak için uygulamanızı güncelleyin.'
                : error.code === 'CART_REVISION_CONFLICT'
                    ? 'Sepet başka bir cihazda değişti. Güncel sepeti yükleyip tekrar deneyin.'
                    : 'Sepet işlemi tamamlanamadı.',
            code: error.code,
            ...(Number.isSafeInteger(error.revision) ? { revision: error.revision } : {})
        });
    }
    if (error?.code === SHARED_STATE_SCHEMA_ERROR) {
        return res.status(503).json({
            error: 'Ortak müşteri durumu geçici olarak kullanılamıyor.',
            code: 'SHARED_STATE_SCHEMA_MISSING'
        });
    }
    return res.status(500).json({ error: fallbackMessage });
};

const normalizeStateKey = (value) => {
    const key = String(value || '').trim().toLowerCase();
    return ALLOWED_STATE_KEYS.has(key) ? key : null;
};

const normalizeCartItem = (item) => {
    if (!item || typeof item !== 'object') return null;

    const productId = Number(item.productId ?? item.product_id ?? item.id);
    const quantity = Number(item.quantity ?? 1);
    const price = Number(item.price ?? 0);
    const oldPrice = Number(item.oldPrice ?? item.old_price ?? 0);
    const name = String(item.name || '').trim();
    const imageUrl = item.imageUrl ?? item.image_url ?? item.image ?? null;

    if (!Number.isInteger(productId) || productId <= 0) return null;
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 999) return null;
    if (!Number.isFinite(price) || price < 0) return null;
    if (!name) return null;

    return {
        productId,
        id: productId,
        name: name.slice(0, 240),
        price,
        oldPrice: Number.isFinite(oldPrice) && oldPrice > 0 ? oldPrice : null,
        old_price: Number.isFinite(oldPrice) && oldPrice > 0 ? oldPrice : null,
        imageUrl: imageUrl ? String(imageUrl).slice(0, 1200) : null,
        image: imageUrl ? String(imageUrl).slice(0, 1200) : null,
        quantity
    };
};

const normalizeCartPayload = (payload) => {
    if (cartV2.schemaOf(payload) !== 1) {
        throw Object.assign(new Error('CART_CLIENT_UPGRADE_REQUIRED'), { code: 'CART_CLIENT_UPGRADE_REQUIRED', statusCode: 426 });
    }
    const rawItems = Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.cartItems)
            ? payload.cartItems
            : Array.isArray(payload)
                ? payload
                : [];

    const byProduct = new Map();
    for (const raw of rawItems.slice(0, MAX_ITEMS)) {
        const item = normalizeCartItem(raw);
        if (!item) continue;

        const existing = byProduct.get(item.productId);
        if (existing) {
            existing.quantity = Math.min(999, existing.quantity + item.quantity);
        } else {
            byProduct.set(item.productId, item);
        }
    }

    return {
        version: 1,
        items: [...byProduct.values()],
        updatedAt: new Date().toISOString()
    };
};

const normalizeCheckoutPayload = (payload) => {
    const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const items = normalizeCartPayload(body.items ? { items: body.items } : body).items;

    return {
        version: 1,
        items,
        selectedAddressId: body.selectedAddressId ?? body.selected_address_id ?? null,
        couponCode: body.couponCode ? String(body.couponCode).trim().slice(0, 64) : null,
        paymentMethod: body.paymentMethod ? String(body.paymentMethod).trim().slice(0, 40) : null,
        updatedAt: new Date().toISOString()
    };
};

const normalizePayload = (key, payload) => {
    if (key === 'cart') return normalizeCartPayload(payload);
    if (key === 'checkout') return normalizeCheckoutPayload(payload);
    return null;
};

const handleSharedState = (method) => async (req, res) => {
    const key = normalizeStateKey(req.params.key);
    if (!key) return res.status(400).json({ error: 'Gecersiz ortak durum anahtari.' });

    try {
        const result = await cartV2.execute({ database: pool, userId: req.user.id, key,
            method, headers: req.headers, body: req.body, legacyNormalize: normalizePayload });
        res.set?.('Cache-Control', 'no-store');
        res.json(result);
    } catch (error) {
        // Do not log account/cart contents or database statements with parameters.
        if (!error?.statusCode) console.error('Ortak durum işlemi başarısız:', error?.code || 'INTERNAL_ERROR');
        sendSharedStateError(res, error, 'Ortak durum işlemi tamamlanamadı.');
    }
};
const getSharedState = handleSharedState('GET');
const putSharedState = handleSharedState('PUT');
const deleteSharedState = handleSharedState('DELETE');
const finalizeCart = handleSharedState('FINALIZE');

module.exports = {
    getSharedState,
    putSharedState,
    deleteSharedState,
    finalizeCart,
    __test: {
        normalizeStateKey,
        normalizeCartPayload,
        normalizeCheckoutPayload,
        sendSharedStateError
    }
};
