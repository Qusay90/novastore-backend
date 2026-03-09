const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ensureJwtSecret = () => {
    if (!process.env.JWT_SECRET) {
        throw new Error('Server JWT config missing');
    }
};

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

// 1. Musteri kayit olma
const registerUser = async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'Bu e-posta adresi zaten kullaniliyor.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await insertUserWithSchemaFallback(fullName, email, hashedPassword);
        const row = newUser.rows[0];

        res.status(201).json({
            mesaj: 'Aramiza hos geldin! Kayit basarili.',
            user: {
                id: row.id,
                fullName: row.full_name || row.name,
                email: row.email
            }
        });
    } catch (err) {
        console.error('Kayit hatasi:', err.message);
        res.status(500).json({ error: 'Kayit olurken bir hata olustu.' });
    }
};

// 2. Musteri giris yapma
const loginUser = async (req, res) => {
    try {
        ensureJwtSecret();
        const { email, password } = req.body;

        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(400).json({ error: 'E-posta veya sifre hatali.' });
        }

        const currentUser = user.rows[0];

        const isMatch = await bcrypt.compare(password, currentUser.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'E-posta veya sifre hatali.' });
        }

        const token = jwt.sign(
            { id: currentUser.id, role: currentUser.role },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(200).json({
            mesaj: 'Giris basarili! Yonlendiriliyorsunuz...',
            token,
            user: {
                id: currentUser.id,
                fullName: currentUser.full_name || currentUser.name,
                email: currentUser.email,
                role: currentUser.role
            }
        });
    } catch (err) {
        console.error('Giris hatasi:', err.message);
        if (String(err.message).includes('JWT config')) {
            return res.status(500).json({ error: 'Sunucu guvenlik ayari eksik.' });
        }
        res.status(500).json({ error: 'Giris yaparken sunucu hatasi olustu.' });
    }
};

module.exports = { registerUser, loginUser };
