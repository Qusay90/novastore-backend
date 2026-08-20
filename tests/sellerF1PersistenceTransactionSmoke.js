'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    inTransaction,
    createOrganization,
    createMembership,
    updateMembership,
    changeOrganizationStatus
} = require('../services/sellerAuthorizationService');
const { bindStore, assignScope, revokeScope, replaceScopes } = require('../services/sellerStoreBindingService');
const {
    PURPOSE: INVITATION_PURPOSE,
    purposeBoundHash,
    createInvitation,
    findPendingByPurposeHash,
    setInvitationStatus
} = require('../services/sellerInvitationService');
const {
    PURPOSE: BOOTSTRAP_PURPOSE,
    payloadHash,
    dryRun,
    apply,
    expireAuthorization
} = require('../services/sellerFirstPartyBootstrapService');
const {
    validateDisposableDbTarget,
    authorizeMigrationApply,
    authorizeDisposableDbCleanup
} = require('./helpers/sellerF1DisposableDb');
const registry = require('../models/sellerF1MigrationRegistry');

const fail = (code) => {
    const error = new Error(code);
    error.code = code;
    throw error;
};

const guard = async () => {
    const calls = [];
    const client = {
        query: async (sql) => {
            calls.push(sql);
            if (sql === 'WORK') throw Object.assign(new Error('x'), { code: '40001' });
            return { rows: [] };
        },
        release: () => calls.push('RELEASE')
    };
    await assert.rejects(
        () => inTransaction({ connect: async () => client }, async (connection) => connection.query('WORK')),
        (error) => error.code === 'SELLER_PERSISTENCE_RETRYABLE'
    );
    assert.deepEqual(calls, ['BEGIN', 'WORK', 'ROLLBACK', 'RELEASE']);
};

const makeDecision = (suffix, userId, storeId, organizationDisplayName, sellerStoreDisplayName) => Object.freeze({
    authorizationPublicId: `00000000-0000-4000-8000-000000000${suffix}`,
    organizationExternalKey: `00000000-0000-4000-8000-000000000${suffix}`,
    organizationDisplayName,
    sellerStoreDisplayName,
    userId,
    storeId
});

const insertAuthorization = async (client, decision, { status = 'pending', expiresAt = new Date(Date.now() + 600000) } = {}) => {
    await client.query(
        `INSERT INTO seller_bootstrap_operator_authorizations (
            public_id, purpose, target_owner_user_id, target_legacy_store_id,
            intended_organization_external_key, intended_organization_display_name,
            intended_seller_store_display_name, decision_payload_sha256,
            operator_reference, reason_code, status, expires_at, consumed_at, revoked_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
            decision.authorizationPublicId,
            BOOTSTRAP_PURPOSE,
            decision.userId,
            decision.storeId,
            decision.organizationExternalKey,
            decision.organizationDisplayName,
            decision.sellerStoreDisplayName,
            payloadHash(decision),
            `operator-decision-${decision.authorizationPublicId}`,
            'f1b-test',
            status,
            expiresAt,
            status === 'consumed' ? new Date() : null,
            status === 'revoked' ? new Date() : null,
            new Date(expiresAt.getTime() - 60000)
        ]
    );
};

const poolForClient = (client) => Object.freeze({
    connect: async () => Object.freeze({ query: client.query.bind(client), release() {} })
});

const dbRun = async (args) => {
    const raw = args[args.indexOf('--connection') + 1];
    if (!raw || !args.includes('--allow-db-operation') || !args.includes('--allow-migration-apply') || !args.includes('--allow-db-cleanup')) {
        fail('SELLER_F1_DB_EXPLICIT_OPT_IN_REQUIRED');
    }
    const url = new URL(raw);
    const connection = validateDisposableDbTarget({
        host: url.hostname,
        database: decodeURIComponent(url.pathname.slice(1)),
        port: Number(url.port),
        ssl: false
    });
    const migrationNames = registry.F1A_MIGRATIONS.map((item) => path.basename(item.relativePath));
    authorizeMigrationApply({ allowDbOperation: true, applyAuthorization: true, connection, migrationPaths: migrationNames });
    authorizeDisposableDbCleanup({ allowDbOperation: true, cleanupAuthorization: true, connection });
    const migrations = registry.verifyMigrationFiles();
    const { Client } = await import('pg');
    const config = {
        host: url.hostname,
        port: Number(url.port),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        ssl: false
    };
    const admin = new Client({ ...config, database: 'postgres' });
    const target = new Client({ ...config, database: connection.database });
    let created = false;
    try {
        await admin.connect();
        assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [connection.database])).rowCount, 0);
        await admin.query(`CREATE DATABASE "${connection.database}"`);
        created = true;
        await target.connect();
        await target.query('CREATE TABLE users (id SERIAL PRIMARY KEY)');
        await target.query('CREATE TABLE stores (id BIGSERIAL PRIMARY KEY, is_active BOOLEAN NOT NULL DEFAULT TRUE, deleted_at TIMESTAMPTZ)');
        for (const migration of migrations) {
            await target.query(fs.readFileSync(path.join(__dirname, '..', migration.relativePath), 'utf8'));
        }

        const database = poolForClient(target);
        const orgA = await createOrganization(database, {
            externalKey: '00000000-0000-4000-8000-000000000101',
            displayName: 'A'
        });
        const orgB = await createOrganization(database, {
            externalKey: '00000000-0000-4000-8000-000000000102',
            displayName: 'B'
        });
        await target.query('INSERT INTO users (id) VALUES (101), (102), (103), (104)');
        await target.query('INSERT INTO stores (id) VALUES (501), (502), (503), (504)');
        await target.query('INSERT INTO stores (id, is_active) VALUES (505, FALSE)');
        const roles = await target.query("SELECT id, code FROM seller_roles WHERE organization_id IS NULL AND code IN ('owner', 'manager', 'operator')");
        const byCode = new Map(roles.rows.map((row) => [row.code, row.id]));
        const owner = await createMembership(database, { organizationId: orgA.id, userId: 101, roleId: byCode.get('owner') });
        const manager = await createMembership(database, { organizationId: orgA.id, userId: 102, roleId: byCode.get('manager') });
        const operator = await createMembership(database, { organizationId: orgA.id, userId: 104, roleId: byCode.get('operator') });
        await assert.rejects(
            () => updateMembership(database, { organizationId: orgA.id, membershipId: owner.id, expectedRevision: 1, status: 'revoked' }),
            (error) => error.code === 'LAST_OWNER_REQUIRED'
        );
        await assert.rejects(
            () => updateMembership(database, { organizationId: orgA.id, membershipId: owner.id, expectedRevision: 1, roleId: byCode.get('operator') }),
            (error) => error.code === 'LAST_OWNER_REQUIRED'
        );
        const sellerStore = await bindStore(database, { organizationId: orgA.id, legacyStoreId: 501, displayName: 'A store' });
        await assert.rejects(
            () => bindStore(database, { organizationId: orgA.id, legacyStoreId: 505, displayName: 'Pasif mağaza' }),
            (error) => error.code === 'RESOURCE_NOT_FOUND'
        );
        await assignScope(database, { organizationId: orgA.id, membershipId: manager.id, storeId: sellerStore.id, scopeKind: 'assigned' });
        const sellerStoreTwo = await bindStore(database, { organizationId: orgA.id, legacyStoreId: 502, displayName: 'A second store' });
        const allStoreExpansion = await assignScope(database, { organizationId: orgA.id, membershipId: manager.id, scopeKind: 'all' });
        assert.deepEqual(allStoreExpansion, {
            organizationId: orgA.id,
            membershipId: Number(manager.id),
            scopeKind: 'assigned',
            allStoresExpanded: true,
            assignedStoreIds: [Number(sellerStoreTwo.id)]
        });
        assert.equal((await revokeScope(database, { organizationId: orgA.id, membershipId: manager.id, storeId: sellerStoreTwo.id })).store_id, sellerStoreTwo.id);
        assert.deepEqual((await assignScope(database, { organizationId: orgA.id, membershipId: manager.id, scopeKind: 'all' })).assignedStoreIds, [Number(sellerStoreTwo.id)]);
        const revisionBeforeReplacement = Number((await target.query('SELECT membership_revision FROM seller_memberships WHERE id = $1', [manager.id])).rows[0].membership_revision);
        assert.deepEqual(
            await replaceScopes(database, { organizationId: orgA.id, membershipId: manager.id, scopeKind: 'assigned', storeIds: [sellerStoreTwo.id] }),
            {
                organizationId: orgA.id,
                membershipId: Number(manager.id),
                scopeKind: 'assigned',
                allStoresExpanded: false,
                assignedStoreIds: [],
                revokedStoreIds: [Number(sellerStore.id)]
            }
        );
        assert.equal(Number((await target.query('SELECT membership_revision FROM seller_memberships WHERE id = $1', [manager.id])).rows[0].membership_revision), revisionBeforeReplacement + 1);
        assert.deepEqual(
            await replaceScopes(database, { organizationId: orgA.id, membershipId: manager.id, scopeKind: 'all' }),
            {
                organizationId: orgA.id,
                membershipId: Number(manager.id),
                scopeKind: 'assigned',
                allStoresExpanded: true,
                assignedStoreIds: [Number(sellerStore.id)],
                revokedStoreIds: []
            }
        );
        const scopeRaceClientOne = new Client({ ...config, database: connection.database });
        const scopeRaceClientTwo = new Client({ ...config, database: connection.database });
        await scopeRaceClientOne.connect();
        await scopeRaceClientTwo.connect();
        const scopeRaceClients = [scopeRaceClientOne, scopeRaceClientTwo];
        const scopeRaceDatabase = Object.freeze({
            connect: async () => {
                const client = scopeRaceClients.shift();
                if (!client) throw new Error('unexpected scope-race connection');
                return Object.freeze({ query: client.query.bind(client), release() {} });
            }
        });
        const scopeRace = await Promise.allSettled([
            assignScope(scopeRaceDatabase, { organizationId: orgA.id, membershipId: manager.id, storeId: sellerStore.id, scopeKind: 'assigned' }),
            revokeScope(scopeRaceDatabase, { organizationId: orgA.id, membershipId: manager.id, storeId: sellerStore.id })
        ]);
        await scopeRaceClientOne.end();
        await scopeRaceClientTwo.end();
        assert.equal(scopeRace.filter((entry) => entry.status === 'fulfilled').length, 2);
        assert.ok((await target.query('SELECT COUNT(*)::int AS count FROM seller_membership_store_scopes WHERE organization_id = $1 AND membership_id = $2 AND store_id = $3 AND revoked_at IS NULL', [orgA.id, manager.id, sellerStore.id])).rows[0].count <= 1);
        await assignScope(database, { organizationId: orgA.id, membershipId: manager.id, storeId: sellerStore.id, scopeKind: 'assigned' });
        await assert.rejects(
            () => assignScope(database, { organizationId: orgB.id, membershipId: manager.id, storeId: sellerStore.id, scopeKind: 'assigned' }),
            (error) => error.code === 'RESOURCE_NOT_FOUND'
        );
        await assert.rejects(
            () => assignScope(database, { organizationId: orgA.id, membershipId: manager.id, storeId: sellerStore.id, scopeKind: 'wildcard' }),
            (error) => error.code === 'SELLER_SCOPE_KIND_REJECTED'
        );
        const suspendedOrganizationMembership = await createMembership(database, { organizationId: orgB.id, userId: 104, roleId: byCode.get('manager') });
        await assert.rejects(
            () => changeOrganizationStatus(database, { organizationId: orgB.id, expectedRevision: 1, status: 'closed' }),
            (error) => error.code === 'SELLER_LIFECYCLE_TRANSITION_REJECTED'
        );
        const suspendedOrganization = await changeOrganizationStatus(database, { organizationId: orgB.id, expectedRevision: 1, status: 'suspended' });
        assert.ok(suspendedOrganization.suspended_at instanceof Date || typeof suspendedOrganization.suspended_at === 'string');
        await assert.rejects(
            () => createMembership(database, { organizationId: orgB.id, userId: 104, roleId: byCode.get('manager') }),
            (error) => error.code === 'RESOURCE_NOT_FOUND'
        );
        await assert.rejects(
            () => updateMembership(database, { organizationId: orgB.id, membershipId: suspendedOrganizationMembership.id, expectedRevision: 1, status: 'active' }),
            (error) => error.code === 'SELLER_LIFECYCLE_TRANSITION_REJECTED'
        );

        const invitationToken = 'seller-f1b-purpose-bound-invitation-token';
        const invitation = await createInvitation(database, {
            organizationId: orgA.id,
            inviterMembershipId: manager.id,
            roleId: byCode.get('manager'),
            emailHash: 'a'.repeat(64),
            token: invitationToken,
            expiresAt: new Date(Date.now() + 60000)
        });
        assert.equal(
            (await findPendingByPurposeHash(target, {
                organizationId: orgA.id,
                token: invitationToken,
                purpose: INVITATION_PURPOSE
            })).id,
            invitation.id
        );
        assert.equal(
            (await target.query('SELECT token_hash FROM seller_invitations WHERE id = $1', [invitation.id])).rows[0].token_hash,
            purposeBoundHash(invitationToken)
        );
        await assert.rejects(
            () => createInvitation(database, {
                organizationId: orgA.id,
                inviterMembershipId: operator.id,
                roleId: byCode.get('operator'),
                emailHash: 'c'.repeat(64),
                token: 'operator-without-team-invite-permission',
                expiresAt: new Date(Date.now() + 60000)
            }),
            (error) => error.code === 'RESOURCE_NOT_FOUND'
        );
        await target.query('UPDATE seller_roles SET is_active = FALSE WHERE id = $1', [byCode.get('manager')]);
        await assert.rejects(
            () => createInvitation(database, {
                organizationId: orgA.id,
                inviterMembershipId: manager.id,
                roleId: byCode.get('operator'),
                emailHash: 'd'.repeat(64),
                token: 'inactive-manager-cannot-create-invitation',
                expiresAt: new Date(Date.now() + 60000)
            }),
            (error) => error.code === 'RESOURCE_NOT_FOUND'
        );
        const expiringInvitation = await createInvitation(database, {
            organizationId: orgA.id,
            inviterMembershipId: owner.id,
            roleId: byCode.get('operator'),
            emailHash: 'e'.repeat(64),
            token: 'owner-created-expiring-invitation-token',
            expiresAt: new Date(Date.now() + 60000)
        });
        await assert.rejects(
            () => createInvitation(database, {
                organizationId: orgA.id,
                inviterMembershipId: owner.id,
                roleId: byCode.get('operator'),
                emailHash: 'e'.repeat(64),
                token: 'duplicate-pending-email-invitation-token',
                expiresAt: new Date(Date.now() + 60000)
            }),
            (error) => error.code === 'SELLER_PERSISTENCE_CONFLICT' && !String(error.message).includes('duplicate-pending-email-invitation-token')
        );
        assert.equal((await setInvitationStatus(database, { organizationId: orgA.id, invitationId: invitation.id, expectedRevision: 1, status: 'revoked' })).status, 'revoked');
        assert.equal(await findPendingByPurposeHash(target, { organizationId: orgA.id, token: invitationToken, purpose: INVITATION_PURPOSE }), null);
        await assert.rejects(
            () => setInvitationStatus(database, { organizationId: orgA.id, invitationId: invitation.id, expectedRevision: 1, status: 'revoked' }),
            (error) => error.code === 'RESOURCE_NOT_FOUND'
        );
        assert.equal((await setInvitationStatus(database, { organizationId: orgA.id, invitationId: expiringInvitation.id, expectedRevision: 1, status: 'expired' })).status, 'expired');
        await assert.rejects(
            () => setInvitationStatus(database, { organizationId: orgA.id, invitationId: expiringInvitation.id, expectedRevision: 2, status: 'accepted' }),
            (error) => error.code === 'SELLER_LIFECYCLE_TRANSITION_REJECTED'
        );
        const crossOrganization = await createOrganization(database, {
            externalKey: '00000000-0000-4000-8000-000000000109',
            displayName: 'Cross organization'
        });
        await createMembership(database, { organizationId: crossOrganization.id, userId: 104, roleId: byCode.get('owner') });
        await assert.rejects(
            () => updateMembership(database, { organizationId: orgB.id, membershipId: manager.id, expectedRevision: 1, status: 'revoked' }),
            (error) => error.code === 'RESOURCE_NOT_FOUND'
        );
        const terminalMembership = await createMembership(database, { organizationId: crossOrganization.id, userId: 101, roleId: byCode.get('operator') });
        await updateMembership(database, { organizationId: crossOrganization.id, membershipId: terminalMembership.id, expectedRevision: 1, status: 'revoked' });
        await assert.rejects(
            () => updateMembership(database, { organizationId: crossOrganization.id, membershipId: terminalMembership.id, expectedRevision: 2, status: 'active' }),
            (error) => error.code === 'SELLER_LIFECYCLE_TRANSITION_REJECTED'
        );
        await assert.rejects(
            () => updateMembership(database, { organizationId: crossOrganization.id, membershipId: terminalMembership.id, expectedRevision: 2, roleId: byCode.get('owner') }),
            (error) => error.code === 'SELLER_LIFECYCLE_TRANSITION_REJECTED'
        );
        await assert.rejects(
            () => createInvitation(database, {
                organizationId: crossOrganization.id,
                inviterMembershipId: owner.id,
                roleId: byCode.get('operator'),
                emailHash: 'f'.repeat(64),
                token: 'cross-organization-invitation-attempt',
                expiresAt: new Date(Date.now() + 60000)
            }),
            (error) => error.code === 'RESOURCE_NOT_FOUND'
        );

        const ownerRaceOrganization = await createOrganization(database, {
            externalKey: '00000000-0000-4000-8000-000000000110',
            displayName: 'Last owner race organization'
        });
        const ownerRaceOne = await createMembership(database, { organizationId: ownerRaceOrganization.id, userId: 101, roleId: byCode.get('owner') });
        const ownerRaceTwo = await createMembership(database, { organizationId: ownerRaceOrganization.id, userId: 102, roleId: byCode.get('owner') });
        const ownerRaceClientOne = new Client({ ...config, database: connection.database });
        const ownerRaceClientTwo = new Client({ ...config, database: connection.database });
        await ownerRaceClientOne.connect();
        await ownerRaceClientTwo.connect();
        const ownerRaceClients = [ownerRaceClientOne, ownerRaceClientTwo];
        const ownerRaceDatabase = Object.freeze({
            connect: async () => {
                const client = ownerRaceClients.shift();
                if (!client) throw new Error('unexpected owner-race connection');
                return Object.freeze({ query: client.query.bind(client), release() {} });
            }
        });
        const ownerRace = await Promise.allSettled([
            updateMembership(ownerRaceDatabase, { organizationId: ownerRaceOrganization.id, membershipId: ownerRaceOne.id, expectedRevision: 1, status: 'revoked' }),
            updateMembership(ownerRaceDatabase, { organizationId: ownerRaceOrganization.id, membershipId: ownerRaceTwo.id, expectedRevision: 1, status: 'revoked' })
        ]);
        await ownerRaceClientOne.end();
        await ownerRaceClientTwo.end();
        assert.equal(ownerRace.filter((entry) => entry.status === 'fulfilled').length, 1);
        assert.equal(ownerRace.filter((entry) => entry.status === 'rejected' && ['LAST_OWNER_REQUIRED', 'SELLER_PERSISTENCE_RETRYABLE'].includes(entry.reason.code)).length, 1);
        assert.equal((await target.query("SELECT COUNT(*)::int AS count FROM seller_memberships WHERE organization_id = $1 AND status = 'active'", [ownerRaceOrganization.id])).rows[0].count, 1);

        const bootstrap = makeDecision('103', 103, 503, 'İlk taraf satıcı', 'İlk taraf mağaza');
        const missingAuthorization = makeDecision('112', 103, 503, 'Missing authorization', 'Missing authorization store');
        await assert.rejects(() => dryRun(target, missingAuthorization), (error) => error.code === 'BOOTSTRAP_AUTHORIZATION_DENIED');
        await insertAuthorization(target, bootstrap);
        assert.equal((await dryRun(target, bootstrap)).code, 'BOOTSTRAP_READY');
        await assert.rejects(() => dryRun(target, { ...bootstrap, userId: 104 }), (error) => error.code === 'BOOTSTRAP_AUTHORIZATION_DENIED');
        await assert.rejects(() => dryRun(target, { ...bootstrap, storeId: 501 }), (error) => error.code === 'BOOTSTRAP_AUTHORIZATION_DENIED');
        await assert.rejects(() => dryRun(target, { ...bootstrap, sellerStoreDisplayName: 'Payload mismatch' }), (error) => error.code === 'BOOTSTRAP_AUTHORIZATION_DENIED');
        assert.equal((await target.query('SELECT COUNT(*)::int AS count FROM seller_organizations WHERE external_key = $1', [bootstrap.organizationExternalKey])).rows[0].count, 0);

        const racerOne = new Client({ ...config, database: connection.database });
        const racerTwo = new Client({ ...config, database: connection.database });
        await racerOne.connect();
        await racerTwo.connect();
        const racers = [racerOne, racerTwo];
        const racingDatabase = Object.freeze({
            connect: async () => {
                const client = racers.shift();
                if (!client) throw new Error('unexpected extra race connection');
                return Object.freeze({ query: client.query.bind(client), release() {} });
            }
        });
        const race = await Promise.allSettled([apply(racingDatabase, bootstrap), apply(racingDatabase, bootstrap)]);
        await racerOne.end();
        await racerTwo.end();
        assert.equal(race.filter((entry) => entry.status === 'fulfilled').length, 1);
        assert.equal(race.filter((entry) => entry.status === 'rejected' && entry.reason.code === 'BOOTSTRAP_AUTHORIZATION_DENIED').length, 1);
        assert.equal(
            (await target.query('SELECT COUNT(*)::int AS count FROM seller_memberships m JOIN seller_organizations o ON o.id = m.organization_id WHERE o.external_key = $1 AND m.user_id = $2', [bootstrap.organizationExternalKey, bootstrap.userId])).rows[0].count,
            1
        );
        assert.equal(
            (await target.query('SELECT COUNT(*)::int AS count FROM seller_membership_store_scopes s JOIN seller_organizations o ON o.id = s.organization_id WHERE o.external_key = $1', [bootstrap.organizationExternalKey])).rows[0].count,
            1
        );
        assert.equal((await target.query('SELECT status FROM seller_bootstrap_operator_authorizations WHERE public_id = $1', [bootstrap.authorizationPublicId])).rows[0].status, 'consumed');
        await assert.rejects(() => apply(database, bootstrap), (error) => error.code === 'BOOTSTRAP_AUTHORIZATION_DENIED');

        const idempotent = { ...bootstrap, authorizationPublicId: '00000000-0000-4000-8000-000000000105' };
        await insertAuthorization(target, idempotent);
        assert.equal((await apply(database, idempotent)).code, 'BOOTSTRAP_NO_CHANGE');
        const partial = { ...bootstrap, authorizationPublicId: '00000000-0000-4000-8000-000000000106', sellerStoreDisplayName: 'Çakışan mağaza' };
        await insertAuthorization(target, partial);
        await assert.rejects(() => apply(database, partial), (error) => error.code === 'BOOTSTRAP_PARTIAL_STATE_CONFLICT');
        assert.equal((await target.query('SELECT status FROM seller_bootstrap_operator_authorizations WHERE public_id = $1', [partial.authorizationPublicId])).rows[0].status, 'pending');

        const rollback = makeDecision('104', 104, 504, 'Geri alma satıcısı', 'Geri alma mağazası');
        await bindStore(database, { organizationId: orgA.id, legacyStoreId: rollback.storeId, displayName: 'Already bound elsewhere' });
        await insertAuthorization(target, rollback);
        await assert.rejects(() => apply(database, rollback), (error) => error.code === 'BOOTSTRAP_PARTIAL_STATE_CONFLICT');
        assert.equal((await target.query('SELECT COUNT(*)::int AS count FROM seller_organizations WHERE external_key = $1', [rollback.organizationExternalKey])).rows[0].count, 0);
        assert.equal((await target.query('SELECT status FROM seller_bootstrap_operator_authorizations WHERE public_id = $1', [rollback.authorizationPublicId])).rows[0].status, 'pending');

        const expired = makeDecision('107', 104, 502, 'Süresi dolmuş satıcı', 'Süresi dolmuş mağaza');
        await insertAuthorization(target, expired, { expiresAt: new Date(Date.now() - 60000) });
        assert.equal((await expireAuthorization(database, expired.authorizationPublicId)).code, 'BOOTSTRAP_AUTHORIZATION_EXPIRED');
        await assert.rejects(() => dryRun(target, expired), (error) => error.code === 'BOOTSTRAP_AUTHORIZATION_DENIED');
        const inactiveStore = makeDecision('108', 104, 505, 'Pasif store satıcısı', 'Pasif store mağazası');
        await insertAuthorization(target, inactiveStore);
        assert.equal((await dryRun(target, inactiveStore)).code, 'BOOTSTRAP_STORE_NOT_FOUND');
        const revoked = makeDecision('111', 104, 502, 'İptal edilmiş satıcı', 'İptal edilmiş mağaza');
        await insertAuthorization(target, revoked, { status: 'revoked' });
        await assert.rejects(() => dryRun(target, revoked), (error) => error.code === 'BOOTSTRAP_AUTHORIZATION_DENIED');

        console.log('sellerF1PersistenceTransactionSmoke: PASS mode=db-enabled tenant-isolation=PASS lifecycle=PASS invitation-purpose=PASS bootstrap-atomicity=PASS bootstrap-race=PASS rollback=PASS inactive-store=PASS');
    } finally {
        await target.end().catch(() => {});
        if (created) {
            await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [connection.database]);
            await admin.query(`DROP DATABASE "${connection.database}"`);
            assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [connection.database])).rowCount, 0);
        }
        await admin.end().catch(() => {});
    }
};

;(async () => {
    try {
        const args = process.argv.slice(2);
        if (args.includes('--db-enabled')) await dbRun(args);
        else {
            await guard();
            console.log('sellerF1PersistenceTransactionSmoke: PASS mode=guard-only');
        }
    } catch (error) {
        console.error('sellerF1PersistenceTransactionSmoke: FAIL');
        console.error(error.code || 'SELLER_F1_PERSISTENCE_TEST_FAILED');
        if (error.code === 'ERR_ASSERTION') console.error(error.stack);
        process.exitCode = 1;
    }
})();
