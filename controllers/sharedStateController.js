const pool = require('../config/db');

const ALLOWED_STATE_KEYS = new Set(['cart', 'checkout']);
const MAX_ITEMS = 200;
const SHARED_STATE_SCHEMA_ERROR = '42P01';

const sendSharedStateError = (res, error, fallbackMessage) => {
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

const getSharedState = async (req, res) => {
    const key = normalizeStateKey(req.params.key);
    if (!key) return res.status(400).json({ error: 'Gecersiz ortak durum anahtari.' });

    try {
        const result = await pool.query(
            'SELECT payload, updated_at FROM user_shared_state WHERE user_id = $1 AND state_key = $2',
            [req.user.id, key]
        );

        const row = result.rows[0];
        res.json({
            key,
            exists: Boolean(row),
            payload: row?.payload || normalizePayload(key, {}),
            updatedAt: row?.updated_at || null
        });
    } catch (error) {
        console.error('Ortak durum alinamadi:', error);
        sendSharedStateError(res, error, 'Ortak durum alinamadi.');
    }
};

const putSharedState = async (req, res) => {
    const key = normalizeStateKey(req.params.key);
    if (!key) return res.status(400).json({ error: 'Gecersiz ortak durum anahtari.' });

    const payload = normalizePayload(key, req.body?.payload ?? req.body);
    if (!payload) return res.status(400).json({ error: 'Gecersiz ortak durum verisi.' });

    try {
        const result = await pool.query(
            `INSERT INTO user_shared_state (user_id, state_key, payload, updated_at)
             VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
             ON CONFLICT (user_id, state_key)
             DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP
             RETURNING payload, updated_at`,
            [req.user.id, key, JSON.stringify(payload)]
        );

        res.json({
            key,
            exists: true,
            payload: result.rows[0].payload,
            updatedAt: result.rows[0].updated_at
        });
    } catch (error) {
        console.error('Ortak durum kaydedilemedi:', error);
        sendSharedStateError(res, error, 'Ortak durum kaydedilemedi.');
    }
};

const deleteSharedState = async (req, res) => {
    const key = normalizeStateKey(req.params.key);
    if (!key) return res.status(400).json({ error: 'Gecersiz ortak durum anahtari.' });

    try {
        await pool.query(
            'DELETE FROM user_shared_state WHERE user_id = $1 AND state_key = $2',
            [req.user.id, key]
        );
        res.json({ key, exists: false, deleted: true });
    } catch (error) {
        console.error('Ortak durum silinemedi:', error);
        sendSharedStateError(res, error, 'Ortak durum silinemedi.');
    }
};

module.exports = {
    getSharedState,
    putSharedState,
    deleteSharedState,
    __test: {
        normalizeStateKey,
        normalizeCartPayload,
        normalizeCheckoutPayload,
        sendSharedStateError
    }
};
