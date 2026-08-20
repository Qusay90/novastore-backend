'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
try {
    const source = fs.readFileSync(require.resolve('../services/sellerStoreBindingService'), 'utf8');
    assert.match(source, /organization_id = \$1 AND membership_id = \$2 AND store_id = \$3/u);
    assert.doesNotMatch(source, /owner_user_id|wildcard|all-store/u);
    console.log('sellerF1MembershipStoreScopeSmoke: PASS');
} catch (error) { console.error('sellerF1MembershipStoreScopeSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; }
