'use strict';

const crypto = require('node:crypto');
const { SellerPersistenceError, positiveInteger, inTransaction, requireOrganization } = require('./sellerAuthorizationService');
const hash = (value) => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/iu.test(value)) throw new SellerPersistenceError('SELLER_INVITATION_HASH_REQUIRED', 400); return value.toLowerCase(); };
const PURPOSE = 'seller-invitation-v1';
const purposeBoundHash = (token) => {
    if (typeof token !== 'string' || token.length < 16 || token.length > 1024) throw new SellerPersistenceError('SELLER_INVITATION_TOKEN_INVALID', 400);
    return crypto.createHash('sha256').update(`${PURPOSE}\u0000${token}`, 'utf8').digest('hex');
};
const createInvitation = async (database, input) => {
    const organizationId = positiveInteger(input.organizationId); const inviterMembershipId = positiveInteger(input.inviterMembershipId); const roleId = positiveInteger(input.roleId); const emailHash = hash(input.emailHash); const tokenHash = purposeBoundHash(input.token);
    if (!(input.expiresAt instanceof Date) || input.expiresAt <= new Date()) throw new SellerPersistenceError('SELLER_INVITATION_EXPIRY_INVALID', 400);
    return inTransaction(database, async (client) => {
        await requireOrganization(client, organizationId);
        const candidate = await client.query('SELECT id, role_id FROM seller_memberships WHERE organization_id = $1 AND id = $2 AND status = $3', [organizationId, inviterMembershipId, 'active']);
        if (!candidate.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const roleIds = [...new Set([Number(candidate.rows[0].role_id), roleId])].sort((left, right) => left - right);
        const roles = await client.query('SELECT id, organization_id, code, is_assignable, is_active FROM seller_roles WHERE id = ANY($1::bigint[]) AND (organization_id = $2 OR organization_id IS NULL) ORDER BY id ASC FOR UPDATE', [roleIds, organizationId]);
        if (roles.rows?.length !== roleIds.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const roleById = new Map(roles.rows.map((role) => [Number(role.id), role]));
        const inviterRole = roleById.get(Number(candidate.rows[0].role_id));
        const targetRole = roleById.get(roleId);
        if (!inviterRole?.is_active || !targetRole?.is_active || !targetRole.is_assignable || String(targetRole.code).toLowerCase() === 'owner') throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const inviter = await client.query('SELECT id, role_id FROM seller_memberships WHERE organization_id = $1 AND id = $2 AND status = $3 FOR UPDATE', [organizationId, inviterMembershipId, 'active']);
        if (!inviter.rows?.length || Number(inviter.rows[0].role_id) !== Number(inviterRole.id)) throw new SellerPersistenceError('SELLER_PERSISTENCE_RETRYABLE', 503);
        const invitePermission = await client.query('SELECT 1 FROM seller_role_permissions role_permission JOIN seller_permissions permission ON permission.code = role_permission.permission_code AND permission.is_active = TRUE WHERE role_permission.role_id = $1 AND permission.code = $2', [inviterRole.id, 'team.invite']);
        if (!invitePermission.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const result = await client.query('INSERT INTO seller_invitations (organization_id, role_id, invited_by_membership_id, invitee_email_hash, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, organization_id, role_id, status, expires_at, revision', [organizationId, roleId, inviterMembershipId, emailHash, tokenHash, input.expiresAt]);
        return Object.freeze(result.rows[0]);
    });
};
const findPendingByPurposeHash = async (queryable, { organizationId, token, purpose = PURPOSE }) => {
    if (purpose !== PURPOSE) return null;
    const result = await queryable.query("SELECT id, organization_id, role_id, status, expires_at FROM seller_invitations WHERE organization_id = $1 AND token_hash = $2 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP", [positiveInteger(organizationId), purposeBoundHash(token)]);
    return result.rows?.length ? Object.freeze(result.rows[0]) : null;
};
const setInvitationStatus = async (database, input) => {
    const organizationId = positiveInteger(input.organizationId); const invitationId = positiveInteger(input.invitationId); const expectedRevision = positiveInteger(input.expectedRevision);
    if (!['revoked', 'expired'].includes(input.status)) throw new SellerPersistenceError('SELLER_LIFECYCLE_TRANSITION_REJECTED', 400);
    return inTransaction(database, async (client) => {
        await requireOrganization(client, organizationId);
        const result = await client.query('UPDATE seller_invitations SET status = $1::varchar, revision = revision + 1, revoked_at = CASE WHEN $1::varchar = $2::varchar THEN CURRENT_TIMESTAMP ELSE revoked_at END, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $3 AND id = $4 AND status = $5::varchar AND revision = $6 RETURNING id, status, revision', [input.status, 'revoked', organizationId, invitationId, 'pending', expectedRevision]);
        if (!result.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        return Object.freeze(result.rows[0]);
    });
};
module.exports = Object.freeze({ PURPOSE, hash, purposeBoundHash, createInvitation, findPendingByPurposeHash, setInvitationStatus });
