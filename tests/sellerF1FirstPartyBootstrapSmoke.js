'use strict';

const assert = require('node:assert/strict');
const {
    PURPOSE,
    normalizeDecision,
    payloadHash,
    equalHash,
    dryRun
} = require('../services/sellerFirstPartyBootstrapService');

const decision = Object.freeze({
    authorizationPublicId: '00000000-0000-4000-8000-000000000001',
    organizationExternalKey: '00000000-0000-4000-8000-000000000002',
    organizationDisplayName: 'İlk taraf satıcı',
    sellerStoreDisplayName: 'İlk taraf mağaza',
    userId: 1,
    storeId: 2
});

const authorizationRow = Object.freeze({
    id: 1,
    purpose: PURPOSE,
    status: 'pending',
    expires_at: new Date(Date.now() + 60000),
    target_owner_user_id: 1,
    target_legacy_store_id: 2,
    intended_organization_external_key: decision.organizationExternalKey,
    intended_organization_display_name: decision.organizationDisplayName,
    intended_seller_store_display_name: decision.sellerStoreDisplayName,
    decision_payload_sha256: payloadHash(decision),
    revision: 1
});

;(async () => {
    try {
        assert.deepEqual(normalizeDecision(decision), decision);
        assert.equal(equalHash(payloadHash(decision), authorizationRow.decision_payload_sha256), true);
        assert.equal(equalHash(payloadHash(decision), '0'.repeat(64)), false);
        assert.throws(() => normalizeDecision({ ...decision, organizationDisplayName: '' }), /SELLER_PERSISTENCE_INPUT_INVALID/u);

        const missingUser = {
            query: async (sql) => sql.includes('seller_bootstrap_operator_authorizations')
                ? { rows: [authorizationRow] }
                : { rows: [] }
        };
        assert.deepEqual(await dryRun(missingUser, decision), { code: 'BOOTSTRAP_USER_NOT_FOUND', writes: 0 });

        const expired = {
            query: async () => ({ rows: [{ ...authorizationRow, expires_at: new Date(Date.now() - 1) }] })
        };
        await assert.rejects(() => dryRun(expired, decision), (error) => error.code === 'BOOTSTRAP_AUTHORIZATION_DENIED');

        console.log('sellerF1FirstPartyBootstrapSmoke: PASS');
    } catch (error) {
        console.error('sellerF1FirstPartyBootstrapSmoke: FAIL');
        console.error(error.stack);
        process.exitCode = 1;
    }
})();
