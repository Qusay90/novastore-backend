const pool = require('../config/db');

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

const normalizeMediaUrl = (file) => {
    if (!file) return null;
    return file.path || file.secure_url || file.url || null;
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

const parseMediaOrder = (rawValue) => {
    if (!rawValue) return [];

    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((item, index) => ({
                index: Number.isInteger(Number(item?.index)) ? Number(item.index) : index,
                name: String(item?.name || '').trim(),
                size: Number.isFinite(Number(item?.size)) ? Number(item.size) : null
            }))
            .filter((item) => item.name);
    } catch (_) {
        return [];
    }
};

const reorderUploadedFiles = (files, rawMediaOrder) => {
    if (!Array.isArray(files) || files.length === 0) return [];

    const mediaOrder = parseMediaOrder(rawMediaOrder);
    if (mediaOrder.length === 0) return files;

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
                sortIndex: matchIndex >= 0 ? mediaOrder[matchIndex].index : mediaOrder.length + fallbackIndex
            };
        })
        .sort((left, right) => {
            if (left.sortIndex !== right.sortIndex) {
                return left.sortIndex - right.sortIndex;
            }
            return left.fallbackIndex - right.fallbackIndex;
        })
        .map((item) => item.file);
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

const buildProductPayload = (body, files, existingProduct = null) => {
    const orderedFiles = reorderUploadedFiles(files, body.mediaOrder);
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim() || null;
    const category = String(body.category || '').trim() || 'Kategorisiz';
    const price = parsePrice(body.price);
    const oldPrice = parsePrice(body.oldPrice, null);
    const stock = parseStock(body.stock);

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

    const mediaUrls = orderedFiles
        .map(normalizeMediaUrl)
        .filter(Boolean);

    return {
        name,
        description,
        category,
        price,
        oldPrice,
        stock,
        mediaUrls,
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
            ...product,
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
        const payload = buildProductPayload(req.body, req.files);
        if (payload.error) {
            return res.status(400).json({ error: payload.error });
        }

        await client.query('BEGIN');

        const insertResult = await client.query(
            `INSERT INTO products (name, price, old_price, stock, description, image_url, category)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                payload.name,
                payload.price,
                payload.oldPrice,
                payload.stock,
                payload.description,
                payload.mainImageUrl,
                payload.category
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
            product
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

        const product = result.rows[0];
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
        const payload = buildProductPayload(req.body, req.files, existingProduct);
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
                 image_url = $7
             WHERE id = $8
             RETURNING *`,
            [
                payload.name,
                payload.price,
                payload.oldPrice,
                payload.stock,
                payload.description,
                payload.category,
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
            product: updateResult.rows[0]
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
    deleteProductMedia
};
