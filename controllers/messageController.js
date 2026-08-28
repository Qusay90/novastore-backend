const pool = require('../config/db');
const { assertExternalSideEffectAllowed } = require('../config/stagingRuntimePolicy');
const { EVENT } = require('../services/notificationEventCatalog');
const { enqueueNotificationEvent } = require('../services/notificationOutboxService');
const {
    SupportThreadError,
    appendSupportEvent,
    appendSupportMessage,
    claimSupportThread,
    getOrCreateSupportThread,
    normalizeSupportText,
    reopenSupportThreadForCustomer,
    requireCustomer,
    requirePositiveId,
    serializeThread,
    setSupportThreadStatus,
    withSupportTransaction
} = require('../services/supportThreadService');

const AI_HANDOFF_PREFIX = '[AI DESTEK DEVRI]';

const getPrimaryAdminId = async (db = pool) => {
    const result = await db.query(
        "SELECT id FROM users WHERE role = 'admin' AND auth_enabled = TRUE ORDER BY id ASC LIMIT 1"
    );
    if (result.rows.length === 0) return null;
    return Number(result.rows[0].id);
};

const normalizeMessageRow = (row) => ({
    ...row,
    support_thread_id: row.support_thread_id == null ? null : Number(row.support_thread_id),
    is_ai_handoff: String(row.message || '').startsWith(AI_HANDOFF_PREFIX),
    is_ai_handoff_dismissed: row.handoff_dismissed_at != null
});

const sendSupportError = (res, error, fallback = 'Destek işlemi tamamlanamadı.') => {
    if (error instanceof SupportThreadError || Number.isInteger(error?.statusCode)) {
        return res.status(error.statusCode || 409).json({
            code: error.code || 'SUPPORT_THREAD_ERROR',
            error: error.message,
            ...(error.details ? { details: error.details } : {})
        });
    }
    console.error(fallback, error?.message || error);
    return res.status(500).json({ error: fallback });
};

const emitRealtimeMessage = (messageRow, receiverRole) => {
    try {
        assertExternalSideEffectAllowed('outbound_notification');
        const { io } = require('../server');
        if (!io || !messageRow) return false;

        const normalizedMessage = normalizeMessageRow(messageRow);
        const targetRoom = receiverRole === 'admin'
            ? 'admin_room'
            : `user_${Number(normalizedMessage.receiver_id)}`;

        io.to(targetRoom).emit('receive_message', {
            ...normalizedMessage,
            receiver_role: receiverRole
        });
        return true;
    } catch (error) {
        console.error('Gerçek zamanlı mesaj yayını tamamlanamadı:', error.message);
        return false;
    }
};

exports.getChatHistory = async (req, res) => {
    try {
        const requestedUserId = requirePositiveId(req.params.userId, 'userId');
        if (req.user.role !== 'admin' && requestedUserId !== Number(req.user.id)) {
            return res.status(403).json({ error: 'Bu sohbet geçmişine erişim yetkiniz yok.' });
        }
        await requireCustomer(pool, requestedUserId);

        const result = await pool.query(
            `SELECT m.*
             FROM support_threads st
             JOIN messages m ON m.support_thread_id = st.id
             WHERE st.customer_id = $1
             ORDER BY m.created_at ASC, m.id ASC`,
            [requestedUserId]
        );
        return res.status(200).json(result.rows.map(normalizeMessageRow));
    } catch (error) {
        return sendSupportError(res, error, 'Mesaj geçmişi alınamadı.');
    }
};

exports.sendMessage = async (req, res) => {
    try {
        assertExternalSideEffectAllowed('outbound_notification');
        const message = normalizeSupportText(req.body?.message);
        const senderId = requirePositiveId(req.user?.id, 'senderId');
        const isAdmin = req.user?.role === 'admin' && req.user?.principal === 'admin';
        const customerId = isAdmin
            ? requirePositiveId(req.body?.receiver_id, 'receiverId')
            : senderId;

        const result = await withSupportTransaction(async (client) => {
            let thread = await getOrCreateSupportThread(client, {
                customerId,
                source: 'DIRECT',
                actorId: senderId
            });
            if (isAdmin) {
                thread = await claimSupportThread(client, { threadId: thread.id, adminId: senderId });
            } else {
                thread = await reopenSupportThreadForCustomer(client, { thread, customerId });
            }
            const previousMessage = await client.query(
                'SELECT id FROM messages WHERE support_thread_id = $1 ORDER BY id ASC LIMIT 1',
                [thread.id]
            );
            const receiverId = isAdmin
                ? customerId
                : Number(thread.assigned_admin_id) || await getPrimaryAdminId(client);
            if (!receiverId) {
                throw new SupportThreadError('Etkin destek yöneticisi bulunamadı.', {
                    code: 'SUPPORT_ADMIN_NOT_FOUND',
                    statusCode: 503
                });
            }
            const savedMessage = await appendSupportMessage(client, {
                thread,
                senderId,
                receiverId,
                message
            });
            const notificationEvent = isAdmin
                ? EVENT.SUPPORT_REPLY
                : (previousMessage.rows.length === 0 ? EVENT.SUPPORT_CREATED : EVENT.SUPPORT_MESSAGE);
            await enqueueNotificationEvent(client, {
                eventType: notificationEvent,
                aggregateType: 'support_thread',
                aggregateId: thread.id,
                aggregateRevision: Number(savedMessage.id),
                sourceEventKey: `${notificationEvent}:support_thread:${thread.id}:message:${savedMessage.id}`,
                payload: { source: isAdmin ? 'admin_reply' : 'customer_message' }
            });
            return { thread, savedMessage };
        });

        const normalizedSavedMessage = normalizeMessageRow(result.savedMessage);
        emitRealtimeMessage(result.savedMessage, isAdmin ? 'customer' : 'admin');

        return res.status(201).json(normalizedSavedMessage);
    } catch (error) {
        if (error?.code === 'STAGING_EXTERNAL_SIDE_EFFECT_DISABLED') {
            return res.status(error.statusCode || 503).json({
                code: error.code,
                error: error.publicMessage || 'External side effect is disabled in staging.'
            });
        }
        return sendSupportError(res, error, 'Mesaj gönderilemedi.');
    }
};

exports.getChatUsers = async (_req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                u.id,
                COALESCE(u.full_name, u.name) AS name,
                u.email,
                st.id AS support_thread_id,
                st.status,
                st.assigned_admin_id,
                st.source,
                st.last_message_at,
                CAST(COUNT(m.id) FILTER (
                    WHERE m.message LIKE $1 AND m.handoff_dismissed_at IS NULL
                ) AS INTEGER) AS ai_handoff_count
             FROM support_threads st
             JOIN users u ON u.id = st.customer_id AND u.role = 'customer'
             LEFT JOIN messages m ON m.support_thread_id = st.id
             GROUP BY u.id, u.full_name, u.name, u.email, st.id
             ORDER BY st.last_message_at DESC NULLS LAST, st.id DESC`,
            [`${AI_HANDOFF_PREFIX}%`]
        );
        return res.status(200).json(result.rows);
    } catch (error) {
        return sendSupportError(res, error, 'Kullanıcılar alınamadı.');
    }
};

exports.getAiHandoffs = async (_req, res) => {
    try {
        const result = await pool.query(
            `WITH latest_handoff AS (
                SELECT DISTINCT ON (m.support_thread_id)
                    m.support_thread_id,
                    m.message,
                    m.created_at
                FROM messages m
                WHERE m.message LIKE $1
                  AND m.support_thread_id IS NOT NULL
                  AND m.handoff_dismissed_at IS NULL
                ORDER BY m.support_thread_id, m.created_at DESC, m.id DESC
             )
             SELECT
                u.id,
                COALESCE(u.full_name, u.name) AS name,
                u.email,
                st.id AS support_thread_id,
                st.status,
                st.assigned_admin_id,
                st.source,
                lh.message AS latest_handoff_message,
                lh.created_at AS latest_handoff_at,
                st.last_message_at AS last_thread_message_at,
                CAST(COUNT(m.id) FILTER (
                    WHERE m.message LIKE $1 AND m.handoff_dismissed_at IS NULL
                ) AS INTEGER) AS handoff_count
             FROM latest_handoff lh
             JOIN support_threads st ON st.id = lh.support_thread_id
             JOIN users u ON u.id = st.customer_id AND u.role = 'customer'
             JOIN messages m ON m.support_thread_id = st.id
             GROUP BY u.id, u.full_name, u.name, u.email, st.id, lh.message, lh.created_at
             ORDER BY lh.created_at DESC, st.id DESC`,
            [`${AI_HANDOFF_PREFIX}%`]
        );
        return res.status(200).json(result.rows);
    } catch (error) {
        return sendSupportError(res, error, 'AI handoff listesi alınamadı.');
    }
};

exports.takeOverSupportThread = async (req, res) => {
    try {
        const thread = await withSupportTransaction((client) => claimSupportThread(client, {
            threadId: req.params.threadId,
            adminId: req.currentAdmin?.id || req.user?.id
        }));
        return res.status(200).json({ thread: serializeThread(thread) });
    } catch (error) {
        return sendSupportError(res, error, 'Destek konuşması devralınamadı.');
    }
};

exports.updateSupportThreadStatus = async (req, res) => {
    try {
        const thread = await withSupportTransaction((client) => setSupportThreadStatus(client, {
            threadId: req.params.threadId,
            adminId: req.currentAdmin?.id || req.user?.id,
            status: req.body?.status
        }));
        return res.status(200).json({ thread: serializeThread(thread) });
    } catch (error) {
        return sendSupportError(res, error, 'Destek konuşması durumu güncellenemedi.');
    }
};

exports.deleteAiHandoffThread = async (req, res) => {
    try {
        const requestedUserId = requirePositiveId(req.params.userId, 'userId');
        const result = await withSupportTransaction(async (client) => {
            await requireCustomer(client, requestedUserId);
            const threadResult = await client.query(
                'SELECT * FROM support_threads WHERE customer_id = $1 FOR UPDATE',
                [requestedUserId]
            );
            const thread = threadResult.rows[0];
            if (!thread) {
                throw new SupportThreadError('Destek konuşması bulunamadı.', {
                    code: 'SUPPORT_THREAD_NOT_FOUND',
                    statusCode: 404
                });
            }
            const dismissed = await client.query(
                `UPDATE messages
                 SET handoff_dismissed_at = CURRENT_TIMESTAMP,
                     handoff_dismissed_by = $3
                 WHERE support_thread_id = $1
                   AND message LIKE $2
                   AND handoff_dismissed_at IS NULL`,
                [thread.id, `${AI_HANDOFF_PREFIX}%`, req.currentAdmin?.id || req.user?.id]
            );
            await client.query(
                `UPDATE notifications
                 SET is_read = TRUE
                 WHERE user_id IS NULL
                   AND type = 'ai_handoff'
                   AND (
                       (entity_type = 'support_thread' AND entity_id = $1)
                       OR (
                           entity_type IS NULL
                           AND entity_id IS NULL
                           AND message ~ $2
                       )
                   )`,
                [thread.id, `Müşteri #${requestedUserId}([^0-9]|$)`]
            );
            if (Number(dismissed.rowCount || 0) > 0) {
                await appendSupportEvent(client, {
                    threadId: thread.id,
                    actorId: req.currentAdmin?.id || req.user?.id,
                    eventType: 'HANDOFF_DISMISSED',
                    payload: { dismissedCount: Number(dismissed.rowCount || 0) }
                });
            }
            return Number(dismissed.rowCount || 0);
        });

        return res.status(200).json({
            mesaj: result > 0
                ? 'AI devir kayıtları, görüşme geçmişi korunarak kapatıldı.'
                : 'Kapatılacak AI devir kaydı bulunamadı.',
            dismissedCount: result,
            deletedCount: 0
        });
    } catch (error) {
        return sendSupportError(res, error, 'AI devir kaydı kapatılamadı.');
    }
};

module.exports.AI_HANDOFF_PREFIX = AI_HANDOFF_PREFIX;
module.exports.emitRealtimeMessage = emitRealtimeMessage;
module.exports.getPrimaryAdminId = getPrimaryAdminId;
module.exports.normalizeMessageRow = normalizeMessageRow;
