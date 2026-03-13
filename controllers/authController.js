const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const { getAppBaseUrl, getMailFrom } = require('../config/appConfig');

const ensureJwtSecret = () => {
    if (!process.env.JWT_SECRET) {
        throw new Error('Server JWT config missing');
    }
};

const login = async (req, res) => {
    try {
        ensureJwtSecret();
        const { email, password } = req.body;

        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Bu e-posta adresine ait bir hesap bulunamadi.' });
        }

        const user = userResult.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Hatali sifre girdiniz.' });
        }

        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Bu panele sadece yoneticiler girebilir!' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ mesaj: 'Giris basarili, panele yonlendiriliyorsunuz...', token });
    } catch (err) {
        console.error('Giris hatasi:', err);
        if (String(err.message).includes('JWT config')) {
            return res.status(500).json({ error: 'Sunucu guvenlik ayari eksik.' });
        }
        res.status(500).json({ error: 'Sunucu hatasi meydana geldi.' });
    }
};

// Sifremi unuttum
const forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        ensureJwtSecret();

        if (!process.env.RESEND_API_KEY) {
            return res.status(500).json({ message: 'E-posta servisi ayarlanmamis. RESEND_API_KEY eksik.' });
        }

        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Bu e-posta adresine kayitli bir hesap bulunamadi.' });
        }

        const user = userResult.rows[0];

        const resetToken = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const baseUrl = getAppBaseUrl(req);
        const resetLink = `${baseUrl}/reset-password.html?token=${resetToken}`;

        const displayName = user.full_name || user.name || 'Kullanici';

        const resend = new Resend(process.env.RESEND_API_KEY);

        const { error } = await resend.emails.send({
            from: 'NovaStore Destek <destek@novastore.tr>', // SADECE BU SATIRI DEĞİŞTİRDİK
            to: user.email,
            subject: 'NovaStore - Sifre Sifirlama Talebi',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <h2 style="color: #0F2A43;">NovaStore Sifre Sifirlama</h2>
            <p>Merhaba <b>${displayName}</b>,</p>
            <p>Hesabinizin sifresini sifirlamak icin bir talepte bulundunuz. Asagidaki butona tiklayarak yeni sifrenizi belirleyebilirsiniz:</p>
            <a href="${resetLink}" style="background-color: #F7941D; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin: 20px 0;">Sifremi Sifirla</a>
            <p style="color: #666; font-size: 0.9rem;">Bu baglanti guvenliginiz icin <b>1 saat</b> sonra gecersiz olacaktir.</p>
            <p style="color: #999; font-size: 0.8rem;">Eger bu talebi siz yapmadiysaniz, bu e-postayi gormezden gelebilirsiniz.</p>
        </div>
    `
        });

        if (error) {
            console.error('Resend hatasi:', error);
            return res.status(500).json({ message: 'Mail gonderme hatasi: ' + error.message });
        }

        res.status(200).json({ message: 'Sifre sifirlama linki e-postaniza gonderildi.' });
    } catch (error) {
        console.error('Sifre sifirlama hatasi:', error);
        if (String(error.message).includes('JWT config')) {
            return res.status(500).json({ message: 'Sunucu guvenlik ayari eksik.' });
        }
        res.status(500).json({ message: 'Hatasi detayi: ' + (error.message || 'Bilinmeyen Hata') });
    }
};

// Yeni sifre belirleme
const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token ve yeni sifre gereklidir.' });
    }

    try {
        ensureJwtSecret();

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const result = await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2 RETURNING id',
            [hashedPassword, decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Kullanici bulunamadi.' });
        }

        res.status(200).json({ message: 'Sifreniz basariyla guncellendi.' });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(400).json({ message: 'Bu baglantinin suresi dolmus. Lutfen yeni bir sifirlama linki isteyin.' });
        }
        if (String(err.message).includes('JWT config')) {
            return res.status(500).json({ message: 'Sunucu guvenlik ayari eksik.' });
        }
        return res.status(400).json({ message: 'Gecersiz veya bozuk baglanti.' });
    }
};

module.exports = { login, forgotPassword, resetPassword };
