'use strict';
const assert = require('node:assert/strict');
const { positiveInteger, uuid, mapDatabaseError, SellerPersistenceError } = require('../services/sellerAuthorizationService');
try {
    assert.equal(positiveInteger('42'), 42);
    assert.throws(() => positiveInteger('1.2'), SellerPersistenceError);
    assert.equal(uuid('00000000-0000-4000-8000-000000000001'), '00000000-0000-4000-8000-000000000001');
    assert.equal(mapDatabaseError({ code: '40001' }).code, 'SELLER_PERSISTENCE_RETRYABLE');
    assert.equal(mapDatabaseError({ code: '23505' }).code, 'SELLER_PERSISTENCE_CONFLICT');
    console.log('sellerF1OrganizationMembershipPolicySmoke: PASS');
} catch (error) { console.error('sellerF1OrganizationMembershipPolicySmoke: FAIL'); console.error(error.stack); process.exitCode = 1; }
