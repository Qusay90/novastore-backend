const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { AuthSessionError, issueAccessSession } = require('../services/authSessionService');

const insertUserWithSchemaFallback = async (fullName, email, hashedPassword) => {
    try {
        return await pool.query(
            'INSERT INTO users (full_name, email, password) VALUES ($1, $2, $3) RETURNING id, full_name, email',
            [fullName, email, hashedPassword]
        );
    } catch (err) {
        // Eski schema uyumu: users.name
        if (err && err.code === '42703') {
            return pool.query(
                'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
                [fullName, email, hashedPassword]
            );
        }
        throw err;
    }
};

const selectUserProfile = async (userId) => {
    try {
        const result = await pool.query(
            'SELECT id, full_name, name, email, role, phone FROM users WHERE id = $1',
            [userId]
        );
        return result.rows[0] || null;
    } catch (err) {
        if (err && err.code === '42703') {
            const result = await pool.query(
                'SELECT id, full_name, name, email, role FROM users WHERE id = $1',
                [userId]
            );
            return result.rows[0] ? { ...result.rows[0], phone: null } : null;
        }
        throw err;
    }
};

const ensureUsersPhoneColumn = async () => {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32)');
};

const updateUserProfileWithSchemaFallback = async (userId, fullName, phone) => {
    try {
        return await pool.query(
            `UPDATE users
             SET full_name = $1, phone = $2
             WHERE id = $3
             RETURNING id, full_name, name, email, role, phone`,
            [fullName, phone, userId]
        );
    } catch (err) {
        if (err && err.code === '42703') {
            await ensureUsersPhoneColumn();
            try {
                return await pool.query(
                    `UPDATE users
                     SET full_name = $1, phone = $2
                     WHERE id = $3
                     RETURNING id, full_name, name, email, role, phone`,
                    [fullName, phone, userId]
                );
            } catch (retryErr) {
                if (retryErr && retryErr.code !== '42703') {
                    throw retryErr;
                }
            }
            try {
                return await pool.query(
                    `UPDATE users
                     SET full_name = $1
                     WHERE id = $2
                     RETURNING id, full_name, name, email, role`,
                    [fullName, userId]
                );
            } catch (innerErr) {
                if (innerErr && innerErr.code === '42703') {
                    return pool.query(
                        `UPDATE users
                         SET name = $1
                         WHERE id = $2
                         RETURNING id, name, email, role`,
                        [fullName, userId]
                    );
                }
                throw innerErr;
            }
        }
        throw err;
    }
};

const toUserResponse = (row) => ({
    id: row.id,
    fullName: row.full_name || row.name,
    email: row.email,
    role: row.role,
    phone: row.phone || null
});

// 1. Müşteri kayıt olma
const registerUser = async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'Bu e-posta adresi zaten kullanılıyor.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await insertUserWithSchemaFallback(fullName, email, hashedPassword);
        const row = newUser.rows[0];

        res.status(201).json({
            mesaj: 'Aramıza hoş geldin! Kayıt başarılı.',
            user: {
                id: row.id,
                fullName: row.full_name || row.name,
                email: row.email
            }
        });
    } catch (err) {
        console.error('Kayıt hatası:', err.message);
        res.status(500).json({ error: 'Kayıt olurken bir hata oluştu.' });
    }
};

// 2. Müşteri giriş yapma
const loginUser = async (req, res) => {
    let client;
    let transactionOpen = false;
    try {
        const { email, password } = req.body;
        client = await pool.connect();
        await client.query('BEGIN');
        transactionOpen = true;

        const user = await client.query(
            'SELECT * FROM users WHERE email = $1 FOR UPDATE',
            [email]
        );
        if (user.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return res.status(400).json({ error: 'E-posta veya şifre hatalı.' });
        }

        const currentUser = user.rows[0];
        const isMatch = await bcrypt.compare(password, currentUser.password);
        if (!isMatch || currentUser.role !== 'customer' || currentUser.auth_enabled !== true) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return res.status(400).json({ error: 'E-posta veya şifre hatalı.' });
        }

        const session = await issueAccessSession({
            userId: currentUser.id,
            role: currentUser.role,
            principal: 'customer',
            queryable: client
        });
        await client.query('COMMIT');
        transactionOpen = false;

        return res.status(200).json({
            mesaj: 'Giriş başarılı! Yönlendiriliyorsunuz...',
            token: session.token,
            user: {
                id: currentUser.id,
                fullName: currentUser.full_name || currentUser.name,
                email: currentUser.email,
                role: currentUser.role,
                phone: currentUser.phone || null
            }
        });
    } catch (err) {
        if (transactionOpen && client) {
            try { await client.query('ROLLBACK'); } catch (_) { /* best effort */ }
        }
        console.error('Giriş hatası:', err.message);
        if (err instanceof AuthSessionError && err.statusCode === 500) {
            return res.status(500).json({ error: 'Sunucu güvenlik ayarı eksik.' });
        }
        return res.status(500).json({ error: 'Giriş yaparken sunucu hatası oluştu.' });
    } finally {
        client?.release?.();
    }
};

const updateMe = async (req, res) => {
    try {
        const fullName = String(req.body.fullName || req.body.full_name || '').trim();
        const rawPhone = req.body.phone === undefined || req.body.phone === null ? null : String(req.body.phone).trim();
        const phone = rawPhone ? rawPhone.replace(/[^\d+]/g, '').slice(0, 16) : null;

        if (fullName.length < 2) {
            return res.status(400).json({ error: 'Ad soyad en az 2 karakter olmalıdır.' });
        }

        if (phone && !/^(\+?\d{10,16})$/.test(phone)) {
            return res.status(400).json({ error: 'Geçerli bir telefon numarası girin.' });
        }

        const result = await updateUserProfileWithSchemaFallback(req.user.id, fullName, phone);
        const row = result.rows[0] || await selectUserProfile(req.user.id);
        if (!row) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }

        res.status(200).json({
            mesaj: 'Profil güncellendi.',
            user: toUserResponse(row)
        });
    } catch (err) {
        console.error('Profil güncelleme hatası:', err.message);
        res.status(500).json({ error: 'Profil güncellenemedi.' });
    }
};

const getMe = async (req, res) => {
    try {
        const row = await selectUserProfile(req.user.id);
        if (!row) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }

        res.status(200).json({
            user: toUserResponse(row)
        });
    } catch (err) {
        console.error('Profil okuma hatası:', err.message);
        res.status(500).json({ error: 'Profil bilgileri alınamadı.' });
    }
};

const getSecurityStatus = async (req, res) => {
    try {
        const row = await selectUserProfile(req.user.id);
        if (!row) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }

        const passwordResult = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
        res.status(200).json({
            email: row.email,
            emailVerified: false,
            phone: row.phone || null,
            phoneVerified: false,
            twoFactorEnabled: false,
            hasPassword: Boolean(passwordResult.rows[0]?.password)
        });
    } catch (err) {
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
        if (!newPassword) {
            return res.status(400).json({ error: 'Yeni şifre boş olamaz.' });
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

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Mevcut şifre hatalı.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, req.user.id]);

        res.status(200).json({ message: 'Şifren başarıyla güncellendi.' });
    } catch (err) {
        console.error('Şifre değiştirme hatası:', err.message);
        res.status(500).json({ error: 'Şifre güncellenemedi.' });
    }
};

module.exports = { registerUser, loginUser, getMe, updateMe, getSecurityStatus, changePassword };
