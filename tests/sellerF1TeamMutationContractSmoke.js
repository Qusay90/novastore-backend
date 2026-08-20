'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

;(async () => {
    const source = fs.readFileSync('routes/sellerContextRoutes.js', 'utf8');
    assert.match(source, /router\.get\('\/context'/u);
    assert.match(source, /router\.get\('\/organizations\/current'/u);
    assert.match(source, /router\.get\('\/team\/roles'/u);
    assert.match(source, /router\.get\('\/team\/members'/u);
    assert.doesNotMatch(source, /router\.(?:post|patch|put|delete)\(/u);
    assert.doesNotMatch(source, /invitations|\/api\/admin/u);
    console.log('sellerF1TeamMutationContractSmoke: PASS');
})().catch((error) => { console.error('sellerF1TeamMutationContractSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
