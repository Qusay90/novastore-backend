const pool = require('../config/db');
const { cloudinary } = require('../config/cloudinary');
const { getUserFromRequestIfAny } = require('../middlewares/authMiddleware');
const {
    resolveProductCategoryAssignment,
    getProductCategoryLinks,
    syncProductCategoryAssignments,
    assertProductCategoryPublicationReady
} = require('../services/productCategoryService');
const { syncCategoryStatsForProducts } = require('../services/categoryStatsService');
const DEFAULT_PRODUCT_CATEGORY = 'Kategorisiz';
const BACKGROUND_REMOVAL_TRANSFORMATION = [
    { effect: 'background_removal' },
    {
        background: 'white',
        crop: 'pad',
        gravity: 'center',
        width: 1200,
        height: 1200,
        quality: 'auto',
        format: 'jpg'
    }
];
const PRODUCT_MEDIA_PREVIEW_FOLDER = 'novastore_product_previews/';

const parseProductId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) ? id : null;
};

const parsePrice = (value, fallback = null) => {
    if (value === undefined || value === null || value === '') return fallback;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : Number.NaN;
};

const parseStock = (value) => {
    if (value === undefined || value === null || value === '') return 0;
    const numericValue = Number(value);
    return Number.isInteger(numericValue) && numericValue >= 0 ? numericValue : Number.NaN;
};

const parseBooleanFlag = (value) => {
    if (typeof value === 'boolean') return value;

    const normalizedValue = String(value || '').trim().toLocaleLowerCase('tr-TR');
    return ['1', 'true', 'on', 'yes', 'evet'].includes(normalizedValue);
};

const PRODUCT_STATUSES = new Set(['draft', 'pending_approval', 'active', 'inactive', 'rejected', 'archived']);

const parseProductStatus = (body, existingProduct = null) => {
    const rawValue = body.publicationStatus ?? body.publication_status;
    const status = rawValue === undefined
        ? String(existingProduct?.publication_status || 'active')
        : String(rawValue).trim().toLowerCase();
    return PRODUCT_STATUSES.has(status) ? status : null;
};

const parseCustomerVisibility = (body, existingProduct = null) => {
    const rawValue = body.isCustomerVisible ?? body.is_customer_visible;
    return rawValue === undefined
        ? existingProduct?.is_customer_visible !== false
        : parseBooleanFlag(rawValue);
};

const parseDeletedAt = (body, existingProduct = null) => {
    const hasValue =
        Object.prototype.hasOwnProperty.call(body, 'deletedAt') ||
        Object.prototype.hasOwnProperty.call(body, 'deleted_at');
    if (!hasValue) return existingProduct?.deleted_at || null;
    const rawValue = Object.prototype.hasOwnProperty.call(body, 'deletedAt')
        ? body.deletedAt
        : body.deleted_at;
    if (rawValue === null || rawValue === '' || String(rawValue).toLowerCase() === 'null') return null;
    const parsed = new Date(rawValue);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const dedupeCategories = (values) => {
    const seen = new Set();
    const normalized = [];

    values.forEach((value) => {
        const categoryName = String(value || '').trim();
        if (!categoryName) return;

        const lookupKey = categoryName.toLocaleLowerCase('tr-TR');
        if (seen.has(lookupKey)) return;
        seen.add(lookupKey);
        normalized.push(categoryName);
    });

    return normalized;
};

const getExistingProductCategories = (existingProduct = null) => {
    if (!existingProduct) return [];

    const fallbackCategories = Array.isArray(existingProduct.categories) && existingProduct.categories.length > 0
        ? existingProduct.categories
        : [existingProduct.category];

    return dedupeCategories(fallbackCategories);
};

const parseProductCategories = (body = {}, existingProduct = null) => {
    let rawCategories = [];

    if (Array.isArray(body.categories)) {
        rawCategories = body.categories;
    } else if (typeof body.categories === 'string' && body.categories.trim()) {
        try {
            const parsed = JSON.parse(body.categories);
            rawCategories = Array.isArray(parsed) ? parsed : [body.categories];
        } catch (_) {
            rawCategories = [body.categories];
        }
    }

    if (rawCategories.length === 0 && body.category !== undefined) {
        rawCategories = [body.category];
    }

    if (rawCategories.length === 0) {
        rawCategories = getExistingProductCategories(existingProduct);
    }

    const categories = dedupeCategories(rawCategories);
    return categories.length > 0 ? categories : [DEFAULT_PRODUCT_CATEGORY];
};

const normalizeProductRow = (product = {}) => {
    const categories = dedupeCategories(
        Array.isArray(product.categories) && product.categories.length > 0
            ? product.categories
            : [product.category]
    );
    const primaryCategory = categories[0] || String(product.category || '').trim() || DEFAULT_PRODUCT_CATEGORY;

    return {
        ...product,
        category: primaryCategory,
        categories: categories.length > 0 ? categories : [primaryCategory],
        is_purchasable:
            product.publication_status === 'active' &&
            product.is_customer_visible !== false &&
            !product.deleted_at &&
            Number(product.stock || 0) > 0
    };
};

const normalizeMediaUrl = (file) => {
    if (!file) return null;
    return file.path || file.secure_url || file.url || null;
};

const getUploadedPublicId = (file) => {
    return String(file?.filename || file?.public_id || '').trim();
};

const getUploadedFileName = (file) => {
    return String(
        file?.originalname || file?.original_filename || file?.filename || file?.public_id || ''
    ).trim();
};

const normalizeComparableFileName = (value) => {
    return String(value || '')
        .trim()
        .split(/[\\/]/)
        .pop()
        .toLowerCase();
};

const stripFileExtension = (value) => {
    return String(value || '').replace(/\.[^/.]+$/, '');
};

const getUploadedFileSize = (file) => {
    const numericValue = Number(file?.size);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
};

const getBackgroundRemovalRequestedForFile = (mediaEntry, fallbackValue = false) => {
    if (!mediaEntry || typeof mediaEntry !== 'object' || !('file' in mediaEntry)) {
        return fallbackValue;
    }

    return fallbackValue || parseBooleanFlag(mediaEntry.removeBackground);
};

const formatBackgroundRemovalFailureReason = (reason) => {
    const normalizedReason = String(reason || '').trim();
    if (!normalizedReason) {
        return 'Arka plan kaldırma önizlemesi Cloudinary tarafında hazırlanamadı.';
    }

    if (/less than 64x64/i.test(normalizedReason) || /too small/i.test(normalizedReason)) {
        return 'Görsel çok küçük. Arka plan kaldırma önizlemesi için en az 64x64 px görsel gerekiyor.';
    }

    if (/unsupported/i.test(normalizedReason)) {
        return 'Bu görsel formatı arka plan kaldırma önizlemesinde desteklenmiyor.';
    }

    return `Arka plan kaldırma önizlemesi hazırlanamadı: ${normalizedReason}`;
};

const extractCloudinaryAssetFromUrl = (mediaUrl) => {
    try {
        const parsedUrl = new URL(String(mediaUrl || '').trim());
        if (!/cloudinary\.com$/i.test(parsedUrl.hostname)) {
            return null;
        }

        const segments = parsedUrl.pathname.split('/').filter(Boolean);
        const uploadIndex = segments.findIndex((segment) => segment === 'upload');
        if (uploadIndex < 1) {
            return null;
        }

        const resourceType = segments[uploadIndex - 1];
        const versionIndex = segments.findIndex((segment, index) => index > uploadIndex && /^v\d+$/i.test(segment));
        if (versionIndex < 0 || versionIndex === segments.length - 1) {
            return null;
        }

        const publicIdWithExtension = segments.slice(versionIndex + 1).join('/');
        const publicId = stripFileExtension(publicIdWithExtension);
        const extensionMatch = publicIdWithExtension.match(/\.([a-z0-9]+)$/i);

        if (!publicId) {
            return null;
        }

        return {
            resourceType,
            publicId,
            extension: extensionMatch ? extensionMatch[1].toLocaleLowerCase('tr-TR') : '',
            mediaUrl: parsedUrl.toString()
        };
    } catch (_) {
        return null;
    }
};

const isBackgroundRemovedUrl = (mediaUrl) => {
    return /e_background_removal/i.test(String(mediaUrl || ''));
};

const isBackgroundRemovalEligibleForAsset = (asset) => {
    if (!asset || asset.resourceType !== 'image') {
        return false;
    }

    return asset.extension !== 'gif';
};

const isBackgroundRemovalEligible = (file) => {
    const mimeType = String(file?.mimetype || '').trim().toLocaleLowerCase('tr-TR');
    const fileName = getUploadedFileName(file).toLocaleLowerCase('tr-TR');

    const looksLikeImage = mimeType.startsWith('image/')
        || /\.(avif|bmp|heic|heif|jpe?g|png|tiff?|webp)$/i.test(fileName);

    if (!looksLikeImage) return false;
    if (mimeType === 'image/gif' || /\.gif$/i.test(fileName)) return false;
    return true;
};

const buildBackgroundRemovedMediaUrl = (publicId) => {
    return cloudinary.url(publicId, {
        secure: true,
        resource_type: 'image',
        type: 'upload',
        transformation: BACKGROUND_REMOVAL_TRANSFORMATION
    });
};

const buildBackgroundRemovalPreviewForAsset = async (asset) => {
    if (!asset || !asset.publicId || !isBackgroundRemovalEligibleForAsset(asset)) {
        return {
            url: null,
            warning: 'Bu medya için arka plan kaldırma önizlemesi kullanılamaz.'
        };
    }

    try {
        const explicitResult = await cloudinary.uploader.explicit(asset.publicId, {
            type: 'upload',
            resource_type: 'image',
            eager: [BACKGROUND_REMOVAL_TRANSFORMATION],
            eager_async: false
        });

        const eagerResult = explicitResult?.eager?.[0] || null;
        if (String(eagerResult?.status || '').toLocaleLowerCase('tr-TR') === 'failed') {
            return {
                url: null,
                warning: formatBackgroundRemovalFailureReason(eagerResult?.reason)
            };
        }

        const transformedUrl = eagerResult?.secure_url || buildBackgroundRemovedMediaUrl(asset.publicId);
        if (!transformedUrl) {
            return {
                url: null,
                warning: formatBackgroundRemovalFailureReason('Cloudinary transformed URL uretmedi.')
            };
        }

        return { url: transformedUrl, warning: null };
    } catch (error) {
        console.error(`Arka plan kaldırma hatası (${asset.publicId}):`, error.message);
        return {
            url: null,
            warning: formatBackgroundRemovalFailureReason(error.message)
        };
    }
};

const destroyCloudinaryAsset = async (publicId, resourceType = 'image') => {
    if (!publicId) return;

    try {
        await cloudinary.uploader.destroy(publicId, {
            invalidate: true,
            type: 'upload',
            resource_type: resourceType
        });
    } catch (error) {
        console.error(`Cloudinary varlık silme hatası (${publicId}):`, error.message);
    }
};

const applyBackgroundRemovalToFile = async (file) => {
    const originalUrl = normalizeMediaUrl(file);
    const publicId = getUploadedPublicId(file);

    if (!originalUrl || !publicId || !isBackgroundRemovalEligible(file)) {
        return { url: originalUrl, warning: null };
    }

    const previewResult = await buildBackgroundRemovalPreviewForAsset({
        publicId,
        resourceType: 'image',
        extension: stripFileExtension(getUploadedFileName(file)) === getUploadedFileName(file)
            ? ''
            : String(getUploadedFileName(file)).split('.').pop().toLocaleLowerCase('tr-TR')
    });

    if (!previewResult.url || previewResult.warning) {
        return {
            url: originalUrl,
            warning: `${getUploadedFileName(file) || 'Bir görsel'} için ${previewResult.warning || 'Arka plan kaldırma uygulanamadı; orijinal dosya korundu.'}`
        };
    }

    return { url: previewResult.url, warning: null };
};

const buildProductMediaUrls = async (mediaEntries, shouldRemoveBackground = false) => {
    if (!Array.isArray(mediaEntries) || mediaEntries.length === 0) {
        return { mediaUrls: [], warnings: [] };
    }

    const processedFiles = await Promise.all(mediaEntries.map(async (mediaEntry) => {
        const file = mediaEntry && typeof mediaEntry === 'object' && 'file' in mediaEntry
            ? mediaEntry.file
            : mediaEntry;

        if (!getBackgroundRemovalRequestedForFile(mediaEntry, shouldRemoveBackground)) {
            return {
                url: normalizeMediaUrl(file),
                warning: null
            };
        }

        return applyBackgroundRemovalToFile(file);
    }));

    return {
        mediaUrls: processedFiles.map((item) => item.url).filter(Boolean),
        warnings: processedFiles.map((item) => item.warning).filter(Boolean)
    };
};

const parseMediaOrder = (rawValue) => {
    if (!rawValue) return [];

    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((item, index) => ({
                index: Number.isInteger(Number(item?.index)) ? Number(item.index) : index,
                name: String(item?.name || '').trim(),
                size: Number.isFinite(Number(item?.size)) ? Number(item.size) : null,
                removeBackground: parseBooleanFlag(item?.removeBackground)
            }))
            .filter((item) => item.name);
    } catch (_) {
        return [];
    }
};

const reorderUploadedFiles = (files, rawMediaOrder) => {
    if (!Array.isArray(files) || files.length === 0) return [];

    const mediaOrder = parseMediaOrder(rawMediaOrder);
    if (mediaOrder.length === 0) {
        return files.map((file) => ({
            file,
            removeBackground: false
        }));
    }

    const usedOrderIndexes = new Set();

    return files
        .map((file, fallbackIndex) => {
            const fileName = getUploadedFileName(file);
            const normalizedFileName = normalizeComparableFileName(fileName);
            const normalizedFileBaseName = stripFileExtension(normalizedFileName);
            const fileSize = getUploadedFileSize(file);
            const matchIndex = mediaOrder.findIndex((entry, orderIndex) => {
                if (usedOrderIndexes.has(orderIndex)) return false;

                const normalizedEntryName = normalizeComparableFileName(entry.name);
                const normalizedEntryBaseName = stripFileExtension(normalizedEntryName);
                const sameName = normalizedEntryName === normalizedFileName
                    || normalizedEntryBaseName === normalizedFileBaseName;
                const sameSize = fileSize === null || entry.size === null || fileSize === entry.size;
                return sameName && sameSize;
            });

            if (matchIndex >= 0) {
                usedOrderIndexes.add(matchIndex);
            }

            return {
                file,
                fallbackIndex,
                sortIndex: matchIndex >= 0 ? mediaOrder[matchIndex].index : mediaOrder.length + fallbackIndex,
                removeBackground: matchIndex >= 0 ? mediaOrder[matchIndex].removeBackground : false
            };
        })
        .sort((left, right) => {
            if (left.sortIndex !== right.sortIndex) {
                return left.sortIndex - right.sortIndex;
            }
            return left.fallbackIndex - right.fallbackIndex;
        });
};

const setMainMediaForProduct = async (client, productId, mediaUrl = null) => {
    if (!mediaUrl) {
        await client.query('UPDATE products SET image_url = NULL WHERE id = $1', [productId]);
        return;
    }

    await client.query('UPDATE product_media SET is_main = FALSE WHERE product_id = $1', [productId]);
    await client.query(
        'UPDATE product_media SET is_main = TRUE WHERE product_id = $1 AND media_url = $2',
        [productId, mediaUrl]
    );
    await client.query('UPDATE products SET image_url = $1 WHERE id = $2', [mediaUrl, productId]);
};

const syncMainMediaFromDatabase = async (client, productId) => {
    const nextMediaResult = await client.query(
        `SELECT id, media_url
         FROM product_media
         WHERE product_id = $1
         ORDER BY is_main DESC, sort_order ASC, id ASC
         LIMIT 1`,
        [productId]
    );

    if (nextMediaResult.rows.length === 0) {
        await setMainMediaForProduct(client, productId, null);
        return null;
    }

    const nextMedia = nextMediaResult.rows[0];
    await client.query('UPDATE product_media SET is_main = FALSE WHERE product_id = $1', [productId]);
    await client.query('UPDATE product_media SET is_main = TRUE WHERE id = $1', [nextMedia.id]);
    await client.query('UPDATE products SET image_url = $1 WHERE id = $2', [nextMedia.media_url, productId]);
    return nextMedia.media_url;
};

const buildProductPayload = async (body, files, existingProduct = null) => {
    const orderedFiles = reorderUploadedFiles(files, body.mediaOrder);
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim() || null;
    const categories = parseProductCategories(body, existingProduct);
    const category = categories[0] || DEFAULT_PRODUCT_CATEGORY;
    const price = parsePrice(body.price);
    const oldPrice = parsePrice(body.oldPrice, null);
    const stock = parseStock(body.stock);
    const removeBackground = parseBooleanFlag(body.removeBackground);
    const publicationStatus = parseProductStatus(body, existingProduct);
    const isCustomerVisible = parseCustomerVisibility(body, existingProduct);
    const deletedAt = parseDeletedAt(body, existingProduct);

    if (!name) {
        return { error: 'Ürün adı zorunludur.' };
    }
    if (!Number.isFinite(price) || price < 0) {
        return { error: 'Ürün fiyatı geçersiz.' };
    }
    if (oldPrice !== null && (!Number.isFinite(oldPrice) || oldPrice < 0)) {
        return { error: 'Eski fiyat geçersiz.' };
    }
    if (!Number.isInteger(stock)) {
        return { error: 'Stok bilgisi geçersiz.' };
    }

    if (!publicationStatus) {
        return { error: 'Ürün yayın durumu geçersiz.' };
    }
    if (deletedAt === undefined) {
        return { error: 'Ürün silinme tarihi geçersiz.' };
    }

    const { mediaUrls, warnings } = await buildProductMediaUrls(orderedFiles, removeBackground);

    return {
        name,
        description,
        category,
        categories,
        price,
        oldPrice,
        stock,
        publicationStatus,
        isCustomerVisible,
        deletedAt,
        mediaUrls,
        warnings,
        mainImageUrl: mediaUrls[0] || existingProduct?.image_url || null
    };
};

const buildProductMediaMap = (mediaRows) => {
    const mediaByProductId = new Map();

    mediaRows.forEach((mediaRow) => {
        const productId = Number(mediaRow.product_id);
        if (!mediaByProductId.has(productId)) {
            mediaByProductId.set(productId, []);
        }
        mediaByProductId.get(productId).push(mediaRow);
    });

    return mediaByProductId;
};

const getAllProducts = async (req, res) => {
    try {
        const isAdmin = getUserFromRequestIfAny(req)?.role === 'admin';
        const visibilityWhere = isAdmin
            ? ''
            : `WHERE p.publication_status = 'active'
                 AND p.is_customer_visible = TRUE
                 AND p.deleted_at IS NULL`;
        const [productsResult, mediaResult, categoryLinksResult] = await Promise.all([
            pool.query(`
                SELECT p.*,
                       ROUND(COALESCE(AVG(r.rating), 0), 1) AS average_rating,
                       CAST(COUNT(r.id) AS INTEGER) AS review_count
                FROM products p
                LEFT JOIN reviews r ON p.id = r.product_id
                ${visibilityWhere}
                GROUP BY p.id
                ORDER BY ${isAdmin ? '' : 'CASE WHEN p.stock > 0 THEN 0 ELSE 1 END,'} p.created_at DESC
            `),
            pool.query(`
                SELECT *
                FROM product_media
                ORDER BY product_id ASC, is_main DESC, sort_order ASC, id ASC
            `),
            isAdmin
                ? pool.query(`
                    SELECT product_id, category_id, is_primary
                    FROM product_categories
                    ORDER BY product_id, is_primary DESC, category_id
                `)
                : Promise.resolve({ rows: [] })
        ]);

        const mediaByProductId = buildProductMediaMap(mediaResult.rows);
        const categoriesByProductId = new Map();
        categoryLinksResult.rows.forEach((link) => {
            const productId = Number(link.product_id);
            if (!categoriesByProductId.has(productId)) categoriesByProductId.set(productId, []);
            categoriesByProductId.get(productId).push({
                categoryId: Number(link.category_id),
                isPrimary: link.is_primary === true
            });
        });
        const products = productsResult.rows.map((product) => {
            const links = categoriesByProductId.get(Number(product.id)) || [];
            return {
                ...normalizeProductRow(product),
                media: mediaByProductId.get(Number(product.id)) || [],
                ...(isAdmin ? {
                    categoryIds: links.map((item) => item.categoryId),
                    primaryCategoryId: links.find((item) => item.isPrimary)?.categoryId || null
                } : {})
            };
        });

        res.status(200).json(products);
    } catch (err) {
        console.error('Ürün listeleme hatası:', err.message);
        res.status(500).json({ error: 'Ürünler getirilirken sunucu hatası oluştu.' });
    }
};

const createProduct = async (req, res) => {
    const client = await pool.connect();

    try {
        const payload = await buildProductPayload(req.body, req.files);
        if (payload.error) {
            return res.status(400).json({ error: payload.error });
        }

        await client.query('BEGIN');
        const categoryResolution = await resolveProductCategoryAssignment(
            client,
            req.body,
            payload.categories
        );
        assertProductCategoryPublicationReady(payload.publicationStatus, categoryResolution.assignments);
        if (categoryResolution.replace) {
            payload.categories = categoryResolution.categoryNames;
            payload.category = categoryResolution.categoryNames[0];
        }

        const insertResult = await client.query(
            `INSERT INTO products (
                name, price, old_price, stock, description, image_url, category, categories,
                publication_status, is_customer_visible, deleted_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [
                payload.name,
                payload.price,
                payload.oldPrice,
                payload.stock,
                payload.description,
                payload.mainImageUrl,
                payload.category,
                payload.categories,
                payload.publicationStatus,
                payload.isCustomerVisible,
                payload.deletedAt
            ]
        );

        const product = insertResult.rows[0];
        const categorySync = await syncProductCategoryAssignments(
            client,
            product.id,
            categoryResolution
        );

        for (let i = 0; i < payload.mediaUrls.length; i += 1) {
            await client.query(
                'INSERT INTO product_media (product_id, media_url, is_main, sort_order) VALUES ($1, $2, $3, $4)',
                [product.id, payload.mediaUrls[i], i === 0, i]
            );
        }

        if (payload.mediaUrls.length > 0) {
            await setMainMediaForProduct(client, product.id, payload.mediaUrls[0]);
        }
        await syncCategoryStatsForProducts(
            client,
            [product.id],
            categorySync.previous.map((item) => item.categoryId)
        );

        await client.query('COMMIT');

        res.status(201).json({
            mesaj: 'Ürün başarıyla vitrine eklendi.',
            warnings: [...payload.warnings, ...categoryResolution.warnings],
            product: {
                ...normalizeProductRow(product),
                categoryIds: categorySync.current.map((item) => item.categoryId),
                primaryCategoryId: categorySync.current.find((item) => item.isPrimary)?.categoryId || null
            }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (!err.statusCode || err.statusCode >= 500) {
            console.error('Ürün ekleme hatası:', err.message);
        }

        const isValueTooLong = err.code === '22001';
        const message = isValueTooLong
            ? 'Ürün görsel adresi veritabanı alanına sığmadı. URL alanları büyütüldü; sunucuyu yeniden başlatıp tekrar deneyin.'
            : (err.message || 'Ürün eklenirken bir hata meydana geldi.');

        res.status(err.statusCode || 500).json({
            error: message,
            code: err.code,
            details: err.details
        });
    } finally {
        client.release();
    }
};

const getProductById = async (req, res) => {
    try {
        const id = parseProductId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Geçersiz ürün kimliği.' });
        }

        const isAdmin = getUserFromRequestIfAny(req)?.role === 'admin';
        const result = await pool.query(
            `SELECT * FROM products
             WHERE id = $1
             ${isAdmin ? '' : `AND publication_status = 'active'
                 AND is_customer_visible = TRUE
                 AND deleted_at IS NULL`}`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ürün bulunamadı.' });
        }

        const mediaResult = await pool.query(
            'SELECT * FROM product_media WHERE product_id = $1 ORDER BY is_main DESC, sort_order ASC, id ASC',
            [id]
        );

        const product = normalizeProductRow(result.rows[0]);
        product.media = mediaResult.rows;
        const categoryLinks = await getProductCategoryLinks(pool, id);
        product.categoryIds = categoryLinks.map((item) => item.categoryId);
        product.primaryCategoryId = categoryLinks.find((item) => item.isPrimary)?.categoryId || null;

        res.status(200).json(product);
    } catch (err) {
        console.error('Ürün detay hatası:', err.message);
        res.status(500).json({ error: 'Ürün detayları getirilemedi.' });
    }
};

const deleteProduct = async (req, res) => {
    const client = await pool.connect();

    try {
        const id = parseProductId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Geçersiz ürün kimliği.' });
        }

        await client.query('BEGIN');
        const previousLinks = await getProductCategoryLinks(client, id);

        await client.query('DELETE FROM product_media WHERE product_id = $1', [id]);
        await client.query('DELETE FROM reviews WHERE product_id = $1', [id]);
        await client.query('DELETE FROM product_questions WHERE product_id = $1', [id]);

        const deleteResult = await client.query(
            'DELETE FROM products WHERE id = $1 RETURNING id',
            [id]
        );

        if (deleteResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Ürün bulunamadı.' });
        }

        await syncCategoryStatsForProducts(
            client,
            [id],
            previousLinks.map((item) => item.categoryId)
        );
        await client.query('COMMIT');
        res.status(200).json({ mesaj: 'Ürün başarıyla silindi.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ürün silme hatası:', err.message);
        res.status(500).json({ error: err.message || 'Ürün silinirken hata oluştu.' });
    } finally {
        client.release();
    }
};

const previewProductMediaBackgroundRemoval = async (req, res) => {
    const uploadedFile = req.file;
    if (!uploadedFile) {
        return res.status(400).json({ error: 'Önizleme için bir görsel seçin.' });
    }

    const publicId = getUploadedPublicId(uploadedFile);
    if (!isBackgroundRemovalEligible(uploadedFile)) {
        await destroyCloudinaryAsset(publicId);
        return res.status(400).json({ error: 'Arka plan kaldırma önizlemesi yalnızca standart görsellerde kullanılabilir. Video ve GIF dosyaları desteklenmiyor.' });
    }

    try {
        const previewResult = await applyBackgroundRemovalToFile(uploadedFile);
        if (!previewResult.url || previewResult.warning) {
            await destroyCloudinaryAsset(publicId);
            return res.status(422).json({ error: previewResult.warning || 'Önizleme oluşturulamadı.' });
        }

        return res.status(200).json({
            mesaj: 'Arka plan kaldırma önizlemesi hazır.',
            originalUrl: normalizeMediaUrl(uploadedFile),
            previewPublicId: publicId,
            previewUrl: previewResult.url
        });
    } catch (error) {
        await destroyCloudinaryAsset(publicId);
        console.error('Arka plan kaldırma önizleme hatası:', error.message);
        return res.status(500).json({ error: 'Arka plan kaldırma önizlemesi hazırlanamadı.' });
    }
};

const previewExistingProductMediaBackgroundRemoval = async (req, res) => {
    try {
        const mediaId = parseProductId(req.params.mediaId);
        if (!mediaId) {
            return res.status(400).json({ error: 'Geçersiz medya kimliği.' });
        }

        const mediaResult = await pool.query(
            'SELECT id, media_url FROM product_media WHERE id = $1',
            [mediaId]
        );

        if (mediaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Medya bulunamadı.' });
        }

        const mediaRow = mediaResult.rows[0];
        const asset = extractCloudinaryAssetFromUrl(mediaRow.media_url);
        if (!isBackgroundRemovalEligibleForAsset(asset)) {
            return res.status(400).json({ error: 'Arka plan kaldırma önizlemesi yalnızca standart görsellerde kullanılabilir. Video ve GIF dosyaları desteklenmiyor.' });
        }

        const previewResult = await buildBackgroundRemovalPreviewForAsset(asset);
        if (!previewResult.url || previewResult.warning) {
            return res.status(422).json({ error: previewResult.warning || 'Arka plan kaldırma önizlemesi hazırlanamadı.' });
        }

        return res.status(200).json({
            mesaj: 'Arka plan kaldırma önizlemesi hazır.',
            mediaId,
            previewUrl: previewResult.url
        });
    } catch (error) {
        console.error('Mevcut medya arka plan önizleme hatası:', error.message);
        return res.status(500).json({ error: 'Arka plan kaldırma önizlemesi hazırlanamadı.' });
    }
};

const applyExistingProductMediaBackgroundRemoval = async (req, res) => {
    const client = await pool.connect();

    try {
        const mediaId = parseProductId(req.params.mediaId);
        if (!mediaId) {
            return res.status(400).json({ error: 'Geçersiz medya kimliği.' });
        }

        const previewUrl = String(req.body?.previewUrl || '').trim();
        if (!previewUrl) {
            return res.status(400).json({ error: 'Önizleme görseli bulunamadı.' });
        }

        await client.query('BEGIN');

        const mediaResult = await client.query(
            `SELECT pm.id, pm.product_id, pm.media_url, pm.is_main, p.image_url
             FROM product_media pm
             INNER JOIN products p ON p.id = pm.product_id
             WHERE pm.id = $1
             FOR UPDATE`,
            [mediaId]
        );

        if (mediaResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Medya bulunamadı.' });
        }

        const mediaRow = mediaResult.rows[0];
        const sourceAsset = extractCloudinaryAssetFromUrl(mediaRow.media_url);
        const previewAsset = extractCloudinaryAssetFromUrl(previewUrl);

        if (!isBackgroundRemovalEligibleForAsset(sourceAsset)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Arka plan kaldırma yalnızca standart görsellerde kullanılabilir.' });
        }

        const previewBelongsToSameAsset = previewAsset
            && previewAsset.publicId === sourceAsset.publicId
            && previewAsset.resourceType === 'image'
            && isBackgroundRemovedUrl(previewUrl);

        const nextMediaUrl = previewBelongsToSameAsset
            ? previewUrl
            : buildBackgroundRemovedMediaUrl(sourceAsset.publicId);

        await client.query(
            'UPDATE product_media SET media_url = $1 WHERE id = $2',
            [nextMediaUrl, mediaId]
        );

        if (mediaRow.is_main || mediaRow.image_url === mediaRow.media_url) {
            await client.query(
                'UPDATE products SET image_url = $1 WHERE id = $2',
                [nextMediaUrl, mediaRow.product_id]
            );
        }

        await client.query('COMMIT');

        return res.status(200).json({
            mesaj: 'Mevcut görsel arka plansız güncellendi.',
            media: {
                id: mediaRow.id,
                product_id: mediaRow.product_id,
                media_url: nextMediaUrl,
                is_main: mediaRow.is_main
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Mevcut medya arka plan uygulama hatası:', error.message);
        return res.status(500).json({ error: 'Mevcut görsel arka plansız güncellenemedi.' });
    } finally {
        client.release();
    }
};

const cleanupProductMediaPreview = async (req, res) => {
    const publicId = String(req.body?.publicId || '').trim();
    if (!publicId || !publicId.startsWith(PRODUCT_MEDIA_PREVIEW_FOLDER)) {
        return res.status(400).json({ error: 'Geçersiz önizleme kimliği.' });
    }

    await destroyCloudinaryAsset(publicId);
    return res.status(200).json({ mesaj: 'Onizleme temizlendi.' });
};

const updateProduct = async (req, res) => {
    const client = await pool.connect();

    try {
        const id = parseProductId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Geçersiz ürün kimliği.' });
        }

        await client.query('BEGIN');

        const existingResult = await client.query(
            'SELECT * FROM products WHERE id = $1 FOR UPDATE',
            [id]
        );

        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Ürün bulunamadı.' });
        }

        const existingProduct = existingResult.rows[0];
        const payload = await buildProductPayload(req.body, req.files, existingProduct);
        if (payload.error) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: payload.error });
        }
        const categoryResolution = await resolveProductCategoryAssignment(
            client,
            req.body,
            payload.categories,
            { isUpdate: true }
        );
        const effectiveCategoryAssignments = categoryResolution.replace
            ? categoryResolution.assignments
            : await getProductCategoryLinks(client, id);
        assertProductCategoryPublicationReady(payload.publicationStatus, effectiveCategoryAssignments);
        if (categoryResolution.replace) {
            payload.categories = categoryResolution.categoryNames;
            payload.category = categoryResolution.categoryNames[0];
        }

        const nextMainImageUrl = payload.mediaUrls[0] || existingProduct.image_url || null;

        const updateResult = await client.query(
            `UPDATE products
             SET name = $1,
                 price = $2,
                 old_price = $3,
                 stock = $4,
                 description = $5,
                 category = $6,
                 categories = $7,
                 image_url = $8,
                 publication_status = $9,
                 is_customer_visible = $10,
                 deleted_at = $11,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $12
             RETURNING *`,
            [
                payload.name,
                payload.price,
                payload.oldPrice,
                payload.stock,
                payload.description,
                payload.category,
                payload.categories,
                nextMainImageUrl,
                payload.publicationStatus,
                payload.isCustomerVisible,
                payload.deletedAt,
                id
            ]
        );

        if (payload.mediaUrls.length > 0) {
            const orderResult = await client.query(
                'SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM product_media WHERE product_id = $1',
                [id]
            );
            const nextSortOrder = Number(orderResult.rows[0]?.max_sort_order || -1) + 1;

            await client.query('UPDATE product_media SET is_main = FALSE WHERE product_id = $1', [id]);
            for (let i = 0; i < payload.mediaUrls.length; i += 1) {
                await client.query(
                    'INSERT INTO product_media (product_id, media_url, is_main, sort_order) VALUES ($1, $2, $3, $4)',
                    [id, payload.mediaUrls[i], i === 0, nextSortOrder + i]
                );
            }
            await setMainMediaForProduct(client, id, payload.mediaUrls[0]);
        }
        const categorySync = await syncProductCategoryAssignments(
            client,
            id,
            categoryResolution
        );
        await syncCategoryStatsForProducts(
            client,
            [id],
            categorySync.previous.map((item) => item.categoryId)
        );

        await client.query('COMMIT');
        res.status(200).json({
            mesaj: 'Ürün bilgileri güncellendi.',
            warnings: [...payload.warnings, ...categoryResolution.warnings],
            product: {
                ...normalizeProductRow(updateResult.rows[0]),
                categoryIds: categorySync.current.map((item) => item.categoryId),
                primaryCategoryId: categorySync.current.find((item) => item.isPrimary)?.categoryId || null
            }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (!err.statusCode || err.statusCode >= 500) {
            console.error('Ürün güncelleme hatası:', err.message);
        }
        res.status(err.statusCode || 500).json({
            error: err.message || 'Ürün güncellenemedi.',
            code: err.code,
            details: err.details
        });
    } finally {
        client.release();
    }
};

const deleteProductMedia = async (req, res) => {
    const client = await pool.connect();

    try {
        const mediaId = parseProductId(req.params.mediaId);
        if (!mediaId) {
            return res.status(400).json({ error: 'Geçersiz medya kimliği.' });
        }

        await client.query('BEGIN');

        const productResult = await client.query(
            'SELECT image_url FROM products WHERE id = (SELECT product_id FROM product_media WHERE id = $1)',
            [mediaId]
        );

        const currentProductImage = productResult.rows[0] ? productResult.rows[0].image_url : null;

        const mediaResult = await client.query(
            'DELETE FROM product_media WHERE id = $1 RETURNING id, product_id, is_main, media_url',
            [mediaId]
        );

        if (mediaResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Medya bulunamadı.' });
        }

        const removedMedia = mediaResult.rows[0];
        if (removedMedia.is_main || currentProductImage === removedMedia.media_url) {
            await syncMainMediaFromDatabase(client, removedMedia.product_id);
        }

        await client.query('COMMIT');
        res.status(200).json({ mesaj: 'Medya başarıyla silindi.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Medya silme hatası:', err.message);
        res.status(500).json({ error: err.message || 'Medya silinemedi.' });
    } finally {
        client.release();
    }
};

module.exports = {
    getAllProducts,
    createProduct,
    getProductById,
    deleteProduct,
    updateProduct,
    deleteProductMedia,
    previewProductMediaBackgroundRemoval,
    previewExistingProductMediaBackgroundRemoval,
    applyExistingProductMediaBackgroundRemoval,
    cleanupProductMediaPreview
};
