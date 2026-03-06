const pool = require('../config/db');
const jwt = require('jsonwebtoken');

// --- Müşteri İşlemleri ---

// Yeni Soru Sor
exports.askQuestion = async (req, res) => {
    try {
        const { product_id, question } = req.body;

        // Token'ı header'dan alıp manuel çözüyoruz (middleware olmadığı için)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Lütfen giriş yapın." });
        }
        const token = authHeader.split(' ')[1];
        let user_id;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gizli_anahtar_degistirilecek');
            user_id = decoded.id;
        } catch (err) {
            return res.status(401).json({ error: "Geçersiz veya süresi dolmuş token." });
        }

        if (!product_id || !question) {
            return res.status(400).json({ error: "Ürün ID ve soru içeriği gereklidir." });
        }

        const newQuestion = await pool.query(
            "INSERT INTO product_questions (product_id, user_id, question) VALUES ($1, $2, $3) RETURNING *",
            [product_id, user_id, question]
        );

        // Bildirim gönder (Admine)
        try {
            const { io } = require('../server');
            const { createNotification } = require('./notificationController');
            await createNotification(null, 'new_question', 'Yeni bir ürün sorusu geldi!', io);
        } catch (notifErr) {
            console.error('Bildirim gönderilirken hata:', notifErr);
        }

        res.status(201).json({ mesaj: "Sorunuz başarıyla iletildi. Satıcı yanıtladığında burada görünecektir.", question: newQuestion.rows[0] });
    } catch (error) {
        console.error("Soru sorma hatası:", error);
        res.status(500).json({ error: "Sunucu hatası" });
    }
};

// Ürüne Ait Soruları Getir (Sadece cevaplanmış olanları veya soruyu soran kişinin tüm sorularını getirebiliriz.
// Şimdilik Amazon mantığı: Sadece cevaplanmış sorular herkese açık görünür)
exports.getProductQuestions = async (req, res) => {
    try {
        const { productId } = req.params;

        // name'i çekmek için join atıyoruz
        const questions = await pool.query(
            `SELECT pq.id, pq.question, pq.answer, pq.created_at, pq.answered_at, u.name as user_name
             FROM product_questions pq
             JOIN users u ON pq.user_id = u.id
             WHERE pq.product_id = $1 AND pq.answer IS NOT NULL
             ORDER BY pq.answered_at DESC`,
            [productId]
        );

        res.status(200).json(questions.rows);
    } catch (error) {
        console.error("Soruları getirme hatası:", error);
        res.status(500).json({ error: "Sunucu hatası" });
    }
};

// 3. Kullanıcının Kendi Sorduğu Soruları Getir
exports.getUserQuestions = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Lütfen giriş yapın." });
        }
        const token = authHeader.split(' ')[1];
        let user_id;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gizli_anahtar_degistirilecek');
            user_id = decoded.id;
        } catch (err) {
            return res.status(401).json({ error: "Geçersiz veya süresi dolmuş token." });
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
        console.error("Kullanıcı soruları getirme hatası:", error);
        res.status(500).json({ error: "Sunucu hatası" });
    }
};

// --- Admin İşlemleri ---

// Admin: Tüm Soruları Getir (Cevaplanmamışlar üstte olsun)
exports.getAllQuestionsAdmin = async (req, res) => {
    try {
        console.log("➡️ [ADMIN YETKİ KONTROLÜ] Başlatılıyor...");
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log("❌ [ADMIN YETKİ KONTROLÜ] Token bulunamadı.");
            return res.status(401).json({ error: "Lütfen giriş yapın." });
        }
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gizli_anahtar_degistirilecek');
            if (decoded.role !== 'admin') {
                console.log("❌ [ADMIN YETKİ KONTROLÜ] Yetkisiz rol:", decoded.role);
                return res.status(403).json({ error: "Sadece yöneticiler bu işlemi yapabilir." });
            }
            console.log("✅ [ADMIN YETKİ KONTROLÜ] Başarılı.");
        } catch (err) {
            console.log("❌ [ADMIN YETKİ KONTROLÜ] Token doğrulanamadı:", err.message);
            return res.status(401).json({ error: "Geçersiz veya süresi dolmuş token." });
        }

        console.log("➡️ [VERİTABANI] Sorular çekiliyor...");
        const questions = await pool.query(
            `SELECT pq.id, pq.question, pq.answer, pq.created_at, pq.answered_at, 
                    p.name as product_name, p.image_url as product_image,
                    u.name as user_name
             FROM product_questions pq
             JOIN products p ON pq.product_id = p.id
             JOIN users u ON pq.user_id = u.id
             ORDER BY 
                CASE WHEN pq.answer IS NULL THEN 0 ELSE 1 END ASC, 
                pq.created_at DESC`
        );
        console.log("✅ [VERİTABANI] Sorular çekildi, adet:", questions.rows.length);

        res.status(200).json(questions.rows);
    } catch (error) {
        console.error("❌ Tüm soruları getirme hatası:", error);
        res.status(500).json({ error: "Sunucu hatası: " + error.message });
    }
};

// Admin: Soruya Cevap Ver
exports.answerQuestion = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Lütfen giriş yapın." });
        }
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gizli_anahtar_degistirilecek');
            if (decoded.role !== 'admin') {
                return res.status(403).json({ error: "Sadece yöneticiler bu işlemi yapabilir." });
            }
        } catch (err) {
            return res.status(401).json({ error: "Geçersiz veya süresi dolmuş token." });
        }

        const { id } = req.params; // soru ID'si
        const { answer } = req.body;

        if (!answer) {
            return res.status(400).json({ error: "Lütfen bir cevap yazın." });
        }

        const updatedQuery = await pool.query(
            "UPDATE product_questions SET answer = $1, answered_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
            [answer, id]
        );

        if (updatedQuery.rows.length === 0) {
            return res.status(404).json({ error: "Soru bulunamadı." });
        }

        const answeredQuestion = updatedQuery.rows[0];

        // Bildirim gönder (Kullanıcıya)
        try {
            const { io } = require('../server');
            const { createNotification } = require('./notificationController');
            await createNotification(answeredQuestion.user_id, 'question_answered', 'Sorduğunuz soru satıcı tarafından yanıtlandı!', io);
        } catch (notifErr) {
            console.error('Bildirim gönderilirken hata:', notifErr);
        }

        res.status(200).json({ mesaj: "Soru cevaplandı ve yayınlandı.", question: answeredQuestion });
    } catch (error) {
        console.error("Cevaplama hatası:", error);
        res.status(500).json({ error: "Sunucu hatası" });
    }
};
