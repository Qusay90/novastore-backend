'use strict';

// Token verification belongs to the existing Admin/Seller middleware. This module
// re-reads authorization on the caller's transaction client, before replay lookup.
class ThemePlatformAuthError extends Error {
    constructor(code, statusCode = 403) {
        super(code);
        this.name = 'ThemePlatformAuthError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const permissions = Object.freeze([
    'catalog.read', 'catalog.write', 'version.create',
    'service.read', 'service.manage', 'assignment.read', 'assignment.manage', 'assignment.accept',
    'entitlement.read', 'entitlement.manage', 'draft.read', 'draft.edit',
    'asset.read', 'asset.register', 'preview.read', 'preview.create',
    'publication.read', 'publication.request', 'rollback.request',
    'operation.read', 'audit.read'
]);
const rolePermissions = Object.freeze({
    super_admin: permissions,
    theme_admin: Object.freeze([
        'catalog.read', 'catalog.write', 'version.create', 'service.read',
        'assignment.read', 'assignment.manage', 'assignment.accept', 'entitlement.read', 'draft.read',
        'asset.read', 'preview.read', 'preview.create', 'publication.read',
        'operation.read', 'audit.read'
    ]),
    support: Object.freeze(['catalog.read', 'service.read', 'audit.read']),
    seller_owner: Object.freeze([
        'service.read', 'assignment.read', 'assignment.accept', 'entitlement.read', 'draft.read',
        'draft.edit', 'asset.read', 'asset.register', 'preview.read', 'preview.create',
        'publication.read', 'publication.request', 'rollback.request',
        'operation.read', 'audit.read'
    ]),
    seller_admin: Object.freeze([
        'service.read', 'assignment.read', 'assignment.accept', 'draft.read', 'draft.edit',
        'asset.read', 'asset.register', 'preview.read', 'preview.create',
        'publication.read', 'operation.read'
    ]),
    seller_editor: Object.freeze([
        'service.read', 'assignment.read', 'assignment.accept', 'draft.read', 'draft.edit',
        'asset.read', 'asset.register', 'preview.read', 'preview.create',
        'publication.read', 'operation.read'
    ]),
    seller_viewer: Object.freeze([
        'service.read', 'assignment.read', 'draft.read', 'asset.read',
        'preview.read', 'publication.read', 'operation.read'
    ])
});
const adminRoles = new Set(['super_admin', 'theme_admin', 'support']);
const sellerRoles = new Set(['seller_owner', 'seller_admin', 'seller_editor', 'seller_viewer']);
const fail = (code, status = 403) => { throw new ThemePlatformAuthError(code, status); };
const positiveId = (value) => {
    const number = typeof value === 'string' && /^[1-9]\d*$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(number) || number < 1) fail('THEME_AUTH_REQUIRED', 401);
    return number;
};
const sessionUuid = (value) => {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
        fail('THEME_AUTH_REQUIRED', 401);
    }
    return value.toLowerCase();
};
const one = (result) => result?.rows?.length === 1 ? result.rows[0] : null;

const principalFromAdmin = (req) => {
    const auth = req?.auth;
    if (auth?.user?.principal !== 'admin' || auth.user.role !== 'admin'
        || auth?.session?.principal !== 'admin' || auth.session.revoked !== false
        || positiveId(auth.session.userId) !== positiveId(auth.user.id)) fail('THEME_AUTH_REQUIRED', 401);
    return Object.freeze({ kind: 'admin', userId: positiveId(auth.user.id), sessionId: positiveId(auth.session.id) });
};

const principalFromSeller = (req) => {
    const principal = req?.sellerPrincipal;
    if (principal?.issuer !== 'novastore-seller-v1' || principal.audience !== 'seller') fail('THEME_AUTH_REQUIRED', 401);
    return Object.freeze({ kind: 'seller', userId: positiveId(principal.userId), sessionId: sessionUuid(principal.sessionId) });
};

const authorizeAdmin = async (client, principal) => {
    const userId = positiveId(principal.userId), sessionId = positiveId(principal.sessionId);
    const session = one(await client.query(`/* theme-auth:admin-session */
        SELECT s.id AS session_id, s.user_id, s.principal_type, s.revoked_at,
               (s.expires_at > clock_timestamp()) AS unexpired,
               u.role AS user_role, u.auth_enabled
        FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.user_id = $2
        FOR SHARE OF s, u`, [sessionId, userId]));
    if (!session || session.principal_type !== 'admin' || session.revoked_at !== null
        || session.unexpired !== true || session.auth_enabled !== true) fail('THEME_AUTH_REQUIRED', 401);
    if (session.user_role !== 'admin') fail('THEME_PERMISSION_DENIED');
    const binding = one(await client.query(`/* theme-auth:admin-role */
        SELECT role, active, revision FROM theme_admin_roles
        WHERE user_id = $1 FOR SHARE`, [userId]));
    if (!binding || binding.active !== true || !adminRoles.has(binding.role)) fail('THEME_PERMISSION_DENIED');
    return Object.freeze({
        kind: 'admin', userId, sessionId, actorId: `admin:${userId}`,
        role: binding.role, roleRevision: positiveId(binding.revision),
        permissions: rolePermissions[binding.role]
    });
};

const authorizeSeller = async (client, principal, service) => {
    const userId = positiveId(principal.userId), sessionId = sessionUuid(principal.sessionId);
    // This first read discovers the authoritative organization/member IDs only.
    // The session is read and locked again after locking its parent membership.
    const discovered = one(await client.query(`/* theme-auth:seller-session-scope */
        SELECT organization_id, membership_id FROM seller_sessions
        WHERE id = $1 AND user_id = $2 AND audience = 'seller'`, [sessionId, userId]));
    if (!discovered) fail('THEME_AUTH_REQUIRED', 401);
    const organizationId = positiveId(discovered.organization_id), membershipId = positiveId(discovered.membership_id);
    const organization = one(await client.query(`/* theme-auth:seller-organization */
        SELECT id, status FROM seller_organizations WHERE id = $1 FOR SHARE`, [organizationId]));
    if (!organization || organization.status !== 'active') fail('THEME_PERMISSION_DENIED');
    // FOR UPDATE also conflicts with the FK key-share of a new theme role row.
    // Therefore a concurrently inserted inactive binding cannot race owner fallback.
    const membership = one(await client.query(`/* theme-auth:seller-membership */
        SELECT id, organization_id, user_id, role_id, status, membership_revision, security_stamp,
               (effective_at <= clock_timestamp()) AS effective
        FROM seller_memberships
        WHERE organization_id = $1 AND id = $2 AND user_id = $3 FOR UPDATE`, [organizationId, membershipId, userId]));
    if (!membership || membership.status !== 'active' || membership.effective !== true) fail('THEME_PERMISSION_DENIED');
    const systemRole = one(await client.query(`/* theme-auth:seller-existing-role */
        SELECT id, organization_id, code, role_kind, is_active FROM seller_roles
        WHERE id = $1 AND (organization_id = $2 OR organization_id IS NULL) FOR SHARE`,
    [positiveId(membership.role_id), organizationId]));
    if (!systemRole || systemRole.is_active !== true) fail('THEME_PERMISSION_DENIED');
    const user = one(await client.query(`/* theme-auth:seller-user */
        SELECT id, auth_enabled FROM users WHERE id = $1 FOR SHARE`, [userId]));
    if (!user || user.auth_enabled !== true) fail('THEME_AUTH_REQUIRED', 401);
    const session = one(await client.query(`/* theme-auth:seller-live-session */
        SELECT id, user_id, organization_id, membership_id, audience, status,
               membership_revision, security_stamp, (expires_at > clock_timestamp()) AS unexpired
        FROM seller_sessions WHERE id = $1 AND user_id = $2 FOR SHARE`, [sessionId, userId]));
    if (!session || session.status !== 'active' || session.audience !== 'seller' || session.unexpired !== true
        || positiveId(session.organization_id) !== organizationId || positiveId(session.membership_id) !== membershipId
        || positiveId(session.membership_revision) !== positiveId(membership.membership_revision)
        || session.security_stamp !== membership.security_stamp) fail('THEME_AUTH_REQUIRED', 401);
    const binding = one(await client.query(`/* theme-auth:seller-theme-role */
        SELECT role, publish_allowed, active, revision FROM theme_seller_roles
        WHERE organization_id = $1 AND membership_id = $2 FOR SHARE`, [organizationId, membershipId]));
    let role, roleRevision, publishAllowed = false;
    if (binding) {
        if (binding.active !== true || !sellerRoles.has(binding.role)) fail('THEME_PERMISSION_DENIED');
        role = binding.role; roleRevision = positiveId(binding.revision); publishAllowed = binding.publish_allowed === true;
    } else {
        if (systemRole.role_kind !== 'system' || systemRole.organization_id !== null || systemRole.code !== 'owner') {
            fail('THEME_PERMISSION_DENIED');
        }
        role = 'seller_owner'; roleRevision = null;
    }
    const scoped = await client.query(`/* theme-auth:seller-store-scopes */
        SELECT store.id AS store_id
        FROM seller_membership_store_scopes scope
        JOIN seller_stores store ON store.organization_id = scope.organization_id AND store.id = scope.store_id
        WHERE scope.organization_id = $1 AND scope.membership_id = $2
          AND scope.scope_kind = 'assigned' AND scope.revoked_at IS NULL
          AND store.status = 'active' AND store.closed_at IS NULL
        ORDER BY store.id FOR SHARE OF scope, store`, [organizationId, membershipId]);
    const storeIds = Object.freeze([...new Set((scoped.rows || []).map(row => positiveId(row.store_id)))]);
    if (service) {
        if (positiveId(service.organization_id) !== organizationId || !storeIds.includes(positiveId(service.store_id))) {
            fail('THEME_RESOURCE_NOT_FOUND', 404);
        }
        if (service.status !== 'ACTIVE') fail('THEME_SERVICE_INACTIVE');
    }
    const granted = [...rolePermissions[role]];
    if (publishAllowed && ['seller_admin', 'seller_editor'].includes(role)) {
        granted.push('publication.request', 'rollback.request');
    }
    return Object.freeze({
        kind: 'seller', userId, sessionId, actorId: `seller:${organizationId}:${membershipId}`,
        organizationId, membershipId, membershipRevision: positiveId(membership.membership_revision),
        storeIds, role, roleRevision, publishAllowed,
        permissions: Object.freeze(granted)
    });
};

const authorize = async (client, principal, permission, service = null) => {
    if (!client || typeof client.query !== 'function') throw new TypeError('Theme authorization requires the caller transaction client.');
    if (!principal || !['admin', 'seller'].includes(principal.kind)) fail('THEME_AUTH_REQUIRED', 401);
    // These values are never accepted from a caller's precomputed authority cache.
    if (['role', 'permissions', 'organizationId', 'membershipId', 'storeIds', 'publishAllowed', 'delegated', 'credentialType']
        .some(key => Object.prototype.hasOwnProperty.call(principal, key))) fail('THEME_AUTH_REQUIRED', 401);
    if (!permissions.includes(permission)) fail('THEME_PERMISSION_DENIED');
    if (principal.kind === 'seller' && !service && !['assignment.read', 'service.read'].includes(permission)) {
        fail('THEME_RESOURCE_NOT_FOUND', 404);
    }
    const actor = principal.kind === 'admin'
        ? await authorizeAdmin(client, principal)
        : await authorizeSeller(client, principal, service);
    if (!actor.permissions.includes(permission)) fail('THEME_PERMISSION_DENIED');
    return actor;
};

module.exports = Object.freeze({ ThemePlatformAuthError, rolePermissions, permissions, principalFromAdmin, principalFromSeller, authorize });
