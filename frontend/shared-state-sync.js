(function (root) {
    const CART_PREFIX = 'novastore_cart_';
    const CART_MIGRATION_PREFIX = 'novastore_cart_migrated_';
    const CHECKOUT_PREFIX = 'novastore_checkout_';
    const PENDING_CHECKOUT_PREFIX = 'novastore_pending_checkout_';
    const syncingKeys = new Set();

    function storage() {
        return root.localStorage;
    }

    function readJson(key, fallback) {
        try {
            const raw = storage().getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function getUserInfo() {
        return readJson('nova_user_info', null);
    }

    function getUserId() {
        const info = getUserInfo();
        return info && info.id ? String(info.id) : 'guest';
    }

    function getToken() {
        return storage().getItem('nova_user_token') || '';
    }

    function isAuthenticated() {
        return Boolean(getToken()) && getUserId() !== 'guest';
    }

    function scopedKey(prefix) {
        return `${prefix}${getUserId()}`;
    }

    function isCartMigrationComplete() {
        return storage().getItem(scopedKey(CART_MIGRATION_PREFIX)) === '1';
    }

    function markCartMigrationComplete() {
        storage().setItem(scopedKey(CART_MIGRATION_PREFIX), '1');
    }

    function normalizeCartItem(item) {
        if (!item || typeof item !== 'object') return null;
        const productId = Number.parseInt(item.productId || item.product_id || item.id, 10);
        const quantity = Number.parseInt(item.quantity || 1, 10);
        const price = Number(item.price || 0);
        const oldPrice = Number(item.oldPrice || item.old_price || 0);
        const name = String(item.name || '').trim();
        const image = item.imageUrl || item.image_url || item.image || '';

        if (!Number.isInteger(productId) || productId <= 0) return null;
        if (!Number.isInteger(quantity) || quantity <= 0) return null;
        if (!Number.isFinite(price) || price < 0) return null;
        if (!name) return null;

        return {
            id: productId,
            productId,
            name,
            price,
            oldPrice: Number.isFinite(oldPrice) && oldPrice > 0 ? oldPrice : null,
            old_price: Number.isFinite(oldPrice) && oldPrice > 0 ? oldPrice : null,
            image,
            imageUrl: image,
            quantity,
            selected: item.selected !== false
        };
    }

    function normalizeCartItems(items) {
        const byId = new Map();
        (Array.isArray(items) ? items : []).forEach((raw) => {
            const item = normalizeCartItem(raw);
            if (!item) return;
            const existing = byId.get(item.productId);
            if (existing) {
                existing.quantity = Math.min(999, existing.quantity + item.quantity);
            } else {
                byId.set(item.productId, item);
            }
        });
        return [...byId.values()];
    }

    async function apiFetch(path, options = {}) {
        const response = await root.fetch(path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
                Authorization: `Bearer ${getToken()}`
            }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(payload.error || 'Ortak durum senkronlanamadi.');
            error.status = response.status;
            error.payload = payload;
            throw error;
        }
        return payload;
    }

    async function loadCart() {
        if (!isAuthenticated()) return [];
        const response = await loadCartState();
        return response.items;
    }

    async function loadCartState() {
        if (!isAuthenticated()) return { exists: false, items: [] };
        const response = await apiFetch('/api/shared-state/cart');
        return {
            exists: response.exists === true,
            updatedAt: response.updatedAt || null,
            payload: response.payload || {},
            items: normalizeCartItems(response.payload && response.payload.items)
        };
    }

    async function saveCart(items) {
        if (!isAuthenticated()) return null;
        const normalized = normalizeCartItems(items);
        return apiFetch('/api/shared-state/cart', {
            method: 'PUT',
            body: JSON.stringify({ payload: { version: 1, items: normalized } })
        });
    }

    async function saveCheckout(payload) {
        if (!isAuthenticated()) return null;
        const normalizedPayload = {
            ...(payload || {}),
            items: normalizeCartItems((payload && payload.items) || [])
        };
        return apiFetch('/api/shared-state/checkout', {
            method: 'PUT',
            body: JSON.stringify({ payload: normalizedPayload })
        });
    }

    async function loadCheckout() {
        if (!isAuthenticated()) return null;
        const response = await apiFetch('/api/shared-state/checkout');
        return {
            ...(response.payload || {}),
            items: normalizeCartItems(response.payload && response.payload.items)
        };
    }

    function writeWithoutSync(key, value) {
        syncingKeys.add(key);
        try {
            storage().setItem(key, value);
        } finally {
            syncingKeys.delete(key);
        }
    }

    function writeCartLocal(items) {
        const normalized = normalizeCartItems(items);
        writeWithoutSync(scopedKey(CART_PREFIX), JSON.stringify(normalized));
        return normalized;
    }

    async function hydrateCart() {
        if (!isAuthenticated()) return;
        const key = scopedKey(CART_PREFIX);
        try {
            const remoteState = await loadCartState();
            if (remoteState.exists) {
                writeWithoutSync(key, JSON.stringify(remoteState.items));
                markCartMigrationComplete();
                root.dispatchEvent(new CustomEvent('novastore:shared-cart-updated', { detail: { items: remoteState.items } }));
                return;
            }

            const localItems = normalizeCartItems(readJson(key, []));
            if (localItems.length > 0 && !isCartMigrationComplete()) {
                await saveCart(localItems);
                markCartMigrationComplete();
                writeWithoutSync(key, JSON.stringify(localItems));
                root.dispatchEvent(new CustomEvent('novastore:shared-cart-updated', { detail: { items: localItems } }));
            } else {
                markCartMigrationComplete();
                writeWithoutSync(key, JSON.stringify([]));
                root.dispatchEvent(new CustomEvent('novastore:shared-cart-updated', { detail: { items: [] } }));
            }
        } catch (error) {
            root.dispatchEvent(new CustomEvent('novastore:shared-state-error', { detail: { error } }));
        }
    }

    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
        originalSetItem.call(this, key, value);
        if (this !== storage() || syncingKeys.has(key) || !isAuthenticated()) return;

        if (key === scopedKey(CART_PREFIX)) {
            saveCart(readJson(key, [])).catch((error) => {
                root.dispatchEvent(new CustomEvent('novastore:shared-state-error', { detail: { error, key: 'cart' } }));
            });
        } else if (key === scopedKey(CHECKOUT_PREFIX) || key === scopedKey(PENDING_CHECKOUT_PREFIX)) {
            saveCheckout(readJson(key, {})).catch((error) => {
                root.dispatchEvent(new CustomEvent('novastore:shared-state-error', { detail: { error, key: 'checkout' } }));
            });
        }
    };

    root.NovaStoreSharedState = {
        isAuthenticated,
        hydrateCart,
        saveCart,
        loadCart,
        loadCartState,
        saveCheckout,
        loadCheckout,
        writeCartLocal,
        normalizeCartItems,
        isCartMigrationComplete
    };

    root.addEventListener('DOMContentLoaded', () => {
        hydrateCart();
    });
})(typeof window !== 'undefined' ? window : globalThis);
