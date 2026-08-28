'use strict';

class NotificationReadError extends Error {
    constructor(message, code = 'NOTIFICATION_REQUEST_INVALID', statusCode = 400) {
        super(message);
        this.name = 'NotificationReadError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const parseLimit = (value) => {
    if (value === undefined || value === null || value === '') return 20;
    if (!/^\d+$/u.test(String(value))) {
        throw new NotificationReadError('Bildirim sayfa sınırı geçersiz.', 'NOTIFICATION_LIMIT_INVALID');
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
        throw new NotificationReadError('Bildirim sayfa sınırı 1 ile 100 arasında olmalıdır.', 'NOTIFICATION_LIMIT_INVALID');
    }
    return parsed;
};

const encodeCursor = (row) => Buffer.from(JSON.stringify({
    createdAt: new Date(row.created_at).toISOString(),
    id: Number(row.id)
}), 'utf8').toString('base64url');

const decodeCursor = (value) => {
    if (value === undefined || value === null || value === '') return null;
    try {
        const decoded = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
        const createdAt = new Date(decoded.createdAt);
        const id = Number(decoded.id);
        if (!Number.isFinite(createdAt.getTime()) || !Number.isSafeInteger(id) || id < 1) throw new Error('invalid');
        return Object.freeze({ createdAt, id });
    } catch (_) {
        throw new NotificationReadError('Bildirim sayfa imleci geçersiz.', 'NOTIFICATION_CURSOR_INVALID');
    }
};

const normalizeScope = (scope) => {
    const userId = Number(scope?.userId);
    const role = String(scope?.role || '').trim().toLowerCase();
    if (!Number.isSafeInteger(userId) || userId < 1 || !['admin', 'customer', 'seller'].includes(role)) {
        throw new NotificationReadError('Kimliği doğrulanmış bildirim kapsamı gerekli.', 'AUTH_REQUIRED', 401);
    }
    const organizationId = scope?.organizationId == null ? null : Number(scope.organizationId);
    if (role === 'seller' && (!Number.isSafeInteger(organizationId) || organizationId < 1)) {
        throw new NotificationReadError('Satıcı bildirim kapsamı geçersiz.', 'SELLER_SCOPE_REQUIRED', 403);
    }
    const storeIds = role === 'seller'
        ? [...new Set((scope.storeIds || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
        : [];
    return Object.freeze({ userId, role, organizationId, storeIds: Object.freeze(storeIds) });
};

const scopeSql = (scope, startIndex = 1) => {
    if (scope.role === 'admin') {
        return Object.freeze({
            clause: `(recipient_role = 'admin' AND (user_id = $${startIndex} OR user_id IS NULL))`,
            values: [scope.userId]
        });
    }
    if (scope.role === 'customer') {
        return Object.freeze({
            clause: `(recipient_role = 'customer' AND user_id = $${startIndex})`,
            values: [scope.userId]
        });
    }
    return Object.freeze({
        clause: `(recipient_role = 'seller'
                  AND user_id = $${startIndex}
                  AND recipient_organization_id = $${startIndex + 1}
                  AND (recipient_store_id IS NULL OR recipient_store_id = ANY($${startIndex + 2}::BIGINT[])))`,
        values: [scope.userId, scope.organizationId, scope.storeIds]
    });
};

const selectColumns = `id, type, category, priority, title, message,
    COALESCE(is_read, FALSE) AS is_read, read_at,
    entity_type, entity_id, entity_key, created_at, updated_at`;

const listNotifications = async (database, rawScope, options = {}) => {
    const scope = normalizeScope(rawScope);
    const limit = parseLimit(options.limit);
    const cursor = decodeCursor(options.cursor);
    const scoped = scopeSql(scope, 1);
    const cursorOffset = scoped.values.length + 1;
    const result = await database.query(
        `SELECT ${selectColumns}
           FROM notifications
          WHERE ${scoped.clause}
            AND ($${cursorOffset}::TIMESTAMPTZ IS NULL
                 OR (created_at, id) < ($${cursorOffset}::TIMESTAMPTZ, $${cursorOffset + 1}::INTEGER))
          ORDER BY created_at DESC, id DESC
          LIMIT $${cursorOffset + 2}`,
        [
            ...scoped.values,
            cursor?.createdAt || null,
            cursor?.id || null,
            limit + 1
        ]
    );
    const hasMore = result.rows.length > limit;
    const items = result.rows.slice(0, limit);
    return Object.freeze({
        items: Object.freeze(items.map((row) => Object.freeze(row))),
        page: Object.freeze({
            limit,
            hasMore,
            nextCursor: hasMore && items.length ? encodeCursor(items[items.length - 1]) : null
        })
    });
};

const getUnreadCount = async (database, rawScope) => {
    const scope = normalizeScope(rawScope);
    const scoped = scopeSql(scope, 1);
    const result = await database.query(
        `SELECT COUNT(*)::INT AS unread_count
           FROM notifications
          WHERE ${scoped.clause}
            AND read_at IS NULL
            AND COALESCE(is_read, FALSE) = FALSE`,
        scoped.values
    );
    return Number(result.rows[0]?.unread_count || 0);
};

const parseNotificationId = (value) => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw new NotificationReadError('Bildirim kimliği geçersiz.', 'NOTIFICATION_ID_INVALID');
    }
    return id;
};

const markNotificationRead = async (database, rawScope, rawId) => {
    const scope = normalizeScope(rawScope);
    const id = parseNotificationId(rawId);
    const scoped = scopeSql(scope, 2);
    const result = await database.query(
        `UPDATE notifications
            SET is_read = TRUE,
                read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
          WHERE id = $1
            AND ${scoped.clause}
      RETURNING ${selectColumns}`,
        [id, ...scoped.values]
    );
    if (result.rows.length === 0) {
        throw new NotificationReadError('Bildirim bulunamadı.', 'NOTIFICATION_NOT_FOUND', 404);
    }
    return Object.freeze(result.rows[0]);
};

const markAllNotificationsRead = async (database, rawScope) => {
    const scope = normalizeScope(rawScope);
    const scoped = scopeSql(scope, 1);
    const result = await database.query(
        `UPDATE notifications
            SET is_read = TRUE,
                read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
          WHERE ${scoped.clause}
            AND read_at IS NULL
      RETURNING id`,
        scoped.values
    );
    return result.rows.length;
};

module.exports = Object.freeze({
    NotificationReadError,
    decodeCursor,
    encodeCursor,
    getUnreadCount,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    normalizeScope,
    parseLimit,
    scopeSql
});
