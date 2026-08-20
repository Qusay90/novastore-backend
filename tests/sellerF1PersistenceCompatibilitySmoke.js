'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
try {
    const sources = ['sellerAuthorizationService.js', 'sellerRolePermissionService.js', 'sellerStoreBindingService.js', 'sellerInvitationService.js', 'sellerFirstPartyBootstrapService.js'].map((name) => fs.readFileSync(`services/${name}`, 'utf8')).join('\n');
    assert.doesNotMatch(sources, /server\.js|routes\/|middlewares\/|sellerSessionService|sellerAuditOutboxService|FROM\s+stores[\s\S]{0,120}owner_user_id/u);
    console.log('sellerF1PersistenceCompatibilitySmoke: PASS');
} catch (error) { console.error('sellerF1PersistenceCompatibilitySmoke: FAIL'); console.error(error.stack); process.exitCode = 1; }
