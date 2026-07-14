const pool = require('../config/db');
const { createNotification } = require('./notificationController');
const { getUserFromRequestIfAny } = require('../middlewares/authMiddleware');
const { ORDER_STATUS } = require('../constants/orderStatus');
const { buildPublicProductSqlPredicate } = require('../constants/productVisibility');
const { maskFullName } = require('../services/privacyService');
const { reviewUpload, uploadReviewMediaFiles, cleanupCloudinaryAssets } = require('../config/cloudinary');

const MAX_REVIEW_MEDIA_COUNT = 4;
const MAX_REVIEW_COMMENT_LENGTH = 2000;

const getPublicProductReviewEligibility = async (userId, productId) => {
    const result = await pool.query(
        `SELECT
            EXISTS (
                SELECT 1
                FROM products
                WHERE products.id = $3
                  AND ${buildPublicProductSqlPredicate('products')}
            ) AS public_product_exists,
            EXISTS (
                SELECT 1
                FROM orders o
                JOIN LATERAL jsonb_array_elements(
                    CASE
                        WHEN jsonb_typeof(COALESCE(o.items, '[]'::jsonb)) = 'array' THEN COALESCE(o.items, '[]'::jsonb)
                        ELSE '[]'::jsonb
                    END
                ) AS item(value) ON TRUE
                WHERE o.user_id = $1
                  AND o.status = $2
                  AND (
                        ((item.value->>'id') ~ '^[0-9]+$' AND (item.value->>'id')::int = $3)
                        OR
                        ((item.value->>'product_id') ~ '^[0-9]+$' AND (item.value->>'product_id')::int = $3)
                  )
            ) AS has_delivered_order`,
        [userId, ORDER_STATUS.TESLIM_EDILDI, productId]
    );

    const row = result.rows?.[0];
    if (typeof row?.public_product_exists !== 'boolean'
        || typeof row?.has_delivered_order !== 'boolean') {
        const error = new Error('Yorum uygunluk sorgusu geçersiz sonuç döndürdü.');
        error.code = 'REVIEW_ELIGIBILITY_RESULT_INVALID';
        throw error;
    }

    return {
        publicProductExists: row.public_product_exists,
        hasDeliveredOrder: row.has_delivered_order
    };
};

const getReviewPermission = async (userId, productId) => {
    if (!Number.isInteger(userId)) {
        return {
            canReview: false,
            requiresAuth: true,
            code: 'AUTH_REQUIRED',
            message: 'Değerlendirme yapabilmek için giriş yapmalısınız.'
        };
    }

    const eligibility = await getPublicProductReviewEligibility(userId, productId);
    if (!eligibility.publicProductExists) {
        return {
            canReview: false,
            requiresAuth: false,
            code: 'PRODUCT_NOT_FOUND',
            message: 'Ürün bulunamadı.'
        };
    }

    const existingReview = await pool.query(
        'SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2',
        [productId, userId]
    );

    if (existingReview.rows.length > 0) {
        return {
            canReview: false,
            requiresAuth: false,
            code: 'ALREADY_REVIEWED',
            message: 'Bu ürünü zaten değerlendirdiniz.'
        };
    }

    if (!eligibility.hasDeliveredOrder) {
        return {
            canReview: false,
            requiresAuth: false,
            code: 'DELIVERY_REQUIRED',
            message: 'Bu ürüne sadece satın alıp siparişi teslim edilen müşteriler değerlendirme yapabilir.'
        };
    }

    return {
        canReview: true,
        requiresAuth: false,
        code: 'ELIGIBLE',
        message: null
    };
};

const normalizeReviewComment = (value) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized || null;
};

const normalizeReviewMediaUrl = (file) => {
    if (!file) return null;
    return String(file.path || file.secure_url || file.url || '').trim() || null;
};

const getReviewMediaType = (file, mediaUrl) => {
    const mimeType = String(file?.mimetype || '').toLowerCase();
    if (mimeType.startsWith('video/')) return 'video';
    return /\.(mp4|webm|ogg|mov)(?:$|[?#])/i.test(String(mediaUrl || '')) ? 'video' : 'image';
};

const buildReviewMediaPayload = (files) => {
    if (!Array.isArray(files) || files.length === 0) return [];

    return files
        .map((file, index) => {
            const mediaUrl = normalizeReviewMediaUrl(file);
            if (!mediaUrl) return null;

            return {
                media_url: mediaUrl,
                media_type: getReviewMediaType(file, mediaUrl),
                sort_order: index
            };
        })
        .filter(Boolean);
};

const loadReviewMediaMap = async (reviewIds) => {
    if (!Array.isArray(reviewIds) || reviewIds.length === 0) {
        return new Map();
    }

    const mediaResult = await pool.query(
        `SELECT id, review_id, media_url, media_type, sort_order
         FROM review_media
         WHERE review_id = ANY($1::int[])
         ORDER BY sort_order ASC, id ASC`,
        [reviewIds]
    );

    const mediaMap = new Map();
    mediaResult.rows.forEach((row) => {
        if (!mediaMap.has(row.review_id)) {
            mediaMap.set(row.review_id, []);
        }
        mediaMap.get(row.review_id).push(row);
    });

    return mediaMap;
};

const firstReviewFieldValue = (value) => {
    if (Array.isArray(value)) return firstReviewFieldValue(value[0]);
    if (value === undefined || value === null) return null;

    const normalized = String(value).trim();
    return normalized === '' ? null : normalized;
};

const getReviewFieldValue = (source, ...names) => {
    if (!source) return null;

    for (const name of names) {
        const value = firstReviewFieldValue(source[name]);
        if (value !== null) return value;
    }

    return null;
};

const parsePositiveInteger = (value) => {
    const numericValue = Number(value);
    return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const isMultipartReviewRequest = (req) => {
    return /^multipart\/form-data(?:;|$)/i.test(String(req.headers['content-type'] || ''));
};

const getMultipartPreflightProductId = (req) => {
    return getReviewFieldValue(req.query, 'productId', 'product_id')
        || firstReviewFieldValue(req.headers['x-review-product-id']);
};

const parseReviewMediaUpload = (req, res) => new Promise((resolve, reject) => {
    reviewUpload.array('media', MAX_REVIEW_MEDIA_COUNT)(req, res, (err) => {
        if (err) return reject(err);
        return resolve();
    });
});

const sendReviewUploadError = (res, err) => {
    const errorCode = String(err.code || '');
    const statusCode = err.statusCode || (errorCode.startsWith('LIMIT_') ? 400 : 500);
    return res.status(statusCode).json({ error: err.message || 'Yorum medyası yüklenemedi.' });
};

const sendReviewPermissionError = (res, permission) => {
    const statusCode = permission.code === 'PRODUCT_NOT_FOUND'
        ? 404
        : permission.code === 'ALREADY_REVIEWED' ? 400 : 403;
    return res.status(statusCode).json({ error: permission.message, code: permission.code });
};

const createPublicProductNotFoundError = () => {
    const error = new Error('Ürün bulunamadı.');
    error.code = 'PRODUCT_NOT_FOUND';
    return error;
};

// 1. Ürüne yorum ekleme
const addReview = async (req, res) => {
    let client;
    let uploadedReviewFiles = [];

    try {
        const multipartRequest = isMultipartReviewRequest(req);
        const productId = multipartRequest
            ? getMultipartPreflightProductId(req)
            : getReviewFieldValue(req.body, 'productId', 'product_id');
        const userId = req.user.id;

        if (!productId) {
            return res.status(400).json({ error: '\u00dcr\u00fcn bilgisi zorunludur.' });
        }

        const numericProductId = parsePositiveInteger(productId);
        if (!numericProductId) {
            return res.status(400).json({ error: 'Geçerli bir ürün seçmelisiniz.' });
        }

        let rating = getReviewFieldValue(req.body, 'rating');
        let comment = getReviewFieldValue(req.body, 'comment');
        let numericRating;
        let normalizedComment;
        let pendingReviewFiles = [];

        if (!multipartRequest) {
            numericRating = Number(rating);
            if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
                return res.status(400).json({ error: 'Puan 1 ile 5 arasinda olmalidir.' });
            }

            normalizedComment = normalizeReviewComment(comment);
            if (normalizedComment && normalizedComment.length > MAX_REVIEW_COMMENT_LENGTH) {
                return res.status(400).json({ error: 'Yorum metni çok uzun. Lütfen daha kısa bir yorum yazın.' });
            }

            pendingReviewFiles = Array.isArray(req.files) ? req.files : [];
            if (pendingReviewFiles.length > MAX_REVIEW_MEDIA_COUNT) {
                return res.status(400).json({ error: 'En fazla 4 görsel veya video ekleyebilirsiniz.' });
            }

        }

        const permission = await getReviewPermission(userId, numericProductId);
        if (!permission.canReview) {
            return sendReviewPermissionError(res, permission);
        }

        if (multipartRequest) {
            try {
                await parseReviewMediaUpload(req, res);
            } catch (err) {
                return sendReviewUploadError(res, err);
            }

            const parsedProductId = getReviewFieldValue(req.body, 'productId', 'product_id');
            if (parsedProductId && parsePositiveInteger(parsedProductId) !== numericProductId) {
                return res.status(400).json({ error: 'Yorum iste\u011findeki \u00fcr\u00fcn bilgisi tutars\u0131z.' });
            }

            rating = getReviewFieldValue(req.body, 'rating');
            comment = getReviewFieldValue(req.body, 'comment');

            if (!rating) {
                return res.status(400).json({ error: 'Puan bilgisi zorunludur.' });
            }

            numericRating = Number(rating);
            if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
                return res.status(400).json({ error: 'Puan 1 ile 5 arasinda olmalidir.' });
            }

            normalizedComment = normalizeReviewComment(comment);
            if (normalizedComment && normalizedComment.length > MAX_REVIEW_COMMENT_LENGTH) {
                return res.status(400).json({ error: 'Yorum metni \u00e7ok uzun. L\u00fctfen daha k\u0131sa bir yorum yaz\u0131n.' });
            }

            pendingReviewFiles = Array.isArray(req.files) ? req.files : [];
            if (pendingReviewFiles.length > MAX_REVIEW_MEDIA_COUNT) {
                return res.status(400).json({ error: 'En fazla 4 g\u00f6rsel veya video ekleyebilirsiniz.' });
            }
        }

        uploadedReviewFiles = await uploadReviewMediaFiles(pendingReviewFiles);
        const reviewMedia = buildReviewMediaPayload(uploadedReviewFiles);

        client = await pool.connect();
        await client.query('BEGIN');

        const reviewResult = await client.query(
            `INSERT INTO reviews (product_id, user_id, rating, comment)
             SELECT products.id, $2, $3, $4
             FROM products
             WHERE products.id = $1
               AND ${buildPublicProductSqlPredicate('products')}
             RETURNING id`,
            [numericProductId, userId, numericRating, normalizedComment]
        );

        if (reviewResult.rows.length === 0) {
            throw createPublicProductNotFoundError();
        }

        const reviewId = reviewResult.rows[0].id;

        for (const media of reviewMedia) {
            await client.query(
                `INSERT INTO review_media (review_id, media_url, media_type, sort_order)
                 VALUES ($1, $2, $3, $4)`,
                [reviewId, media.media_url, media.media_type, media.sort_order]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({
            mesaj: 'Değerlendirmeniz başarıyla eklendi!',
            reviewId
        });

        // Admin'e yeni yorum bildirimi (asenkron)
        try {
            const { io } = require('../server');
            await createNotification(
                null,
                'new_review',
                `Yeni bir ürün yorumu eklendi! Ürün ID: #${numericProductId} - Puan: ${numericRating}/5`,
                io
            );
        } catch (_) { }
    } catch (err) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (_) { }
        }

        if (uploadedReviewFiles.length > 0) {
            try {
                await cleanupCloudinaryAssets(uploadedReviewFiles);
            } catch (cleanupError) {
                console.error('Yorum medyası temizleme hatası:', cleanupError.message);
            }
        }

        if (err.code === 'PRODUCT_NOT_FOUND') {
            return res.status(404).json({ error: 'Ürün bulunamadı.', code: 'PRODUCT_NOT_FOUND' });
        }

        console.error('Yorum ekleme hatası:', err.message);
        res.status(500).json({ error: 'Yorum eklenirken hata oluştu.' });
    } finally {
        if (client) client.release();
    }
};

// 2. Bir ürünün tüm yorumlarını ve puan ortalamasını getirme
const getProductReviews = async (req, res) => {
    try {
        const productId = Number(req.params.productId);
        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({ error: 'Geçersiz ürün kimliği.' });
        }

        const authUser = getUserFromRequestIfAny(req);

        const reviewResult = await pool.query(
            `SELECT products.id AS public_product_id,
                    r.id, r.rating, r.comment, r.created_at,
                    COALESCE(u.full_name, u.name) AS full_name,
                    AVG(r.rating) OVER () AS average,
                    COUNT(r.id) OVER () AS total
             FROM products
             LEFT JOIN reviews r ON r.product_id = products.id
             LEFT JOIN users u ON r.user_id = u.id
             WHERE products.id = $1
               AND ${buildPublicProductSqlPredicate('products')}
             ORDER BY r.created_at DESC`,
            [productId]
        );

        if (reviewResult.rows.length === 0) {
            return res.status(404).json({ error: 'Ürün bulunamadı.', code: 'PRODUCT_NOT_FOUND' });
        }

        const reviewRows = reviewResult.rows.filter((review) => review.id !== null);

        const mediaMap = await loadReviewMediaMap(reviewRows.map((review) => review.id));

        const reviewPermission = await getReviewPermission(authUser ? authUser.id : null, productId);
        if (reviewPermission.code === 'PRODUCT_NOT_FOUND') {
            return sendReviewPermissionError(res, reviewPermission);
        }

        const aggregateRow = reviewResult.rows[0];

        res.status(200).json({
            reviews: reviewRows.map(({ public_product_id: _productId, average: _average, total: _total, ...review }) => ({
                ...review,
                full_name: maskFullName(review.full_name),
                media: mediaMap.get(review.id) || []
            })),
            average: aggregateRow.average ? parseFloat(aggregateRow.average).toFixed(1) : 0,
            totalReviews: parseInt(aggregateRow.total, 10) || 0,
            reviewPermission
        });
    } catch (err) {
        console.error('Yorumları getirme hatası:', err.message);
        res.status(500).json({ error: 'Yorumlar getirilemedi.' });
    }
};

// 3. Bir musterinin tum yorumlarini getirme
const getUserReviews = async (req, res) => {
    try {
        const { userId } = req.params;

        const reviewResult = await pool.query(
            `SELECT r.id, r.rating, r.comment, r.created_at, p.name as product_name, p.image_url, p.id as product_id
             FROM reviews r
             JOIN products p ON r.product_id = p.id
             WHERE r.user_id = $1
             ORDER BY r.created_at DESC`,
            [userId]
        );

        const mediaMap = await loadReviewMediaMap(reviewResult.rows.map((review) => review.id));

        res.status(200).json(
            reviewResult.rows.map((review) => ({
                ...review,
                media: mediaMap.get(review.id) || []
            }))
        );
    } catch (err) {
        console.error('Kullanıcı yorumları getirme hatası:', err);
        res.status(500).json({ error: 'Yorumlariniz getirilemedi.' });
    }
};

module.exports = { addReview, getProductReviews, getUserReviews };
