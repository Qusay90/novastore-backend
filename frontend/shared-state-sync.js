(function (root) {
    const CART_PREFIX = 'novastore_cart_';
    const CART_MIGRATION_PREFIX = 'novastore_cart_migrated_';
    const writeQueues = new Map();
    const recentNotices = new Map();

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

    function clearExpiredSession() {
        storage().removeItem('nova_user_token');
        storage().removeItem('nova_user_info');
        root.dispatchEvent(new CustomEvent('novastore:auth-required'));
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

    function formatPrice(value) {
        const amount = Number(value || 0);
        return (Number.isFinite(amount) ? amount : 0).toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function readResponsePayload(response) {
        if (typeof response.text === 'function') {
            const text = await response.text();
            if (!text) return {};
            try {
                return JSON.parse(text);
            } catch (_) {
                return { message: text };
            }
        }
        if (typeof response.json === 'function') {
            return response.json().catch(() => ({}));
        }
        return {};
    }

    function shouldRetry(error) {
        return !error.status || error.status === 408 || error.status === 429 || error.status >= 500;
    }

    async function apiFetch(path, options = {}, attempt = 0) {
        try {
            const response = await root.fetch(path, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {}),
                    Authorization: `Bearer ${getToken()}`
                }
            });
            const payload = await readResponsePayload(response);
            if (!response.ok) {
                const error = new Error(payload.error || payload.message || 'Ortak durum senkronlanamadı.');
                error.status = response.status;
                error.code = payload.code;
                error.payload = payload;
                if (response.status === 401) clearExpiredSession();
                throw error;
            }
            return payload;
        } catch (error) {
            if (attempt === 0 && shouldRetry(error)) {
                await wait(250);
                return apiFetch(path, options, attempt + 1);
            }
            throw error;
        }
    }

    function enqueueWrite(key, operation) {
        const previous = writeQueues.get(key) || Promise.resolve();
        const current = previous.catch(() => undefined).then(operation);
        writeQueues.set(key, current);
        return current.finally(() => {
            if (writeQueues.get(key) === current) writeQueues.delete(key);
        });
    }

    function showNotice(message) {
        const now = Date.now();
        if (now - (recentNotices.get(message) || 0) < 2500) return;
        recentNotices.set(message, now);

        if (typeof root.showToast === 'function') {
            root.showToast(message, 'warning');
            return;
        }

        if (!root.document || !root.document.body) return;
        const notice = root.document.createElement('div');
        notice.setAttribute('role', 'status');
        notice.textContent = message;
        Object.assign(notice.style, {
            position: 'fixed',
            right: '16px',
            bottom: '16px',
            zIndex: '100000',
            maxWidth: '360px',
            padding: '12px 16px',
            background: '#1f2937',
            color: '#ffffff',
            borderLeft: '4px solid #f59e0b',
            borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,.2)',
            font: '600 14px/1.4 Arial, sans-serif'
        });
        root.document.body.appendChild(notice);
        setTimeout(() => notice.remove(), 4500);
    }

    function reportError(scope, error, message) {
        console.error(`[NovaStore ${scope} sync]`, {
            status: error?.status || null,
            code: error?.code || null,
            message: error?.message || String(error)
        });
        showNotice(error?.status === 401
            ? 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.'
            : message);
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
        return enqueueWrite('cart', () => apiFetch('/api/shared-state/cart', {
            method: 'PUT',
            body: JSON.stringify({ payload: { version: 1, items: normalized } })
        }));
    }

    async function saveCheckout(payload) {
        if (!isAuthenticated()) return null;
        const normalizedPayload = {
            ...(payload || {}),
            items: normalizeCartItems((payload && payload.items) || [])
        };
        return enqueueWrite('checkout', () => apiFetch('/api/shared-state/checkout', {
            method: 'PUT',
            body: JSON.stringify({ payload: normalizedPayload })
        }));
    }

    async function loadCheckout() {
        if (!isAuthenticated()) return null;
        const response = await apiFetch('/api/shared-state/checkout');
        return {
            ...(response.payload || {}),
            items: normalizeCartItems(response.payload && response.payload.items)
        };
    }

    function writeCartLocal(items) {
        const normalized = normalizeCartItems(items);
        storage().setItem(scopedKey(CART_PREFIX), JSON.stringify(normalized));
        return normalized;
    }

    async function hydrateCart() {
        if (!isAuthenticated()) return;
        const key = scopedKey(CART_PREFIX);
        try {
            const remoteState = await loadCartState();
            if (remoteState.exists) {
                storage().setItem(key, JSON.stringify(remoteState.items));
                markCartMigrationComplete();
                root.dispatchEvent(new CustomEvent('novastore:shared-cart-updated', { detail: { items: remoteState.items } }));
                return;
            }

            const localItems = normalizeCartItems(readJson(key, []));
            if (localItems.length > 0 && !isCartMigrationComplete()) {
                await saveCart(localItems);
                markCartMigrationComplete();
                storage().setItem(key, JSON.stringify(localItems));
                root.dispatchEvent(new CustomEvent('novastore:shared-cart-updated', { detail: { items: localItems } }));
            } else {
                markCartMigrationComplete();
                storage().setItem(key, JSON.stringify([]));
                root.dispatchEvent(new CustomEvent('novastore:shared-cart-updated', { detail: { items: [] } }));
            }
        } catch (error) {
            reportError('cart', error, 'Sepet şu anda senkronlanamadı. Değişiklikleriniz korunuyor.');
            root.dispatchEvent(new CustomEvent('novastore:shared-state-error', { detail: { error } }));
        }
    }

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
        formatPrice,
        isCartMigrationComplete,
        reportError
    };

    root.addEventListener('DOMContentLoaded', () => {
        hydrateCart();
    });
})(typeof window !== 'undefined' ? window : globalThis);
