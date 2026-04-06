const pool = require('../config/db');
const { cloudinary } = require('../config/cloudinary');
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
        categories: categories.length > 0 ? categories : [primaryCategory]
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
        return 'Arka plan kaldirma onizlemesi Cloudinary tarafinda hazirlanamadi.';
    }

    if (/less than 64x64/i.test(normalizedReason) || /too small/i.test(normalizedReason)) {
        return 'Gorsel cok kucuk. Arka plan kaldirma onizlemesi icin en az 64x64 px gorsel gerekiyor.';
    }

    if (/unsupported/i.test(normalizedReason)) {
        return 'Bu gorsel formati arka plan kaldirma onizlemesinde desteklenmiyor.';
    }

    return `Arka plan kaldirma onizlemesi hazirlanamadi: ${normalizedReason}`;
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
            warning: 'Bu medya icin arka plan kaldirma onizlemesi kullanilamaz.'
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
        console.error(`Arka plan kaldirma hatasi (${asset.publicId}):`, error.message);
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
        console.error(`Cloudinary varlik silme hatasi (${publicId}):`, error.message);
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
            warning: `${getUploadedFileName(file) || 'Bir gorsel'} icin ${previewResult.warning || 'Arka plan kaldirma uygulanamadi; orijinal dosya korundu.'}`
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

    if (!name) {
        return { error: 'Urun adi zorunludur.' };
    }
    if (!Number.isFinite(price) || price < 0) {
        return { error: 'Urun fiyati gecersiz.' };
    }
    if (oldPrice !== null && (!Number.isFinite(oldPrice) || oldPrice < 0)) {
        return { error: 'Eski fiyat gecersiz.' };
    }
    if (!Number.isInteger(stock)) {
        return { error: 'Stok bilgisi gecersiz.' };
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
        const [productsResult, mediaResult] = await Promise.all([
            pool.query(`
                SELECT p.*,
                       ROUND(COALESCE(AVG(r.rating), 0), 1) AS average_rating,
                       CAST(COUNT(r.id) AS INTEGER) AS review_count
                FROM products p
                LEFT JOIN reviews r ON p.id = r.product_id
                GROUP BY p.id
                ORDER BY p.created_at DESC
            `),
            pool.query(`
                SELECT *
                FROM product_media
                ORDER BY product_id ASC, is_main DESC, sort_order ASC, id ASC
            `)
        ]);

        const mediaByProductId = buildProductMediaMap(mediaResult.rows);
        const products = productsResult.rows.map((product) => ({
            ...normalizeProductRow(product),
            media: mediaByProductId.get(Number(product.id)) || []
        }));

        res.status(200).json(products);
    } catch (err) {
        console.error('Urun listeleme hatasi:', err.message);
        res.status(500).json({ error: 'Urunler getirilirken sunucu hatasi olustu.' });
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

        const insertResult = await client.query(
            `INSERT INTO products (name, price, old_price, stock, description, image_url, category, categories)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                payload.name,
                payload.price,
                payload.oldPrice,
                payload.stock,
                payload.description,
                payload.mainImageUrl,
                payload.category,
                payload.categories
            ]
        );

        const product = insertResult.rows[0];

        for (let i = 0; i < payload.mediaUrls.length; i += 1) {
            await client.query(
                'INSERT INTO product_media (product_id, media_url, is_main, sort_order) VALUES ($1, $2, $3, $4)',
                [product.id, payload.mediaUrls[i], i === 0, i]
            );
        }

        if (payload.mediaUrls.length > 0) {
            await setMainMediaForProduct(client, product.id, payload.mediaUrls[0]);
        }

        await client.query('COMMIT');

        res.status(201).json({
            mesaj: 'Urun basariyla vitrine eklendi.',
            warnings: payload.warnings,
            product: normalizeProductRow(product)
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Urun ekleme hatasi:', err.message);

        const isValueTooLong = err.code === '22001';
        const message = isValueTooLong
            ? 'Urun gorsel adresi veritabani alanina sigmadi. URL alanlari buyutuldu; sunucuyu yeniden baslatip tekrar deneyin.'
            : (err.message || 'Urun eklenirken bir hata meydana geldi.');

        res.status(500).json({ error: message });
    } finally {
        client.release();
    }
};

const getProductById = async (req, res) => {
    try {
        const id = parseProductId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Gecersiz urun kimligi.' });
        }

        const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Urun bulunamadi.' });
        }

        const mediaResult = await pool.query(
            'SELECT * FROM product_media WHERE product_id = $1 ORDER BY is_main DESC, sort_order ASC, id ASC',
            [id]
        );

        const product = normalizeProductRow(result.rows[0]);
        product.media = mediaResult.rows;

        res.status(200).json(product);
    } catch (err) {
        console.error('Urun detay hatasi:', err.message);
        res.status(500).json({ error: 'Urun detaylari getirilemedi.' });
    }
};

const deleteProduct = async (req, res) => {
    const client = await pool.connect();

    try {
        const id = parseProductId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Gecersiz urun kimligi.' });
        }

        await client.query('BEGIN');

        await client.query('DELETE FROM product_media WHERE product_id = $1', [id]);
        await client.query('DELETE FROM reviews WHERE product_id = $1', [id]);
        await client.query('DELETE FROM product_questions WHERE product_id = $1', [id]);

        const deleteResult = await client.query(
            'DELETE FROM products WHERE id = $1 RETURNING id',
            [id]
        );

        if (deleteResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Urun bulunamadi.' });
        }

        await client.query('COMMIT');
        res.status(200).json({ mesaj: 'Urun basariyla silindi.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Urun silme hatasi:', err.message);
        res.status(500).json({ error: err.message || 'Urun silinirken hata olustu.' });
    } finally {
        client.release();
    }
};

const previewProductMediaBackgroundRemoval = async (req, res) => {
    const uploadedFile = req.file;
    if (!uploadedFile) {
        return res.status(400).json({ error: 'Onizleme icin bir gorsel secin.' });
    }

    const publicId = getUploadedPublicId(uploadedFile);
    if (!isBackgroundRemovalEligible(uploadedFile)) {
        await destroyCloudinaryAsset(publicId);
        return res.status(400).json({ error: 'Arka plan kaldirma onizlemesi yalnizca standart gorsellerde kullanilabilir. Video ve GIF dosyalari desteklenmiyor.' });
    }

    try {
        const previewResult = await applyBackgroundRemovalToFile(uploadedFile);
        if (!previewResult.url || previewResult.warning) {
            await destroyCloudinaryAsset(publicId);
            return res.status(422).json({ error: previewResult.warning || 'Onizleme olusturulamadi.' });
        }

        return res.status(200).json({
            mesaj: 'Arka plan kaldirma onizlemesi hazir.',
            originalUrl: normalizeMediaUrl(uploadedFile),
            previewPublicId: publicId,
            previewUrl: previewResult.url
        });
    } catch (error) {
        await destroyCloudinaryAsset(publicId);
        console.error('Arka plan kaldirma onizleme hatasi:', error.message);
        return res.status(500).json({ error: 'Arka plan kaldirma onizlemesi hazirlanamadi.' });
    }
};

const previewExistingProductMediaBackgroundRemoval = async (req, res) => {
    try {
        const mediaId = parseProductId(req.params.mediaId);
        if (!mediaId) {
            return res.status(400).json({ error: 'Gecersiz medya kimligi.' });
        }

        const mediaResult = await pool.query(
            'SELECT id, media_url FROM product_media WHERE id = $1',
            [mediaId]
        );

        if (mediaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Medya bulunamadi.' });
        }

        const mediaRow = mediaResult.rows[0];
        const asset = extractCloudinaryAssetFromUrl(mediaRow.media_url);
        if (!isBackgroundRemovalEligibleForAsset(asset)) {
            return res.status(400).json({ error: 'Arka plan kaldirma onizlemesi yalnizca standart gorsellerde kullanilabilir. Video ve GIF dosyalari desteklenmiyor.' });
        }

        const previewResult = await buildBackgroundRemovalPreviewForAsset(asset);
        if (!previewResult.url || previewResult.warning) {
            return res.status(422).json({ error: previewResult.warning || 'Arka plan kaldirma onizlemesi hazirlanamadi.' });
        }

        return res.status(200).json({
            mesaj: 'Arka plan kaldirma onizlemesi hazir.',
            mediaId,
            previewUrl: previewResult.url
        });
    } catch (error) {
        console.error('Mevcut medya arka plan onizleme hatasi:', error.message);
        return res.status(500).json({ error: 'Arka plan kaldirma onizlemesi hazirlanamadi.' });
    }
};

const applyExistingProductMediaBackgroundRemoval = async (req, res) => {
    const client = await pool.connect();

    try {
        const mediaId = parseProductId(req.params.mediaId);
        if (!mediaId) {
            return res.status(400).json({ error: 'Gecersiz medya kimligi.' });
        }

        const previewUrl = String(req.body?.previewUrl || '').trim();
        if (!previewUrl) {
            return res.status(400).json({ error: 'Onizleme gorseli bulunamadi.' });
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
            return res.status(404).json({ error: 'Medya bulunamadi.' });
        }

        const mediaRow = mediaResult.rows[0];
        const sourceAsset = extractCloudinaryAssetFromUrl(mediaRow.media_url);
        const previewAsset = extractCloudinaryAssetFromUrl(previewUrl);

        if (!isBackgroundRemovalEligibleForAsset(sourceAsset)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Arka plan kaldirma yalnizca standart gorsellerde kullanilabilir.' });
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
            mesaj: 'Mevcut gorsel arka plansiz guncellendi.',
            media: {
                id: mediaRow.id,
                product_id: mediaRow.product_id,
                media_url: nextMediaUrl,
                is_main: mediaRow.is_main
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Mevcut medya arka plan uygulama hatasi:', error.message);
        return res.status(500).json({ error: 'Mevcut gorsel arka plansiz guncellenemedi.' });
    } finally {
        client.release();
    }
};

const cleanupProductMediaPreview = async (req, res) => {
    const publicId = String(req.body?.publicId || '').trim();
    if (!publicId || !publicId.startsWith(PRODUCT_MEDIA_PREVIEW_FOLDER)) {
        return res.status(400).json({ error: 'Gecersiz onizleme kimligi.' });
    }

    await destroyCloudinaryAsset(publicId);
    return res.status(200).json({ mesaj: 'Onizleme temizlendi.' });
};

const updateProduct = async (req, res) => {
    const client = await pool.connect();

    try {
        const id = parseProductId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Gecersiz urun kimligi.' });
        }

        await client.query('BEGIN');

        const existingResult = await client.query(
            'SELECT * FROM products WHERE id = $1 FOR UPDATE',
            [id]
        );

        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Urun bulunamadi.' });
        }

        const existingProduct = existingResult.rows[0];
        const payload = await buildProductPayload(req.body, req.files, existingProduct);
        if (payload.error) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: payload.error });
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
                 image_url = $8
             WHERE id = $9
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

        await client.query('COMMIT');
        res.status(200).json({
            mesaj: 'Urun bilgileri guncellendi.',
            warnings: payload.warnings,
            product: normalizeProductRow(updateResult.rows[0])
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Urun guncelleme hatasi:', err.message);
        res.status(500).json({ error: err.message || 'Urun guncellenemedi.' });
    } finally {
        client.release();
    }
};

const deleteProductMedia = async (req, res) => {
    const client = await pool.connect();

    try {
        const mediaId = parseProductId(req.params.mediaId);
        if (!mediaId) {
            return res.status(400).json({ error: 'Gecersiz medya kimligi.' });
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
            return res.status(404).json({ error: 'Medya bulunamadi.' });
        }

        const removedMedia = mediaResult.rows[0];
        if (removedMedia.is_main || currentProductImage === removedMedia.media_url) {
            await syncMainMediaFromDatabase(client, removedMedia.product_id);
        }

        await client.query('COMMIT');
        res.status(200).json({ mesaj: 'Medya basariyla silindi.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Medya silme hatasi:', err.message);
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
