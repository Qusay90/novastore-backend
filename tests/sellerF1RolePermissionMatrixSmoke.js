'use strict';
const assert = require('node:assert/strict');
const { knownPermission } = require('../services/sellerRolePermissionService');
try {
    assert.equal(knownPermission('team.read'), true);
    assert.equal(knownPermission('platform.catalog.manage'), false);
    assert.equal(knownPermission(''), false);
    console.log('sellerF1RolePermissionMatrixSmoke: PASS');
} catch (error) { console.error('sellerF1RolePermissionMatrixSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; }
