const pool = require('../config/db');
const { emitWithRetry } = require('../services/notificationService');
const {
    ExternalSideEffectBlockedError,
    assertExternalSideEffectAllowed
} = require('../config/stagingRuntimePolicy');

const redactKnownSecretText = (value = '') => {
    let text = String(value || '');
    for (const secret of [process.env.PAYTR_MERCHANT_KEY, process.env.PAYTR_MERCHANT_SALT]) {
        const secretText = String(secret || '').trim();
        if (secretText) {
            text = text.split(secretText).join('[REDACTED]');
        }
    }
    return text;
};

/**
 * Yeni bildirim olusturur ve Socket.io ile gercek zamanli gonderir.
 * @param {number|null} userId
 * @param {string} type
 * @param {string} message
 * @param {object} io
 */
const createNotification = async (userId, type, message, io = null) => {
    assertExternalSideEffectAllowed('outbound_notification');
    try {
        const result = await pool.query(
            'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3) RETURNING *',
            [userId || null, type, message]
        );
        const notif = result.rows[0];

        const room = userId ? `user_${userId}` : 'admin_room';
        await emitWithRetry({
            io,
            room,
            eventName: 'new_notification',
            payload: notif,
            notificationId: notif.id,
            retries: 3
        });

        return notif;
    } catch (err) {
        console.error('Bildirim oluşturma hatası:', redactKnownSecretText(err.message));
        return null;
    }
};

// GET /api/notifications/user/:userId
const getUserNotifications = async (req, res) => {
    try {
        const userId = Number(req.params.userId);
        if (!Number.isInteger(userId)) {
            return res.status(400).json({ error: 'Geçersiz kullanıcı kimliği.' });
        }

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

// GET /api/notifications/admin
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

// PATCH /api/notifications/:id/read
const markAsRead = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: 'Geçersiz bildirim kimliği.' });
        }

        const notifResult = await pool.query('SELECT id, user_id FROM notifications WHERE id = $1', [id]);
        if (notifResult.rows.length === 0) {
            return res.status(404).json({ error: 'Bildirim bulunamadı.' });
        }

        const notif = notifResult.rows[0];

        if (req.user.role !== 'admin') {
            if (notif.user_id === null || Number(notif.user_id) !== req.user.id) {
                return res.status(403).json({ error: 'Bu bildirime erişim yetkiniz yok.' });
            }
        }

        await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [id]);
        res.status(200).json({ mesaj: 'Bildirim okundu olarak işaretlendi.' });
    } catch (err) {
        res.status(500).json({ error: 'Bildirim guncellenemedi.' });
    }
};

// PATCH /api/notifications/read-all/:userId
const markAllAsRead = async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.role === 'admin') {
            if (userId === 'admin') {
                await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id IS NULL');
            } else {
                const numericUserId = Number(userId);
                if (!Number.isInteger(numericUserId)) {
                    return res.status(400).json({ error: 'Geçersiz kullanıcı kimliği.' });
                }
                await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [numericUserId]);
            }
            return res.status(200).json({ mesaj: 'Tüm bildirimler okundu olarak işaretlendi.' });
        }

        const requestedUserId = Number(userId);
        if (!Number.isInteger(requestedUserId) || requestedUserId !== req.user.id) {
            return res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
        }

        await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
        res.status(200).json({ mesaj: 'Tüm bildirimler okundu olarak işaretlendi.' });
    } catch (err) {
        res.status(500).json({ error: 'Bildirimler guncellenemedi.' });
    }
};

// POST /api/notifications/test
const sendTestNotification = async (req, res) => {
    try {
        const { userId, type, message } = req.body;
        const { io } = require('../server');
        const notif = await createNotification(
            userId || null,
            type || 'order_update',
            message || 'Bu bir test bildirimidir.',
            io
        );
        res.status(201).json({ mesaj: 'Test bildirimi gonderildi!', bildirim: notif });
    } catch (err) {
        if (err instanceof ExternalSideEffectBlockedError) {
            return res.status(err.statusCode).json({ code: err.code, error: err.publicMessage });
        }
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
