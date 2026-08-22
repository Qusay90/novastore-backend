'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { createSellerAccessTokenService } = require('../services/sellerAccessTokenService');
const { issueSellerSession } = require('../services/sellerSessionService');

const connectionString = String(process.env.MAIN6V_TEST_DATABASE_URL || '').trim();
const baseUrl = String(process.env.MAIN6V_SERVER_BASE_URL || '').trim();
const secret = String(process.env.MAIN6V_SELLER_ACCESS_TOKEN_SECRET || '');
assert(connectionString && baseUrl && secret.length >= 32, 'Main-6V Seller HTTP fixture configuration is required.');
const parsedDatabase = new URL(connectionString);
const parsedBase = new URL(baseUrl);
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(parsedDatabase.hostname));
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(parsedBase.hostname));
assert.equal(decodeURIComponent(parsedDatabase.pathname.replace(/^\/+/, '')), 'novastore_main6v_test');

const pool = new Pool({ connectionString, application_name: 'novastore_main6v_seller_preview_http_test' });
const tokenService = createSellerAccessTokenService({ secret });

const issue = async ({ userId, organizationId, membershipId, membershipRevision, securityStamp }) => {
    const issued = await issueSellerSession(pool, {
        userId,
        organizationId,
        membershipId,
        membershipRevision,
        securityStamp,
        refreshCredential: `main6v-refresh-${crypto.randomUUID()}`,
        sessionId: crypto.randomUUID(),
        familyId: crypto.randomUUID(),
        tokenId: crypto.randomUUID()
    });
    return Object.freeze({
        sessionId: issued.sessionId,
        token: tokenService.issue({ sessionId: issued.sessionId, userId })
    });
};

const getJson = async (path, token = null) => {
    assert.ok(path.startsWith('/') && !path.includes('token='), 'Seller token must never enter the URL.');
    const response = await fetch(`${baseUrl}${path}`, {
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
    return Object.freeze({ status: response.status, body: await response.json() });
};

const run = async () => {
    const fixture = await pool.query(
        `SELECT organization.id AS organization_id, membership.id AS membership_id,
                membership.membership_revision, membership.security_stamp,
                seller_store.id AS seller_store_id
           FROM seller_organizations organization
     INNER JOIN seller_memberships membership
             ON membership.organization_id = organization.id
            AND membership.user_id = 96101
     INNER JOIN seller_membership_store_scopes scope
             ON scope.organization_id = organization.id
            AND scope.membership_id = membership.id
            AND scope.revoked_at IS NULL
     INNER JOIN seller_stores seller_store
             ON seller_store.organization_id = organization.id
            AND seller_store.id = scope.store_id
          WHERE organization.external_key = '96000000-0000-4000-8000-000000000001'`
    );
    assert.equal(fixture.rows.length, 1);
    const owner = fixture.rows[0];
    const foreign = await pool.query(
        `SELECT seller_store.id
           FROM seller_stores seller_store
     INNER JOIN seller_organizations organization ON organization.id = seller_store.organization_id
          WHERE organization.external_key = '96000000-0000-4000-8000-000000000002'`
    );
    const ownerSession = await issue({
        userId: 96101,
        organizationId: Number(owner.organization_id),
        membershipId: Number(owner.membership_id),
        membershipRevision: Number(owner.membership_revision),
        securityStamp: owner.security_stamp
    });
    const publicStore = await getJson('/api/public/stores/main6v-nova-teknoloji');
    const ownPreview = await getJson(`/api/seller/v1/stores/${owner.seller_store_id}/public-preview`, ownerSession.token);
    assert.equal(publicStore.status, 200);
    assert.equal(ownPreview.status, 200);
    assert.deepEqual(ownPreview.body, publicStore.body, 'Seller own preview HTTP response must equal the public DTO');

    const crossTenant = await getJson(`/api/seller/v1/stores/${foreign.rows[0].id}/public-preview`, ownerSession.token);
    assert.equal(crossTenant.status, 404);
    assert.deepEqual(crossTenant.body, { code: 'RESOURCE_NOT_FOUND', error: 'RESOURCE_NOT_FOUND' });
    const invalidStore = await getJson('/api/seller/v1/stores/999999/public-preview', ownerSession.token);
    assert.equal(invalidStore.status, 404);
    assert.deepEqual(invalidStore.body, { code: 'RESOURCE_NOT_FOUND', error: 'RESOURCE_NOT_FOUND' });
    const noSession = await getJson(`/api/seller/v1/stores/${owner.seller_store_id}/public-preview`);
    assert.equal(noSession.status, 401);
    assert.deepEqual(noSession.body, { code: 'AUTH_REQUIRED', error: 'AUTH_REQUIRED' });

    await pool.query("INSERT INTO users (id, full_name, email, password) VALUES (96104, 'Main6V No Permission', 'main6v-no-permission@local.invalid', 'not-used') ON CONFLICT (id) DO NOTHING");
    let role = await pool.query(
        "SELECT id FROM seller_roles WHERE organization_id = $1 AND LOWER(code) = 'main6v_no_store_read'",
        [Number(owner.organization_id)]
    );
    if (role.rows.length === 0) {
        role = await pool.query(
            `INSERT INTO seller_roles (organization_id, code, name, role_kind, is_assignable)
             VALUES ($1, 'main6v_no_store_read', 'Main6V no store read', 'organization', TRUE)
             RETURNING id`,
            [Number(owner.organization_id)]
        );
    }
    let membership = await pool.query(
        'SELECT id, membership_revision, security_stamp FROM seller_memberships WHERE organization_id = $1 AND user_id = 96104 AND status = $2',
        [Number(owner.organization_id), 'active']
    );
    if (membership.rows.length === 0) {
        membership = await pool.query(
            `INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp)
             VALUES ($1, 96104, $2, '96000000-0000-4000-8000-000000000014')
             RETURNING id, membership_revision, security_stamp`,
            [Number(owner.organization_id), Number(role.rows[0].id)]
        );
    }
    await pool.query(
        `INSERT INTO seller_membership_store_scopes (membership_id, organization_id, store_id)
         SELECT $1, $2, $3
         WHERE NOT EXISTS (
            SELECT 1 FROM seller_membership_store_scopes
             WHERE membership_id = $1 AND organization_id = $2 AND store_id = $3 AND revoked_at IS NULL
         )`,
        [Number(membership.rows[0].id), Number(owner.organization_id), Number(owner.seller_store_id)]
    );
    const deniedSession = await issue({
        userId: 96104,
        organizationId: Number(owner.organization_id),
        membershipId: Number(membership.rows[0].id),
        membershipRevision: Number(membership.rows[0].membership_revision),
        securityStamp: membership.rows[0].security_stamp
    });
    const denied = await getJson(`/api/seller/v1/stores/${owner.seller_store_id}/public-preview`, deniedSession.token);
    assert.equal(denied.status, 403);
    assert.deepEqual(denied.body, { code: 'PERMISSION_DENIED', error: 'PERMISSION_DENIED' });

    const expiredSession = await issue({
        userId: 96104,
        organizationId: Number(owner.organization_id),
        membershipId: Number(membership.rows[0].id),
        membershipRevision: Number(membership.rows[0].membership_revision),
        securityStamp: membership.rows[0].security_stamp
    });
    await pool.query(
        "UPDATE seller_sessions SET issued_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes', expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id = $1",
        [expiredSession.sessionId]
    );
    const expired = await getJson(`/api/seller/v1/stores/${owner.seller_store_id}/public-preview`, expiredSession.token);
    assert.equal(expired.status, 401);
    assert.deepEqual(expired.body, { code: 'SESSION_EXPIRED', error: 'SESSION_EXPIRED' });

    console.log(`public store Seller preview HTTP PASS: own=200 crossTenant=404 denied=403 expired=401 storeId=${owner.seller_store_id}`);
};

run().finally(async () => {
    await pool.end().catch(() => {});
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
