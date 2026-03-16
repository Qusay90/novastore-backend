const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const { maskFullName } = require('../services/privacyService');

// --- Musteri Islemleri ---

// Yeni Soru Sor
exports.askQuestion = async (req, res) => {
    try {
        const { product_id, question } = req.body;

        // Token'i header'dan alip manuel cozuyoruz (middleware olmadigi icin)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Lutfen giris yapin.' });
        }
        const token = authHeader.split(' ')[1];
        let user_id;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            user_id = decoded.id;
        } catch (err) {
            return res.status(401).json({ error: 'Gecersiz veya suresi dolmus token.' });
        }

        if (!product_id || !question) {
            return res.status(400).json({ error: 'Urun ID ve soru icerigi gereklidir.' });
        }

        const newQuestion = await pool.query(
            'INSERT INTO product_questions (product_id, user_id, question) VALUES ($1, $2, $3) RETURNING *',
            [product_id, user_id, question]
        );

        // Bildirim gonder (Admine)
        try {
            const { io } = require('../server');
            const { createNotification } = require('./notificationController');
            await createNotification(null, 'new_question', 'Yeni bir urun sorusu geldi!', io);
        } catch (notifErr) {
            console.error('Bildirim gonderilirken hata:', notifErr);
        }

        res.status(201).json({ mesaj: 'Sorunuz basariyla iletildi. Satici yanitladiginda burada gorunecektir.', question: newQuestion.rows[0] });
    } catch (error) {
        console.error('Soru sorma hatasi:', error);
        res.status(500).json({ error: 'Sunucu hatasi' });
    }
};

// Urune Ait Sorulari Getir
exports.getProductQuestions = async (req, res) => {
    try {
        const { productId } = req.params;

        const questions = await pool.query(
            `SELECT pq.id, pq.question, pq.answer, pq.created_at, pq.answered_at, COALESCE(u.full_name, u.name) as user_name
             FROM product_questions pq
             JOIN users u ON pq.user_id = u.id
             WHERE pq.product_id = $1 AND pq.answer IS NOT NULL
             ORDER BY pq.answered_at DESC`,
            [productId]
        );

        res.status(200).json(
            questions.rows.map((questionRow) => ({
                ...questionRow,
                user_name: maskFullName(questionRow.user_name)
            }))
        );
    } catch (error) {
        console.error('Sorulari getirme hatasi:', error);
        res.status(500).json({ error: 'Sunucu hatasi' });
    }
};

// 3. Kullanicinin Kendi Sordugu Sorulari Getir
exports.getUserQuestions = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Lutfen giris yapin.' });
        }
        const token = authHeader.split(' ')[1];
        let user_id;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            user_id = decoded.id;
        } catch (err) {
            return res.status(401).json({ error: 'Gecersiz veya suresi dolmus token.' });
        }

        const questions = await pool.query(
            `SELECT pq.id, pq.question, pq.answer, pq.created_at, pq.answered_at,
                    p.name as product_name, p.image_url as product_image
             FROM product_questions pq
             JOIN products p ON pq.product_id = p.id
             WHERE pq.user_id = $1
             ORDER BY pq.created_at DESC`,
            [user_id]
        );

        res.status(200).json(questions.rows);
    } catch (error) {
        console.error('Kullanici sorulari getirme hatasi:', error);
        res.status(500).json({ error: 'Sunucu hatasi' });
    }
};

// --- Admin Islemleri ---

// Admin: Tum Sorulari Getir (Cevaplanmamislar ustte olsun)
exports.getAllQuestionsAdmin = async (req, res) => {
    try {
        console.log('[ADMIN YETKI KONTROLU] Baslatiliyor...');
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('[ADMIN YETKI KONTROLU] Token bulunamadi.');
            return res.status(401).json({ error: 'Lutfen giris yapin.' });
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
            return res.status(401).json({ error: 'Gecersiz veya suresi dolmus token.' });
        }

        console.log('[VERITABANI] Sorular cekiliyor...');
        const questions = await pool.query(
            `SELECT pq.id, pq.question, pq.answer, pq.created_at, pq.answered_at,
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
        console.error('Tum sorulari getirme hatasi:', error);
        res.status(500).json({ error: 'Sunucu hatasi: ' + error.message });
    }
};

// Admin: Soruya Cevap Ver
exports.answerQuestion = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Lutfen giris yapin.' });
        }
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.role !== 'admin') {
                return res.status(403).json({ error: 'Sadece yoneticiler bu islemi yapabilir.' });
            }
        } catch (err) {
            return res.status(401).json({ error: 'Gecersiz veya suresi dolmus token.' });
        }

        const { id } = req.params;
        const { answer } = req.body;

        if (!answer) {
            return res.status(400).json({ error: 'Lutfen bir cevap yazin.' });
        }

        const updatedQuery = await pool.query(
            'UPDATE product_questions SET answer = $1, answered_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [answer, id]
        );

        if (updatedQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Soru bulunamadi.' });
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
        console.error('Cevaplama hatasi:', error);
        res.status(500).json({ error: 'Sunucu hatasi' });
    }
};
