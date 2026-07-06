const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const { getAppBaseUrl, getMailFrom } = require('../config/appConfig');

const PASSWORD_RESET_TOKEN_PURPOSE = 'password_reset';
const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60;

const ensureJwtSecret = () => {
    if (!process.env.JWT_SECRET) {
        throw new Error('Server JWT config missing');
    }
};

const createPasswordResetTokenPayload = (userId) => ({
    id: Number(userId),
    purpose: PASSWORD_RESET_TOKEN_PURPOSE,
    jti: crypto.randomBytes(16).toString('hex')
});

const hashPasswordResetToken = (token) => (
    crypto.createHash('sha256').update(String(token || '')).digest('hex')
);

const verifyPasswordResetToken = (token) => {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = Number(decoded && decoded.id);

    if (
        !decoded ||
        decoded.purpose !== PASSWORD_RESET_TOKEN_PURPOSE ||
        !Number.isInteger(userId) ||
        userId <= 0
    ) {
        throw new Error('Invalid password reset token');
    }

    return { id: userId };
};

const login = async (req, res) => {
    try {
        ensureJwtSecret();
        const { email, password } = req.body;

        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Bu e-posta adresine ait bir hesap bulunamadı.' });
        }

        const user = userResult.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Hatalı şifre girdiniz.' });
        }

        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Bu panele sadece yöneticiler girebilir!' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ mesaj: 'Giriş başarılı, panele yönlendiriliyorsunuz...', token });
    } catch (err) {
        console.error('Giriş hatası:', err);
        if (String(err.message).includes('JWT config')) {
            return res.status(500).json({ error: 'Sunucu güvenlik ayarı eksik.' });
        }
        res.status(500).json({ error: 'Sunucu hatası meydana geldi.' });
    }
};

// Sifremi unuttum
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    const neutralMessage = 'Eğer bu e-posta sistemde kayıtlıysa şifre sıfırlama bağlantısı gönderildi.';

    try {
        ensureJwtSecret();

        if (!process.env.RESEND_API_KEY) {
            return res.status(503).json({ message: 'E-posta servisi şu anda kullanılamıyor.' });
        }

        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userResult.rows.length === 0) {
            return res.status(200).json({ message: neutralMessage });
        }

        const user = userResult.rows[0];

        const resetToken = jwt.sign(
            createPasswordResetTokenPayload(user.id),
            process.env.JWT_SECRET,
            { expiresIn: PASSWORD_RESET_TOKEN_TTL_SECONDS }
        );
        const resetTokenHash = hashPasswordResetToken(resetToken);
        const resetTokenExpiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000);

        const resetStateResult = await pool.query(
            `UPDATE users
             SET password_reset_token_hash = $1,
                 password_reset_expires_at = $2
             WHERE id = $3
             RETURNING id`,
            [resetTokenHash, resetTokenExpiresAt, user.id]
        );

        if (resetStateResult.rows.length === 0) {
            return res.status(200).json({ message: neutralMessage });
        }

        const baseUrl = getAppBaseUrl(req);
        const resetLink = `${baseUrl}/reset-password.html?token=${resetToken}`;

        const displayName = user.full_name || user.name || 'Kullanıcı';

        const resend = new Resend(process.env.RESEND_API_KEY);

        const { error } = await resend.emails.send({
            from: 'NovaStore Destek <destek@novastore.tr>',
            to: user.email,
            subject: 'NovaStore - Şifre Sıfırlama Talebi',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <h2 style="color: #0F2A43;">NovaStore Şifre Sıfırlama</h2>
            <p>Merhaba <b>${displayName}</b>,</p>
            <p>Hesabınızın şifresini sıfırlamak için bir talepte bulundunuz. Aşağıdaki butona tıklayarak yeni şifrenizi belirleyebilirsiniz:</p>
            <a href="${resetLink}" style="background-color: #F7941D; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin: 20px 0;">Şifremi Sıfırla</a>
            <p style="color: #666; font-size: 0.9rem;">Bu bağlantı güvenliğiniz için <b>1 saat</b> sonra geçersiz olacaktır.</p>
            <p style="color: #999; font-size: 0.8rem;">Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.</p>
        </div>
    `
        });

        if (error) {
            console.error('Resend hatası:', error);
            return res.status(500).json({ message: 'Mail gönderme hatası: ' + error.message });
        }

        res.status(200).json({ message: neutralMessage });
    } catch (error) {
        console.error('Şifre sıfırlama hatası:', error);
        if (String(error.message).includes('JWT config')) {
            return res.status(500).json({ message: 'Sunucu güvenlik ayarı eksik.' });
        }
        res.status(500).json({ message: 'Hatasi detayi: ' + (error.message || 'Bilinmeyen Hata') });
    }
};

const getSecurityStatus = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, phone, password FROM users WHERE id = $1',
            [req.user.id]
        );
        const user = result.rows[0];
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }

        res.status(200).json({
            email: user.email,
            emailVerified: false,
            phone: user.phone || null,
            phoneVerified: false,
            twoFactorEnabled: false,
            hasPassword: Boolean(user.password)
        });
    } catch (err) {
        if (err && err.code === '42703') {
            const result = await pool.query(
                'SELECT id, email, password FROM users WHERE id = $1',
                [req.user.id]
            );
            const user = result.rows[0];
            if (!user) {
                return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
            }
            return res.status(200).json({
                email: user.email,
                emailVerified: false,
                phone: null,
                phoneVerified: false,
                twoFactorEnabled: false,
                hasPassword: Boolean(user.password)
            });
        }
        console.error('Güvenlik durumu hatası:', err.message);
        res.status(500).json({ error: 'Güvenlik durumu alınamadı.' });
    }
};

const changePassword = async (req, res) => {
    try {
        const currentPassword = String(req.body.currentPassword || '');
        const newPassword = String(req.body.newPassword || '');

        if (!currentPassword) {
            return res.status(400).json({ error: 'Mevcut şifre boş olamaz.' });
        }
        if (newPassword.length < 8 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(newPassword) || !/\d/.test(newPassword)) {
            return res.status(400).json({ error: 'Yeni şifre en az 8 karakter, harf ve rakam içermelidir.' });
        }
        if (currentPassword === newPassword) {
            return res.status(400).json({ error: 'Yeni şifre mevcut şifre ile aynı olamaz.' });
        }

        const result = await pool.query('SELECT id, password FROM users WHERE id = $1', [req.user.id]);
        const user = result.rows[0];
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }

        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Mevcut şifre hatalı.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query(
            `UPDATE users
             SET password = $1,
                 password_reset_token_hash = NULL,
                 password_reset_expires_at = NULL
             WHERE id = $2`,
            [hashedPassword, req.user.id]
        );
        res.status(200).json({ message: 'Şifren başarıyla güncellendi.' });
    } catch (err) {
        console.error('Şifre değiştirme hatası:', err.message);
        res.status(500).json({ error: 'Şifre güncellenemedi.' });
    }
};

const sendPhoneCode = async (_req, res) => {
    res.status(503).json({ error: 'SMS doğrulama servisi henüz yapılandırılmadı.' });
};

const verifyPhoneCode = async (_req, res) => {
    res.status(503).json({ error: 'SMS doğrulama servisi henüz yapılandırılmadı.' });
};

const sendEmailVerification = async (_req, res) => {
    res.status(503).json({ error: 'E-posta doğrulama servisi henüz yapılandırılmadı.' });
};

const setupTwoFactor = async (_req, res) => {
    res.status(503).json({ error: 'İki adımlı doğrulama altyapısı henüz yapılandırılmadı.' });
};

// Yeni şifre belirleme
const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token ve yeni şifre gereklidir.' });
    }

    try {
        ensureJwtSecret();

        const decoded = verifyPasswordResetToken(token);
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const resetTokenHash = hashPasswordResetToken(token);

        const result = await pool.query(
            `UPDATE users
             SET password = $1,
                 password_reset_token_hash = NULL,
                 password_reset_expires_at = NULL
             WHERE id = $2
               AND password_reset_token_hash = $3
               AND password_reset_expires_at > NOW()
             RETURNING id`,
            [hashedPassword, decoded.id, resetTokenHash]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Geçersiz veya süresi dolmuş bağlantı.' });
        }

        res.status(200).json({ message: 'Şifreniz başarıyla güncellendi.' });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(400).json({ message: 'Bu bağlantının süresi dolmuş. Lütfen yeni bir sıfırlama linki isteyin.' });
        }
        if (String(err.message).includes('JWT config')) {
            return res.status(500).json({ message: 'Sunucu güvenlik ayarı eksik.' });
        }
        return res.status(400).json({ message: 'Geçersiz veya bozuk bağlantı.' });
    }
};

module.exports = {
    login,
    forgotPassword,
    resetPassword,
    getSecurityStatus,
    changePassword,
    sendPhoneCode,
    verifyPhoneCode,
    sendEmailVerification,
    setupTwoFactor
};
