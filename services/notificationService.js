const pool = require('../config/db');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const writeNotificationAudit = async ({
    notificationId,
    room,
    eventName,
    payload,
    delivered,
    attempts,
    lastError
}) => {
    try {
        await pool.query(
            `INSERT INTO notification_audit_logs
                (notification_id, channel, room, event_name, payload, delivered, attempts, last_error)
             VALUES
                ($1, 'socket', $2, $3, $4::jsonb, $5, $6, $7)`,
            [notificationId, room, eventName, JSON.stringify(payload || {}), delivered, attempts, lastError || null]
        );
    } catch (err) {
        console.error('Bildirim audit log yazilamadi:', err.message);
    }
};

const emitWithRetry = async ({ io, room, eventName, payload, notificationId = null, retries = 3 }) => {
    if (!io || !room) {
        await writeNotificationAudit({
            notificationId,
            room: room || 'unknown',
            eventName,
            payload,
            delivered: false,
            attempts: 0,
            lastError: 'Socket sunucusu veya oda bilgisi bulunamadi.'
        });
        return false;
    }

    let attempt = 0;
    let lastError = null;

    while (attempt < retries) {
        attempt += 1;
        try {
            io.to(room).emit(eventName, payload);

            await writeNotificationAudit({
                notificationId,
                room,
                eventName,
                payload,
                delivered: true,
                attempts: attempt,
                lastError: null
            });

            return true;
        } catch (err) {
            lastError = err.message;
            if (attempt < retries) {
                await sleep(120 * attempt);
            }
        }
    }

    await writeNotificationAudit({
        notificationId,
        room,
        eventName,
        payload,
        delivered: false,
        attempts: attempt,
        lastError
    });

    return false;
};

module.exports = {
    emitWithRetry
};
