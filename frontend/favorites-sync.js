(function (root, factory) {
    const api = factory(root);
    root.NovaStoreFavorites = api;
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    const FAVORITES_PREFIX = 'novastore_favs_';
    const MIGRATION_PREFIX = 'novastore_favs_migrated_';
    const mutationQueues = new Map();

    function storage() {
        return root.localStorage;
    }

    function getUserId() {
        try {
            const info = JSON.parse(storage().getItem('nova_user_info'));
            return info && info.id ? String(info.id) : 'guest';
        } catch (_) {
            return 'guest';
        }
    }

    function getToken() {
        return storage().getItem('nova_user_token') || '';
    }

    function clearAuthSession() {
        storage().removeItem('nova_user_token');
        storage().removeItem('nova_user_info');
        root.dispatchEvent(new CustomEvent('novastore:auth-required'));
    }

    function isAuthenticated() {
        return Boolean(getToken()) && getUserId() !== 'guest';
    }

    function favoritesKey(userId = getUserId()) {
        return `${FAVORITES_PREFIX}${userId}`;
    }

    function migrationKey(userId = getUserId()) {
        return `${MIGRATION_PREFIX}${userId}`;
    }

    function normalizeIds(values) {
        const ids = [];
        (Array.isArray(values) ? values : []).forEach((value) => {
            const id = Number.parseInt(value, 10);
            if (Number.isInteger(id) && id > 0 && !ids.includes(id)) {
                ids.push(id);
            }
        });
        return ids;
    }

    function readLocalIds(userId = getUserId()) {
        try {
            return normalizeIds(JSON.parse(storage().getItem(favoritesKey(userId)) || '[]'));
        } catch (_) {
            return [];
        }
    }

    function writeLocalIds(ids, userId = getUserId()) {
        storage().setItem(favoritesKey(userId), JSON.stringify(normalizeIds(ids)));
    }

    function extractIds(payload) {
        if (Array.isArray(payload?.productIds)) return normalizeIds(payload.productIds);
        if (Array.isArray(payload?.favorites)) return normalizeIds(payload.favorites.map((item) => item.productId || item.product_id));
        return [];
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
                const error = new Error(payload.error || payload.message || 'Favori işlemi tamamlanamadı.');
                error.status = response.status;
                error.code = payload.code;
                error.payload = payload;
                if (response.status === 401) clearAuthSession();
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

    function enqueueMutation(productId, operation) {
        const previous = mutationQueues.get(productId) || Promise.resolve();
        const current = previous.catch(() => undefined).then(operation);
        mutationQueues.set(productId, current);
        return current.finally(() => {
            if (mutationQueues.get(productId) === current) mutationQueues.delete(productId);
        });
    }

    function reportError(error, message = 'Favori işlemi şu anda tamamlanamadı. Seçiminiz değiştirilmedi.') {
        if (root.NovaStoreSharedState?.reportError) {
            root.NovaStoreSharedState.reportError('favorites', error, message);
            return;
        }
        console.error('[NovaStore favorites sync]', {
            status: error?.status || null,
            code: error?.code || null,
            message: error?.message || String(error)
        });
    }

    async function syncLocalFavoritesOnce() {
        if (!isAuthenticated()) return null;

        const userId = getUserId();
        const guestIds = readLocalIds('guest');
        const migrationComplete = storage().getItem(migrationKey(userId)) === '1';
        if (migrationComplete && guestIds.length === 0) return null;

        const localIds = normalizeIds([
            ...(migrationComplete ? [] : readLocalIds(userId)),
            ...guestIds
        ]);
        let payload = null;
        if (localIds.length > 0) {
            payload = await apiFetch('/api/favorites/sync', {
                method: 'POST',
                body: JSON.stringify({ productIds: localIds })
            });
            writeLocalIds(extractIds(payload), userId);
        }
        if (guestIds.length > 0) storage().removeItem(favoritesKey('guest'));
        storage().setItem(migrationKey(userId), '1');
        return payload;
    }

    async function loadFavoriteIds({ onError } = {}) {
        if (!isAuthenticated()) {
            return new Set(readLocalIds());
        }

        const userId = getUserId();
        try {
            await syncLocalFavoritesOnce();
            const payload = await apiFetch('/api/favorites');
            const ids = extractIds(payload);
            writeLocalIds(ids, userId);
            return new Set(ids);
        } catch (error) {
            if (typeof onError === 'function') onError(error);
            return new Set(readLocalIds(userId));
        }
    }

    async function setFavorite(productId, shouldFavorite) {
        const id = Number.parseInt(productId, 10);
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error('Gecersiz urun id.');
        }

        const authenticatedAtCall = isAuthenticated();
        const userId = getUserId();
        return enqueueMutation(id, async () => {
            const localIds = readLocalIds(userId);
            if (!authenticatedAtCall) {
                writeLocalIds(shouldFavorite ? [...localIds, id] : localIds.filter((item) => item !== id), userId);
                return { productId: id, favorited: shouldFavorite, localOnly: true };
            }

            const payload = await apiFetch(`/api/favorites/${id}`, {
                method: shouldFavorite ? 'POST' : 'DELETE'
            });
            writeLocalIds(shouldFavorite ? [...localIds, id] : localIds.filter((item) => item !== id), userId);
            return payload;
        });
    }

    return {
        getUserId,
        isAuthenticated,
        clearAuthSession,
        favoritesKey,
        migrationKey,
        readLocalIds,
        writeLocalIds,
        extractIds,
        syncLocalFavoritesOnce,
        loadFavoriteIds,
        setFavorite,
        reportError
    };
});
