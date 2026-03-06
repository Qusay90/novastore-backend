const pool = require('../config/db');

// ─────────────────────────────────────────────────────
// YARDIMCI FONKSİYON — Diğer controller'lar buraya çağırır
// ─────────────────────────────────────────────────────

/**
 * Yeni bildirim oluşturur ve Socket.io ile gerçek zamanlı gönderir.
 * @param {number|null} userId  - Hedef kullanıcı ID (null ise admin bildirimi)
 * @param {string}      type    - 'order_update' | 'welcome' | 'new_order' | 'new_review' | 'low_stock'
 * @param {string}      message - Bildirim metni
 * @param {object}      io      - Socket.io instance (opsiyonel)
 */
const createNotification = async (userId, type, message, io = null) => {
    try {
        const result = await pool.query(
            'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3) RETURNING *',
            [userId || null, type, message]
        );
        const notif = result.rows[0];

        // Gerçek zamanlı gönder
        if (io) {
            const room = userId ? `user_${userId}` : 'admin_room';
            io.to(room).emit('new_notification', notif);
        }

        return notif;
    } catch (err) {
        console.error('❌ Bildirim oluşturma hatası:', err.message);
    }
};

// ─────────────────────────────────────────────────────
// 1. KULLANICI BİLDİRİMLERİNİ GETİR
// GET /api/notifications/user/:userId
// ─────────────────────────────────────────────────────
const getUserNotifications = async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Bildirim getirme hatası:', err.message);
        res.status(500).json({ error: 'Bildirimler getirilemedi.' });
    }
};

// ─────────────────────────────────────────────────────
// 2. ADMİN BİLDİRİMLERİNİ GETİR (user_id = NULL olanlar)
// GET /api/notifications/admin
// ─────────────────────────────────────────────────────
const getAdminNotifications = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM notifications WHERE user_id IS NULL ORDER BY created_at DESC LIMIT 50'
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Admin bildirim hatası:', err.message);
        res.status(500).json({ error: 'Admin bildirimleri getirilemedi.' });
    }
};

// ─────────────────────────────────────────────────────
// 3. TEKİL BİLDİRİMİ OKUNDU YAP
// PATCH /api/notifications/:id/read
// ─────────────────────────────────────────────────────
const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = $1 RETURNING *',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Bildirim bulunamadı.' });
        }
        res.status(200).json({ mesaj: 'Bildirim okundu olarak işaretlendi.' });
    } catch (err) {
        res.status(500).json({ error: 'Bildirim güncellenemedi.' });
    }
};

// ─────────────────────────────────────────────────────
// 4. TÜM BİLDİRİMLERİ OKUNDU YAP
// PATCH /api/notifications/read-all/:userId
// ─────────────────────────────────────────────────────
const markAllAsRead = async (req, res) => {
    try {
        const { userId } = req.params;

        // userId = "admin" ise NULL olanları işaretle, değilse o kullanıcınınkileri
        if (userId === 'admin') {
            await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id IS NULL');
        } else {
            await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [userId]);
        }

        res.status(200).json({ mesaj: 'Tüm bildirimler okundu olarak işaretlendi.' });
    } catch (err) {
        res.status(500).json({ error: 'Bildirimler güncellenemedi.' });
    }
};

// ─────────────────────────────────────────────────────
// 5. TEST BİLDİRİMİ GÖNDER (Geliştirme amaçlı)
// POST /api/notifications/test
// ─────────────────────────────────────────────────────
const sendTestNotification = async (req, res) => {
    try {
        const { userId, type, message } = req.body;
        const { io } = require('../server');
        const notif = await createNotification(
            userId || null,
            type || 'order_update',
            message || '🧪 Bu bir test bildirimidir!',
            io
        );
        res.status(201).json({ mesaj: 'Test bildirimi gönderildi!', bildirim: notif });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    createNotification,
    getUserNotifications,
    getAdminNotifications,
    markAsRead,
    markAllAsRead,
    sendTestNotification
};
