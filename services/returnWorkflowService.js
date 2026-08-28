'use strict';

const pool = require('../config/db');
const { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS } = require('../constants/orderStatus');

const RETURN_STATUS = Object.freeze({
    REQUESTED: 'REQUESTED',
    IN_REVIEW: 'IN_REVIEW',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    COMPLETED: 'COMPLETED'
});

const RETURN_REASON_CODES = Object.freeze([
    'DAMAGED',
    'WRONG_ITEM',
    'NOT_AS_DESCRIBED',
    'CHANGED_MIND',
    'OTHER'
]);

const ACTIVE_RETURN_STATUSES = Object.freeze([
    RETURN_STATUS.REQUESTED,
    RETURN_STATUS.IN_REVIEW,
    RETURN_STATUS.APPROVED
]);

const ADMIN_TRANSITIONS = Object.freeze({
    [RETURN_STATUS.REQUESTED]: Object.freeze([RETURN_STATUS.IN_REVIEW, RETURN_STATUS.REJECTED]),
    [RETURN_STATUS.IN_REVIEW]: Object.freeze([RETURN_STATUS.APPROVED, RETURN_STATUS.REJECTED])
});

class ReturnWorkflowError extends Error {
    constructor(code, message, statusCode = 409, details = null) {
        super(message);
        this.name = 'ReturnWorkflowError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

const positiveInteger = (value, code = 'RETURN_VALIDATION_FAILED') => {
    const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new ReturnWorkflowError(code, 'Geçerli pozitif kimlik gereklidir.', 400);
    }
    return parsed;
};

const boundedText = (value, max, { required = false } = {}) => {
    if (value === undefined || value === null) {
        if (required) throw new ReturnWorkflowError('RETURN_VALIDATION_FAILED', 'Zorunlu alan eksik.', 400);
        return null;
    }
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new ReturnWorkflowError('RETURN_VALIDATION_FAILED', 'Metin alanı geçersiz.', 400);
    }
    const normalized = value.trim();
    if ((required && !normalized) || normalized.length > max) {
        throw new ReturnWorkflowError('RETURN_VALIDATION_FAILED', 'Metin alanı geçersiz.', 400);
    }
    return normalized || null;
};

const strictBody = (body, allowed) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ReturnWorkflowError('RETURN_VALIDATION_FAILED', 'İstek gövdesi geçersiz.', 400);
    }
    const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
        throw new ReturnWorkflowError('RETURN_VALIDATION_FAILED', 'Desteklenmeyen iade alanı gönderildi.', 400, { fields: unknown });
    }
    return body;
};

const appendReturnEvent = async (client, {
    returnId,
    orderId,
    actorUserId,
    actorRole,
    eventType,
    fromStatus = null,
    toStatus,
    payload = {}
}) => client.query(
    `INSERT INTO return_events
        (return_id, order_id, actor_user_id, actor_role, event_type, from_status, to_status, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [returnId, orderId, actorUserId, actorRole, eventType, fromStatus, toStatus, JSON.stringify(payload)]
);

const insertReturnNotification = async (client, { userId, returnId, message }) => client.query(
    `INSERT INTO notifications (user_id, type, message, entity_type, entity_id)
     VALUES ($1, 'order_update', $2, 'return_request', $3)`,
    [userId, message, returnId]
);

const serializeReturn = (row, extra = {}) => Object.freeze({
    id: Number(row.id),
    order_id: Number(row.order_id),
    user_id: row.user_id === null ? null : Number(row.user_id),
    reason_code: row.reason_code,
    note: row.note || null,
    status: row.status,
    refund_amount: row.refund_amount === null ? null : Number(row.refund_amount),
    revision: Number(row.revision),
    decision_note: row.decision_note || null,
    decided_at: row.decided_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...extra
});

const createCustomerReturn = async ({ user, body, database = pool, env = process.env }) => {
    if (!user || user.principal !== 'customer' || user.role !== 'customer') {
        throw new ReturnWorkflowError('RETURN_CUSTOMER_REQUIRED', 'Müşteri oturumu gereklidir.', 403);
    }
    strictBody(body, ['order_id', 'reason_code', 'note']);
    const orderId = positiveInteger(body.order_id);
    const reasonCode = boundedText(body.reason_code, 50, { required: true }).toUpperCase();
    if (!RETURN_REASON_CODES.includes(reasonCode)) {
        throw new ReturnWorkflowError('RETURN_REASON_INVALID', 'Desteklenmeyen iade nedeni.', 400);
    }
    const note = boundedText(body.note, 1000);
    const returnWindowDays = positiveInteger(env.NOVASTORE_RETURN_WINDOW_DAYS || 14);
    const client = await database.connect();
    let open = false;
    try {
        await client.query('BEGIN');
        open = true;
        const orderResult = await client.query(
            `SELECT id, user_id, status, payment_status, refund_status, total_amount, currency, delivered_at
             FROM orders
             WHERE id = $1
             FOR UPDATE`,
            [orderId]
        );
        const order = orderResult.rows?.[0];
        if (!order || Number(order.user_id) !== Number(user.id)) {
            throw new ReturnWorkflowError('RETURN_ORDER_NOT_FOUND', 'Sipariş bulunamadı.', 404);
        }
        if (order.payment_status !== PAYMENT_STATUS.PAID || order.status !== ORDER_STATUS.TESLIM_EDILDI) {
            throw new ReturnWorkflowError(
                'RETURN_ORDER_NOT_ELIGIBLE',
                'Yalnız ödemesi tamamlanmış ve teslim edilmiş siparişler için iade talebi açılabilir.'
            );
        }
        const deliveredAt = new Date(order.delivered_at).getTime();
        if (!Number.isFinite(deliveredAt) || Date.now() - deliveredAt > returnWindowDays * 24 * 60 * 60 * 1000) {
            throw new ReturnWorkflowError('RETURN_WINDOW_EXPIRED', 'İade talebi süresi dolmuş.');
        }
        const existing = await client.query(
            `SELECT * FROM returns
             WHERE order_id = $1 AND status = ANY($2::varchar[])
             ORDER BY id DESC LIMIT 1 FOR UPDATE`,
            [orderId, ACTIVE_RETURN_STATUSES]
        );
        if (existing.rows?.[0]) {
            await client.query('COMMIT');
            open = false;
            return Object.freeze({ reused: true, return: serializeReturn(existing.rows[0]) });
        }
        const inserted = await client.query(
            `INSERT INTO returns
                (order_id, user_id, reason_code, note, status, refund_amount, revision)
             VALUES ($1, $2, $3, $4, $5, $6, 1)
             RETURNING *`,
            [orderId, Number(user.id), reasonCode, note, RETURN_STATUS.REQUESTED, order.total_amount]
        );
        const returnRow = inserted.rows[0];
        await client.query(
            `UPDATE orders SET refund_status = $1, updated_at = NOW() WHERE id = $2`,
            [REFUND_STATUS.REQUESTED, orderId]
        );
        await client.query(
            `INSERT INTO seller_returns
                (organization_id, store_id, seller_order_id, canonical_return_id, status)
             SELECT seller_order.organization_id,
                    seller_order.store_id,
                    seller_order.id,
                    $1,
                    'requested'
             FROM seller_orders seller_order
             WHERE seller_order.canonical_order_id = $2
             ON CONFLICT (canonical_return_id, store_id) DO NOTHING`,
            [returnRow.id, orderId]
        );
        await appendReturnEvent(client, {
            returnId: returnRow.id,
            orderId,
            actorUserId: Number(user.id),
            actorRole: 'customer',
            eventType: 'RETURN_REQUESTED',
            toStatus: RETURN_STATUS.REQUESTED,
            payload: { reasonCode, refundProviderExecuted: false }
        });
        await insertReturnNotification(client, {
            userId: null,
            returnId: returnRow.id,
            message: `Sipariş #${orderId} için yeni iade talebi oluşturuldu.`
        });
        await client.query('COMMIT');
        open = false;
        return Object.freeze({ reused: false, return: serializeReturn(returnRow) });
    } catch (error) {
        if (open) await client.query('ROLLBACK').catch(() => {});
        if (error?.code === '23505') {
            throw new ReturnWorkflowError('RETURN_ALREADY_ACTIVE', 'Bu sipariş için etkin bir iade talebi zaten var.');
        }
        throw error;
    } finally {
        client.release();
    }
};

const updateReturnByAdmin = async ({ returnId, admin, body, database = pool }) => {
    if (!admin || admin.principal !== 'admin' || admin.role !== 'admin') {
        throw new ReturnWorkflowError('RETURN_ADMIN_REQUIRED', 'Yönetici oturumu gereklidir.', 403);
    }
    const safeReturnId = positiveInteger(returnId);
    strictBody(body, ['status', 'expected_revision', 'decision_note']);
    const targetStatus = boundedText(body.status, 40, { required: true }).toUpperCase();
    const expectedRevision = positiveInteger(body.expected_revision, 'RETURN_REVISION_REQUIRED');
    const terminalDecision = [RETURN_STATUS.APPROVED, RETURN_STATUS.REJECTED].includes(targetStatus);
    const decisionNote = boundedText(body.decision_note, 1000, { required: terminalDecision });
    const client = await database.connect();
    let open = false;
    try {
        await client.query('BEGIN');
        open = true;
        const result = await client.query(
            `SELECT r.*, o.user_id AS order_user_id, o.refund_status AS order_refund_status
             FROM returns r
             JOIN orders o ON o.id = r.order_id
             WHERE r.id = $1
             FOR UPDATE OF r, o`,
            [safeReturnId]
        );
        const current = result.rows?.[0];
        if (!current) throw new ReturnWorkflowError('RETURN_NOT_FOUND', 'İade talebi bulunamadı.', 404);
        if (Number(current.revision) !== expectedRevision) {
            throw new ReturnWorkflowError('RETURN_REVISION_CONFLICT', 'İade talebi başka bir işlem tarafından değiştirildi.', 409, {
                expectedRevision,
                currentRevision: Number(current.revision)
            });
        }
        if (current.status === targetStatus) {
            await client.query('COMMIT');
            open = false;
            return Object.freeze({ reused: true, return: serializeReturn(current), refundProviderExecuted: false });
        }
        const allowed = ADMIN_TRANSITIONS[current.status] || [];
        if (!allowed.includes(targetStatus)) {
            throw new ReturnWorkflowError('RETURN_TRANSITION_NOT_ALLOWED', 'Bu iade durumu geçişine izin verilmiyor.');
        }
        const refundStatus = targetStatus === RETURN_STATUS.IN_REVIEW
            ? REFUND_STATUS.IN_REVIEW
            : targetStatus === RETURN_STATUS.APPROVED
                ? REFUND_STATUS.PENDING
                : REFUND_STATUS.REJECTED;
        const updated = await client.query(
            `UPDATE returns
             SET status = $1,
                 decision_note = $2,
                 decided_by_admin_id = $3,
                 decided_at = CASE WHEN $1::varchar IN ('APPROVED', 'REJECTED') THEN NOW() ELSE decided_at END,
                 revision = revision + 1,
                 updated_at = NOW()
             WHERE id = $4 AND revision = $5
             RETURNING *`,
            [targetStatus, decisionNote, Number(admin.id), safeReturnId, expectedRevision]
        );
        if (!updated.rows?.[0]) {
            throw new ReturnWorkflowError('RETURN_REVISION_CONFLICT', 'İade talebi başka bir işlem tarafından değiştirildi.');
        }
        await client.query(
            'UPDATE orders SET refund_status = $1, updated_at = NOW() WHERE id = $2',
            [refundStatus, current.order_id]
        );
        await client.query(
            `UPDATE seller_returns
             SET status = $1, revision = revision + 1, updated_at = NOW()
             WHERE canonical_return_id = $2`,
            [targetStatus === RETURN_STATUS.IN_REVIEW ? 'platform_review' : 'closed', safeReturnId]
        );
        await appendReturnEvent(client, {
            returnId: safeReturnId,
            orderId: Number(current.order_id),
            actorUserId: Number(admin.id),
            actorRole: 'admin',
            eventType: `RETURN_${targetStatus}`,
            fromStatus: current.status,
            toStatus: targetStatus,
            payload: {
                refundStatus,
                refundProviderExecuted: false,
                refundProviderGate: targetStatus === RETURN_STATUS.APPROVED
            }
        });
        if (current.order_user_id) {
            await insertReturnNotification(client, {
                userId: Number(current.order_user_id),
                returnId: safeReturnId,
                message: `Sipariş #${current.order_id} iade talebinizin durumu güncellendi: ${targetStatus}.`
            });
        }
        await client.query('COMMIT');
        open = false;
        return Object.freeze({
            reused: false,
            return: serializeReturn(updated.rows[0]),
            refundProviderExecuted: false,
            refundProviderRequired: targetStatus === RETURN_STATUS.APPROVED
        });
    } catch (error) {
        if (open) await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

module.exports = Object.freeze({
    ACTIVE_RETURN_STATUSES,
    ADMIN_TRANSITIONS,
    RETURN_REASON_CODES,
    RETURN_STATUS,
    ReturnWorkflowError,
    appendReturnEvent,
    createCustomerReturn,
    serializeReturn,
    updateReturnByAdmin
});
