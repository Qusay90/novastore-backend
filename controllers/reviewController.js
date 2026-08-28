const pool = require('../config/db');
const { getUserFromRequestIfAny, sendAuthError } = require('../middlewares/authMiddleware');
const { ORDER_STATUS } = require('../constants/orderStatus');
const { buildPublicProductSqlPredicate } = require('../constants/productVisibility');
const { maskFullName } = require('../services/privacyService');
const { reviewUpload, uploadReviewMediaFiles, cleanupCloudinaryAssets } = require('../config/cloudinary');
const { PLATFORM_STORE } = require('../services/categoryV2BackfillService');
const { EVENT } = require('../services/notificationEventCatalog');
const { enqueueNotificationEvent } = require('../services/notificationOutboxService');

const MAX_REVIEW_MEDIA_COUNT = 4;
const MAX_REVIEW_COMMENT_LENGTH = 2000;
const MAX_REVIEW_MODERATION_NOTE_LENGTH = 1000;
const REVIEW_STATUS = Object.freeze({
    PENDING: 'PENDING',
    PUBLISHED: 'PUBLISHED',
    HIDDEN: 'HIDDEN'
});
const REVIEW_MODERATION_STATUSES = new Set([REVIEW_STATUS.PUBLISHED, REVIEW_STATUS.HIDDEN]);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

class ReviewOperationError extends Error {
    constructor(message, code, statusCode = 400) {
        super(message);
        this.name = 'ReviewOperationError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const parseExpectedRevision = (body = {}) => {
    const value = body.expected_revision ?? body.expectedRevision;
    const revision = Number(value);
    if (!Number.isSafeInteger(revision) || revision < 1) {
        throw new ReviewOperationError(
            'expected_revision pozitif g\u00fcvenli tam say\u0131 olmal\u0131d\u0131r.',
            'REVIEW_REVISION_INVALID'
        );
    }
    return revision;
};

const normalizeModerationNote = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
        throw new ReviewOperationError('Moderasyon notu metin olmal\u0131d\u0131r.', 'REVIEW_MODERATION_NOTE_INVALID');
    }
    const note = value.trim();
    if (CONTROL_CHARACTER_PATTERN.test(note)) {
        throw new ReviewOperationError('Moderasyon notu kontrol karakteri i\u00e7eremez.', 'REVIEW_MODERATION_NOTE_INVALID');
    }
    if (note.length > MAX_REVIEW_MODERATION_NOTE_LENGTH) {
        throw new ReviewOperationError(
            `Moderasyon notu en fazla ${MAX_REVIEW_MODERATION_NOTE_LENGTH} karakter olabilir.`,
            'REVIEW_MODERATION_NOTE_INVALID'
        );
    }
    return note || null;
};

const requestAuditMetadata = (req, values = {}) => {
    const requestId = String(req.headers?.['x-request-id'] || '').trim();
    return {
        ...values,
        request_id: requestId && requestId.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(requestId)
            ? requestId
            : null
    };
};

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
                FROM products
                JOIN stores first_party_store
                  ON first_party_store.id = products.store_id
                 AND LOWER(first_party_store.slug) = LOWER($4)
                 AND first_party_store.is_active = TRUE
                 AND first_party_store.deleted_at IS NULL
                WHERE products.id = $3
                  AND ${buildPublicProductSqlPredicate('products')}
            ) AS first_party_write_eligible,
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
        [userId, ORDER_STATUS.TESLIM_EDILDI, productId, PLATFORM_STORE.slug]
    );

    const row = result.rows?.[0];
    if (typeof row?.public_product_exists !== 'boolean'
        || typeof row?.first_party_write_eligible !== 'boolean'
        || typeof row?.has_delivered_order !== 'boolean') {
        const error = new Error('Yorum uygunluk sorgusu geçersiz sonuç döndürdü.');
        error.code = 'REVIEW_ELIGIBILITY_RESULT_INVALID';
        throw error;
    }

    return {
        publicProductExists: row.public_product_exists,
        firstPartyWriteEligible: row.first_party_write_eligible,
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

    if (!eligibility.firstPartyWriteEligible) {
        return {
            canReview: false,
            requiresAuth: false,
            code: 'SELLER_REVIEW_HANDOFF_REQUIRED',
            message: 'Bu satıcı ürünü için değerlendirme iş akışı satıcı operasyonları açılana kadar kullanılamaz.'
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
    if (typeof value !== 'string') {
        throw new ReviewOperationError('Değerlendirme metin olmalıdır.', 'REVIEW_COMMENT_INVALID');
    }

    const normalized = value.trim();
    if (CONTROL_CHARACTER_PATTERN.test(normalized)) {
        throw new ReviewOperationError('De\u011ferlendirme kontrol karakteri i\u00e7eremez.', 'REVIEW_COMMENT_INVALID');
    }
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
            `INSERT INTO reviews (product_id, user_id, rating, comment, status)
             SELECT products.id, $2, $3, $4, 'PENDING'
             FROM products
             JOIN stores first_party_store
               ON first_party_store.id = products.store_id
              AND LOWER(first_party_store.slug) = LOWER($5)
              AND first_party_store.is_active = TRUE
              AND first_party_store.deleted_at IS NULL
             WHERE products.id = $1
               AND ${buildPublicProductSqlPredicate('products')}
             RETURNING id`,
            [numericProductId, userId, numericRating, normalizedComment, PLATFORM_STORE.slug]
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

        await enqueueNotificationEvent(client, {
            eventType: EVENT.REVIEW_CREATED,
            aggregateType: 'review',
            aggregateId: reviewId,
            aggregateRevision: 1,
            sourceEventKey: `REVIEW_CREATED:review:${reviewId}:r1`,
            payload: { source: 'customer_review' }
        });

        await client.query('COMMIT');

        res.status(201).json({
            mesaj: 'Değerlendirmeniz alındı ve yayın incelemesine gönderildi.',
            reviewId,
            status: REVIEW_STATUS.PENDING
        });

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

        if (err.code === '23505') {
            return res.status(409).json({
                error: 'Bu ürünü zaten değerlendirdiniz.',
                code: 'ALREADY_REVIEWED'
            });
        }

        if (err instanceof ReviewOperationError) {
            return res.status(err.statusCode).json({ error: err.message, code: err.code });
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

        const authUser = await getUserFromRequestIfAny(req);

        const reviewResult = await pool.query(
            `SELECT products.id AS public_product_id,
                    r.id, r.rating, r.comment, r.created_at,
                    COALESCE(u.full_name, u.name) AS full_name,
                    AVG(r.rating) OVER () AS average,
                    COUNT(r.id) OVER () AS total
             FROM products
             LEFT JOIN reviews r
               ON r.product_id = products.id
              AND r.status = 'PUBLISHED'
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
        if (err.publicMessage && [401, 503].includes(err.statusCode)) return sendAuthError(res, err);
        console.error('Yorumları getirme hatası:', err.message);
        res.status(500).json({ error: 'Yorumlar getirilemedi.' });
    }
};

// 3. Bir musterinin tum yorumlarini getirme
const getUserReviews = async (req, res) => {
    try {
        const { userId } = req.params;

        const reviewResult = await pool.query(
            `SELECT r.id, r.rating, r.comment, r.status, r.created_at,
                    p.name as product_name, p.image_url, p.id as product_id
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

const getAdminReviews = async (req, res) => {
    try {
        const rawStatus = String(req.query?.status || '').trim().toUpperCase();
        const status = rawStatus || null;
        if (status && !Object.values(REVIEW_STATUS).includes(status)) {
            return res.status(400).json({ error: 'Geçersiz değerlendirme durumu.', code: 'REVIEW_STATUS_INVALID' });
        }

        const rawLimit = req.query?.limit === undefined ? 50 : Number(req.query.limit);
        if (!Number.isSafeInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
            return res.status(400).json({ error: 'limit 1 ile 100 arasında olmalıdır.', code: 'REVIEW_LIMIT_INVALID' });
        }

        const result = await pool.query(
            `SELECT r.id, r.product_id, r.user_id, r.rating, r.comment, r.status, r.revision,
                    r.created_at, r.moderated_by, r.moderated_at, r.moderation_note,
                    product.name AS product_name,
                    COALESCE(customer.full_name, customer.name) AS user_name
             FROM reviews r
             JOIN products product ON product.id = r.product_id
             JOIN stores first_party_store
               ON first_party_store.id = product.store_id
              AND LOWER(first_party_store.slug) = LOWER($1)
              AND first_party_store.is_active = TRUE
              AND first_party_store.deleted_at IS NULL
             JOIN users customer ON customer.id = r.user_id
             WHERE ($2::TEXT IS NULL OR r.status = $2)
             ORDER BY
                CASE r.status WHEN 'PENDING' THEN 0 WHEN 'HIDDEN' THEN 1 ELSE 2 END,
                r.created_at ASC,
                r.id ASC
             LIMIT $3`,
            [PLATFORM_STORE.slug, status, rawLimit]
        );

        const mediaMap = await loadReviewMediaMap(result.rows.map((review) => Number(review.id)));
        const reviews = result.rows.map((review) => ({
            ...review,
            media: mediaMap.get(review.id) || mediaMap.get(Number(review.id)) || []
        }));
        return res.status(200).json({ reviews, count: reviews.length });
    } catch (error) {
        console.error('Admin değerlendirme kuyruğu hatası:', error.message);
        return res.status(500).json({ error: 'Değerlendirme kuyruğu getirilemedi.' });
    }
};

const moderateReview = async (req, res) => {
    let client;
    try {
        const reviewId = parsePositiveInteger(req.params.reviewId);
        if (!reviewId) {
            throw new ReviewOperationError('Geçersiz değerlendirme kimliği.', 'REVIEW_ID_INVALID');
        }

        const status = String(req.body?.status || '').trim().toUpperCase();
        if (!REVIEW_MODERATION_STATUSES.has(status)) {
            throw new ReviewOperationError(
                'Moderasyon durumu yalnızca PUBLISHED veya HIDDEN olabilir.',
                'REVIEW_MODERATION_STATUS_INVALID'
            );
        }
        const expectedRevision = parseExpectedRevision(req.body);
        const moderationNote = normalizeModerationNote(req.body?.moderation_note ?? req.body?.moderationNote);
        const actorId = Number(req.currentAdmin?.id);
        if (!Number.isSafeInteger(actorId) || actorId < 1) {
            throw new ReviewOperationError('Güncel yönetici kimliği zorunludur.', 'REVIEW_ADMIN_ACTOR_INVALID', 403);
        }

        client = await pool.connect();
        await client.query('BEGIN');
        const currentResult = await client.query(
            `SELECT r.id, r.product_id, r.status, r.revision, r.moderation_note
             FROM reviews r
             JOIN products product ON product.id = r.product_id
             JOIN stores first_party_store
               ON first_party_store.id = product.store_id
              AND LOWER(first_party_store.slug) = LOWER($2)
              AND first_party_store.is_active = TRUE
              AND first_party_store.deleted_at IS NULL
             WHERE r.id = $1
             FOR UPDATE OF r`,
            [reviewId, PLATFORM_STORE.slug]
        );
        if (currentResult.rows.length === 0) {
            throw new ReviewOperationError('Değerlendirme bulunamadı.', 'REVIEW_NOT_FOUND', 404);
        }

        const current = currentResult.rows[0];
        const currentRevision = Number(current.revision);
        if (currentRevision !== expectedRevision) {
            throw new ReviewOperationError(
                'Değerlendirme başka bir işlem tarafından güncellendi; kuyruğu yenileyin.',
                'REVIEW_REVISION_CONFLICT',
                409
            );
        }
        if (current.status === status && (current.moderation_note || null) === moderationNote) {
            throw new ReviewOperationError(
                'Moderasyon isteği mevcut durumla aynı.',
                'REVIEW_MODERATION_NOOP',
                409
            );
        }

        const updatedResult = await client.query(
            `UPDATE reviews
             SET status = $1,
                 moderation_note = $2,
                 moderated_by = $3,
                 moderated_at = CURRENT_TIMESTAMP,
                 revision = revision + 1
             WHERE id = $4 AND revision = $5
             RETURNING id, product_id, status, revision, moderated_by, moderated_at, moderation_note`,
            [status, moderationNote, actorId, reviewId, expectedRevision]
        );
        if (updatedResult.rows.length !== 1) {
            throw new ReviewOperationError(
                'Değerlendirme revision güncellemesi çakıştı.',
                'REVIEW_REVISION_CONFLICT',
                409
            );
        }

        const updated = updatedResult.rows[0];
        await client.query(
            `INSERT INTO customer_operation_audit_events (
                actor_user_id, actor_role, entity_type, entity_id, action,
                before_state, after_state, metadata
             ) VALUES ($1, 'admin', 'review', $2, $3, $4::JSONB, $5::JSONB, $6::JSONB)`,
            [
                actorId,
                reviewId,
                status === REVIEW_STATUS.PUBLISHED ? 'publish' : 'hide',
                JSON.stringify({
                    status: current.status,
                    revision: currentRevision,
                    moderation_note: current.moderation_note || null
                }),
                JSON.stringify({
                    status: updated.status,
                    revision: Number(updated.revision),
                    moderation_note: updated.moderation_note || null
                }),
                JSON.stringify(requestAuditMetadata(req, { product_id: Number(current.product_id) }))
            ]
        );
        await enqueueNotificationEvent(client, {
            eventType: EVENT.REVIEW_MODERATION_RESULT,
            aggregateType: 'review',
            aggregateId: reviewId,
            aggregateRevision: Number(updated.revision),
            sourceEventKey: `REVIEW_MODERATION_RESULT:review:${reviewId}:r${Number(updated.revision)}`,
            payload: { status: updated.status }
        });
        await client.query('COMMIT');

        return res.status(200).json({
            mesaj: status === REVIEW_STATUS.PUBLISHED
                ? 'Değerlendirme yayınlandı.'
                : 'Değerlendirme yayından gizlendi.',
            review: updated
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        if (error instanceof ReviewOperationError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('Değerlendirme moderasyon hatası:', error.message);
        return res.status(500).json({ error: 'Değerlendirme moderasyonu tamamlanamadı.' });
    } finally {
        if (client) client.release();
    }
};

module.exports = {
    addReview,
    getProductReviews,
    getUserReviews,
    getAdminReviews,
    moderateReview
};
