'use strict';

const crypto = require('node:crypto');
const {
    SellerPersistenceError,
    positiveInteger,
    uuid,
    inTransaction
} = require('./sellerAuthorizationService');

const PURPOSE = 'FIRST_PARTY_SELLER_BOOTSTRAP';
const OWNER_ROLE_CODE = 'owner';

const nonEmptyText = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || normalized.length > 160) {
        throw new SellerPersistenceError('SELLER_PERSISTENCE_INPUT_INVALID', 400);
    }
    return normalized;
};

const normalizeDecision = (input) => Object.freeze({
    authorizationPublicId: uuid(input.authorizationPublicId),
    organizationExternalKey: uuid(input.organizationExternalKey),
    organizationDisplayName: nonEmptyText(input.organizationDisplayName),
    sellerStoreDisplayName: nonEmptyText(input.sellerStoreDisplayName),
    userId: positiveInteger(input.userId),
    storeId: positiveInteger(input.storeId)
});

const payloadHash = (decision) => crypto.createHash('sha256').update(JSON.stringify({
    organizationDisplayName: decision.organizationDisplayName,
    organizationExternalKey: decision.organizationExternalKey,
    sellerStoreDisplayName: decision.sellerStoreDisplayName,
    storeId: decision.storeId,
    userId: decision.userId
})).digest('hex');

const equalHash = (left, right) => {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const denyAuthorization = () => {
    throw new SellerPersistenceError('BOOTSTRAP_AUTHORIZATION_DENIED', 404);
};

const loadAuthorization = async (client, decision, lock = '') => {
    const result = await client.query(
        `SELECT id, purpose, target_owner_user_id, target_legacy_store_id,
                intended_organization_external_key, intended_organization_display_name,
                intended_seller_store_display_name, decision_payload_sha256, status,
                revision, expires_at
           FROM seller_bootstrap_operator_authorizations
          WHERE public_id = $1 AND purpose = $2 ${lock}`,
        [decision.authorizationPublicId, PURPOSE]
    );
    if (!result.rows?.length) denyAuthorization();
    const row = result.rows[0];
    if (
        row.status !== 'pending' ||
        new Date(row.expires_at).getTime() <= Date.now() ||
        Number(row.target_owner_user_id) !== decision.userId ||
        Number(row.target_legacy_store_id) !== decision.storeId ||
        String(row.intended_organization_external_key).toLowerCase() !== decision.organizationExternalKey ||
        String(row.intended_organization_display_name) !== decision.organizationDisplayName ||
        String(row.intended_seller_store_display_name) !== decision.sellerStoreDisplayName ||
        !equalHash(row.decision_payload_sha256, payloadHash(decision))
    ) denyAuthorization();
    return row;
};

const requireSelectedUser = async (client, decision, lock = '') => {
    const user = await client.query(`SELECT id FROM users WHERE id = $1 ${lock}`, [decision.userId]);
    return user.rows?.length ? null : 'BOOTSTRAP_USER_NOT_FOUND';
};

const requireSelectedStore = async (client, decision, lock = '') => {
    const store = await client.query(
        `SELECT id FROM stores WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL ${lock}`,
        [decision.storeId]
    );
    return store.rows?.length ? null : 'BOOTSTRAP_STORE_NOT_FOUND';
};

const requireSelectedBaseRows = async (client, decision, lock = '') => {
    const user = await requireSelectedUser(client, decision, lock);
    return user || requireSelectedStore(client, decision, lock);
};

const selectCurrentState = async (client, decision, lock = '') => {
    const organization = await client.query(
        `SELECT id, external_key, display_name, status
           FROM seller_organizations WHERE external_key = $1 ${lock}`,
        [decision.organizationExternalKey]
    );
    if (!organization.rows?.length) return Object.freeze({ code: 'BOOTSTRAP_READY' });
    const organizationRow = organization.rows[0];
    if (organizationRow.status !== 'active' || organizationRow.display_name !== decision.organizationDisplayName) {
        return Object.freeze({ code: 'BOOTSTRAP_PARTIAL_STATE_CONFLICT' });
    }
    const binding = await client.query(
        `SELECT id, organization_id, legacy_store_id, display_name, status, closed_at
           FROM seller_stores
          WHERE legacy_store_id = $1 AND closed_at IS NULL ${lock}`,
        [decision.storeId]
    );
    if (binding.rows?.length && (
        Number(binding.rows[0].organization_id) !== Number(organizationRow.id) ||
        binding.rows[0].status !== 'active' ||
        binding.rows[0].closed_at !== null ||
        binding.rows[0].display_name !== decision.sellerStoreDisplayName
    )) return Object.freeze({ code: 'BOOTSTRAP_PARTIAL_STATE_CONFLICT' });
    const ownerRole = await client.query(
        `SELECT id FROM seller_roles
          WHERE organization_id IS NULL AND code = $1 AND is_active = TRUE ${lock}`,
        [OWNER_ROLE_CODE]
    );
    if (!ownerRole.rows?.length) return Object.freeze({ code: 'BOOTSTRAP_PARTIAL_STATE_CONFLICT' });
    const membership = await client.query(
        `SELECT id, role_id, status FROM seller_memberships
          WHERE organization_id = $1 AND user_id = $2
            AND status IN ('active', 'suspended') ${lock}`,
        [organizationRow.id, decision.userId]
    );
    if (membership.rows?.length && (
        membership.rows[0].status !== 'active' ||
        Number(membership.rows[0].role_id) !== Number(ownerRole.rows[0].id)
    )) return Object.freeze({ code: 'BOOTSTRAP_PARTIAL_STATE_CONFLICT' });
    if (binding.rows?.length && membership.rows?.length) {
        const scope = await client.query(
            `SELECT membership_id FROM seller_membership_store_scopes
              WHERE organization_id = $1 AND membership_id = $2 AND store_id = $3
                AND scope_kind = 'assigned' AND revoked_at IS NULL ${lock}`,
            [organizationRow.id, membership.rows[0].id, binding.rows[0].id]
        );
        if (scope.rows?.length) return Object.freeze({
            code: 'BOOTSTRAP_NO_CHANGE',
            organizationId: organizationRow.id,
            membershipId: membership.rows[0].id,
            sellerStoreId: binding.rows[0].id,
            ownerRoleId: ownerRole.rows[0].id
        });
    }
    return Object.freeze({
        code: 'BOOTSTRAP_RECONCILE',
        organizationId: organizationRow.id,
        membershipId: membership.rows?.[0]?.id || null,
        sellerStoreId: binding.rows?.[0]?.id || null,
        ownerRoleId: ownerRole.rows[0].id
    });
};

const dryRun = async (queryable, input) => {
    const decision = normalizeDecision(input);
    const authorization = await loadAuthorization(queryable, decision);
    const missing = await requireSelectedBaseRows(queryable, decision);
    if (missing) return Object.freeze({ code: missing, writes: 0 });
    const state = await selectCurrentState(queryable, decision);
    return Object.freeze({ ...state, writes: 0, authorizationId: authorization.id });
};

const ensureOrganization = async (client, decision) => {
    const existing = await client.query(
        'SELECT id, display_name, status FROM seller_organizations WHERE external_key = $1 FOR UPDATE',
        [decision.organizationExternalKey]
    );
    if (existing.rows?.length) {
        const row = existing.rows[0];
        if (row.status !== 'active' || row.display_name !== decision.organizationDisplayName) {
            throw new SellerPersistenceError('BOOTSTRAP_PARTIAL_STATE_CONFLICT');
        }
        return row;
    }
    const inserted = await client.query(
        'INSERT INTO seller_organizations (external_key, display_name) VALUES ($1, $2) RETURNING id, display_name, status',
        [decision.organizationExternalKey, decision.organizationDisplayName]
    );
    return inserted.rows[0];
};

const ensureOwnerRole = async (client) => {
    const result = await client.query(
        "SELECT id FROM seller_roles WHERE organization_id IS NULL AND code = $1 AND is_active = TRUE FOR UPDATE",
        [OWNER_ROLE_CODE]
    );
    if (!result.rows?.length) throw new SellerPersistenceError('BOOTSTRAP_PARTIAL_STATE_CONFLICT');
    return result.rows[0];
};

const ensureBinding = async (client, organizationId, decision) => {
    const existing = await client.query(
        'SELECT id, organization_id, display_name, status, closed_at FROM seller_stores WHERE legacy_store_id = $1 AND closed_at IS NULL FOR UPDATE',
        [decision.storeId]
    );
    if (existing.rows?.length) {
        const row = existing.rows[0];
        if (Number(row.organization_id) !== Number(organizationId) || row.status !== 'active' || row.closed_at !== null || row.display_name !== decision.sellerStoreDisplayName) {
            throw new SellerPersistenceError('BOOTSTRAP_PARTIAL_STATE_CONFLICT');
        }
        return row;
    }
    const inserted = await client.query(
        'INSERT INTO seller_stores (organization_id, legacy_store_id, display_name) VALUES ($1, $2, $3) RETURNING id, status, closed_at, display_name',
        [organizationId, decision.storeId, decision.sellerStoreDisplayName]
    );
    return inserted.rows[0];
};

const ensureOwnerMembership = async (client, organizationId, ownerRoleId, decision) => {
    const existing = await client.query(
        "SELECT id, role_id, status FROM seller_memberships WHERE organization_id = $1 AND user_id = $2 AND status IN ('active', 'suspended') FOR UPDATE",
        [organizationId, decision.userId]
    );
    if (existing.rows?.length) {
        const row = existing.rows[0];
        if (row.status !== 'active' || Number(row.role_id) !== Number(ownerRoleId)) {
            throw new SellerPersistenceError('BOOTSTRAP_PARTIAL_STATE_CONFLICT');
        }
        return row;
    }
    const inserted = await client.query(
        'INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp) VALUES ($1, $2, $3, $4) RETURNING id, role_id, status',
        [organizationId, decision.userId, ownerRoleId, crypto.randomUUID()]
    );
    return inserted.rows[0];
};

const ensureScope = async (client, organizationId, membershipId, sellerStoreId) => {
    const scope = await client.query(
        "SELECT membership_id FROM seller_membership_store_scopes WHERE organization_id = $1 AND membership_id = $2 AND store_id = $3 AND scope_kind = 'assigned' AND revoked_at IS NULL FOR UPDATE",
        [organizationId, membershipId, sellerStoreId]
    );
    if (scope.rows?.length) return false;
    await client.query(
        "INSERT INTO seller_membership_store_scopes (organization_id, membership_id, store_id, scope_kind) VALUES ($1, $2, $3, 'assigned')",
        [organizationId, membershipId, sellerStoreId]
    );
    await client.query(
        'UPDATE seller_memberships SET membership_revision = membership_revision + 1, security_stamp = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3',
        [crypto.randomUUID(), organizationId, membershipId]
    );
    return true;
};

const consumeAuthorization = async (client, authorization) => {
    const result = await client.query(
        "UPDATE seller_bootstrap_operator_authorizations SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending' AND revision = $2 AND expires_at > CURRENT_TIMESTAMP RETURNING id",
        [authorization.id, authorization.revision]
    );
    if (!result.rows?.length) denyAuthorization();
};

const expireAuthorization = async (database, authorizationPublicId) => inTransaction(database, async (client) => {
    const publicId = uuid(authorizationPublicId);
    const result = await client.query(
        "UPDATE seller_bootstrap_operator_authorizations SET status = 'expired', revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE public_id = $1 AND purpose = $2 AND status = 'pending' AND expires_at <= CURRENT_TIMESTAMP RETURNING id",
        [publicId, PURPOSE]
    );
    if (!result.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
    return Object.freeze({ code: 'BOOTSTRAP_AUTHORIZATION_EXPIRED', authorizationPublicId: publicId });
});

const apply = async (database, input) => inTransaction(database, async (client) => {
    const decision = normalizeDecision(input);
    const authorization = await loadAuthorization(client, decision, 'FOR UPDATE');
    const organization = await ensureOrganization(client, decision);
    const ownerRole = await ensureOwnerRole(client);
    const missingUser = await requireSelectedUser(client, decision, 'FOR UPDATE');
    if (missingUser) throw new SellerPersistenceError(missingUser, 409);
    const membership = await ensureOwnerMembership(client, organization.id, ownerRole.id, decision);
    const missingStore = await requireSelectedStore(client, decision, 'FOR UPDATE');
    if (missingStore) throw new SellerPersistenceError(missingStore, 409);
    const sellerStore = await ensureBinding(client, organization.id, decision);
    const wroteScope = await ensureScope(client, organization.id, membership.id, sellerStore.id);
    await consumeAuthorization(client, authorization);
    return Object.freeze({
        code: wroteScope ? 'BOOTSTRAP_APPLIED' : 'BOOTSTRAP_NO_CHANGE',
        authorizationPublicId: decision.authorizationPublicId,
        organizationId: organization.id,
        membershipId: membership.id,
        sellerStoreId: sellerStore.id
    });
});

module.exports = Object.freeze({
    PURPOSE,
    normalizeDecision,
    payloadHash,
    equalHash,
    loadAuthorization,
    dryRun,
    apply,
    expireAuthorization
});
