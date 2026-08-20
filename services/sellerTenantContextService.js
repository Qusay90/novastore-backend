'use strict';

const { listPermissions } = require('./sellerRolePermissionService');

class SellerTenantError extends Error {
    constructor(code, statusCode = 404) {
        super(code);
        this.name = 'SellerTenantError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const positiveInteger = (value, code = 'RESOURCE_NOT_FOUND') => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new SellerTenantError(code);
    return parsed;
};

const requireQueryable = (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') throw new TypeError('Seller tenant queryable is required.');
    return queryable;
};

const resourceNotFound = () => new SellerTenantError('RESOURCE_NOT_FOUND', 404);

const resolveTenantContext = async (queryable, session) => {
    const target = requireQueryable(queryable);
    const sessionId = typeof session?.sessionId === 'string' ? session.sessionId.trim() : '';
    if (!sessionId) throw new SellerTenantError('NO_ACTIVE_MEMBERSHIP', 403);
    const organizationId = positiveInteger(session?.organizationId);
    const membershipId = positiveInteger(session?.membershipId);
    const sessionRevision = positiveInteger(session?.membershipRevision);
    const membershipResult = await target.query(
        "SELECT membership.id, membership.organization_id, membership.user_id, membership.role_id, membership.membership_revision, membership.security_stamp, membership.status AS membership_status, organization.status AS organization_status FROM seller_memberships membership JOIN seller_organizations organization ON organization.id = membership.organization_id WHERE membership.organization_id = $1 AND membership.id = $2 AND membership.status = 'active' AND organization.status = 'active'",
        [organizationId, membershipId]
    );
    const membership = membershipResult.rows?.[0];
    if (!membership || Number(membership.membership_revision) !== sessionRevision || membership.security_stamp !== session.securityStamp) {
        throw new SellerTenantError('NO_ACTIVE_MEMBERSHIP', 403);
    }
    const scopesResult = await target.query(
        "SELECT scope.store_id FROM seller_membership_store_scopes scope JOIN seller_stores store ON store.organization_id = scope.organization_id AND store.id = scope.store_id WHERE scope.organization_id = $1 AND scope.membership_id = $2 AND scope.scope_kind = 'assigned' AND scope.revoked_at IS NULL AND store.status = 'active' ORDER BY scope.store_id ASC",
        [organizationId, membershipId]
    );
    const storeIds = Object.freeze((scopesResult.rows || []).map((row) => positiveInteger(Number(row.store_id))));
    const permissions = Object.freeze(await listPermissions(target, { organizationId, roleId: membership.role_id }));
    return Object.freeze({
        sessionId,
        organizationId,
        membershipId,
        userId: positiveInteger(Number(membership.user_id)),
        roleId: positiveInteger(Number(membership.role_id)),
        membershipRevision: sessionRevision,
        securityStamp: String(membership.security_stamp),
        storeIds,
        permissions
    });
};

const requireTenantPermission = (context, permission) => {
    if (typeof permission !== 'string' || !context?.permissions?.includes(permission)) {
        throw new SellerTenantError('PERMISSION_DENIED', 403);
    }
    return true;
};

const loadTenantScopedResource = async (context, { storeId, loader }) => {
    if (!context || typeof loader !== 'function') throw resourceNotFound();
    const requestedStoreId = storeId === undefined || storeId === null ? null : positiveInteger(storeId);
    if (requestedStoreId !== null && !context.storeIds.includes(requestedStoreId)) throw resourceNotFound();
    const resource = await loader(Object.freeze({
        organizationId: context.organizationId,
        storeIds: context.storeIds,
        storeId: requestedStoreId
    }));
    if (!resource || resource.deletedAt) throw resourceNotFound();
    return Object.freeze(resource);
};

module.exports = Object.freeze({
    SellerTenantError,
    resourceNotFound,
    resolveTenantContext,
    requireTenantPermission,
    loadTenantScopedResource
});
