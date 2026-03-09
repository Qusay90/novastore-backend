const pool = require('../config/db');

const getPrimaryAdminId = async () => {
    const result = await pool.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    if (!result.rows.length) return null;
    return Number(result.rows[0].id);
};

const createEscalationMessage = async ({ userId, summary }) => {
    const adminId = await getPrimaryAdminId();
    if (!adminId) {
        const err = new Error('Admin hesabi bulunamadi.');
        err.statusCode = 500;
        throw err;
    }

    const message = `[AI DESTEK DEVRI]\n${String(summary || '').trim()}`;
    const result = await pool.query(
        `INSERT INTO messages (sender_id, receiver_id, message)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [userId, adminId, message]
    );

    return {
        adminId,
        message: result.rows[0]
    };
};

module.exports = {
    createEscalationMessage,
    getPrimaryAdminId
};
