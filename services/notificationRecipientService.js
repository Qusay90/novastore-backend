'use strict';

const { getNotificationEventPolicy } = require('./notificationEventCatalog');
const { getSellerNotificationEventAuthority } = require('./sellerNotificationAuthorizationService');

class NotificationRecipientError extends Error {
    constructor(message, code = 'NOTIFICATION_RECIPIENT_RESOLUTION_FAILED') {
        super(message);
        this.name = 'NotificationRecipientError';
        this.code = code;
    }
}

const positiveId = (value) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new NotificationRecipientError('Bildirim olayının varlık kimliği geçersiz.', 'NOTIFICATION_AGGREGATE_ID_INVALID');
    }
    return parsed;
};

const rowToRecipient = (row, role) => Object.freeze({
    userId: Number(row.user_id),
    role,
    organizationId: row.organization_id == null ? null : Number(row.organization_id),
    storeId: row.store_id == null ? null : Number(row.store_id)
});

const loadAdminRecipients = async (queryable) => {
    const result = await queryable.query(
        `SELECT id AS user_id, NULL::BIGINT AS organization_id, NULL::BIGINT AS store_id
           FROM users
          WHERE role = 'admin'
            AND COALESCE(auth_enabled, TRUE) = TRUE
          ORDER BY id ASC`
    );
    return result.rows.map((row) => rowToRecipient(row, 'admin'));
};

const customerSqlByAggregate = Object.freeze({
    order: `SELECT user_id, NULL::BIGINT AS organization_id, NULL::BIGINT AS store_id
              FROM orders WHERE id = $1 AND user_id IS NOT NULL`,
    return_request: `SELECT orders.user_id, NULL::BIGINT AS organization_id, NULL::BIGINT AS store_id
                       FROM returns
                       JOIN orders ON orders.id = returns.order_id
                      WHERE returns.id = $1 AND orders.user_id IS NOT NULL`,
    support_thread: `SELECT customer_id AS user_id, NULL::BIGINT AS organization_id, NULL::BIGINT AS store_id
                       FROM support_threads WHERE id = $1`,
    product_question: `SELECT user_id, NULL::BIGINT AS organization_id, NULL::BIGINT AS store_id
                         FROM product_questions WHERE id = $1`,
    review: `SELECT user_id, NULL::BIGINT AS organization_id, NULL::BIGINT AS store_id
               FROM reviews WHERE id = $1`
});

const loadCustomerRecipients = async (queryable, event) => {
    const sql = customerSqlByAggregate[event.aggregateType];
    if (!sql) return [];
    const result = await queryable.query(sql, [positiveId(event.aggregateId)]);
    return result.rows.map((row) => rowToRecipient(row, 'customer'));
};

const sellerScopeSql = Object.freeze({
    order: `
        SELECT DISTINCT membership.user_id,
                        membership.organization_id,
                        seller_order.store_id
          FROM seller_orders seller_order
          JOIN seller_stores seller_store
            ON seller_store.organization_id = seller_order.organization_id
           AND seller_store.id = seller_order.store_id
           AND seller_store.status = 'active'
           AND seller_store.closed_at IS NULL
          JOIN seller_memberships membership
            ON membership.organization_id = seller_order.organization_id
           AND membership.status = 'active'
          JOIN seller_organizations organization
            ON organization.id = membership.organization_id
           AND organization.status = 'active'
          JOIN seller_roles role_row
            ON role_row.id = membership.role_id
           AND role_row.is_active = TRUE
           AND (role_row.organization_id IS NULL OR role_row.organization_id = membership.organization_id)
          JOIN seller_role_permissions role_permission
            ON role_permission.role_id = role_row.id
           AND role_permission.permission_code = $2
          JOIN seller_permissions permission
            ON permission.code = role_permission.permission_code
           AND permission.is_active = TRUE
          JOIN users user_row
            ON user_row.id = membership.user_id
           AND user_row.auth_enabled = TRUE
          JOIN seller_membership_store_scopes scope
            ON scope.organization_id = membership.organization_id
           AND scope.membership_id = membership.id
           AND scope.store_id = seller_order.store_id
           AND scope.scope_kind = 'assigned'
           AND scope.revoked_at IS NULL
         WHERE seller_order.canonical_order_id = $1
         ORDER BY membership.organization_id, seller_order.store_id, membership.user_id`,
    return_request: `
        SELECT DISTINCT membership.user_id,
                        membership.organization_id,
                        seller_order.store_id
          FROM returns return_row
          JOIN seller_orders seller_order ON seller_order.canonical_order_id = return_row.order_id
          JOIN seller_stores seller_store
            ON seller_store.organization_id = seller_order.organization_id
           AND seller_store.id = seller_order.store_id
           AND seller_store.status = 'active'
           AND seller_store.closed_at IS NULL
          JOIN seller_memberships membership
            ON membership.organization_id = seller_order.organization_id
           AND membership.status = 'active'
          JOIN seller_organizations organization
            ON organization.id = membership.organization_id
           AND organization.status = 'active'
          JOIN seller_roles role_row
            ON role_row.id = membership.role_id
           AND role_row.is_active = TRUE
           AND (role_row.organization_id IS NULL OR role_row.organization_id = membership.organization_id)
          JOIN seller_role_permissions role_permission
            ON role_permission.role_id = role_row.id
           AND role_permission.permission_code = $2
          JOIN seller_permissions permission
            ON permission.code = role_permission.permission_code
           AND permission.is_active = TRUE
          JOIN users user_row
            ON user_row.id = membership.user_id
           AND user_row.auth_enabled = TRUE
          JOIN seller_membership_store_scopes scope
            ON scope.organization_id = membership.organization_id
           AND scope.membership_id = membership.id
           AND scope.store_id = seller_order.store_id
           AND scope.scope_kind = 'assigned'
           AND scope.revoked_at IS NULL
         WHERE return_row.id = $1
         ORDER BY membership.organization_id, seller_order.store_id, membership.user_id`,
    product_question: `
        SELECT DISTINCT membership.user_id,
                        membership.organization_id,
                        seller_store.id AS store_id
          FROM product_questions question
          JOIN products product ON product.id = question.product_id AND product.deleted_at IS NULL
          JOIN seller_stores seller_store
            ON seller_store.legacy_store_id = product.store_id
           AND seller_store.status = 'active'
           AND seller_store.closed_at IS NULL
          JOIN seller_memberships membership
            ON membership.organization_id = seller_store.organization_id
           AND membership.status = 'active'
          JOIN seller_organizations organization
            ON organization.id = membership.organization_id
           AND organization.status = 'active'
          JOIN seller_roles role_row
            ON role_row.id = membership.role_id
           AND role_row.is_active = TRUE
           AND (role_row.organization_id IS NULL OR role_row.organization_id = membership.organization_id)
          JOIN seller_role_permissions role_permission
            ON role_permission.role_id = role_row.id
           AND role_permission.permission_code = $2
          JOIN seller_permissions permission
            ON permission.code = role_permission.permission_code
           AND permission.is_active = TRUE
          JOIN users user_row
            ON user_row.id = membership.user_id
           AND user_row.auth_enabled = TRUE
          JOIN seller_membership_store_scopes scope
            ON scope.organization_id = membership.organization_id
           AND scope.membership_id = membership.id
           AND scope.store_id = seller_store.id
           AND scope.scope_kind = 'assigned'
           AND scope.revoked_at IS NULL
         WHERE question.id = $1
         ORDER BY membership.organization_id, seller_store.id, membership.user_id`,
    review: `
        SELECT DISTINCT membership.user_id,
                        membership.organization_id,
                        seller_store.id AS store_id
          FROM reviews review_row
          JOIN products product ON product.id = review_row.product_id AND product.deleted_at IS NULL
          JOIN seller_stores seller_store
            ON seller_store.legacy_store_id = product.store_id
           AND seller_store.status = 'active'
           AND seller_store.closed_at IS NULL
          JOIN seller_memberships membership
            ON membership.organization_id = seller_store.organization_id
           AND membership.status = 'active'
          JOIN seller_organizations organization
            ON organization.id = membership.organization_id
           AND organization.status = 'active'
          JOIN seller_roles role_row
            ON role_row.id = membership.role_id
           AND role_row.is_active = TRUE
           AND (role_row.organization_id IS NULL OR role_row.organization_id = membership.organization_id)
          JOIN seller_role_permissions role_permission
            ON role_permission.role_id = role_row.id
           AND role_permission.permission_code = $2
          JOIN seller_permissions permission
            ON permission.code = role_permission.permission_code
           AND permission.is_active = TRUE
          JOIN users user_row
            ON user_row.id = membership.user_id
           AND user_row.auth_enabled = TRUE
          JOIN seller_membership_store_scopes scope
            ON scope.organization_id = membership.organization_id
           AND scope.membership_id = membership.id
           AND scope.store_id = seller_store.id
           AND scope.scope_kind = 'assigned'
           AND scope.revoked_at IS NULL
         WHERE review_row.id = $1
         ORDER BY membership.organization_id, seller_store.id, membership.user_id`
});

const loadSellerApplicationRecipient = async (queryable, event, permissionCode) => {
    const applicationKey = String(event.aggregateId || '').trim().toLowerCase();
    const result = await queryable.query(
        `SELECT DISTINCT membership.user_id,
                         membership.organization_id,
                         NULL::BIGINT AS store_id
           FROM seller_applications application
           JOIN users user_row
             ON user_row.id = application.applicant_user_id
             AND user_row.auth_enabled = TRUE
           JOIN seller_memberships membership
             ON membership.user_id = user_row.id
            AND membership.status = 'active'
           JOIN seller_organizations organization
             ON organization.id = membership.organization_id
            AND organization.status = 'active'
           JOIN seller_roles role_row
             ON role_row.id = membership.role_id
            AND role_row.is_active = TRUE
            AND (role_row.organization_id IS NULL OR role_row.organization_id = membership.organization_id)
           JOIN seller_role_permissions role_permission
             ON role_permission.role_id = role_row.id
            AND role_permission.permission_code = $2
           JOIN seller_permissions permission
             ON permission.code = role_permission.permission_code
            AND permission.is_active = TRUE
          WHERE application.id = $1::UUID
          ORDER BY membership.organization_id, membership.user_id`,
        [applicationKey, permissionCode]
    );
    return result.rows.map((row) => rowToRecipient(row, 'seller'));
};

const loadSellerRecipients = async (queryable, event) => {
    const eventAuthority = getSellerNotificationEventAuthority(event.eventType);
    if (!eventAuthority || eventAuthority.targetType !== event.aggregateType) return [];
    if (event.aggregateType === 'seller_application') {
        return loadSellerApplicationRecipient(queryable, event, eventAuthority.permission);
    }
    const sql = sellerScopeSql[event.aggregateType];
    if (!sql) return [];
    const result = await queryable.query(sql, [positiveId(event.aggregateId), eventAuthority.permission]);
    return result.rows.map((row) => rowToRecipient(row, 'seller'));
};

const recipientKey = (recipient) => [
    recipient.role,
    recipient.userId,
    recipient.organizationId || 0,
    recipient.storeId || 0
].join(':');

const resolveNotificationRecipients = async (queryable, event) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Bildirim alıcı çözümlemesi için sorgulanabilir veritabanı gerekir.');
    }
    const eventPolicy = getNotificationEventPolicy(event.eventType);
    if (eventPolicy.aggregateType !== event.aggregateType) {
        throw new NotificationRecipientError('Bildirim olayı ve varlık türü uyuşmuyor.', 'NOTIFICATION_AGGREGATE_TYPE_MISMATCH');
    }

    const recipients = [];
    for (const role of eventPolicy.recipients) {
        if (role === 'admin') recipients.push(...await loadAdminRecipients(queryable));
        if (role === 'customer') recipients.push(...await loadCustomerRecipients(queryable, event));
        if (role === 'seller') recipients.push(...await loadSellerRecipients(queryable, event));
    }

    const unique = new Map();
    for (const recipient of recipients) {
        if (!Number.isSafeInteger(recipient.userId) || recipient.userId < 1) continue;
        unique.set(recipientKey(recipient), recipient);
    }
    return Object.freeze([...unique.values()]);
};

module.exports = Object.freeze({
    NotificationRecipientError,
    recipientKey,
    resolveNotificationRecipients
});
