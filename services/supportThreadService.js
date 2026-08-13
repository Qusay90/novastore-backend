const pool = require('../config/db');

const SUPPORT_MESSAGE_MAX_LENGTH = 2000;
const SUPPORT_SUMMARY_MAX_LENGTH = 1800;
const SUPPORT_THREAD_STATUSES = Object.freeze(['OPEN', 'TAKEN_OVER', 'CLOSED']);
const supportThreadStatuses = new Set(SUPPORT_THREAD_STATUSES);

class SupportThreadError extends Error {
    constructor(message, { code = 'SUPPORT_THREAD_ERROR', statusCode = 409, details = null } = {}) {
        super(message);
        this.name = 'SupportThreadError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

const requirePositiveId = (value, field = 'id') => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new SupportThreadError(`${field} geçersiz.`, {
            code: 'SUPPORT_ID_INVALID',
            statusCode: 400,
            details: { field }
        });
    }
    return id;
};

const normalizeSupportText = (value, {
    field = 'message',
    maxLength = SUPPORT_MESSAGE_MAX_LENGTH
} = {}) => {
    if (typeof value !== 'string') {
        throw new SupportThreadError(`${field} metin olmalıdır.`, {
            code: 'SUPPORT_TEXT_INVALID',
            statusCode: 400,
            details: { field, maxLength }
        });
    }
    const text = value.trim();
    if (!text || text.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
        throw new SupportThreadError(`${field} 1-${maxLength} karakter aralığında olmalıdır.`, {
            code: 'SUPPORT_TEXT_INVALID',
            statusCode: 400,
            details: { field, maxLength }
        });
    }
    return text;
};

const serializeThread = (row = {}) => ({
    id: Number(row.id),
    customerId: Number(row.customer_id),
    status: String(row.status || 'OPEN'),
    assignedAdminId: row.assigned_admin_id == null ? null : Number(row.assigned_admin_id),
    source: String(row.source || 'DIRECT'),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    lastMessageAt: row.last_message_at || null
});

const requireCustomer = async (client, customerId) => {
    const id = requirePositiveId(customerId, 'customerId');
    const result = await client.query(
        "SELECT id FROM users WHERE id = $1 AND role = 'customer' LIMIT 1",
        [id]
    );
    if (result.rows.length !== 1) {
        throw new SupportThreadError('Destek müşterisi bulunamadı.', {
            code: 'SUPPORT_CUSTOMER_NOT_FOUND',
            statusCode: 404
        });
    }
    return id;
};

const appendSupportEvent = async (client, {
    threadId,
    actorId = null,
    eventType,
    payload = null
}) => {
    await client.query(
        `INSERT INTO support_thread_events (support_thread_id, actor_id, event_type, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
            requirePositiveId(threadId, 'threadId'),
            actorId == null ? null : requirePositiveId(actorId, 'actorId'),
            eventType,
            JSON.stringify(payload || {})
        ]
    );
};

const getOrCreateSupportThread = async (client, {
    customerId,
    source = 'DIRECT',
    actorId = null
}) => {
    const normalizedCustomerId = await requireCustomer(client, customerId);
    const normalizedSource = source === 'NOVABOT' ? 'NOVABOT' : 'DIRECT';
    const inserted = await client.query(
        `INSERT INTO support_threads (customer_id, status, source)
         VALUES ($1, 'OPEN', $2)
         ON CONFLICT (customer_id) DO NOTHING
         RETURNING *`,
        [normalizedCustomerId, normalizedSource]
    );

    let thread = inserted.rows[0] || null;
    if (thread) {
        await appendSupportEvent(client, {
            threadId: thread.id,
            actorId,
            eventType: 'THREAD_CREATED',
            payload: { source: normalizedSource }
        });
    } else {
        const existing = await client.query(
            'SELECT * FROM support_threads WHERE customer_id = $1 FOR UPDATE',
            [normalizedCustomerId]
        );
        thread = existing.rows[0] || null;
    }

    if (!thread) {
        throw new SupportThreadError('Destek konuşması oluşturulamadı.', {
            code: 'SUPPORT_THREAD_CREATE_FAILED',
            statusCode: 500
        });
    }
    return thread;
};

const appendSupportMessage = async (client, {
    thread,
    senderId,
    receiverId,
    message,
    eventType = 'MESSAGE_CREATED'
}) => {
    const normalizedMessage = normalizeSupportText(message);
    const customerId = requirePositiveId(thread?.customer_id, 'customerId');
    const normalizedSenderId = requirePositiveId(senderId, 'senderId');
    const normalizedReceiverId = requirePositiveId(receiverId, 'receiverId');
    if ((normalizedSenderId === customerId) === (normalizedReceiverId === customerId)) {
        throw new SupportThreadError('Destek mesajı tam olarak bir müşteri katılımcısı içermelidir.', {
            code: 'SUPPORT_PARTICIPANT_INVALID',
            statusCode: 403
        });
    }
    const insert = await client.query(
        `INSERT INTO messages (support_thread_id, sender_id, receiver_id, message)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
            requirePositiveId(thread.id, 'threadId'),
            normalizedSenderId,
            normalizedReceiverId,
            normalizedMessage
        ]
    );
    const saved = insert.rows[0];
    await client.query(
        `UPDATE support_threads
         SET last_message_at = COALESCE($2, NOW()), updated_at = NOW()
         WHERE id = $1`,
        [thread.id, saved.created_at || null]
    );
    await appendSupportEvent(client, {
        threadId: thread.id,
        actorId: normalizedSenderId,
        eventType,
        payload: { messageId: Number(saved.id), receiverId: normalizedReceiverId }
    });
    return saved;
};

const claimSupportThread = async (client, { threadId, adminId }) => {
    const id = requirePositiveId(threadId, 'threadId');
    const actorId = requirePositiveId(adminId, 'adminId');
    const result = await client.query('SELECT * FROM support_threads WHERE id = $1 FOR UPDATE', [id]);
    const thread = result.rows[0];
    if (!thread) {
        throw new SupportThreadError('Destek konuşması bulunamadı.', {
            code: 'SUPPORT_THREAD_NOT_FOUND',
            statusCode: 404
        });
    }
    if (thread.status === 'CLOSED') {
        throw new SupportThreadError('Kapatılmış destek konuşması devralınamaz.', {
            code: 'SUPPORT_THREAD_CLOSED'
        });
    }
    if (
        thread.assigned_admin_id != null &&
        Number(thread.assigned_admin_id) !== actorId
    ) {
        throw new SupportThreadError('Destek konuşması başka bir yöneticiye atanmış.', {
            code: 'SUPPORT_THREAD_ASSIGNED_TO_ANOTHER_ADMIN',
            statusCode: 409
        });
    }

    if (thread.status === 'TAKEN_OVER' && Number(thread.assigned_admin_id) === actorId) return thread;
    const updated = await client.query(
        `UPDATE support_threads
         SET status = 'TAKEN_OVER', assigned_admin_id = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, actorId]
    );
    await appendSupportEvent(client, {
        threadId: id,
        actorId,
        eventType: 'TAKEOVER',
        payload: { previousStatus: thread.status }
    });
    return updated.rows[0];
};

const reopenSupportThreadForCustomer = async (client, { thread, customerId }) => {
    const normalizedCustomerId = requirePositiveId(customerId, 'customerId');
    if (Number(thread?.customer_id) !== normalizedCustomerId) {
        throw new SupportThreadError('Bu destek konuşmasına erişim yetkiniz yok.', {
            code: 'SUPPORT_THREAD_FORBIDDEN',
            statusCode: 403
        });
    }
    if (thread.status !== 'CLOSED') return thread;
    const updated = await client.query(
        `UPDATE support_threads
         SET status = 'OPEN', assigned_admin_id = NULL, updated_at = NOW()
         WHERE id = $1 AND customer_id = $2
         RETURNING *`,
        [thread.id, normalizedCustomerId]
    );
    await appendSupportEvent(client, {
        threadId: thread.id,
        actorId: normalizedCustomerId,
        eventType: 'STATUS_CHANGED',
        payload: { previousStatus: 'CLOSED', status: 'OPEN', reason: 'CUSTOMER_MESSAGE' }
    });
    return updated.rows[0];
};

const setSupportThreadStatus = async (client, { threadId, adminId, status }) => {
    const normalizedStatus = String(status || '').trim().toUpperCase();
    if (!supportThreadStatuses.has(normalizedStatus) || normalizedStatus === 'TAKEN_OVER') {
        throw new SupportThreadError('Destek konuşması durumu yalnız OPEN veya CLOSED olabilir.', {
            code: 'SUPPORT_THREAD_STATUS_INVALID',
            statusCode: 400
        });
    }
    const id = requirePositiveId(threadId, 'threadId');
    const actorId = requirePositiveId(adminId, 'adminId');
    const result = await client.query('SELECT * FROM support_threads WHERE id = $1 FOR UPDATE', [id]);
    const thread = result.rows[0];
    if (!thread) {
        throw new SupportThreadError('Destek konuşması bulunamadı.', {
            code: 'SUPPORT_THREAD_NOT_FOUND',
            statusCode: 404
        });
    }
    if (
        thread.assigned_admin_id != null &&
        Number(thread.assigned_admin_id) !== actorId
    ) {
        throw new SupportThreadError('Destek konuşması başka bir yöneticiye atanmış.', {
            code: 'SUPPORT_THREAD_ASSIGNED_TO_ANOTHER_ADMIN'
        });
    }

    const updated = await client.query(
        `UPDATE support_threads
         SET status = $2,
             assigned_admin_id = CASE WHEN $2 = 'CLOSED' THEN assigned_admin_id ELSE NULL END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, normalizedStatus]
    );
    await appendSupportEvent(client, {
        threadId: id,
        actorId,
        eventType: 'STATUS_CHANGED',
        payload: { previousStatus: thread.status, status: normalizedStatus }
    });
    return updated.rows[0];
};

const withSupportTransaction = async (work, database = pool) => {
    const client = await database.connect();
    let started = false;
    let committed = false;
    try {
        await client.query('BEGIN');
        started = true;
        const value = await work(client);
        await client.query('COMMIT');
        committed = true;
        return value;
    } catch (error) {
        if (started && !committed) await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    SUPPORT_MESSAGE_MAX_LENGTH,
    SUPPORT_SUMMARY_MAX_LENGTH,
    SUPPORT_THREAD_STATUSES,
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
};
