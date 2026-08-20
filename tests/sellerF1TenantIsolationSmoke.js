'use strict';

const assert = require('node:assert/strict');
const { loadTenantScopedResource, resolveTenantContext, SellerTenantError } = require('../services/sellerTenantContextService');

;(async () => {
    const context = Object.freeze({ organizationId: 11, membershipId: 21, storeIds: Object.freeze([31]), permissions: Object.freeze(['organization.read']) });
    let observed = null;
    const resource = await loadTenantScopedResource(context, { storeId: 31, loader: async (scope) => { observed = scope; return { id: 'resource-a' }; } });
    assert.equal(resource.id, 'resource-a');
    assert.deepEqual(observed, { organizationId: 11, storeIds: [31], storeId: 31 });
    await assert.rejects(() => loadTenantScopedResource(context, { storeId: 32, loader: async () => ({ id: 'resource-b' }) }), (error) => error instanceof SellerTenantError && error.code === 'RESOURCE_NOT_FOUND');
    await assert.rejects(() => loadTenantScopedResource(context, { storeId: 31, loader: async () => null }), (error) => error.code === 'RESOURCE_NOT_FOUND');
    const statements = [];
    const resolved = await resolveTenantContext({ query: async (sql) => {
        statements.push(sql);
        if (sql.includes('FROM seller_memberships membership')) return { rows: [{ id: 21, organization_id: 11, user_id: 101, role_id: 31, membership_revision: 4, security_stamp: 'stamp-1', membership_status: 'active', organization_status: 'active' }] };
        if (sql.includes('FROM seller_membership_store_scopes scope')) return { rows: [{ store_id: 31 }] };
        if (sql.includes('FROM seller_organizations organization JOIN seller_roles')) return { rows: [{ id: 31, organization_id: null, code: 'manager', name: 'Manager', role_kind: 'system', is_assignable: true, is_active: true }] };
        return { rows: [{ code: 'organization.read' }] };
    } }, { sessionId: 'session-tenant-isolation', organizationId: 11, membershipId: 21, membershipRevision: 4, securityStamp: 'stamp-1' });
    assert.equal(resolved.sessionId, 'session-tenant-isolation');
    assert.deepEqual(resolved.storeIds, [31]);
    assert.match(statements.find((statement) => statement.includes('seller_membership_store_scopes')), /scope\.organization_id = \$1.*scope\.membership_id = \$2.*scope\.scope_kind = 'assigned'.*scope\.revoked_at IS NULL/u);
    console.log('sellerF1TenantIsolationSmoke: PASS');
})().catch((error) => { console.error('sellerF1TenantIsolationSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
