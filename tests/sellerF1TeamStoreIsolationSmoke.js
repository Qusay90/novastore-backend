'use strict';

const assert = require('node:assert/strict');
const { listMembersForStoreScope, SellerTeamReadError } = require('../services/sellerTeamReadService');

;(async () => {
    const calls = [];
    const database = {
        async query(sql, values) {
            calls.push({ sql, values });
            return { rows: [
                { id: 21, role_code: 'owner', status: 'active', display_name: 'Store 31 Owner' },
                { id: 22, role_code: 'operator', status: 'active', display_name: 'Shared Operator' }
            ] };
        }
    };
    const rows = await listMembersForStoreScope(database, { organizationId: 11, storeIds: [31, 31] }, { limit: 50 });
    assert.deepEqual(rows.map((row) => row.id), [21, 22]);
    assert.deepEqual(calls[0].values, [11, [31], 50]);
    assert.match(calls[0].sql, /EXISTS[\s\S]*scope\.organization_id = membership\.organization_id[\s\S]*scope\.membership_id = membership\.id/u);
    assert.match(calls[0].sql, /scope\.scope_kind = 'assigned'[\s\S]*scope\.revoked_at IS NULL[\s\S]*scope\.store_id = ANY\(\$2::bigint\[\]\)/u);
    assert.doesNotMatch(calls[0].sql, /JOIN seller_membership_store_scopes/u, 'EXISTS must avoid duplicates for multi-store overlap');
    await assert.rejects(
        () => listMembersForStoreScope(database, { organizationId: 11, storeIds: [] }, { limit: 50 }),
        (error) => error instanceof SellerTeamReadError && error.code === 'RESOURCE_NOT_FOUND'
    );
    console.log('sellerF1TeamStoreIsolationSmoke: PASS');
})().catch((error) => {
    console.error('sellerF1TeamStoreIsolationSmoke: FAIL');
    console.error(error.stack);
    process.exitCode = 1;
});
