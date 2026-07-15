const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const { maskFullName } = require('../services/privacyService');
const { buildPublicProductSqlPredicate } = require('../constants/productVisibility');

// --- Musteri Islemleri ---

// Yeni Soru Sor
exports.askQuestion = async (req, res) => {
    try {
        const { product_id, question } = req.body;

        // Token'i header'dan alip manuel cozuyoruz (middleware olmadigi icin)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Lütfen giriş yapın.' });
        }
        const token = authHeader.split(' ')[1];
        let user_id;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            user_id = decoded.id;
        } catch (err) {
            return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token.' });
        }

        if (!product_id || !question) {
            return res.status(400).json({ error: 'Ürün ID ve soru içeriği gereklidir.' });
        }

        const newQuestion = await pool.query(
            `INSERT INTO product_questions (product_id, user_id, question)
             SELECT products.id, $2, $3
             FROM products
             WHERE products.id = $1
               AND ${buildPublicProductSqlPredicate('products')}
             RETURNING *`,
            [product_id, user_id, question]
        );

        if (newQuestion.rows.length === 0) {
            return res.status(404).json({ error: 'Ürün bulunamadı.', code: 'PRODUCT_NOT_FOUND' });
        }

        // Bildirim gonder (Admine)
        try {
            const { io } = require('../server');
            const { createNotification } = require('./notificationController');
            await createNotification(null, 'new_question', 'Yeni bir ürün sorusu geldi!', io);
        } catch (notifErr) {
            console.error('Bildirim gonderilirken hata:', notifErr);
        }

        res.status(201).json({ mesaj: 'Sorunuz başarıyla iletildi. Satıcı yanıtladığında burada görünecektir.', question: newQuestion.rows[0] });
    } catch (error) {
        console.error('Soru sorma hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
};

// Ürüne Ait Soruları Getir
exports.getProductQuestions = async (req, res) => {
    try {
        const { productId } = req.params;

        const questions = await pool.query(
            `WITH public_product AS (
                SELECT products.id
                FROM products
                WHERE products.id = $1
                  AND ${buildPublicProductSqlPredicate('products')}
             )
             SELECT public_product.id AS public_product_id,
                    pq.id, pq.product_id, pq.user_id, pq.question, pq.answer, pq.created_at, pq.answered_at,
                    COALESCE(u.full_name, u.name) as user_name
             FROM public_product
             LEFT JOIN product_questions pq ON pq.product_id = public_product.id
             LEFT JOIN users u ON pq.user_id = u.id
             ORDER BY
                CASE WHEN pq.answer IS NULL THEN 0 ELSE 1 END ASC,
                COALESCE(pq.answered_at, pq.created_at) DESC`,
            [productId]
        );

        if (questions.rows.length === 0) {
            return res.status(404).json({ error: 'Ürün bulunamadı.', code: 'PRODUCT_NOT_FOUND' });
        }

        res.status(200).json(
            questions.rows
                .filter((questionRow) => questionRow.id !== null)
                .map(({ public_product_id: _publicProductId, ...questionRow }) => ({
                    ...questionRow,
                    user_name: maskFullName(questionRow.user_name),
                    status: questionRow.answer ? 'answered' : 'pending',
                    is_answered: Boolean(questionRow.answer)
                }))
        );
    } catch (error) {
        console.error('Soruları getirme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
};

// 3. Kullanıcının Kendi Sorduğu Soruları Getir
exports.getUserQuestions = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Lütfen giriş yapın.' });
        }
        const token = authHeader.split(' ')[1];
        let user_id;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            user_id = decoded.id;
        } catch (err) {
            return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token.' });
        }

        const questions = await pool.query(
            `SELECT pq.id, pq.question, pq.answer, pq.created_at, pq.answered_at,
                    pq.product_id, p.name as product_name, p.image_url as product_image
             FROM product_questions pq
             JOIN products p ON pq.product_id = p.id
             WHERE pq.user_id = $1
             ORDER BY pq.created_at DESC`,
            [user_id]
        );

        res.status(200).json(questions.rows.map((questionRow) => ({
            ...questionRow,
            status: questionRow.answer ? 'answered' : 'pending',
            is_answered: Boolean(questionRow.answer)
        })));
    } catch (error) {
        console.error('Kullanıcı soruları getirme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
};

// --- Admin Islemleri ---

// Admin: Tüm Soruları Getir (Cevaplanmamışlar üstte olsun)
exports.getAllQuestionsAdmin = async (req, res) => {
    try {
        console.log('[ADMIN YETKI KONTROLU] Baslatiliyor...');
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('[ADMIN YETKİ KONTROLÜ] Token bulunamadı.');
            return res.status(401).json({ error: 'Lütfen giriş yapın.' });
        }
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.role !== 'admin') {
                console.log('[ADMIN YETKI KONTROLU] Yetkisiz rol:', decoded.role);
                return res.status(403).json({ error: 'Sadece yoneticiler bu islemi yapabilir.' });
            }
            console.log('[ADMIN YETKI KONTROLU] Basarili.');
        } catch (err) {
            console.log('[ADMIN YETKI KONTROLU] Token dogrulanamadi:', err.message);
            return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token.' });
        }

        console.log('[VERITABANI] Sorular cekiliyor...');
        const questions = await pool.query(
            `SELECT pq.id, pq.product_id, pq.user_id, pq.question, pq.answer, pq.created_at, pq.answered_at,
                    p.name as product_name, p.image_url as product_image,
                    COALESCE(u.full_name, u.name) as user_name
             FROM product_questions pq
             JOIN products p ON pq.product_id = p.id
             JOIN users u ON pq.user_id = u.id
             ORDER BY
                CASE WHEN pq.answer IS NULL THEN 0 ELSE 1 END ASC,
                pq.created_at DESC`
        );
        console.log('[VERITABANI] Sorular cekildi, adet:', questions.rows.length);

        res.status(200).json(questions.rows);
    } catch (error) {
        console.error('Tüm soruları getirme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası: ' + error.message });
    }
};

// Admin: Ürün bazlı soru özetleri
exports.getProductQuestionSummaryAdmin = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Lütfen giriş yapın.' });
        }
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.role !== 'admin') {
                return res.status(403).json({ error: 'Sadece yöneticiler bu işlemi yapabilir.' });
            }
        } catch (err) {
            return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token.' });
        }

        const result = await pool.query(
            `SELECT
                p.id AS product_id,
                p.name AS product_name,
                p.image_url AS product_image,
                COUNT(pq.id)::INT AS question_count,
                COUNT(pq.id) FILTER (WHERE pq.answer IS NULL)::INT AS pending_count,
                COUNT(pq.id) FILTER (WHERE pq.answer IS NOT NULL)::INT AS answered_count,
                MAX(pq.created_at) AS latest_question_at
             FROM product_questions pq
             JOIN products p ON pq.product_id = p.id
             GROUP BY p.id, p.name, p.image_url
             ORDER BY
                COUNT(pq.id) FILTER (WHERE pq.answer IS NULL) DESC,
                MAX(pq.created_at) DESC`
        );

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Ürün soru özetleri getirme hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası: ' + error.message });
    }
};

// Admin: Soruya Cevap Ver
exports.answerQuestion = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Lütfen giriş yapın.' });
        }
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.role !== 'admin') {
                return res.status(403).json({ error: 'Sadece yoneticiler bu islemi yapabilir.' });
            }
        } catch (err) {
            return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token.' });
        }

        const { id } = req.params;
        const { answer } = req.body;

        if (!answer) {
            return res.status(400).json({ error: 'Lütfen bir cevap yazın.' });
        }

        const updatedQuery = await pool.query(
            'UPDATE product_questions SET answer = $1, answered_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [answer, id]
        );

        if (updatedQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Soru bulunamadı.' });
        }

        const answeredQuestion = updatedQuery.rows[0];

        // Bildirim gonder (Kullaniciya)
        try {
            const { io } = require('../server');
            const { createNotification } = require('./notificationController');
            await createNotification(answeredQuestion.user_id, 'question_answered', 'Sordugunuz soru satici tarafindan yanitlandi!', io);
        } catch (notifErr) {
            console.error('Bildirim gonderilirken hata:', notifErr);
        }

        res.status(200).json({ mesaj: 'Soru cevaplandi ve yayinlandi.', question: answeredQuestion });
    } catch (error) {
        console.error('Cevaplama hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
};
