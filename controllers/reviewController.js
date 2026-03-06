const pool = require('../config/db');
const { createNotification } = require('./notificationController');

// 1. Ürüne Yorum Ekleme
const addReview = async (req, res) => {
    try {
        const { productId, userId, rating, comment } = req.body;

        // Müşteri bu ürüne daha önce yorum yapmış mı kontrolü (Hepsiburada Mantığı)
        const checkReview = await pool.query('SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2', [productId, userId]);
        if (checkReview.rows.length > 0) {
            return res.status(400).json({ error: "Bu ürünü zaten değerlendirdiniz." });
        }

        const newReview = await pool.query(
            'INSERT INTO reviews (product_id, user_id, rating, comment) VALUES ($1, $2, $3, $4) RETURNING *',
            [productId, userId, rating, comment]
        );

        res.status(201).json({ mesaj: "Değerlendirmeniz başarıyla eklendi!" });

        // Admin'e yeni yorum bildirimi (asenkron, response beklemez)
        try {
            const { io } = require('../server');
            await createNotification(
                null,
                'new_review',
                `⭐ Yeni bir ürün yorumu eklendi! Ürün ID: #${productId} — Puan: ${rating}/5`,
                io
            );
        } catch (_) { }

    } catch (err) {
        console.error("Yorum ekleme hatası:", err.message);
        res.status(500).json({ error: "Yorum eklenirken hata oluştu." });
    }
};

// 2. Bir Ürünün Tüm Yorumlarını ve Puan Ortalamasını Getirme
const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;

        // Yorumları ve yorumu yapan müşterinin adını getiriyoruz
        const reviews = await pool.query(`
            SELECT r.id, r.rating, r.comment, r.created_at, u.full_name 
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.product_id = $1
            ORDER BY r.created_at DESC
        `, [productId]);

        // Ortalama puanı hesapla (Örn: 4.5 Yıldız)
        const avgResult = await pool.query('SELECT AVG(rating) as average, COUNT(id) as total FROM reviews WHERE product_id = $1', [productId]);

        res.status(200).json({
            reviews: reviews.rows,
            average: avgResult.rows[0].average ? parseFloat(avgResult.rows[0].average).toFixed(1) : 0,
            totalReviews: parseInt(avgResult.rows[0].total) || 0
        });

    } catch (err) {
        console.error("Yorumları getirme hatası:", err.message);
        res.status(500).json({ error: "Yorumlar getirilemedi." });
    }
};

// 3. Bir Müşterinin Tüm Yorumlarını Getirme (Profil Sayfası İçin)
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
        console.error("Kullanıcı yorumları getirme hatası:", err);
        res.status(500).json({ error: "Yorumlarınız getirilemedi." });
    }
};

module.exports = { addReview, getProductReviews, getUserReviews };