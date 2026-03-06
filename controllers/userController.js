const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 1. Müşteri Kayıt Olma (Şifreleri Kriptolayarak)
const registerUser = async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        // Müşteri zaten kayıtlı mı kontrol et
        const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: "Bu e-posta adresi zaten kullanılıyor." });
        }

        // Şifreyi hackerların okuyamayacağı formata çevir (Kriptola)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Yeni müşteriyi veritabanına kaydet (Kriptolu şifre ile)
        const newUser = await pool.query(
            'INSERT INTO users (full_name, email, password) VALUES ($1, $2, $3) RETURNING id, full_name, email',
            [fullName, email, hashedPassword]
        );

        res.status(201).json({ mesaj: "Aramıza hoş geldin! Kayıt başarılı.", user: newUser.rows[0] });
    } catch (err) {
        console.error("Kayıt hatası:", err.message);
        res.status(500).json({ error: "Kayıt olurken bir hata oluştu." });
    }
};

// 2. Müşteri Giriş Yapma
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        // E-posta veritabanında var mı?
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(400).json({ error: "E-posta veya şifre hatalı." });
        }

        // Girilen şifre, kriptolu şifreyle eşleşiyor mu?
        const isMatch = await bcrypt.compare(password, user.rows[0].password);
        if (!isMatch) {
            return res.status(400).json({ error: "E-posta veya şifre hatalı." });
        }

        // Başarılı giriş: Müşteriye 30 günlük dijital anahtar (Token) ver
        const token = jwt.sign(
            { id: user.rows[0].id, role: user.rows[0].role },
            process.env.JWT_SECRET || 'gizli_anahtar_nova_123',
            { expiresIn: '30d' }
        );

        res.status(200).json({
            mesaj: "Giriş başarılı! Yönlendiriliyorsunuz...",
            token: token,
            user: { id: user.rows[0].id, fullName: user.rows[0].full_name, email: user.rows[0].email }
        });
    } catch (err) {
        console.error("Giriş hatası:", err.message);
        res.status(500).json({ error: "Giriş yaparken sunucu hatası oluştu." });
    }
};

module.exports = { registerUser, loginUser };