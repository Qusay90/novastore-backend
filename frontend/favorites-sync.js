(function (root, factory) {
    const api = factory(root);
    root.NovaStoreFavorites = api;
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    const FAVORITES_PREFIX = 'novastore_favs_';
    const MIGRATION_PREFIX = 'novastore_favs_migrated_';

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
            const error = new Error(payload.error || 'Favori islemi tamamlanamadi.');
            error.status = response.status;
            error.payload = payload;
            throw error;
        }
        return payload;
    }

    async function syncLocalFavoritesOnce() {
        if (!isAuthenticated()) return null;

        const userId = getUserId();
        if (storage().getItem(migrationKey(userId)) === '1') return null;

        const localIds = readLocalIds(userId);
        let payload = null;
        if (localIds.length > 0) {
            payload = await apiFetch('/api/favorites/sync', {
                method: 'POST',
                body: JSON.stringify({ productIds: localIds })
            });
            writeLocalIds(extractIds(payload), userId);
        }
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

        const userId = getUserId();
        const localIds = readLocalIds(userId);

        if (!isAuthenticated()) {
            writeLocalIds(shouldFavorite ? [...localIds, id] : localIds.filter((item) => item !== id), userId);
            return { productId: id, favorited: shouldFavorite, localOnly: true };
        }

        const payload = await apiFetch(`/api/favorites/${id}`, {
            method: shouldFavorite ? 'POST' : 'DELETE'
        });
        writeLocalIds(shouldFavorite ? [...localIds, id] : localIds.filter((item) => item !== id), userId);
        return payload;
    }

    return {
        getUserId,
        isAuthenticated,
        favoritesKey,
        migrationKey,
        readLocalIds,
        writeLocalIds,
        extractIds,
        syncLocalFavoritesOnce,
        loadFavoriteIds,
        setFavorite
    };
});
