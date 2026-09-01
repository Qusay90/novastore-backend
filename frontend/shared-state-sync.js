(function (root) {
    const CART_PREFIX = 'novastore_cart_';
    const CART_MIGRATION_PREFIX = 'novastore_cart_migrated_';
    const PRINCIPAL_CHANGED_CODE = 'SHARED_STATE_PRINCIPAL_CHANGED';
    const writeQueues = new Map();
    const recentNotices = new Map();
    let hydratePromise = null;
    let hydratePrincipal = null;
    let activePrincipal = null;
    let principalSequence = 0;

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

    function capturePrincipal() {
        const userId = getUserId();
        const token = getToken();
        if (!token || userId === 'guest') {
            activePrincipal = null;
            return null;
        }
        if (
            !activePrincipal
            || activePrincipal.userId !== userId
            || activePrincipal.token !== token
        ) {
            principalSequence += 1;
            activePrincipal = Object.freeze({
                userId,
                token,
                queueScope: `principal-${principalSequence}`
            });
        }
        return activePrincipal;
    }

    function isCurrentPrincipal(principal) {
        return Boolean(principal)
            && principal === activePrincipal
            && getUserId() === principal.userId
            && getToken() === principal.token;
    }

    function principalChangedError() {
        const error = new Error('Oturum değiştiği için bekleyen ortak durum işlemi iptal edildi.');
        error.status = 409;
        error.code = PRINCIPAL_CHANGED_CODE;
        return error;
    }

    function assertCurrentPrincipal(principal) {
        if (!isCurrentPrincipal(principal)) throw principalChangedError();
    }

    function clearExpiredSession(principal = null) {
        if (principal && !isCurrentPrincipal(principal)) return;
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
        if (error?.code === PRINCIPAL_CHANGED_CODE) return false;
        return !error.status || error.status === 408 || error.status === 429 || error.status >= 500;
    }

    async function apiFetch(path, options = {}, attempt = 0, principal = null) {
        const requestPrincipal = principal || capturePrincipal();
        try {
            if (requestPrincipal) assertCurrentPrincipal(requestPrincipal);
            const response = await root.fetch(path, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {}),
                    Authorization: `Bearer ${requestPrincipal?.token || getToken()}`
                }
            });
            const payload = await readResponsePayload(response);
            if (requestPrincipal) assertCurrentPrincipal(requestPrincipal);
            if (!response.ok) {
                const error = new Error(payload.error || payload.message || 'Ortak durum senkronlanamadı.');
                error.status = response.status;
                error.code = payload.code;
                error.payload = payload;
                if (response.status === 401) clearExpiredSession(requestPrincipal);
                throw error;
            }
            return payload;
        } catch (error) {
            if (
                requestPrincipal
                && !isCurrentPrincipal(requestPrincipal)
                && error?.status !== 401
            ) throw principalChangedError();
            if (attempt === 0 && shouldRetry(error)) {
                if (requestPrincipal) assertCurrentPrincipal(requestPrincipal);
                await wait(250);
                if (requestPrincipal) assertCurrentPrincipal(requestPrincipal);
                return apiFetch(path, options, attempt + 1, requestPrincipal);
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
        if (error?.code === PRINCIPAL_CHANGED_CODE) return;
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
        const principal = capturePrincipal();
        if (!principal) return [];
        const response = await loadCartState(principal);
        assertCurrentPrincipal(principal);
        const items = response.items;
        assertCurrentPrincipal(principal);
        return items;
    }

    async function loadCartState(principal = capturePrincipal()) {
        if (!principal) return { exists: false, items: [] };
        const response = await apiFetch('/api/shared-state/cart', {}, 0, principal);
        assertCurrentPrincipal(principal);
        const state = {
            exists: response.exists === true,
            updatedAt: response.updatedAt || null,
            payload: response.payload || {},
            items: normalizeCartItems(response.payload && response.payload.items)
        };
        assertCurrentPrincipal(principal);
        return state;
    }

    async function saveCart(items) {
        const principal = capturePrincipal();
        if (!principal) return null;
        const normalized = normalizeCartItems(items);
        return enqueueWrite(`cart:${principal.queueScope}`, () => apiFetch('/api/shared-state/cart', {
            method: 'PUT',
            body: JSON.stringify({ payload: { version: 1, items: normalized } })
        }, 0, principal));
    }

    async function saveCheckout(payload) {
        const principal = capturePrincipal();
        if (!principal) return null;
        const normalizedPayload = {
            ...(payload || {}),
            items: normalizeCartItems((payload && payload.items) || [])
        };
        return enqueueWrite(`checkout:${principal.queueScope}`, () => apiFetch('/api/shared-state/checkout', {
            method: 'PUT',
            body: JSON.stringify({ payload: normalizedPayload })
        }, 0, principal));
    }

    async function loadCheckout() {
        const principal = capturePrincipal();
        if (!principal) return null;
        const response = await apiFetch('/api/shared-state/checkout', {}, 0, principal);
        assertCurrentPrincipal(principal);
        const checkout = {
            ...(response.payload || {}),
            items: normalizeCartItems(response.payload && response.payload.items)
        };
        assertCurrentPrincipal(principal);
        return checkout;
    }

    function writeCartLocal(items) {
        const normalized = normalizeCartItems(items);
        storage().setItem(scopedKey(CART_PREFIX), JSON.stringify(normalized));
        return normalized;
    }

    async function hydrateCartOnce(principal) {
        if (!principal) return;
        const key = `${CART_PREFIX}${principal.userId}`;
        const migrationKey = `${CART_MIGRATION_PREFIX}${principal.userId}`;
        try {
            assertCurrentPrincipal(principal);
            const remoteState = await loadCartState(principal);
            assertCurrentPrincipal(principal);
            if (remoteState.exists) {
                assertCurrentPrincipal(principal);
                storage().setItem(key, JSON.stringify(remoteState.items));
                storage().setItem(migrationKey, '1');
                assertCurrentPrincipal(principal);
                root.dispatchEvent(new CustomEvent('novastore:shared-cart-updated', { detail: { items: remoteState.items } }));
                return;
            }

            assertCurrentPrincipal(principal);
            const localItems = normalizeCartItems(readJson(key, []));
            if (localItems.length > 0 && storage().getItem(migrationKey) !== '1') {
                await enqueueWrite(`cart:${principal.queueScope}`, () => apiFetch('/api/shared-state/cart', {
                    method: 'PUT',
                    body: JSON.stringify({ payload: { version: 1, items: localItems } })
                }, 0, principal));
                assertCurrentPrincipal(principal);
                storage().setItem(migrationKey, '1');
                storage().setItem(key, JSON.stringify(localItems));
                assertCurrentPrincipal(principal);
                root.dispatchEvent(new CustomEvent('novastore:shared-cart-updated', { detail: { items: localItems } }));
            } else {
                assertCurrentPrincipal(principal);
                storage().setItem(migrationKey, '1');
                storage().setItem(key, JSON.stringify([]));
                assertCurrentPrincipal(principal);
                root.dispatchEvent(new CustomEvent('novastore:shared-cart-updated', { detail: { items: [] } }));
            }
        } catch (error) {
            if (error?.code === PRINCIPAL_CHANGED_CODE) return;
            reportError('cart', error, 'Sepet şu anda senkronlanamadı. Değişiklikleriniz korunuyor.');
            root.dispatchEvent(new CustomEvent('novastore:shared-state-error', { detail: { error } }));
        }
    }

    function hydrateCart() {
        const principal = capturePrincipal();
        if (!principal) return Promise.resolve();
        if (
            hydratePromise
            && hydratePrincipal === principal
        ) return hydratePromise;
        hydratePrincipal = principal;
        const currentPromise = hydrateCartOnce(principal).finally(() => {
            if (hydratePromise === currentPromise) {
                hydratePromise = null;
                hydratePrincipal = null;
            }
        });
        hydratePromise = currentPromise;
        return currentPromise;
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
        if (root.__NOVASTORE_INTEGRATED_RUNTIME_OWNS_CART_HYDRATION__ === true) return;
        hydrateCart();
    });
})(typeof window !== 'undefined' ? window : globalThis);
