'use strict';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const policy = (permission, targetType) => Object.freeze({ permission, targetType });

const SELLER_NOTIFICATION_EVENT_AUTHORITY = Object.freeze({
    SELLER_APPLICATION_STATUS_CHANGED: policy('organization.read', 'seller_application'),
    ORDER_CONFIRMED: policy('order.read', 'order'),
    ORDER_CANCEL_REQUESTED: policy('order.read', 'order'),
    CANCELLATION_RESULT: policy('order.read', 'order'),
    REFUND_STATUS_CHANGED: policy('finance.read', 'order'),
    RETURN_REQUESTED: policy('return.read', 'return_request'),
    RETURN_STATUS_CHANGED: policy('return.read', 'return_request'),
    QUESTION_CREATED: policy('offer.read', 'product_question'),
    REVIEW_CREATED: policy('offer.read', 'review')
});

const SELLER_SUPPORTED_EVENT_TYPES = Object.freeze(Object.keys(SELLER_NOTIFICATION_EVENT_AUTHORITY));
const SELLER_SUPPORTED_TYPED_TARGETS = Object.freeze([
    ...new Set(SELLER_SUPPORTED_EVENT_TYPES.map((eventType) => SELLER_NOTIFICATION_EVENT_AUTHORITY[eventType].targetType))
]);

class SellerNotificationAuthorizationError extends Error {
    constructor({ endpointInvalid = false } = {}) {
        super('Bildirim hedefi güncel Seller kapsamınızda bulunamadı.');
        this.name = 'SellerNotificationAuthorizationError';
        this.code = 'SELLER_NOTIFICATION_TARGET_NOT_FOUND';
        this.statusCode = 404;
        this.endpointInvalid = endpointInvalid === true;
    }
}

const authorizationError = (endpointInvalid = false) => new SellerNotificationAuthorizationError({ endpointInvalid });

const positiveId = (value) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw authorizationError();
    return parsed;
};

const eventTypeOf = (value) => String(value || '').trim().toUpperCase();

const getSellerNotificationEventAuthority = (eventType) => (
    SELLER_NOTIFICATION_EVENT_AUTHORITY[eventTypeOf(eventType)] || null
);

const allowedSellerNotificationEventTypes = (permissions) => {
    const granted = new Set(Array.isArray(permissions) ? permissions.map(String) : []);
    return Object.freeze(SELLER_SUPPORTED_EVENT_TYPES.filter((eventType) => (
        granted.has(SELLER_NOTIFICATION_EVENT_AUTHORITY[eventType].permission)
    )));
};

const isSellerNotificationEventAllowed = (eventType, permissions) => {
    const eventAuthority = getSellerNotificationEventAuthority(eventType);
    return Boolean(eventAuthority && new Set(Array.isArray(permissions) ? permissions.map(String) : []).has(eventAuthority.permission));
};

const requireQueryable = (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Seller bildirim yetkisi için sorgulanabilir veritabanı gerekir.');
    }
    return queryable;
};

const normalizeLiveIdentity = (identity) => {
    const sessionId = String(identity?.sessionId || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(sessionId)) throw authorizationError(true);
    return Object.freeze({
        sessionId,
        userId: positiveId(identity?.userId),
        organizationId: positiveId(identity?.organizationId),
        expectedMembershipId: identity?.membershipId == null ? null : positiveId(identity.membershipId)
    });
};

const loadLockedLiveAuthority = async (queryable, rawIdentity) => {
    const client = requireQueryable(queryable);
    const identity = normalizeLiveIdentity(rawIdentity);
    const result = await client.query(
        `SELECT seller_session.id AS session_id,
                seller_session.user_id,
                seller_session.organization_id,
                seller_session.membership_id,
                membership.role_id,
                membership.membership_revision,
                membership.security_stamp
           FROM seller_sessions seller_session
           JOIN seller_memberships membership
             ON membership.organization_id = seller_session.organization_id
            AND membership.id = seller_session.membership_id
            AND membership.user_id = seller_session.user_id
           JOIN seller_organizations organization
             ON organization.id = membership.organization_id
           JOIN seller_roles role_row
             ON role_row.id = membership.role_id
            AND (role_row.organization_id IS NULL OR role_row.organization_id = membership.organization_id)
           JOIN users user_row
             ON user_row.id = membership.user_id
          WHERE seller_session.id = $1::UUID
            AND seller_session.user_id = $2
            AND seller_session.organization_id = $3
            AND seller_session.audience = 'seller'
            AND seller_session.status = 'active'
            AND seller_session.expires_at > CURRENT_TIMESTAMP
            AND membership.status = 'active'
            AND organization.status = 'active'
            AND role_row.is_active = TRUE
            AND user_row.auth_enabled = TRUE
            AND seller_session.membership_revision = membership.membership_revision
            AND seller_session.security_stamp = membership.security_stamp
          FOR SHARE OF seller_session, membership, organization, role_row, user_row`,
        [identity.sessionId, identity.userId, identity.organizationId]
    );
    const row = result.rows?.[0];
    if (!row || (identity.expectedMembershipId !== null && Number(row.membership_id) !== identity.expectedMembershipId)) {
        throw authorizationError(true);
    }
    return Object.freeze({
        sessionId: String(row.session_id),
        userId: positiveId(row.user_id),
        organizationId: positiveId(row.organization_id),
        membershipId: positiveId(row.membership_id),
        roleId: positiveId(row.role_id),
        membershipRevision: positiveId(row.membership_revision),
        securityStamp: String(row.security_stamp)
    });
};

const requireLockedPermission = async (queryable, authority, permission) => {
    const result = await requireQueryable(queryable).query(
        `SELECT role_permission.permission_code
           FROM seller_role_permissions role_permission
           JOIN seller_permissions permission
             ON permission.code = role_permission.permission_code
            AND permission.is_active = TRUE
          WHERE role_permission.role_id = $1
            AND role_permission.permission_code = $2
          FOR SHARE OF role_permission, permission`,
        [authority.roleId, permission]
    );
    if (result.rows?.length !== 1) throw authorizationError();
};

const loadLockedPermissions = async (queryable, authority) => {
    const result = await requireQueryable(queryable).query(
        `SELECT permission.code AS permission_code
           FROM seller_role_permissions role_permission
           JOIN seller_permissions permission
             ON permission.code = role_permission.permission_code
            AND permission.is_active = TRUE
          WHERE role_permission.role_id = $1
          ORDER BY permission.code ASC
          FOR SHARE OF role_permission, permission`,
        [authority.roleId]
    );
    return Object.freeze((result.rows || []).map((row) => String(row.permission_code)));
};

const loadLockedAssignedStoreIds = async (queryable, authority) => {
    const result = await requireQueryable(queryable).query(
        `SELECT store_scope.store_id
           FROM seller_membership_store_scopes store_scope
           JOIN seller_stores seller_store
             ON seller_store.organization_id = store_scope.organization_id
            AND seller_store.id = store_scope.store_id
          WHERE store_scope.organization_id = $1
            AND store_scope.membership_id = $2
            AND store_scope.scope_kind = 'assigned'
            AND store_scope.revoked_at IS NULL
            AND seller_store.status = 'active'
            AND seller_store.closed_at IS NULL
          ORDER BY store_scope.store_id ASC
          FOR SHARE OF store_scope, seller_store`,
        [authority.organizationId, authority.membershipId]
    );
    return Object.freeze((result.rows || []).map((row) => positiveId(row.store_id)));
};

const loadLockedLiveNotificationScope = async (queryable, rawIdentity) => {
    const authority = await loadLockedLiveAuthority(queryable, rawIdentity);
    const permissions = await loadLockedPermissions(queryable, authority);
    const storeIds = await loadLockedAssignedStoreIds(queryable, authority);
    return Object.freeze({
        sessionId: authority.sessionId,
        userId: authority.userId,
        role: 'seller',
        organizationId: authority.organizationId,
        membershipId: authority.membershipId,
        storeIds,
        permissions
    });
};

const requireStoreTarget = (notification) => positiveId(notification.recipient_store_id);

const resolveLockedOrder = async (queryable, authority, notification) => {
    const storeId = requireStoreTarget(notification);
    const canonicalOrderId = positiveId(notification.entity_id);
    const result = await requireQueryable(queryable).query(
        `SELECT seller_order.id AS seller_order_id,
                seller_order.canonical_order_id,
                seller_order.store_id
           FROM seller_orders seller_order
           JOIN seller_stores seller_store
             ON seller_store.organization_id = seller_order.organization_id
            AND seller_store.id = seller_order.store_id
           JOIN seller_membership_store_scopes store_scope
             ON store_scope.organization_id = seller_order.organization_id
            AND store_scope.membership_id = $4
            AND store_scope.store_id = seller_order.store_id
            AND store_scope.scope_kind = 'assigned'
            AND store_scope.revoked_at IS NULL
          WHERE seller_order.canonical_order_id = $1
            AND seller_order.organization_id = $2
            AND seller_order.store_id = $3
            AND seller_store.status = 'active'
            AND seller_store.closed_at IS NULL
          FOR SHARE OF seller_order, seller_store, store_scope`,
        [canonicalOrderId, authority.organizationId, storeId, authority.membershipId]
    );
    const row = result.rows?.[0];
    if (!row) throw authorizationError();
    return Object.freeze({
        type: 'order',
        destination: 'SELLER_ORDER_DETAIL',
        sellerOrderId: positiveId(row.seller_order_id),
        canonicalOrderId: positiveId(row.canonical_order_id),
        sellerStoreId: positiveId(row.store_id)
    });
};

const resolveLockedReturn = async (queryable, authority, notification) => {
    const client = requireQueryable(queryable);
    const storeId = requireStoreTarget(notification);
    const canonicalReturnId = positiveId(notification.entity_id);
    const result = await client.query(
        `SELECT return_row.id AS canonical_return_id,
                seller_order.id AS seller_order_id,
                seller_order.store_id
           FROM returns return_row
           JOIN seller_orders seller_order
             ON seller_order.canonical_order_id = return_row.order_id
           JOIN seller_stores seller_store
             ON seller_store.organization_id = seller_order.organization_id
            AND seller_store.id = seller_order.store_id
           JOIN seller_membership_store_scopes store_scope
             ON store_scope.organization_id = seller_order.organization_id
            AND store_scope.membership_id = $4
            AND store_scope.store_id = seller_order.store_id
            AND store_scope.scope_kind = 'assigned'
            AND store_scope.revoked_at IS NULL
          WHERE return_row.id = $1
            AND seller_order.organization_id = $2
            AND seller_order.store_id = $3
            AND seller_store.status = 'active'
            AND seller_store.closed_at IS NULL
          FOR SHARE OF return_row, seller_order, seller_store, store_scope`,
        [canonicalReturnId, authority.organizationId, storeId, authority.membershipId]
    );
    const row = result.rows?.[0];
    if (!row) throw authorizationError();
    const sellerReturn = await client.query(
        `SELECT id
           FROM seller_returns
          WHERE organization_id = $1
            AND store_id = $2
            AND canonical_return_id = $3
          FOR SHARE`,
        [authority.organizationId, storeId, canonicalReturnId]
    );
    return Object.freeze({
        type: 'return_request',
        destination: 'SELLER_RETURNS',
        sellerReturnId: sellerReturn.rows?.[0] ? positiveId(sellerReturn.rows[0].id) : null,
        sellerOrderId: positiveId(row.seller_order_id),
        canonicalReturnId: positiveId(row.canonical_return_id),
        sellerStoreId: positiveId(row.store_id)
    });
};

const resolveLockedProductRecord = async (queryable, authority, notification, entity) => {
    const client = requireQueryable(queryable);
    const storeId = requireStoreTarget(notification);
    const entityId = positiveId(notification.entity_id);
    const table = entity === 'product_question' ? 'product_questions' : 'reviews';
    const alias = entity === 'product_question' ? 'question_row' : 'review_row';
    const result = await client.query(
        `SELECT ${alias}.id AS entity_id,
                product.id AS product_id,
                seller_store.id AS store_id
           FROM ${table} ${alias}
           JOIN products product
             ON product.id = ${alias}.product_id
            AND product.deleted_at IS NULL
           JOIN seller_stores seller_store
             ON seller_store.legacy_store_id = product.store_id
            AND seller_store.organization_id = $2
            AND seller_store.id = $3
            AND seller_store.status = 'active'
            AND seller_store.closed_at IS NULL
           JOIN seller_membership_store_scopes store_scope
             ON store_scope.organization_id = seller_store.organization_id
            AND store_scope.membership_id = $4
            AND store_scope.store_id = seller_store.id
            AND store_scope.scope_kind = 'assigned'
            AND store_scope.revoked_at IS NULL
          WHERE ${alias}.id = $1
          FOR SHARE OF ${alias}, product, seller_store, store_scope`,
        [entityId, authority.organizationId, storeId, authority.membershipId]
    );
    const row = result.rows?.[0];
    if (!row) throw authorizationError();
    return Object.freeze({
        type: entity,
        destination: 'NOTIFICATION_CENTER',
        ...(entity === 'product_question'
            ? { questionId: positiveId(row.entity_id) }
            : { reviewId: positiveId(row.entity_id) }),
        productId: positiveId(row.product_id),
        sellerStoreId: positiveId(row.store_id)
    });
};

const resolveLockedApplication = async (queryable, authority, notification) => {
    if (notification.recipient_store_id != null) throw authorizationError();
    const applicationId = String(notification.entity_key || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(applicationId) || notification.entity_id != null) throw authorizationError();
    const result = await requireQueryable(queryable).query(
        `SELECT application.id
           FROM seller_applications application
           JOIN users user_row
             ON user_row.id = application.applicant_user_id
            AND user_row.id = $2
            AND user_row.auth_enabled = TRUE
          WHERE application.id = $1::UUID
          FOR SHARE OF application, user_row`,
        [applicationId, authority.userId]
    );
    if (result.rows?.length !== 1) throw authorizationError();
    return Object.freeze({
        type: 'seller_application',
        destination: 'NOTIFICATION_CENTER',
        applicationId
    });
};

const resolveLockedEntity = async (queryable, authority, notification, eventAuthority) => {
    if (String(notification.entity_type || '').trim().toLowerCase() !== eventAuthority.targetType) {
        throw authorizationError();
    }
    if (eventAuthority.targetType === 'order') return resolveLockedOrder(queryable, authority, notification);
    if (eventAuthority.targetType === 'return_request') return resolveLockedReturn(queryable, authority, notification);
    if (eventAuthority.targetType === 'product_question') {
        return resolveLockedProductRecord(queryable, authority, notification, 'product_question');
    }
    if (eventAuthority.targetType === 'review') {
        return resolveLockedProductRecord(queryable, authority, notification, 'review');
    }
    if (eventAuthority.targetType === 'seller_application') {
        return resolveLockedApplication(queryable, authority, notification);
    }
    throw authorizationError();
};

const authorizeLockedNotification = async (queryable, rawIdentity, notification) => {
    if (String(notification?.recipient_role || '').trim().toLowerCase() !== 'seller') throw authorizationError();
    const identity = normalizeLiveIdentity(rawIdentity);
    if (
        positiveId(notification.user_id) !== identity.userId
        || positiveId(notification.recipient_organization_id) !== identity.organizationId
    ) {
        throw authorizationError();
    }
    const eventAuthority = getSellerNotificationEventAuthority(notification.type);
    if (!eventAuthority) throw authorizationError();
    const authority = await loadLockedLiveAuthority(queryable, identity);
    await requireLockedPermission(queryable, authority, eventAuthority.permission);
    const destination = await resolveLockedEntity(queryable, authority, notification, eventAuthority);
    return Object.freeze({ authority, destination, eventAuthority });
};

const loadLockedNotification = async (queryable, notificationId, identity) => {
    const result = await requireQueryable(queryable).query(
        `SELECT id, user_id, recipient_role, recipient_organization_id, recipient_store_id,
                type, entity_type, entity_id, entity_key
           FROM notifications
          WHERE id = $1
            AND recipient_role = 'seller'
            AND user_id = $2
            AND recipient_organization_id = $3
          FOR SHARE`,
        [positiveId(notificationId), identity.userId, identity.organizationId]
    );
    if (result.rows?.length !== 1) throw authorizationError();
    return result.rows[0];
};

const withTransaction = async (database, work) => {
    if (!database || typeof database.connect !== 'function') {
        throw new TypeError('Seller hedef çözümlemesi için veritabanı havuzu gerekir.');
    }
    const client = await database.connect();
    let began = false;
    try {
        await client.query('BEGIN');
        began = true;
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        if (began) await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const publicTarget = (destination) => {
    if (destination.type === 'order') {
        return Object.freeze({
            type: 'order',
            destination: 'SELLER_ORDER_DETAIL',
            sellerOrderId: destination.sellerOrderId
        });
    }
    if (destination.type === 'return_request') {
        return Object.freeze({
            type: 'return_request',
            destination: 'SELLER_RETURNS',
            sellerReturnId: destination.sellerReturnId,
            sellerOrderId: destination.sellerOrderId
        });
    }
    if (destination.type === 'product_question') {
        return Object.freeze({
            type: 'product_question',
            destination: 'NOTIFICATION_CENTER',
            questionId: destination.questionId,
            productId: destination.productId,
            sellerStoreId: destination.sellerStoreId
        });
    }
    if (destination.type === 'review') {
        return Object.freeze({
            type: 'review',
            destination: 'NOTIFICATION_CENTER',
            reviewId: destination.reviewId,
            productId: destination.productId,
            sellerStoreId: destination.sellerStoreId
        });
    }
    if (destination.type === 'seller_application') {
        return Object.freeze({
            type: 'seller_application',
            destination: 'NOTIFICATION_CENTER',
            applicationId: destination.applicationId
        });
    }
    throw authorizationError();
};

const resolveSellerNotificationTarget = async (database, { notificationId, context } = {}) => {
    const identity = normalizeLiveIdentity({
        sessionId: context?.sessionId,
        userId: context?.userId,
        organizationId: context?.organizationId,
        membershipId: context?.membershipId
    });
    return withTransaction(database, async (client) => {
        const notification = await loadLockedNotification(client, notificationId, identity);
        const authorized = await authorizeLockedNotification(client, identity, notification);
        return Object.freeze({
            notificationId: positiveId(notification.id),
            target: publicTarget(authorized.destination)
        });
    });
};

const withLiveSellerNotificationScope = async (database, rawIdentity, work) => {
    if (typeof work !== 'function') throw new TypeError('Seller bildirim kapsamı işi gerekir.');
    return withTransaction(database, async (client) => {
        const scope = await loadLockedLiveNotificationScope(client, rawIdentity);
        return work(client, scope);
    });
};

const authorizeSellerPrivateDelivery = async (queryable, row, { channel } = {}) => {
    const normalizedChannel = String(channel || '').trim().toUpperCase();
    if (!['ANDROID_PUSH', 'WEB_PUSH'].includes(normalizedChannel)) throw authorizationError();
    const notification = Object.freeze({
        id: row.notification_id ?? row.id,
        user_id: row.notification_user_id,
        recipient_role: row.notification_recipient_role,
        recipient_organization_id: row.notification_organization_id,
        recipient_store_id: row.notification_store_id,
        type: row.type,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        entity_key: row.entity_key
    });
    const endpointRole = String(row.endpoint_recipient_role || '').trim().toLowerCase();
    const endpointSessionId = String(row.endpoint_seller_session_id || '').trim().toLowerCase();
    const endpointUserId = positiveId(row.endpoint_user_id);
    const endpointOrganizationId = positiveId(row.endpoint_organization_id);
    if (
        endpointRole !== 'seller'
        || String(notification.recipient_role || '').trim().toLowerCase() !== 'seller'
        || endpointUserId !== positiveId(notification.user_id)
        || endpointOrganizationId !== positiveId(notification.recipient_organization_id)
        || (normalizedChannel === 'ANDROID_PUSH' && row.endpoint_application !== 'SELLER_ANDROID')
        || !UUID_PATTERN.test(endpointSessionId)
    ) {
        throw authorizationError();
    }
    return authorizeLockedNotification(queryable, {
        sessionId: endpointSessionId,
        userId: endpointUserId,
        organizationId: endpointOrganizationId
    }, notification);
};

module.exports = Object.freeze({
    SELLER_NOTIFICATION_EVENT_AUTHORITY,
    SELLER_SUPPORTED_EVENT_TYPES,
    SELLER_SUPPORTED_TYPED_TARGETS,
    SellerNotificationAuthorizationError,
    allowedSellerNotificationEventTypes,
    authorizeSellerPrivateDelivery,
    getSellerNotificationEventAuthority,
    isSellerNotificationEventAllowed,
    resolveSellerNotificationTarget,
    withLiveSellerNotificationScope
});
