'use strict';

// Invoked only by the disposable PostgreSQL harness; never accepts a DB URL.
const assert = require('node:assert/strict');
const { authorize } = require('../services/themePlatformAuthService');

module.exports = async function themePlatformAuthIntegrationExtra({ pool, fixtures }) {
    const database = (await pool.query('SELECT current_database() AS name')).rows[0].name;
    assert(/^novastore_theme_wave1_[a-f0-9]{16}_test$/u.test(database), 'Fresh disposable database required');
    const { a, serviceA } = fixtures;
    const principal = Object.freeze({ kind: 'seller', userId: a.userId, sessionId: a.sessionId });
    const memberScope = [a.store.org, a.membershipId];
    const originalRole = (await pool.query('SELECT * FROM theme_seller_roles WHERE organization_id=$1 AND membership_id=$2', memberScope)).rows[0];
    const originalSession = (await pool.query('SELECT status,revoked_at,updated_at FROM seller_sessions WHERE id=$1', [a.sessionId])).rows[0];
    assert.equal(originalSession.status, 'active');
    let checks = 0;

    const freshAuthorization = async (client) => {
        const service = (await client.query('SELECT * FROM seller_theme_services WHERE id=$1 FOR UPDATE', [serviceA.id])).rows[0];
        return authorize(client, principal, 'draft.read', service);
    };
    const verifyFresh = async (expectedCode) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
            if (expectedCode) await assert.rejects(freshAuthorization(client), { code: expectedCode });
            else assert.equal((await freshAuthorization(client)).role, 'seller_owner');
        } finally {
            await client.query('ROLLBACK');
            client.release();
        }
    };
    const observeBlockedBy = async (waiterPid, blockerPid) => {
        const deadline = Date.now() + 2500;
        while (Date.now() < deadline) {
            const row = (await pool.query('SELECT $2::int = ANY(pg_blocking_pids($1::int)) AS blocked', [waiterPid, blockerPid])).rows[0];
            if (row.blocked) return;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.fail('Expected the live PostgreSQL transaction to wait on the authority lock');
    };
    // Both orderings are driven by observed PostgreSQL blocking, not fixed sleeps.
    const race = async (before, waiting, verify) => {
        const blocker = await pool.connect();
        let waiter, pending;
        try {
            waiter = await pool.connect();
            for (const client of [blocker, waiter]) {
                await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
                await client.query("SET LOCAL lock_timeout='6s'");
                await client.query("SET LOCAL statement_timeout='8s'");
            }
            const blockerPid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
            const waiterPid = (await waiter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
            await before(blocker);
            pending = waiting(waiter).then(value => ({ value }), error => ({ error }));
            await observeBlockedBy(waiterPid, blockerPid);
            await blocker.query('COMMIT');
            const outcome = await pending;
            await verify(outcome);
            await waiter.query(outcome.error ? 'ROLLBACK' : 'COMMIT');
        } finally {
            // Release the blocker first so an assertion failure cannot strand the waiter.
            await blocker.query('ROLLBACK').catch(() => {});
            if (pending) await pending;
            if (waiter) { await waiter.query('ROLLBACK').catch(() => {}); waiter.release(); }
            blocker.release();
        }
    };
    const insertInactive = client => client.query(`INSERT INTO theme_seller_roles(organization_id,membership_id,role,active)
        VALUES($1,$2,'seller_owner',FALSE)`, memberScope);
    const removeRole = () => pool.query('DELETE FROM theme_seller_roles WHERE organization_id=$1 AND membership_id=$2', memberScope);
    const requireSuccess = ({ error }) => { if (error) throw error; };
    try {
        await removeRole();
        await verifyFresh();
        await race(async client => assert.equal((await freshAuthorization(client)).role, 'seller_owner'),
            insertInactive, requireSuccess);
        await verifyFresh('THEME_PERMISSION_DENIED');
        checks += 1; // In-flight owner fallback finishes before a new explicit revocation.

        await removeRole();
        await race(insertInactive, freshAuthorization, ({ error }) => {
            assert.equal(error?.code, 'THEME_PERMISSION_DENIED');
        });
        await verifyFresh('THEME_PERMISSION_DENIED');
        checks += 1; // A role insertion that wins the lock is seen after the wait.

        await pool.query('UPDATE theme_seller_roles SET active=TRUE,revision=revision+1 WHERE organization_id=$1 AND membership_id=$2', memberScope);
        await race(async client => assert.equal((await freshAuthorization(client)).role, 'seller_owner'),
            client => client.query('UPDATE theme_seller_roles SET active=FALSE,revision=revision+1 WHERE organization_id=$1 AND membership_id=$2', memberScope),
            requireSuccess);
        await verifyFresh('THEME_PERMISSION_DENIED');
        checks += 1; // A locked explicit role cannot revoke halfway through an operation.

        await pool.query('UPDATE theme_seller_roles SET active=TRUE,revision=revision+1 WHERE organization_id=$1 AND membership_id=$2', memberScope);
        await race(async client => assert.equal((await freshAuthorization(client)).role, 'seller_owner'),
            client => client.query("UPDATE seller_sessions SET status='revoked',revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId]),
            requireSuccess);
        await verifyFresh('THEME_AUTH_REQUIRED');
        checks += 1; // Committed session revocation rejects a fresh authorization attempt.
    } finally {
        await pool.query('UPDATE seller_sessions SET status=$2,revoked_at=$3,updated_at=$4 WHERE id=$1',
            [a.sessionId, originalSession.status, originalSession.revoked_at, originalSession.updated_at]);
        await removeRole();
        if (originalRole) await pool.query(`INSERT INTO theme_seller_roles(organization_id,membership_id,role,publish_allowed,active,revision,created_at,updated_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [...memberScope, originalRole.role, originalRole.publish_allowed,
            originalRole.active, originalRole.revision, originalRole.created_at, originalRole.updated_at]);
    }
    return { checks };
};
