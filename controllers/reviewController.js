const pool = require('../config/db');
const { createNotification } = require('./notificationController');
const { getUserFromRequestIfAny } = require('../middlewares/authMiddleware');
const { ORDER_STATUS } = require('../constants/orderStatus');
const { maskFullName } = require('../services/privacyService');

const MAX_REVIEW_MEDIA_COUNT = 4;
const MAX_REVIEW_COMMENT_LENGTH = 2000;

const findEligibleDeliveredOrder = async (userId, productId) => {
    return pool.query(
        `SELECT o.id
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
         LIMIT 1`,
        [userId, ORDER_STATUS.TESLIM_EDILDI, productId]
    );
};

const getReviewPermission = async (userId, productId) => {
    if (!Number.isInteger(userId)) {
        return {
            canReview: false,
            requiresAuth: true,
            code: 'AUTH_REQUIRED',
            message: 'Degerlendirme yapabilmek icin giris yapmalisiniz.'
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
            message: 'Bu urunu zaten degerlendirdiniz.'
        };
    }

    const deliveredOrder = await findEligibleDeliveredOrder(userId, productId);
    if (deliveredOrder.rows.length === 0) {
        return {
            canReview: false,
            requiresAuth: false,
            code: 'DELIVERY_REQUIRED',
            message: 'Bu urune sadece satin alip siparisi teslim edilen musteriler degerlendirme yapabilir.'
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

// 1. Urune yorum ekleme
const addReview = async (req, res) => {
    let client;

    try {
        const { productId, rating, comment } = req.body;
        const userId = req.user.id;

        if (!productId || !rating) {
            return res.status(400).json({ error: 'Urun ve puan bilgisi zorunludur.' });
        }

        const numericProductId = Number(productId);
        if (!Number.isInteger(numericProductId) || numericProductId <= 0) {
            return res.status(400).json({ error: 'Gecerli bir urun secmelisiniz.' });
        }

        const numericRating = Number(rating);
        if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({ error: 'Puan 1 ile 5 arasinda olmalidir.' });
        }

        const normalizedComment = normalizeReviewComment(comment);
        if (normalizedComment && normalizedComment.length > MAX_REVIEW_COMMENT_LENGTH) {
            return res.status(400).json({ error: 'Yorum metni cok uzun. Lutfen daha kisa bir yorum yazin.' });
        }

        const reviewMedia = buildReviewMediaPayload(req.files);
        if (reviewMedia.length > MAX_REVIEW_MEDIA_COUNT) {
            return res.status(400).json({ error: 'En fazla 4 gorsel veya video ekleyebilirsiniz.' });
        }

        const permission = await getReviewPermission(userId, numericProductId);
        if (!permission.canReview) {
            const statusCode = permission.code === 'ALREADY_REVIEWED' ? 400 : 403;
            return res.status(statusCode).json({ error: permission.message, code: permission.code });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        const reviewResult = await client.query(
            `INSERT INTO reviews (product_id, user_id, rating, comment)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [numericProductId, userId, numericRating, normalizedComment]
        );

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
            mesaj: 'Degerlendirmeniz basariyla eklendi!',
            reviewId
        });

        // Admin'e yeni yorum bildirimi (asenkron)
        try {
            const { io } = require('../server');
            await createNotification(
                null,
                'new_review',
                `Yeni bir urun yorumu eklendi! Urun ID: #${numericProductId} - Puan: ${numericRating}/5`,
                io
            );
        } catch (_) { }
    } catch (err) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (_) { }
        }

        console.error('Yorum ekleme hatasi:', err.message);
        res.status(500).json({ error: 'Yorum eklenirken hata olustu.' });
    } finally {
        if (client) client.release();
    }
};

// 2. Bir urunun tum yorumlarini ve puan ortalamasini getirme
const getProductReviews = async (req, res) => {
    try {
        const productId = Number(req.params.productId);
        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({ error: 'Gecersiz urun kimligi.' });
        }

        const authUser = getUserFromRequestIfAny(req);

        const reviewResult = await pool.query(
            `SELECT r.id, r.rating, r.comment, r.created_at, COALESCE(u.full_name, u.name) AS full_name
             FROM reviews r
             JOIN users u ON r.user_id = u.id
             WHERE r.product_id = $1
             ORDER BY r.created_at DESC`,
            [productId]
        );

        const mediaMap = await loadReviewMediaMap(reviewResult.rows.map((review) => review.id));

        const avgResult = await pool.query(
            'SELECT AVG(rating) as average, COUNT(id) as total FROM reviews WHERE product_id = $1',
            [productId]
        );

        const reviewPermission = await getReviewPermission(authUser ? authUser.id : null, productId);

        res.status(200).json({
            reviews: reviewResult.rows.map((review) => ({
                ...review,
                full_name: maskFullName(review.full_name),
                media: mediaMap.get(review.id) || []
            })),
            average: avgResult.rows[0].average ? parseFloat(avgResult.rows[0].average).toFixed(1) : 0,
            totalReviews: parseInt(avgResult.rows[0].total, 10) || 0,
            reviewPermission
        });
    } catch (err) {
        console.error('Yorumlari getirme hatasi:', err.message);
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
        console.error('Kullanici yorumlari getirme hatasi:', err);
        res.status(500).json({ error: 'Yorumlariniz getirilemedi.' });
    }
};

module.exports = { addReview, getProductReviews, getUserReviews };
