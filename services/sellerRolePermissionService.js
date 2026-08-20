'use strict';

const { SellerPersistenceError, positiveInteger } = require('./sellerAuthorizationService');
const knownPermission = (value) => typeof value === 'string' && value.length > 0 && !value.startsWith('platform.');
const readRole = async (queryable, { organizationId, roleId }) => {
    const org = positiveInteger(organizationId);
    const role = positiveInteger(roleId);
    const result = await queryable.query('SELECT role.id, role.organization_id, role.code, role.name, role.role_kind, role.is_assignable, role.is_active FROM seller_organizations organization JOIN seller_roles role ON role.id = $1 AND (role.organization_id = organization.id OR role.organization_id IS NULL) WHERE organization.id = $2 AND organization.status = $3', [role, org, 'active']);
    if (!result.rows?.length || result.rows[0].is_active !== true) return null;
    return Object.freeze({ ...result.rows[0], id: positiveInteger(Number(result.rows[0].id)), invitationAssignable: result.rows[0].is_assignable === true && String(result.rows[0].code).toLowerCase() !== 'owner' });
};
const listPermissions = async (queryable, { organizationId, roleId }) => {
    const role = await readRole(queryable, { organizationId, roleId });
    if (!role) return Object.freeze([]);
    const result = await queryable.query('SELECT permission.code FROM seller_role_permissions role_permission JOIN seller_permissions permission ON permission.code = role_permission.permission_code AND permission.is_active = TRUE WHERE role_permission.role_id = $1 ORDER BY permission.code ASC', [role.id]);
    return Object.freeze((result.rows || []).map((row) => row.code).filter(knownPermission));
};
const hasPermission = async (queryable, input) => {
    if (!knownPermission(input.permission)) return false;
    return (await listPermissions(queryable, input)).includes(input.permission);
};
const assertInvitationRole = async (queryable, input) => {
    const role = await readRole(queryable, input);
    if (!role || !role.invitationAssignable) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
    return role;
};
module.exports = Object.freeze({ knownPermission, readRole, listPermissions, hasPermission, assertInvitationRole });
