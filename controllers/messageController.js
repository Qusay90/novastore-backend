const pool = require('../config/db');

// İki kullanıcı (Müşteri ve Admin) arasındaki mesaj geçmişini getirir
exports.getChatHistory = async (req, res) => {
    try {
        const { userId } = req.params;
        const adminId = 1; // Admin ID sabit varsayılarak 1 alındı

        const query = `
            SELECT * FROM messages 
            WHERE (sender_id = $1 AND receiver_id = $2) 
               OR (sender_id = $2 AND receiver_id = $1)
            ORDER BY created_at ASC
        `;

        const result = await pool.query(query, [userId, adminId]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("Mesaj geçmişi çekilirken hata:", err);
        res.status(500).json({ error: 'Mesaj geçmişi alınamadı' });
    }
};

// Yeni mesajı veritabanına kaydeder
exports.sendMessage = async (req, res) => {
    try {
        const { sender_id, receiver_id, message } = req.body;

        if (!sender_id || !receiver_id || !message) {
            return res.status(400).json({ error: 'Eksik bilgi gönderildi' });
        }

        const query = `
            INSERT INTO messages (sender_id, receiver_id, message) 
            VALUES ($1, $2, $3) RETURNING *
        `;

        const result = await pool.query(query, [sender_id, receiver_id, message]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Mesaj gönderilirken hata:", err);
        res.status(500).json({ error: 'Mesaj gönderilemedi' });
    }
};

// Mesaj atan kullanıcıların listesini (admin için) getirir
exports.getChatUsers = async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT u.id, u.name, u.email 
            FROM users u
            JOIN messages m ON u.id = m.sender_id OR u.id = m.receiver_id
            WHERE u.role = 'customer'
        `;
        const result = await pool.query(query);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("Sohbet eden kullanıcılar çekilirken hata:", err);
        res.status(500).json({ error: 'Kullanıcılar alınamadı' });
    }
};
