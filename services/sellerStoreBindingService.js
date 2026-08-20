'use strict';

const { SellerPersistenceError, positiveInteger, inTransaction, requireOrganization } = require('./sellerAuthorizationService');
const bindStore = async (database, input) => {
    const organizationId = positiveInteger(input.organizationId); const legacyStoreId = positiveInteger(input.legacyStoreId);
    const displayName = String(input.displayName || '').trim(); if (!displayName) throw new SellerPersistenceError('SELLER_PERSISTENCE_INPUT_INVALID', 400);
    return inTransaction(database, async (client) => {
        const organization = await requireOrganization(client, organizationId);
        if (organization.status !== 'active') throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const legacyStore = await client.query('SELECT id FROM stores WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL FOR UPDATE', [legacyStoreId]);
        if (!legacyStore.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const result = await client.query('INSERT INTO seller_stores (organization_id, legacy_store_id, display_name) VALUES ($1, $2, $3) RETURNING id, organization_id, legacy_store_id, status, revision', [organizationId, legacyStoreId, displayName]);
        return Object.freeze(result.rows[0]);
    });
};
const assignScope = async (database, input) => {
    const organizationId = positiveInteger(input.organizationId); const membershipId = positiveInteger(input.membershipId);
    const scopeKind = input.scopeKind === undefined ? 'assigned' : input.scopeKind;
    if (!['assigned', 'all'].includes(scopeKind)) throw new SellerPersistenceError('SELLER_SCOPE_KIND_REJECTED', 400);
    const storeId = scopeKind === 'assigned' ? positiveInteger(input.storeId) : null;
    return inTransaction(database, async (client) => {
        const organization = await requireOrganization(client, organizationId);
        if (organization.status !== 'active') throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const membership = await client.query('SELECT id FROM seller_memberships WHERE organization_id = $1 AND id = $2 AND status = $3 FOR UPDATE', [organizationId, membershipId, 'active']);
        if (!membership.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const stores = scopeKind === 'all'
            ? await client.query('SELECT id FROM seller_stores WHERE organization_id = $1 AND status = $2 AND closed_at IS NULL ORDER BY id ASC FOR UPDATE', [organizationId, 'active'])
            : await client.query('SELECT id FROM seller_stores WHERE organization_id = $1 AND id = $2 AND status = $3 AND closed_at IS NULL FOR UPDATE', [organizationId, storeId, 'active']);
        if (!stores.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const assignedStoreIds = [];
        for (const store of stores.rows) {
            const existing = await client.query("SELECT membership_id FROM seller_membership_store_scopes WHERE organization_id = $1 AND membership_id = $2 AND store_id = $3 AND scope_kind = 'assigned' AND revoked_at IS NULL FOR UPDATE", [organizationId, membershipId, store.id]);
            if (existing.rows?.length) continue;
            await client.query("INSERT INTO seller_membership_store_scopes (organization_id, membership_id, store_id, scope_kind) VALUES ($1, $2, $3, 'assigned')", [organizationId, membershipId, store.id]);
            assignedStoreIds.push(Number(store.id));
        }
        if (assignedStoreIds.length) {
            await client.query('UPDATE seller_memberships SET membership_revision = membership_revision + 1, security_stamp = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3', [require('node:crypto').randomUUID(), organizationId, membershipId]);
        }
        return Object.freeze({
            organizationId,
            membershipId,
            scopeKind: 'assigned',
            allStoresExpanded: scopeKind === 'all',
            assignedStoreIds: Object.freeze(assignedStoreIds)
        });
    });
};
const revokeScope = async (database, input) => {
    const organizationId = positiveInteger(input.organizationId); const membershipId = positiveInteger(input.membershipId); const storeId = positiveInteger(input.storeId);
    return inTransaction(database, async (client) => {
        await requireOrganization(client, organizationId);
        const membership = await client.query('SELECT id FROM seller_memberships WHERE organization_id = $1 AND id = $2 AND status = $3 FOR UPDATE', [organizationId, membershipId, 'active']);
        if (!membership.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const store = await client.query('SELECT id FROM seller_stores WHERE organization_id = $1 AND id = $2 FOR UPDATE', [organizationId, storeId]);
        if (!store.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const result = await client.query('UPDATE seller_membership_store_scopes SET revoked_at = CURRENT_TIMESTAMP WHERE organization_id = $1 AND membership_id = $2 AND store_id = $3 AND revoked_at IS NULL RETURNING organization_id, membership_id, store_id, revoked_at', [organizationId, membershipId, storeId]);
        if (!result.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        await client.query('UPDATE seller_memberships SET membership_revision = membership_revision + 1, security_stamp = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3', [require('node:crypto').randomUUID(), organizationId, membershipId]);
        return Object.freeze(result.rows[0]);
    });
};
const replaceScopes = async (database, input) => {
    const organizationId = positiveInteger(input.organizationId);
    const membershipId = positiveInteger(input.membershipId);
    const scopeKind = input.scopeKind === undefined ? 'assigned' : input.scopeKind;
    if (!['assigned', 'all'].includes(scopeKind)) throw new SellerPersistenceError('SELLER_SCOPE_KIND_REJECTED', 400);
    const requestedStoreIds = scopeKind === 'all'
        ? null
        : [...new Set((Array.isArray(input.storeIds) ? input.storeIds : []).map((value) => positiveInteger(value)))].sort((left, right) => left - right);
    if (scopeKind === 'assigned' && requestedStoreIds.length === 0) throw new SellerPersistenceError('SELLER_PERSISTENCE_INPUT_INVALID', 400);
    return inTransaction(database, async (client) => {
        const organization = await requireOrganization(client, organizationId);
        if (organization.status !== 'active') throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const membership = await client.query('SELECT id FROM seller_memberships WHERE organization_id = $1 AND id = $2 AND status = $3 FOR UPDATE', [organizationId, membershipId, 'active']);
        if (!membership.rows?.length) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const stores = scopeKind === 'all'
            ? await client.query('SELECT id FROM seller_stores WHERE organization_id = $1 AND status = $2 AND closed_at IS NULL ORDER BY id ASC FOR UPDATE', [organizationId, 'active'])
            : await client.query('SELECT id FROM seller_stores WHERE organization_id = $1 AND id = ANY($2::bigint[]) AND status = $3 AND closed_at IS NULL ORDER BY id ASC FOR UPDATE', [organizationId, requestedStoreIds, 'active']);
        if (!stores.rows?.length || (requestedStoreIds && stores.rows.length !== requestedStoreIds.length)) throw new SellerPersistenceError('RESOURCE_NOT_FOUND', 404);
        const targetStoreIds = stores.rows.map((store) => Number(store.id));
        const targetSet = new Set(targetStoreIds);
        const existing = await client.query("SELECT store_id FROM seller_membership_store_scopes WHERE organization_id = $1 AND membership_id = $2 AND scope_kind = 'assigned' AND revoked_at IS NULL ORDER BY store_id ASC FOR UPDATE", [organizationId, membershipId]);
        const existingSet = new Set(existing.rows.map((scope) => Number(scope.store_id)));
        const revokedStoreIds = [];
        for (const scope of existing.rows) {
            const storeId = Number(scope.store_id);
            if (targetSet.has(storeId)) continue;
            await client.query('UPDATE seller_membership_store_scopes SET revoked_at = CURRENT_TIMESTAMP WHERE organization_id = $1 AND membership_id = $2 AND store_id = $3 AND revoked_at IS NULL', [organizationId, membershipId, scope.store_id]);
            revokedStoreIds.push(storeId);
        }
        const assignedStoreIds = [];
        for (const storeId of targetStoreIds) {
            if (existingSet.has(storeId)) continue;
            await client.query("INSERT INTO seller_membership_store_scopes (organization_id, membership_id, store_id, scope_kind) VALUES ($1, $2, $3, 'assigned')", [organizationId, membershipId, storeId]);
            assignedStoreIds.push(storeId);
        }
        if (revokedStoreIds.length || assignedStoreIds.length) {
            await client.query('UPDATE seller_memberships SET membership_revision = membership_revision + 1, security_stamp = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3', [require('node:crypto').randomUUID(), organizationId, membershipId]);
        }
        return Object.freeze({
            organizationId,
            membershipId,
            scopeKind: 'assigned',
            allStoresExpanded: scopeKind === 'all',
            assignedStoreIds: Object.freeze(assignedStoreIds),
            revokedStoreIds: Object.freeze(revokedStoreIds)
        });
    });
};
module.exports = Object.freeze({ bindStore, assignScope, revokeScope, replaceScopes });
