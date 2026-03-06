const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Veritabanında bu e-postaya sahip bir kullanıcı var mı bak
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: "Bu e-posta adresine ait bir hesap bulunamadı." });
        }

        const user = userResult.rows[0];

        // 2. Şifre doğru mu kontrol et
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: "Hatalı şifre girdiniz." });
        }

        // 3. Giren kişi Admin (Yönetici) mi kontrol et
        if (user.role !== 'admin') {
            return res.status(403).json({ error: "Bu panele sadece yöneticiler girebilir!" });
        }

        // 4. Her şey doğruysa dijital bir yaka kartı (Token) oluştur (1 gün geçerli)
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ mesaj: "Giriş başarılı, panele yönlendiriliyorsunuz...", token });

    } catch (err) {
        console.error("Giriş hatası:", err);
        res.status(500).json({ error: "Sunucu hatası meydana geldi." });
    }
};

// ŞİFREMİ UNUTTUM FONKSİYONU
const forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        // 1. Veritabanında kullanıcıyı bul
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Bu e-posta adresine kayıtlı bir hesap bulunamadı.' });
        }

        const user = userResult.rows[0];

        // 2. Güvenli bir sıfırlama token'ı oluştur (1 saat geçerli)
        const resetToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'gizli_anahtar', { expiresIn: '1h' });

        // Front-end'deki yeni şifre belirleme sayfasının linki
        // Not: Kendi frontend portuna (örn: 5500 veya doğrudan dosya yolu) göre burayı ayarlayabilirsin
        const resetLink = `http://localhost:5000/reset-password.html?token=${resetToken}`;

        // 3. E-posta Gönderme Ayarları
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: `"NovaStore Destek" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: 'NovaStore - Şifre Sıfırlama Talebi',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <h2 style="color: #0F2A43;">NovaStore Şifre Sıfırlama</h2>
                    <p>Merhaba <b>${user.full_name || 'Kullanıcı'}</b>,</p>
                    <p>Hesabınızın şifresini sıfırlamak için bir talepte bulundunuz. Aşağıdaki butona tıklayarak yeni şifrenizi belirleyebilirsiniz:</p>
                    <a href="${resetLink}" style="background-color: #F7941D; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin: 20px 0;">Şifremi Sıfırla</a>
                    <p style="color: #666; font-size: 0.9rem;">Bu bağlantı güvenliğiniz için <b>1 saat</b> sonra geçersiz olacaktır.</p>
                    <p style="color: #999; font-size: 0.8rem;">Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: 'Şifre sıfırlama linki e-postanıza gönderildi.' });

    } catch (error) {
        console.error('Şifre sıfırlama hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası, lütfen daha sonra tekrar deneyin.' });
    }
};

// YENİ ŞİFRE BELİRLEME FONKSİYONU
const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token ve yeni şifre gereklidir.' });
    }

    try {
        // 1. Token'ı doğrula ve içindeki kullanıcı ID'sini çıkart
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gizli_anahtar');

        // 2. Yeni şifreyi güvenli şekilde hashle
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 3. Veritabanında şifreyi güncelle
        const result = await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2 RETURNING id',
            [hashedPassword, decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        res.status(200).json({ message: 'Şifreniz başarıyla güncellendi.' });

    } catch (err) {
        // Token süresi dolmuşsa veya geçersizse
        if (err.name === 'TokenExpiredError') {
            return res.status(400).json({ message: 'Bu bağlantının süresi dolmuş. Lütfen yeni bir sıfırlama linki isteyin.' });
        }
        return res.status(400).json({ message: 'Geçersiz veya bozuk bağlantı.' });
    }
};

module.exports = { login, forgotPassword, resetPassword };