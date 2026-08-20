'use strict';

class SellerTeamReadError extends Error {
    constructor(code, statusCode = 404) {
        super(code);
        this.name = 'SellerTeamReadError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const positiveInteger = (value) => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new SellerTeamReadError('RESOURCE_NOT_FOUND');
    return parsed;
};

const listMembersForStoreScope = async (database, context, { limit }) => {
    if (!database || typeof database.query !== 'function') throw new TypeError('Seller team database is required.');
    const organizationId = positiveInteger(context?.organizationId);
    const storeIds = Array.isArray(context?.storeIds)
        ? [...new Set(context.storeIds.map(positiveInteger))]
        : [];
    if (storeIds.length === 0) throw new SellerTeamReadError('RESOURCE_NOT_FOUND');
    const safeLimit = positiveInteger(limit);
    if (safeLimit > 100) throw new SellerTeamReadError('VALIDATION_FAILED', 400);
    const result = await database.query(
        `SELECT membership.id, role.code AS role_code, membership.status,
                COALESCE(user_row.full_name, user_row.name) AS display_name
           FROM seller_memberships membership
           JOIN seller_roles role ON role.id = membership.role_id
           JOIN users user_row ON user_row.id = membership.user_id
          WHERE membership.organization_id = $1
            AND EXISTS (
                SELECT 1
                  FROM seller_membership_store_scopes scope
                 WHERE scope.organization_id = membership.organization_id
                   AND scope.membership_id = membership.id
                   AND scope.scope_kind = 'assigned'
                   AND scope.revoked_at IS NULL
                   AND scope.store_id = ANY($2::bigint[])
            )
          ORDER BY membership.id ASC
          LIMIT $3`,
        [organizationId, storeIds, safeLimit]
    );
    return Object.freeze((result.rows || []).map((row) => Object.freeze({
        id: Number(row.id),
        role_code: String(row.role_code),
        status: String(row.status),
        display_name: String(row.display_name || '')
    })));
};

module.exports = Object.freeze({ SellerTeamReadError, listMembersForStoreScope });
