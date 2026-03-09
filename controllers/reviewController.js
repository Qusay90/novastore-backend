const pool = require('../config/db');
const { createNotification } = require('./notificationController');

// 1. Urune yorum ekleme
const addReview = async (req, res) => {
    try {
        const { productId, rating, comment } = req.body;
        const userId = req.user.id;

        if (!productId || !rating) {
            return res.status(400).json({ error: 'Urun ve puan bilgisi zorunludur.' });
        }

        const numericRating = Number(rating);
        if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({ error: 'Puan 1 ile 5 arasinda olmalidir.' });
        }

        const checkReview = await pool.query(
            'SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2',
            [productId, userId]
        );
        if (checkReview.rows.length > 0) {
            return res.status(400).json({ error: 'Bu urunu zaten degerlendirdiniz.' });
        }

        await pool.query(
            'INSERT INTO reviews (product_id, user_id, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *',
            [productId, userId, numericRating, comment || null]
        );

        res.status(201).json({ mesaj: 'Degerlendirmeniz basariyla eklendi!' });

        // Admin'e yeni yorum bildirimi (asenkron)
        try {
            const { io } = require('../server');
            await createNotification(
                null,
                'new_review',
                `⭐ Yeni bir urun yorumu eklendi! Urun ID: #${productId} — Puan: ${numericRating}/5`,
                io
            );
        } catch (_) { }
    } catch (err) {
        console.error('Yorum ekleme hatasi:', err.message);
        res.status(500).json({ error: 'Yorum eklenirken hata olustu.' });
    }
};

// 2. Bir urunun tum yorumlarini ve puan ortalamasini getirme
const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;

        const reviews = await pool.query(`
            SELECT r.id, r.rating, r.comment, r.created_at, COALESCE(u.full_name, u.name) AS full_name
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.product_id = $1
            ORDER BY r.created_at DESC
        `, [productId]);

        const avgResult = await pool.query(
            'SELECT AVG(rating) as average, COUNT(id) as total FROM reviews WHERE product_id = $1',
            [productId]
        );

        res.status(200).json({
            reviews: reviews.rows,
            average: avgResult.rows[0].average ? parseFloat(avgResult.rows[0].average).toFixed(1) : 0,
            totalReviews: parseInt(avgResult.rows[0].total, 10) || 0
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

        const reviews = await pool.query(`
            SELECT r.id, r.rating, r.comment, r.created_at, p.name as product_name, p.image_url, p.id as product_id
            FROM reviews r
            JOIN products p ON r.product_id = p.id
            WHERE r.user_id = $1
            ORDER BY r.created_at DESC
        `, [userId]);

        res.status(200).json(reviews.rows);
    } catch (err) {
        console.error('Kullanici yorumlari getirme hatasi:', err);
        res.status(500).json({ error: 'Yorumlariniz getirilemedi.' });
    }
};

module.exports = { addReview, getProductReviews, getUserReviews };
