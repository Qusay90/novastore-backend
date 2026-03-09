const pool = require('../config/db');

const AI_HANDOFF_PREFIX = '[AI DESTEK DEVRI]';

const getPrimaryAdminId = async () => {
    const result = await pool.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    if (result.rows.length === 0) return null;
    return Number(result.rows[0].id);
};

const normalizeMessageRow = (row) => ({
    ...row,
    is_ai_handoff: String(row.message || '').startsWith(AI_HANDOFF_PREFIX)
});

exports.getChatHistory = async (req, res) => {
    try {
        const requestedUserId = Number(req.params.userId);
        if (!Number.isInteger(requestedUserId)) {
            return res.status(400).json({ error: 'Gecersiz kullanici kimligi.' });
        }

        const adminId = await getPrimaryAdminId();
        if (!adminId) {
            return res.status(500).json({ error: 'Admin hesabi bulunamadi.' });
        }

        const targetUserId = req.user.role === 'admin' ? requestedUserId : req.user.id;

        if (req.user.role !== 'admin' && requestedUserId !== req.user.id) {
            return res.status(403).json({ error: 'Bu sohbet gecmisine erisim yetkiniz yok.' });
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
        console.error('Mesaj gecmisi cekilirken hata:', err);
        res.status(500).json({ error: 'Mesaj gecmisi alinamadi' });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const { receiver_id, message } = req.body;

        if (!message || !String(message).trim()) {
            return res.status(400).json({ error: 'Mesaj icerigi bos olamaz.' });
        }

        const adminId = await getPrimaryAdminId();
        if (!adminId) {
            return res.status(500).json({ error: 'Admin hesabi bulunamadi.' });
        }

        const senderId = req.user.id;
        let receiverId;

        if (req.user.role === 'admin') {
            receiverId = Number(receiver_id);
            if (!Number.isInteger(receiverId)) {
                return res.status(400).json({ error: 'Gecersiz alici kimligi.' });
            }
        } else {
            receiverId = adminId;
        }

        const query = `
            INSERT INTO messages (sender_id, receiver_id, message)
            VALUES ($1, $2, $3) RETURNING *
        `;

        const result = await pool.query(query, [senderId, receiverId, String(message).trim()]);
        res.status(201).json(normalizeMessageRow(result.rows[0]));
    } catch (err) {
        console.error('Mesaj gonderilirken hata:', err);
        res.status(500).json({ error: 'Mesaj gonderilemedi' });
    }
};

exports.getChatUsers = async (req, res) => {
    try {
        const adminId = await getPrimaryAdminId();
        if (!adminId) {
            return res.status(500).json({ error: 'Admin hesabi bulunamadi.' });
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
        console.error('Sohbet eden kullanicilar cekilirken hata:', err);
        res.status(500).json({ error: 'Kullanicilar alinamadi' });
    }
};

exports.getAiHandoffs = async (req, res) => {
    try {
        const adminId = await getPrimaryAdminId();
        if (!adminId) {
            return res.status(500).json({ error: 'Admin hesabi bulunamadi.' });
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
        console.error('AI handoff listesi cekilirken hata:', err);
        res.status(500).json({ error: 'AI handoff listesi alinamadi.' });
    }
};

module.exports.AI_HANDOFF_PREFIX = AI_HANDOFF_PREFIX;
