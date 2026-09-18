'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { authorize, rolePermissions, principalFromAdmin, principalFromSeller } = require('../services/themePlatformAuthService');

const sid = '11111111-1111-4111-8111-111111111111';
const stamp = '22222222-2222-4222-8222-222222222222';
const admin = Object.freeze({ kind: 'admin', userId: 9, sessionId: 7 });
const seller = Object.freeze({ kind: 'seller', userId: 12, sessionId: sid });
const service = Object.freeze({ id: '33333333-3333-4333-8333-333333333333', organization_id: 20, store_id: 30, status: 'ACTIVE' });
const denied = code => ({ code });

function fixture(changes = {}) {
    const records = {
        'admin-session': [{ session_id: 7, user_id: 9, principal_type: 'admin', revoked_at: null, unexpired: true, user_role: 'admin', auth_enabled: true }],
        'admin-role': [{ role: 'super_admin', active: true, revision: 1 }],
        'seller-session-scope': [{ organization_id: 20, membership_id: 21 }],
        'seller-organization': [{ id: 20, status: 'active' }],
        'seller-membership': [{ id: 21, organization_id: 20, user_id: 12, role_id: 22, status: 'active', membership_revision: 3, security_stamp: stamp, effective: true }],
        'seller-existing-role': [{ id: 22, organization_id: null, code: 'owner', role_kind: 'system', is_active: true }],
        'seller-user': [{ id: 12, auth_enabled: true }],
        'seller-live-session': [{ id: sid, user_id: 12, organization_id: 20, membership_id: 21, audience: 'seller', status: 'active', membership_revision: 3, security_stamp: stamp, unexpired: true }],
        'seller-theme-role': [],
        'seller-store-scopes': [{ store_id: 30 }],
        ...changes
    };
    const queries = [];
    const client = { async query(sql, params) {
        const tag = sql.match(/theme-auth:([a-z-]+)/u)?.[1];
        assert.ok(tag && Object.prototype.hasOwnProperty.call(records, tag), 'Unexpected query');
        queries.push({ tag, sql, params });
        const selected = records[tag];
        if (selected instanceof Error) throw selected;
        return { rows: structuredClone(selected) };
    } };
    const patch = (tag, values) => { records[tag] = [{ ...records[tag][0], ...values }]; };
    return { client, records, queries, patch };
}

test('admin principal adapter uses verified auth context and never request body authority', () => {
    const req = { auth: { user: { id: 9, principal: 'admin', role: 'admin' }, session: { id: 7, userId: 9, principal: 'admin', revoked: false } }, body: { userId: 99, role: 'super_admin' } };
    assert.deepEqual(principalFromAdmin(req), admin);
    assert.equal(Object.isFrozen(principalFromAdmin(req)), true);
    assert.throws(() => principalFromAdmin({ body: req.body }), denied('THEME_AUTH_REQUIRED'));
    assert.throws(() => principalFromAdmin({ auth: { ...req.auth, session: { ...req.auth.session, userId: 99 } } }), denied('THEME_AUTH_REQUIRED'));
});
test('seller principal adapter requires the existing issuer and audience', () => {
    const req = { sellerPrincipal: { userId: 12, sessionId: sid, issuer: 'novastore-seller-v1', audience: 'seller' }, body: { organizationId: 900, role: 'seller_owner' } };
    assert.deepEqual(principalFromSeller(req), seller);
    for (const changed of [{ issuer: 'stocky' }, { audience: 'rep' }, { sessionId: 'delegated-opaque-credential' }]) {
        assert.throws(() => principalFromSeller({ sellerPrincipal: { ...req.sellerPrincipal, ...changed } }), denied('THEME_AUTH_REQUIRED'));
    }
});
test('authorization refuses cached client roles, scope, delegated credentials and unsafe IDs', async () => {
    for (const changes of [{ role: 'super_admin' }, { permissions: ['catalog.write'] }, { organizationId: 20 }, { membershipId: 21 }, { storeIds: [30] }, { publishAllowed: true }, { delegated: true }, { credentialType: 'rep' }, { kind: 'connector' }, { userId: '9007199254740993' }]) {
        const f = fixture();await assert.rejects(authorize(f.client, { ...seller, ...changes }, 'assignment.read'), denied('THEME_AUTH_REQUIRED'));
        assert.equal(f.queries.length, 0);
    }
});
test('unknown permission denies without querying or granting super admin wildcard', async () => {
    const f = fixture();await assert.rejects(authorize(f.client, admin, 'not-a-permission'), denied('THEME_PERMISSION_DENIED'));assert.equal(f.queries.length, 0);
});
test('a current admin needs an explicit active theme role', async () => {
    for (const rows of [[], [{ role: 'super_admin', active: false, revision: 1 }], [{ role: 'seller_owner', active: true, revision: 1 }]]) {
        await assert.rejects(authorize(fixture({ 'admin-role': rows }).client, admin, 'catalog.read'), denied('THEME_PERMISSION_DENIED'));
    }
});
test('super admin receives the frozen server permission list and stable actor identity', async () => {
    const actor = await authorize(fixture().client, admin, 'service.manage');
    assert.equal(actor.actorId, 'admin:9');assert.equal(actor.role, 'super_admin');assert.equal(actor.roleRevision, 1);
    assert.equal(Object.isFrozen(actor), true);assert.equal(Object.isFrozen(actor.permissions), true);
    assert.deepEqual(actor.permissions, rolePermissions.super_admin);
});
for (const [field, value] of [['principal_type', 'customer'], ['revoked_at', new Date()], ['unexpired', false], ['auth_enabled', false]]) {
    test(`admin live session rejects ${field}`, async () => {
        const f = fixture();f.patch('admin-session', { [field]: value });await assert.rejects(authorize(f.client, admin, 'catalog.read'), denied('THEME_AUTH_REQUIRED'));
    });
}
test('admin current user demotion denies a previously verified token', async () => {
    const f = fixture();f.patch('admin-session', { user_role: 'customer' });await assert.rejects(authorize(f.client, admin, 'catalog.read'), denied('THEME_PERMISSION_DENIED'));
});
test('theme admin can assign but cannot govern service or entitlement state', async () => {
    const f = fixture({ 'admin-role': [{ role: 'theme_admin', active: true, revision: 2 }] });
    assert.equal((await authorize(f.client, admin, 'assignment.manage')).role, 'theme_admin');
    for (const permission of ['service.manage', 'entitlement.manage']) await assert.rejects(authorize(f.client, admin, permission), denied('THEME_PERMISSION_DENIED'));
});
test('support is limited to catalog/service metadata/audit and never draft contents', async () => {
    const f = fixture({ 'admin-role': [{ role: 'support', active: true, revision: 1 }] });
    for (const permission of ['catalog.read', 'service.read', 'audit.read']) assert.equal((await authorize(f.client, admin, permission)).role, 'support');
    for (const permission of ['draft.read', 'draft.edit', 'catalog.write', 'preview.read']) await assert.rejects(authorize(f.client, admin, permission), denied('THEME_PERMISSION_DENIED'));
});
test('only a live system owner may use the absent-binding owner fallback', async () => {
    const actor = await authorize(fixture().client, seller, 'publication.request', service);
    assert.equal(actor.role, 'seller_owner');assert.equal(actor.roleRevision, null);assert.equal(actor.actorId, 'seller:20:21');
    for (const change of [{ code: 'manager' }, { role_kind: 'organization', organization_id: 20 }, { is_active: false }]) {
        const f = fixture();f.patch('seller-existing-role', change);await assert.rejects(authorize(f.client, seller, 'draft.read', service), denied('THEME_PERMISSION_DENIED'));
    }
});
test('an inactive explicit role overrides the owner fallback and denies', async () => {
    const f = fixture({ 'seller-theme-role': [{ role: 'seller_owner', active: false, revision: 2, publish_allowed: true }] });
    await assert.rejects(authorize(f.client, seller, 'draft.read', service), denied('THEME_PERMISSION_DENIED'));
});
test('an explicit viewer binding narrows a system owner and never allows publication', async () => {
    const f = fixture({ 'seller-theme-role': [{ role: 'seller_viewer', active: true, revision: 2, publish_allowed: true }] });
    assert.equal((await authorize(f.client, seller, 'draft.read', service)).role, 'seller_viewer');
    for (const permission of ['draft.edit', 'publication.request', 'rollback.request']) await assert.rejects(authorize(f.client, seller, permission, service), denied('THEME_PERMISSION_DENIED'));
});
test('assignment acceptance requires write authority and denies viewer/support', async () => {
    for (const role of ['super_admin', 'theme_admin', 'support']) {
        const f = fixture({ 'admin-role': [{ role, active: true, revision: 1 }] });
        if (role === 'support') await assert.rejects(authorize(f.client, admin, 'assignment.accept', service), denied('THEME_PERMISSION_DENIED'));
        else assert.equal((await authorize(f.client, admin, 'assignment.accept', service)).role, role);
    }
    for (const role of ['seller_owner', 'seller_admin', 'seller_editor', 'seller_viewer']) {
        const f = fixture({ 'seller-theme-role': [{ role, active: true, revision: 1, publish_allowed: false }] });
        if (role === 'seller_viewer') await assert.rejects(authorize(f.client, seller, 'assignment.accept', service), denied('THEME_PERMISSION_DENIED'));
        else assert.equal((await authorize(f.client, seller, 'assignment.accept', service)).role, role);
        await assert.rejects(authorize(f.client, seller, 'assignment.accept', null), denied('THEME_RESOURCE_NOT_FOUND'));
    }
});
for (const role of ['seller_admin', 'seller_editor']) {
    test(`${role} publication override is explicit, boolean, and limited to publish/rollback`, async () => {
        for (const allowed of [false, 'true', true]) {
            const f = fixture({ 'seller-theme-role': [{ role, active: true, revision: 3, publish_allowed: allowed }] });
            assert.equal((await authorize(f.client, seller, 'draft.edit', service)).role, role);
            if (allowed === true) {
                assert.ok((await authorize(f.client, seller, 'publication.request', service)).permissions.includes('rollback.request'));
            } else await assert.rejects(authorize(f.client, seller, 'publication.request', service), denied('THEME_PERMISSION_DENIED'));
            await assert.rejects(authorize(f.client, seller, 'entitlement.manage', service), denied('THEME_PERMISSION_DENIED'));
        }
    });
}
for (const [tag, changed, code] of [
    ['seller-organization', { status: 'suspended' }, 'THEME_PERMISSION_DENIED'],
    ['seller-membership', { status: 'revoked' }, 'THEME_PERMISSION_DENIED'],
    ['seller-membership', { effective: false }, 'THEME_PERMISSION_DENIED'],
    ['seller-user', { auth_enabled: false }, 'THEME_AUTH_REQUIRED'],
    ['seller-live-session', { status: 'revoked' }, 'THEME_AUTH_REQUIRED'],
    ['seller-live-session', { unexpired: false }, 'THEME_AUTH_REQUIRED'],
    ['seller-live-session', { membership_revision: 2 }, 'THEME_AUTH_REQUIRED'],
    ['seller-live-session', { security_stamp: 'old-stamp' }, 'THEME_AUTH_REQUIRED'],
    ['seller-live-session', { organization_id: 99 }, 'THEME_AUTH_REQUIRED'],
    ['seller-live-session', { membership_id: 99 }, 'THEME_AUTH_REQUIRED'],
    ['seller-live-session', { audience: 'rep' }, 'THEME_AUTH_REQUIRED']
]) test(`seller live authorization rejects ${tag} ${Object.keys(changed)[0]}`, async () => {
    const f = fixture();f.patch(tag, changed);await assert.rejects(authorize(f.client, seller, 'draft.read', service), denied(code));
});
test('foreign organization and unassigned store return indistinguishable not-found', async () => {
    for (const changed of [{ organization_id: 99 }, { store_id: 99 }]) {
        await assert.rejects(authorize(fixture().client, seller, 'draft.read', { ...service, ...changed }), { code: 'THEME_RESOURCE_NOT_FOUND', statusCode: 404 });
    }
});
test('revoked/absent scope denies owned service and inactive service cannot mutate', async () => {
    await assert.rejects(authorize(fixture({ 'seller-store-scopes': [] }).client, seller, 'draft.edit', service), denied('THEME_RESOURCE_NOT_FOUND'));
    await assert.rejects(authorize(fixture().client, seller, 'draft.edit', { ...service, status: 'SUSPENDED' }), denied('THEME_SERVICE_INACTIVE'));
});
test('seller lists return live assigned store IDs but other operations require a service', async () => {
    const f = fixture({ 'seller-store-scopes': [{ store_id: '30' }, { store_id: '31' }] });
    assert.deepEqual((await authorize(f.client, seller, 'assignment.read', null)).storeIds, [30, 31]);
    assert.deepEqual((await authorize(f.client, seller, 'service.read', null)).storeIds, [30, 31]);
    for (const permission of ['draft.read', 'preview.read', 'publication.request', 'audit.read', 'operation.read']) {
        await assert.rejects(authorize(f.client, seller, permission, null), denied('THEME_RESOURCE_NOT_FOUND'));
    }
});
test('retry re-reads server grant and session rather than trusting prior actor', async () => {
    const f = fixture();await authorize(f.client, seller, 'draft.edit', service);
    f.records['seller-theme-role'] = [{ role: 'seller_owner', active: false, revision: 2 }];
    await assert.rejects(authorize(f.client, seller, 'draft.edit', service), denied('THEME_PERMISSION_DENIED'));
});
test('authentication reads are locked on the supplied client and do not own the transaction', async () => {
    const f = fixture();await authorize(f.client, seller, 'draft.edit', service);
    assert.match(f.queries.find(q => q.tag === 'seller-membership').sql, /FOR UPDATE/u);
    for (const tag of ['seller-organization', 'seller-existing-role', 'seller-user', 'seller-live-session', 'seller-theme-role', 'seller-store-scopes']) {
        assert.match(f.queries.find(q => q.tag === tag).sql, /FOR SHARE/u);
    }
    assert.deepEqual(f.queries.find(q => q.tag === 'seller-membership').params, [20, 21, 12]);
    assert.deepEqual(f.queries.find(q => q.tag === 'seller-store-scopes').params, [20, 21]);
    assert.equal(f.queries.some(q => /\b(?:BEGIN|COMMIT|ROLLBACK)\b/u.test(q.sql)), false);
    const a = fixture();await authorize(a.client, admin, 'catalog.read');
    assert.match(a.queries[0].sql, /FOR SHARE OF s, u/u);assert.match(a.queries[1].sql, /FOR SHARE/u);
});
test('database failure propagates without converting unavailable authority into permission', async () => {
    const error = Object.assign(new Error('database unavailable'), { code: '08006' });
    const f = fixture({ 'admin-session': error });await assert.rejects(authorize(f.client, admin, 'catalog.read'), error);
});
