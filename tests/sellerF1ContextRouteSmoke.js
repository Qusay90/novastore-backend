'use strict';

const assert = require('node:assert/strict');
const { createSellerContextRouter, SELLER_CONTEXT_READ_PATHS } = require('../routes/sellerContextRoutes');
const { createSellerContextController } = require('../controllers/sellerContextController');

const response = () => ({ statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

;(async () => {
    assert.deepEqual(SELLER_CONTEXT_READ_PATHS, ['/context', '/organizations/current', '/team/roles', '/team/members']);
    const disabled = createSellerContextRouter();
    const blocked = response();
    disabled.stack[0].handle({}, blocked, () => assert.fail('disabled route must fail closed'));
    assert.deepEqual(blocked.body, { code: 'CAPABILITY_DISABLED', error: 'CAPABILITY_DISABLED' });
    const controller = createSellerContextController({ readOrganization: async () => ({ id: 11, display_name: 'Org A', status: 'active', legal_name: 'must-not-return' }), listRoles: async () => [{ id: 1, code: 'manager', name: 'Manager', invitationAssignable: true }], listMembers: async () => [{ id: 21, role_code: 'manager', status: 'active', display_name: 'Ada', email: 'must-not-return@example.test' }] });
    const contextResponse = response();
    await controller.getContext({ sellerContext: { storeIds: [31, 32] } }, contextResponse);
    assert.equal(contextResponse.body.selection_required, true);
    assert.equal('legal_name' in contextResponse.body.organization, false);
    const membersResponse = response();
    await controller.getTeamMembers({ sellerContext: { storeIds: [] }, query: { limit: '999' } }, membersResponse);
    assert.equal(membersResponse.body.members[0].email, undefined);
    console.log('sellerF1ContextRouteSmoke: PASS');
})().catch((error) => { console.error('sellerF1ContextRouteSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
