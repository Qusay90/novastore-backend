const { PLATFORM_STORE } = require('./categoryV2BackfillService');
const { AdminCatalogMutationError } = require('./adminCatalogMutationPolicy');
const { executeAdminCatalogMutation } = require('./adminCatalogMutationService');
const { cardFramingFromStorage, normalizeCardFraming } = require('../shared/productCardFraming');
const { lockAdminWritablePlatformStore } = require('./adminCatalogStoreAuthorityService');

const MAX_PRODUCT_MEDIA = 10;
const CLOUDINARY_HOST = 'res.cloudinary.com';

const invalidMedia = (message, code = 'ADMIN_CATALOG_MEDIA_INVALID', statusCode = 400) => {
    throw new AdminCatalogMutationError(message, { code, statusCode });
};

const normalizePositiveId = (value, field) => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) invalidMedia(`${field} geçersiz.`);
    return id;
};

const normalizeCloudinaryMediaUrl = (value, env = process.env) => {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 2048 || /[\u0000-\u001F\\]/.test(raw)) {
        invalidMedia('Medya URL bilgisi geçersiz.', 'ADMIN_CATALOG_MEDIA_URL_INVALID');
    }
    let url;
    try {
        url = new URL(raw);
    } catch (_) {
        invalidMedia('Medya URL bilgisi geçersiz.', 'ADMIN_CATALOG_MEDIA_URL_INVALID');
    }
    if (url.protocol !== 'https:' || url.hostname !== CLOUDINARY_HOST || url.port
        || url.username || url.password || url.search || url.hash) {
        invalidMedia('Yalnızca sorgusuz HTTPS Cloudinary medya URL adresleri kabul edilir.', 'ADMIN_CATALOG_MEDIA_URL_NOT_ALLOWED');
    }
    let pathname;
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch (_) {
        invalidMedia('Medya URL yolu geçersiz.', 'ADMIN_CATALOG_MEDIA_PATH_INVALID');
    }
    if (pathname.includes('..') || pathname.includes('\\') || /[\u0000-\u001F]/.test(pathname)) {
        invalidMedia('Medya URL yolu geçersiz.', 'ADMIN_CATALOG_MEDIA_PATH_INVALID');
    }
    const match = pathname.match(/^\/([^/]+)\/(image|video)\/upload\/(.+)$/);
    if (!match || !match[3] || match[3].endsWith('/')) {
        invalidMedia('Cloudinary medya yolu image/upload veya video/upload sözleşmesine uymalıdır.', 'ADMIN_CATALOG_MEDIA_PATH_INVALID');
    }
    const configuredCloudName = String(env.CLOUDINARY_CLOUD_NAME || '').trim();
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(configuredCloudName)) {
        invalidMedia(
            'Cloudinary hesap yapılandırması olmadan medya kaydı yazılamaz.',
            'ADMIN_CATALOG_MEDIA_STORAGE_CONFIG_UNAVAILABLE',
            503
        );
    }
    if (match[1] !== configuredCloudName) {
        invalidMedia('Medya URL adresi yapılandırılmış Cloudinary hesabına ait değil.', 'ADMIN_CATALOG_MEDIA_ACCOUNT_MISMATCH');
    }
    return Object.freeze({ mediaUrl: url.toString(), mediaType: match[2] });
};

const loadFirstPartyProduct = async (client, productId) => {
    const result = await client.query(
        `SELECT product.id, product.revision
         FROM products product
         JOIN stores store ON store.id = product.store_id
         WHERE product.id = $1
           AND LOWER(store.slug) = LOWER($2)
           AND store.is_active = TRUE
           AND store.deleted_at IS NULL`,
        [productId, PLATFORM_STORE.slug]
    );
    if (!result.rows?.length) {
        invalidMedia('Birinci taraf katalog ürünü bulunamadı.', 'ADMIN_CATALOG_ENTITY_NOT_FOUND', 404);
    }
    return result.rows[0];
};

const authorizeFirstPartyMediaTarget = async (client, current) => {
    await lockAdminWritablePlatformStore(client, { unavailableAsNotFound: true });
    const product = await loadFirstPartyProduct(client, current.id);
    return Object.freeze({ product });
};

const listProductMedia = async (database, rawProductId) => {
    const productId = normalizePositiveId(rawProductId, 'Ürün kimliği');
    await loadFirstPartyProduct(database, productId);
    const result = await database.query(
        `SELECT id, product_id, media_url, media_type, is_main, sort_order,
                card_focal_x, card_focal_y, card_zoom, created_at
         FROM product_media
         WHERE product_id = $1
         ORDER BY is_main DESC, sort_order ASC, id ASC`,
        [productId]
    );
    return Object.freeze(result.rows.map((row) => Object.freeze({
        id: Number(row.id),
        productId: Number(row.product_id),
        mediaUrl: row.media_url,
        mediaType: row.media_type || 'image',
        isCover: row.is_main === true,
        sortOrder: Number(row.sort_order || 0),
        cardFraming: cardFramingFromStorage(row),
        createdAt: row.created_at || null
    })));
};

const updateProductMediaCardFraming = async (database, rawProductId, rawMediaId, { actor, body, requestId = null }) => {
    const productId = normalizePositiveId(rawProductId, 'Ürün kimliği');
    const mediaId = normalizePositiveId(rawMediaId, 'Medya kimliği');
    let framing;
    try {
        framing = normalizeCardFraming(body?.card_framing ?? body?.cardFraming ?? null);
    } catch (error) {
        invalidMedia(error.message, 'ADMIN_CATALOG_MEDIA_CARD_FRAMING_INVALID');
    }
    const executed = await executeAdminCatalogMutation({
        database,
        actor,
        entityType: 'product',
        entityKey: String(productId),
        action: 'update',
        expectedRevision: body?.expected_revision ?? body?.expectedRevision,
        changedFields: ['product_media'],
        requestId,
        metadata: { source: 'admin-commerce-pro', operation: 'media_card_framing', storage_mutation: false },
        authorizeLockedTarget: authorizeFirstPartyMediaTarget,
        applyMutation: async (client) => {
            const updated = await client.query(
                `UPDATE product_media
                    SET card_focal_x = $1,
                        card_focal_y = $2,
                        card_zoom = $3
                  WHERE id = $4
                    AND product_id = $5
                    AND media_type = 'image'
                RETURNING id`,
                [framing?.focal_x ?? null, framing?.focal_y ?? null, framing?.zoom ?? null, mediaId, productId]
            );
            if (!updated.rows?.length) {
                invalidMedia('Ürüne ait görsel medya kaydı bulunamadı.', 'ADMIN_CATALOG_MEDIA_NOT_FOUND', 404);
            }
            return { id: productId };
        }
    });
    return toEnvelope(database, productId, executed);
};

const toEnvelope = async (database, productId, executed) => Object.freeze({
    productId,
    revision: Number(executed.result.revision),
    media: await listProductMedia(database, productId),
    storageMutation: false
});

const registerProductMedia = async (database, rawProductId, { actor, body, requestId = null }) => {
    const productId = normalizePositiveId(rawProductId, 'Ürün kimliği');
    const normalized = normalizeCloudinaryMediaUrl(body?.media_url ?? body?.mediaUrl);
    const requestedType = String(body?.media_type ?? body?.mediaType ?? normalized.mediaType).trim().toLowerCase();
    if (requestedType !== normalized.mediaType) {
        invalidMedia('Medya türü Cloudinary kaynak türüyle eşleşmiyor.', 'ADMIN_CATALOG_MEDIA_TYPE_MISMATCH');
    }
    if (requestedType === 'video') {
        invalidMedia(
            'Video yayınlama Android ve web renderer sözleşmesi tamamlanana kadar kapalıdır.',
            'ADMIN_CATALOG_MEDIA_VIDEO_RENDERER_HANDOFF_REQUIRED'
        );
    }
    const makeCover = body?.is_cover === true || body?.isCover === true;
    if (makeCover && normalized.mediaType !== 'image') {
        invalidMedia('Yalnız görsel medya kapak olabilir.', 'ADMIN_CATALOG_MEDIA_COVER_TYPE_INVALID');
    }
    const executed = await executeAdminCatalogMutation({
        database,
        actor,
        entityType: 'product',
        entityKey: String(productId),
        action: 'update',
        expectedRevision: body?.expected_revision ?? body?.expectedRevision,
        changedFields: ['product_media'],
        requestId,
        metadata: { source: 'admin-commerce-pro', operation: 'media_register', storage_mutation: false },
        authorizeLockedTarget: authorizeFirstPartyMediaTarget,
        applyMutation: async (client) => {
            const countResult = await client.query(
                `SELECT COUNT(*)::INTEGER AS count,
                        COALESCE(MAX(sort_order), -1)::INTEGER AS max_sort_order,
                        COUNT(*) FILTER (WHERE is_main = TRUE AND media_type = 'image')::INTEGER AS image_cover_count
                 FROM product_media
                 WHERE product_id = $1`,
                [productId]
            );
            if (Number(countResult.rows[0]?.count || 0) >= MAX_PRODUCT_MEDIA) {
                invalidMedia(`Bir üründe en fazla ${MAX_PRODUCT_MEDIA} medya kaydı olabilir.`, 'ADMIN_CATALOG_MEDIA_LIMIT_REACHED', 409);
            }
            const duplicate = await client.query(
                'SELECT id FROM product_media WHERE product_id = $1 AND media_url = $2',
                [productId, normalized.mediaUrl]
            );
            if (duplicate.rows?.length) invalidMedia('Bu medya URL adresi üründe zaten kayıtlı.', 'ADMIN_CATALOG_MEDIA_DUPLICATE', 409);
            const shouldCover = normalized.mediaType === 'image'
                && (makeCover || Number(countResult.rows[0]?.image_cover_count || 0) === 0);
            if (shouldCover) await client.query('UPDATE product_media SET is_main = FALSE WHERE product_id = $1', [productId]);
            await client.query(
                `INSERT INTO product_media (product_id, media_url, media_type, is_main, sort_order)
                 VALUES ($1, $2, $3, $4, $5)`,
                [productId, normalized.mediaUrl, normalized.mediaType, shouldCover, Number(countResult.rows[0]?.max_sort_order ?? -1) + 1]
            );
            if (shouldCover) await client.query('UPDATE products SET image_url = $1 WHERE id = $2', [normalized.mediaUrl, productId]);
            return { id: productId };
        }
    });
    return toEnvelope(database, productId, executed);
};

const reorderProductMedia = async (database, rawProductId, { actor, body, requestId = null }) => {
    const productId = normalizePositiveId(rawProductId, 'Ürün kimliği');
    const mediaIds = body?.media_ids ?? body?.mediaIds;
    if (!Array.isArray(mediaIds) || mediaIds.length < 1 || mediaIds.length > MAX_PRODUCT_MEDIA) {
        invalidMedia('Medya sırası dolu bir dizi olmalıdır.', 'ADMIN_CATALOG_MEDIA_ORDER_INVALID');
    }
    const normalizedIds = mediaIds.map((id) => normalizePositiveId(id, 'Medya kimliği'));
    if (new Set(normalizedIds).size !== normalizedIds.length) invalidMedia('Medya sırası tekrar eden kimlik içeremez.', 'ADMIN_CATALOG_MEDIA_ORDER_INVALID');
    const rawCoverId = body?.cover_media_id ?? body?.coverMediaId;
    const coverId = rawCoverId === null ? null : normalizePositiveId(rawCoverId, 'Kapak medya kimliği');
    if (coverId !== null && !normalizedIds.includes(coverId)) invalidMedia('Kapak medyası sıralama listesinde olmalıdır.', 'ADMIN_CATALOG_MEDIA_COVER_INVALID');
    const executed = await executeAdminCatalogMutation({
        database,
        actor,
        entityType: 'product',
        entityKey: String(productId),
        action: 'reorder',
        expectedRevision: body?.expected_revision ?? body?.expectedRevision,
        changedFields: ['image_url', 'product_media'],
        requestId,
        metadata: { source: 'admin-commerce-pro', operation: 'media_reorder', storage_mutation: false },
        authorizeLockedTarget: authorizeFirstPartyMediaTarget,
        applyMutation: async (client) => {
            const current = await client.query(
                'SELECT id, media_url, media_type FROM product_media WHERE product_id = $1 ORDER BY id FOR UPDATE',
                [productId]
            );
            const currentIds = current.rows.map((row) => Number(row.id)).sort((a, b) => a - b);
            const proposedIds = [...normalizedIds].sort((a, b) => a - b);
            if (currentIds.length !== proposedIds.length || currentIds.some((id, index) => id !== proposedIds[index])) {
                invalidMedia('Medya sırası ürünün güncel medya kümesiyle eşleşmiyor.', 'ADMIN_CATALOG_MEDIA_SET_MISMATCH', 409);
            }
            const cover = current.rows.find((row) => Number(row.id) === coverId);
            const imageMedia = current.rows.filter((row) => row.media_type === 'image');
            if (coverId === null && imageMedia.length > 0) {
                invalidMedia('Görsel içeren medya kümesinde bir görsel kapak seçilmelidir.', 'ADMIN_CATALOG_MEDIA_COVER_INVALID');
            }
            if (coverId !== null && cover?.media_type !== 'image') {
                invalidMedia('Yalnız görsel medya kapak olabilir.', 'ADMIN_CATALOG_MEDIA_COVER_TYPE_INVALID');
            }
            // Clear the existing cover before promoting another row. The database
            // enforces one cover per product with a partial unique index, so a
            // row-by-row TRUE/FALSE swap can otherwise collide mid-transaction.
            await client.query(
                'UPDATE product_media SET is_main = FALSE WHERE product_id = $1 AND is_main = TRUE',
                [productId]
            );
            for (let index = 0; index < normalizedIds.length; index += 1) {
                await client.query(
                    'UPDATE product_media SET sort_order = $1 WHERE id = $2 AND product_id = $3',
                    [index, normalizedIds[index], productId]
                );
            }
            if (cover) {
                await client.query(
                    'UPDATE product_media SET is_main = TRUE WHERE id = $1 AND product_id = $2',
                    [coverId, productId]
                );
            }
            await client.query('UPDATE products SET image_url = $1 WHERE id = $2', [cover?.media_url || null, productId]);
            return { id: productId };
        }
    });
    return toEnvelope(database, productId, executed);
};

const deleteProductMediaRecord = async (database, rawProductId, rawMediaId, { actor, body, requestId = null }) => {
    const productId = normalizePositiveId(rawProductId, 'Ürün kimliği');
    const mediaId = normalizePositiveId(rawMediaId, 'Medya kimliği');
    const executed = await executeAdminCatalogMutation({
        database,
        actor,
        entityType: 'product',
        entityKey: String(productId),
        action: 'unlink',
        expectedRevision: body?.expected_revision ?? body?.expectedRevision,
        changedFields: ['image_url', 'product_media'],
        requestId,
        metadata: { source: 'admin-commerce-pro', operation: 'media_registry_delete', storage_mutation: false },
        authorizeLockedTarget: authorizeFirstPartyMediaTarget,
        applyMutation: async (client) => {
            const deleted = await client.query(
                `DELETE FROM product_media
                 WHERE id = $1 AND product_id = $2
                 RETURNING id, is_main`,
                [mediaId, productId]
            );
            if (!deleted.rows?.length) invalidMedia('Medya kaydı bulunamadı.', 'ADMIN_CATALOG_MEDIA_NOT_FOUND', 404);
            const remaining = await client.query(
                `SELECT id, media_url, media_type, is_main
                 FROM product_media
                 WHERE product_id = $1
                 ORDER BY is_main DESC, sort_order ASC, id ASC
                 FOR UPDATE`,
                [productId]
            );
            const nextCover = remaining.rows.find((row) => row.media_type === 'image' && row.is_main === true)
                || remaining.rows.find((row) => row.media_type === 'image')
                || null;
            await client.query('UPDATE product_media SET is_main = FALSE WHERE product_id = $1', [productId]);
            if (nextCover) {
                await client.query('UPDATE product_media SET is_main = TRUE WHERE id = $1 AND product_id = $2', [nextCover.id, productId]);
            }
            await client.query('UPDATE products SET image_url = $1 WHERE id = $2', [nextCover?.media_url || null, productId]);
            return { id: productId };
        }
    });
    return Object.freeze({
        ...(await toEnvelope(database, productId, executed)),
        providerAssetDeletionRequired: true
    });
};

module.exports = {
    MAX_PRODUCT_MEDIA,
    normalizeCloudinaryMediaUrl,
    listProductMedia,
    registerProductMedia,
    reorderProductMedia,
    updateProductMediaCardFraming,
    deleteProductMediaRecord
};
