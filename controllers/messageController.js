const pool = require('../config/db');
const { createNotification } = require('./notificationController');
const {
    assertExternalSideEffectAllowed
} = require('../config/stagingRuntimePolicy');

const AI_HANDOFF_PREFIX = '[AI DESTEK DEVRI]';

const getPrimaryAdminId = async (db = pool) => {
    const result = await db.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    if (result.rows.length === 0) return null;
    return Number(result.rows[0].id);
};

const normalizeMessageRow = (row) => ({
    ...row,
    is_ai_handoff: String(row.message || '').startsWith(AI_HANDOFF_PREFIX)
});

const emitRealtimeMessage = (messageRow, receiverRole) => {
    assertExternalSideEffectAllowed('outbound_notification');

    try {
        const { io } = require('../server');
        if (!io || !messageRow) return;

        const normalizedMessage = normalizeMessageRow(messageRow);
        const targetRoom = receiverRole === 'admin'
            ? 'admin_room'
            : `user_${Number(normalizedMessage.receiver_id)}`;

        io.to(targetRoom).emit('receive_message', {
            ...normalizedMessage,
            receiver_role: receiverRole
        });
    } catch (err) {
        console.error('Gerçek zamanlı mesaj yayını hatası:', err.message);
    }
};

const ensureSupportHandoffThread = async ({ client, customerId, adminId, firstMessage }) => {
    const existingHandoff = await client.query(
        `SELECT id
         FROM messages
         WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
           AND message LIKE $3
         LIMIT 1`,
        [customerId, adminId, `${AI_HANDOFF_PREFIX}%`]
    );

    if (existingHandoff.rows.length > 0) {
        return null;
    }

    const summaryLines = [
        AI_HANDOFF_PREFIX,
        'Müşteri doğrudan canlı destek moduna geçti.',
        `İlk mesaj: ${String(firstMessage || '').trim().slice(0, 500)}`
    ];

    const handoffInsert = await client.query(
        `INSERT INTO messages (sender_id, receiver_id, message)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [customerId, adminId, summaryLines.join('\n')]
    );

    return handoffInsert.rows[0];
};

exports.getChatHistory = async (req, res) => {
    try {
        const requestedUserId = Number(req.params.userId);
        if (!Number.isInteger(requestedUserId)) {
            return res.status(400).json({ error: 'Geçersiz kullanıcı kimliği.' });
        }

        const adminId = await getPrimaryAdminId();
        if (!adminId) {
            return res.status(500).json({ error: 'Admin hesabı bulunamadı.' });
        }

        const targetUserId = req.user.role === 'admin' ? requestedUserId : req.user.id;

        if (req.user.role !== 'admin' && requestedUserId !== req.user.id) {
            return res.status(403).json({ error: 'Bu sohbet geçmişine erişim yetkiniz yok.' });
        }

        const query = `
            SELECT * FROM messages
            WHERE (sender_id = $1 AND receiver_id = $2)
               OR (sender_id = $2 AND receiver_id = $1)
            ORDER BY created_at ASC
        `;

        const result = await pool.query(query, [targetUserId, adminId]);
        res.status(200).json(result.rows.map(normalizeMessageRow));
    } catch (err) {
        console.error('Mesaj geçmişi çekilirken hata:', err);
        res.status(500).json({ error: 'Mesaj geçmişi alınamadı' });
    }
};

exports.sendMessage = async (req, res) => {
    let client = null;

    try {
        assertExternalSideEffectAllowed('outbound_notification');
        client = await pool.connect();

        const { receiver_id, message } = req.body;
        const trimmedMessage = String(message || '').trim();

        if (!trimmedMessage) {
            return res.status(400).json({ error: 'Mesaj içeriği boş olamaz.' });
        }

        const adminId = await getPrimaryAdminId();
        if (!adminId) {
            return res.status(500).json({ error: 'Admin hesabı bulunamadı.' });
        }

        const senderId = req.user.id;
        let receiverId;

        if (req.user.role === 'admin') {
            receiverId = Number(receiver_id);
            if (!Number.isInteger(receiverId)) {
                return res.status(400).json({ error: 'Geçersiz alıcı kimliği.' });
            }
        } else {
            receiverId = adminId;
        }

        await client.query('BEGIN');

        let createdHandoffMessage = null;
        if (req.user.role !== 'admin') {
            createdHandoffMessage = await ensureSupportHandoffThread({
                client,
                customerId: senderId,
                adminId: receiverId,
                firstMessage: trimmedMessage
            });
        }

        const insertResult = await client.query(
            `INSERT INTO messages (sender_id, receiver_id, message)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [senderId, receiverId, trimmedMessage]
        );

        await client.query('COMMIT');

        const savedMessage = insertResult.rows[0];
        const normalizedSavedMessage = normalizeMessageRow(savedMessage);

        if (createdHandoffMessage) {
            emitRealtimeMessage(createdHandoffMessage, 'admin');
            try {
                const { io } = require('../server');
                await createNotification(
                    null,
                    'ai_handoff',
                    `Canlı destek talebi oluştu. Müşteri #${senderId} size yazdı.`,
                    io
                );
            } catch (err) {
                console.error('Canlı destek handoff bildirimi oluşturulamadı:', err.message);
            }
        }

        emitRealtimeMessage(savedMessage, req.user.role === 'admin' ? 'customer' : 'admin');

        res.status(201).json(normalizedSavedMessage);
    } catch (err) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (_) { }
        }

        if (err && err.code === 'STAGING_EXTERNAL_SIDE_EFFECT_DISABLED') {
            return res.status(err.statusCode || 503).json({
                code: err.code,
                error: err.publicMessage || 'External side effect is disabled in staging.'
            });
        }

        console.error('Mesaj gönderilirken hata:', err);
        res.status(500).json({ error: 'Mesaj gönderilemedi' });
    } finally {
        if (client) client.release();
    }
};

exports.getChatUsers = async (req, res) => {
    try {
        const adminId = await getPrimaryAdminId();
        if (!adminId) {
            return res.status(500).json({ error: 'Admin hesabı bulunamadı.' });
        }

        const query = `
            WITH user_threads AS (
                SELECT
                    CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END AS customer_id,
                    MAX(m.created_at) AS last_message_at,
                    COUNT(*) FILTER (WHERE m.message LIKE $2) AS ai_handoff_count
                FROM messages m
                WHERE m.sender_id = $1 OR m.receiver_id = $1
                GROUP BY CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END
            )
            SELECT
                u.id,
                COALESCE(u.full_name, u.name) AS name,
                u.email,
                ut.last_message_at,
                CAST(ut.ai_handoff_count AS INTEGER) AS ai_handoff_count
            FROM user_threads ut
            JOIN users u ON u.id = ut.customer_id
            WHERE u.role = 'customer'
            ORDER BY ut.last_message_at DESC NULLS LAST, u.id DESC
        `;

        const result = await pool.query(query, [adminId, `${AI_HANDOFF_PREFIX}%`]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Sohbet eden kullanıcılar çekilirken hata:', err);
        res.status(500).json({ error: 'Kullanıcılar alınamadı' });
    }
};

exports.getAiHandoffs = async (req, res) => {
    try {
        const adminId = await getPrimaryAdminId();
        if (!adminId) {
            return res.status(500).json({ error: 'Admin hesabı bulunamadı.' });
        }

        const query = `
            WITH handoff_messages AS (
                SELECT
                    CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END AS customer_id,
                    m.id,
                    m.message,
                    m.created_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END
                        ORDER BY m.created_at DESC
                    ) AS rn
                FROM messages m
                WHERE (m.sender_id = $1 OR m.receiver_id = $1)
                  AND m.message LIKE $2
            ),
            thread_counts AS (
                SELECT
                    CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END AS customer_id,
                    COUNT(*) FILTER (WHERE m.message LIKE $2) AS handoff_count,
                    MAX(m.created_at) AS last_thread_message_at
                FROM messages m
                WHERE m.sender_id = $1 OR m.receiver_id = $1
                GROUP BY CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END
            )
            SELECT
                hm.customer_id AS id,
                COALESCE(u.full_name, u.name) AS name,
                u.email,
                hm.message AS latest_handoff_message,
                hm.created_at AS latest_handoff_at,
                CAST(tc.handoff_count AS INTEGER) AS handoff_count,
                tc.last_thread_message_at
            FROM handoff_messages hm
            JOIN thread_counts tc ON tc.customer_id = hm.customer_id
            JOIN users u ON u.id = hm.customer_id
            WHERE hm.rn = 1
              AND u.role = 'customer'
            ORDER BY hm.created_at DESC
        `;

        const result = await pool.query(query, [adminId, `${AI_HANDOFF_PREFIX}%`]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('AI handoff listesi çekilirken hata:', err);
        res.status(500).json({ error: 'AI handoff listesi alınamadı.' });
    }
};

exports.deleteAiHandoffThread = async (req, res) => {
    const client = await pool.connect();

    try {
        const requestedUserId = Number(req.params.userId);
        if (!Number.isInteger(requestedUserId)) {
            return res.status(400).json({ error: 'Geçersiz kullanıcı kimliği.' });
        }

        await client.query('BEGIN');

        const adminId = await getPrimaryAdminId(client);
        if (!adminId) {
            await client.query('ROLLBACK');
            return res.status(500).json({ error: 'Admin hesabı bulunamadı.' });
        }

        const customerResult = await client.query(
            "SELECT id FROM users WHERE id = $1 AND role = 'customer' LIMIT 1",
            [requestedUserId]
        );
        if (customerResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Müşteri bulunamadı.' });
        }

        const deleteMessagesResult = await client.query(
            `DELETE FROM messages
             WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
               AND message LIKE $3`,
            [requestedUserId, adminId, `${AI_HANDOFF_PREFIX}%`]
        );

        await client.query(
            `DELETE FROM notifications
             WHERE user_id IS NULL
               AND type = 'ai_handoff'
               AND message LIKE $1`,
            [`%Müşteri #${requestedUserId}%`]
        );

        await client.query('COMMIT');

        res.status(200).json({
            mesaj: deleteMessagesResult.rowCount > 0
                ? 'AI devir kayıtları silindi.'
                : 'Silinecek AI devir kaydı bulunamadı.',
            deletedCount: Number(deleteMessagesResult.rowCount || 0)
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('AI handoff silinirken hata:', err);
        res.status(500).json({ error: 'AI devir kaydı silinemedi.' });
    } finally {
        client.release();
    }
};

module.exports.AI_HANDOFF_PREFIX = AI_HANDOFF_PREFIX;
