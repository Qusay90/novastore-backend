'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const net = require('node:net');
const path = require('node:path');
const tls = require('node:tls');

const FUTURE_DATABASE_VERIFICATION_STEPS = Object.freeze([
    'fresh-apply',
    'schema-objects',
    'foreign-keys-and-source-type-parity',
    'unique-and-check-constraints',
    'required-indexes',
    'append-only-triggers',
    'second-apply',
    'intentional-failure-rollback',
    'receipt-and-checksum-policy',
    'guarded-cleanup'
]);

const fail = (code) => {
    const error = new Error(code);
    error.code = code;
    throw error;
};

const optionValue = (argumentsList, flag) => {
    const index = argumentsList.indexOf(flag);
    if (index === -1 || index === argumentsList.length - 1) {
        fail('SELLER_F1_DB_DIRECT_CONNECTION_REQUIRED');
    }
    return argumentsList[index + 1];
};

const parseDirectConnection = (rawConnection) => {
    let parsed;
    try {
        parsed = new URL(rawConnection);
    } catch (_) {
        fail('SELLER_F1_DB_DIRECT_CONNECTION_REJECTED');
    }

    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
        fail('SELLER_F1_DB_DIRECT_CONNECTION_REJECTED');
    }

    const host = parsed.hostname.replace(/^\[|\]$/gu, '');
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    if (!parsed.username || !database) {
        fail('SELLER_F1_DB_DIRECT_CONNECTION_REJECTED');
    }

    return Object.freeze({
        connection: Object.freeze({
            host,
            database,
            port: parsed.port ? Number(parsed.port) : 5432,
            ssl: parsed.searchParams.get('sslmode') === 'require'
        }),
        clientConfig: Object.freeze({
            host,
            database,
            port: parsed.port ? Number(parsed.port) : 5432,
            user: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
            ssl: parsed.searchParams.get('sslmode') === 'require'
        })
    });
};

const authorizeFutureDatabaseExecution = (argumentsList, helper, registry) => {
    if (!argumentsList.includes('--db-enabled')) {
        fail('SELLER_F1_DB_ENABLED_MODE_REQUIRED');
    }
    if (!argumentsList.includes('--allow-db-operation')) {
        fail('SELLER_F1_DB_OPERATION_EXPLICIT_OPT_IN_REQUIRED');
    }
    if (!argumentsList.includes('--allow-migration-apply')) {
        fail('SELLER_F1_MIGRATION_APPLY_AUTHORIZATION_REQUIRED');
    }
    if (!argumentsList.includes('--allow-db-cleanup')) {
        fail('SELLER_F1_DB_CLEANUP_AUTHORIZATION_REQUIRED');
    }
    if (!argumentsList.includes('--execute-disposable-db')) {
        fail('SELLER_F1_DB_EXECUTION_AUTHORIZATION_REQUIRED');
    }

    const directConnection = parseDirectConnection(optionValue(argumentsList, '--connection'));
    const migrationPaths = registry.F1A_MIGRATIONS.map((descriptor) => path.basename(descriptor.relativePath));
    const applyAuthorization = helper.authorizeMigrationApply({
        allowDbOperation: true,
        applyAuthorization: true,
        connection: directConnection.connection,
        migrationPaths
    });
    const cleanupAuthorization = helper.authorizeDisposableDbCleanup({
        allowDbOperation: true,
        cleanupAuthorization: true,
        connection: directConnection.connection
    });
    const verifiedDescriptors = registry.verifyMigrationFiles();

    return Object.freeze({
        applyAuthorization,
        cleanupAuthorization,
        clientConfig: directConnection.clientConfig,
        verifiedDescriptors
    });
};

const REQUIRED_DATABASE_TABLES = Object.freeze([
    'seller_organizations',
    'seller_roles',
    'seller_permissions',
    'seller_role_permissions',
    'seller_memberships',
    'seller_stores',
    'seller_membership_store_scopes',
    'seller_invitations',
    'seller_sessions',
    'seller_refresh_token_families',
    'seller_refresh_tokens',
    'seller_step_up_challenges',
    'seller_audit_events',
    'seller_outbox_events',
    'seller_outbox_delivery_attempts',
    'seller_bootstrap_operator_authorizations'
]);

const REQUIRED_CONSTRAINTS = Object.freeze([
    ['pk_seller_organizations', 'p'],
    ['pk_seller_roles', 'p'],
    ['pk_seller_permissions', 'p'],
    ['pk_seller_role_permissions', 'p'],
    ['pk_seller_memberships', 'p'],
    ['pk_seller_stores', 'p'],
    ['pk_seller_membership_store_scopes', 'p'],
    ['pk_seller_invitations', 'p'],
    ['pk_seller_sessions', 'p'],
    ['pk_seller_refresh_token_families', 'p'],
    ['pk_seller_refresh_tokens', 'p'],
    ['pk_seller_step_up_challenges', 'p'],
    ['pk_seller_audit_events', 'p'],
    ['pk_seller_outbox_events', 'p'],
    ['pk_seller_outbox_delivery_attempts', 'p'],
    ['pk_seller_bootstrap_operator_authorizations', 'p'],
    ['uq_seller_organizations_external_key', 'u'],
    ['uq_seller_roles_organization_id_id', 'u'],
    ['uq_seller_memberships_organization_id_id', 'u'],
    ['uq_seller_stores_organization_id_id', 'u'],
    ['uq_seller_invitations_token_hash', 'u'],
    ['uq_seller_refresh_tokens_family_generation', 'u'],
    ['uq_seller_refresh_tokens_token_hash', 'u'],
    ['uq_seller_outbox_events_aggregate_revision', 'u'],
    ['uq_seller_outbox_delivery_attempts_event_number_outcome', 'u'],
    ['uq_seller_bootstrap_operator_authorizations_public_id', 'u'],
    ['fk_seller_membership_store_scopes_membership', 'f'],
    ['fk_seller_membership_store_scopes_store', 'f'],
    ['fk_seller_invitations_inviter_membership', 'f'],
    ['fk_seller_sessions_membership', 'f'],
    ['fk_seller_step_up_challenges_membership', 'f'],
    ['fk_seller_audit_events_store', 'f'],
    ['fk_seller_audit_events_actor_membership', 'f'],
    ['fk_seller_outbox_events_store', 'f'],
    ['fk_seller_bootstrap_operator_authorizations_owner', 'f'],
    ['fk_seller_bootstrap_operator_authorizations_store', 'f'],
    ['chk_seller_organizations_display_name_nonblank', 'c'],
    ['chk_seller_organizations_status', 'c'],
    ['chk_seller_organizations_revision_positive', 'c'],
    ['chk_seller_roles_code_nonblank', 'c'],
    ['chk_seller_roles_name_nonblank', 'c'],
    ['chk_seller_roles_kind_scope', 'c'],
    ['chk_seller_roles_revision_positive', 'c'],
    ['chk_seller_roles_owner_not_assignable', 'c'],
    ['chk_seller_permissions_code_nonblank', 'c'],
    ['chk_seller_permissions_domain_nonblank', 'c'],
    ['chk_seller_memberships_status', 'c'],
    ['chk_seller_memberships_revision_positive', 'c'],
    ['chk_seller_stores_display_name_nonblank', 'c'],
    ['chk_seller_stores_status', 'c'],
    ['chk_seller_stores_revision_positive', 'c'],
    ['chk_seller_membership_store_scopes_kind', 'c'],
    ['chk_seller_invitations_status', 'c'],
    ['chk_seller_invitations_revision_positive', 'c'],
    ['chk_seller_invitations_email_hash_format', 'c'],
    ['chk_seller_invitations_token_hash_format', 'c'],
    ['chk_seller_sessions_audience', 'c'],
    ['chk_seller_sessions_status', 'c'],
    ['chk_seller_sessions_membership_revision_positive', 'c'],
    ['chk_seller_sessions_expiry_after_issue', 'c'],
    ['chk_seller_refresh_token_families_generation_positive', 'c'],
    ['chk_seller_refresh_token_families_status', 'c'],
    ['chk_seller_refresh_tokens_generation_positive', 'c'],
    ['chk_seller_refresh_tokens_status', 'c'],
    ['chk_seller_refresh_tokens_expiry_after_issue', 'c'],
    ['chk_seller_refresh_tokens_hash_format', 'c'],
    ['chk_seller_step_up_challenges_status', 'c'],
    ['chk_seller_step_up_challenges_attempt_count', 'c'],
    ['chk_seller_step_up_challenges_verified_at', 'c'],
    ['chk_seller_audit_events_metadata_object', 'c'],
    ['chk_seller_outbox_events_aggregate_revision_positive', 'c'],
    ['chk_seller_outbox_events_payload_object', 'c'],
    ['chk_seller_outbox_delivery_attempts_number_positive', 'c'],
    ['chk_seller_outbox_delivery_attempts_outcome', 'c'],
    ['chk_seller_outbox_delivery_attempts_lease', 'c'],
    ['chk_seller_bootstrap_operator_authorizations_purpose', 'c'],
    ['chk_seller_bootstrap_operator_authorizations_payload_hash', 'c'],
    ['chk_sbo_auth_organization_display_name', 'c'],
    ['chk_sbo_auth_store_display_name', 'c'],
    ['chk_sbo_auth_operator_reference', 'c'],
    ['chk_seller_bootstrap_operator_authorizations_reason_code', 'c'],
    ['chk_seller_bootstrap_operator_authorizations_status', 'c'],
    ['chk_seller_bootstrap_operator_authorizations_revision', 'c'],
    ['chk_seller_bootstrap_operator_authorizations_expiry', 'c'],
    ['chk_sbo_auth_terminal_timestamps', 'c']
]);

const REQUIRED_INDEXES = Object.freeze([
    ['idx_seller_organizations_status_id', 'seller_organizations', false, false],
    ['uq_seller_roles_system_code', 'seller_roles', true, true],
    ['uq_seller_roles_organization_code', 'seller_roles', true, true],
    ['idx_seller_roles_organization_active_id', 'seller_roles', false, true],
    ['idx_seller_permissions_active_code', 'seller_permissions', false, false],
    ['idx_seller_role_permissions_permission_role', 'seller_role_permissions', false, false],
    ['uq_seller_memberships_live_organization_user', 'seller_memberships', true, true],
    ['idx_seller_memberships_user_status_organization_id', 'seller_memberships', false, false],
    ['idx_seller_memberships_organization_status_user', 'seller_memberships', false, false],
    ['uq_seller_stores_live_legacy_store', 'seller_stores', true, true],
    ['idx_seller_stores_organization_status_id', 'seller_stores', false, false],
    ['uq_seller_membership_store_scopes_live', 'seller_membership_store_scopes', true, true],
    ['idx_seller_membership_store_scopes_organization_store_membership', 'seller_membership_store_scopes', false, false],
    ['idx_seller_membership_store_scopes_membership_revoked', 'seller_membership_store_scopes', false, false],
    ['uq_seller_invitations_pending_email', 'seller_invitations', true, true],
    ['idx_seller_invitations_organization_status_expires_id', 'seller_invitations', false, false],
    ['idx_seller_sessions_id_status_expires', 'seller_sessions', false, false],
    ['idx_seller_sessions_membership_status_id', 'seller_sessions', false, false],
    ['idx_seller_sessions_organization_membership_status', 'seller_sessions', false, false],
    ['idx_seller_refresh_token_families_session_status_expires', 'seller_refresh_token_families', false, false],
    ['uq_seller_refresh_tokens_active_family', 'seller_refresh_tokens', true, true],
    ['idx_seller_refresh_tokens_family_status_generation', 'seller_refresh_tokens', false, false],
    ['idx_seller_refresh_tokens_hash_status', 'seller_refresh_tokens', false, false],
    ['idx_seller_step_up_challenges_session_status_expires', 'seller_step_up_challenges', false, false],
    ['idx_seller_step_up_challenges_organization_action_target_status', 'seller_step_up_challenges', false, false],
    ['idx_seller_audit_events_organization_created_id', 'seller_audit_events', false, false],
    ['idx_seller_audit_events_organization_store_created_id', 'seller_audit_events', false, false],
    ['idx_seller_audit_events_actor_membership_created', 'seller_audit_events', false, false],
    ['idx_seller_audit_events_correlation_id', 'seller_audit_events', false, false],
    ['uq_seller_outbox_events_organization_idempotency', 'seller_outbox_events', true, true],
    ['idx_seller_outbox_events_organization_created_id', 'seller_outbox_events', false, false],
    ['idx_seller_outbox_delivery_attempts_event_created_id', 'seller_outbox_delivery_attempts', false, false],
    ['idx_seller_outbox_delivery_attempts_retry_after_id', 'seller_outbox_delivery_attempts', false, true],
    ['uq_seller_bootstrap_operator_authorizations_pending_target', 'seller_bootstrap_operator_authorizations', true, true],
    ['idx_seller_bootstrap_operator_authorizations_pending_expiry', 'seller_bootstrap_operator_authorizations', false, false]
]);

const REQUIRED_TRIGGERS = Object.freeze([
    'trg_seller_memberships_role_scope',
    'trg_seller_memberships_last_active_owner',
    'trg_seller_memberships_no_hard_delete',
    'trg_seller_role_permissions_no_platform',
    'trg_seller_invitations_role_scope',
    'trg_seller_audit_events_append_only',
    'trg_seller_outbox_events_append_only',
    'trg_seller_outbox_delivery_attempts_append_only'
]);

const REQUIRED_EXTERNAL_COLUMN_TYPES = Object.freeze([
    ['users', 'id', 'integer'],
    ['stores', 'id', 'bigint'],
    ['seller_memberships', 'user_id', 'integer'],
    ['seller_stores', 'legacy_store_id', 'bigint'],
    ['seller_sessions', 'user_id', 'integer'],
    ['seller_audit_events', 'actor_user_id', 'integer'],
    ['seller_bootstrap_operator_authorizations', 'target_owner_user_id', 'integer'],
    ['seller_bootstrap_operator_authorizations', 'target_legacy_store_id', 'bigint']
]);

const quoteIdentifier = (value) => `"${String(value).replace(/"/gu, '""')}"`;
const postgresIdentifier = (value) => String(value).slice(0, 63);

const execute = async (client, state, text, values) => {
    state.sqlStatements += 1;
    return client.query(text, values);
};

const requireRowsByName = (rows, names, field, label) => {
    const actual = new Set(rows.map((row) => row[field]));
    for (const name of names) {
        assert.equal(actual.has(name), true, `${label} missing: ${name}`);
    }
};

const expectQueryFailure = async (client, state, text, values, expectedCode, label) => {
    let failure;
    try {
        await execute(client, state, text, values);
    } catch (error) {
        failure = error;
    }
    assert.ok(failure, `${label} must fail`);
    assert.equal(failure.code, expectedCode, `${label} failure code`);
};

const applyVerifiedMigrations = async (client, state, descriptors) => {
    for (const descriptor of descriptors) {
        const sql = fs.readFileSync(path.join(__dirname, '..', descriptor.relativePath), 'utf8');
        await execute(client, state, sql);
    }
};

const verifyFreshSchema = async (client, state) => {
    const tables = await execute(
        client,
        state,
        "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name LIKE 'seller_%'"
    );
    assert.equal(tables.rows.length, REQUIRED_DATABASE_TABLES.length, 'seller table count');
    requireRowsByName(tables.rows, REQUIRED_DATABASE_TABLES, 'table_name', 'seller table');

    const constraints = await execute(
        client,
        state,
        "SELECT conname, contype FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND conname = ANY($1::text[])",
        [REQUIRED_CONSTRAINTS.map(([name]) => name)]
    );
    const constraintTypes = new Map(constraints.rows.map((row) => [row.conname, row.contype]));
    for (const [name, expectedType] of REQUIRED_CONSTRAINTS) {
        assert.equal(constraintTypes.get(name), expectedType, `constraint type: ${name}`);
    }

    const indexes = await execute(
        client,
        state,
        "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ANY($1::text[])",
        [REQUIRED_INDEXES.map(([name]) => postgresIdentifier(name))]
    );
    const indexByName = new Map(indexes.rows.map((row) => [row.indexname, row]));
    for (const [name, tableName, isUnique, isPartial] of REQUIRED_INDEXES) {
        const index = indexByName.get(postgresIdentifier(name));
        assert.ok(index, `index missing: ${name}`);
        assert.equal(index.tablename, tableName, `index table: ${name}`);
        assert.equal(/CREATE UNIQUE INDEX/u.test(index.indexdef), isUnique, `index uniqueness: ${name}`);
        assert.equal(/\sWHERE\s/iu.test(index.indexdef), isPartial, `index partial predicate: ${name}`);
    }

    const triggers = await execute(
        client,
        state,
        'SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1::text[])',
        [REQUIRED_TRIGGERS]
    );
    requireRowsByName(triggers.rows, REQUIRED_TRIGGERS, 'tgname', 'trigger');

    const columnPairs = REQUIRED_EXTERNAL_COLUMN_TYPES.map(([tableName, columnName]) => `(${tableName},${columnName})`);
    const columns = await execute(
        client,
        state,
        "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND (table_name, column_name) IN (('users', 'id'), ('stores', 'id'), ('seller_memberships', 'user_id'), ('seller_stores', 'legacy_store_id'), ('seller_sessions', 'user_id'), ('seller_audit_events', 'actor_user_id'), ('seller_bootstrap_operator_authorizations', 'target_owner_user_id'), ('seller_bootstrap_operator_authorizations', 'target_legacy_store_id'))"
    );
    const columnTypeByPair = new Map(columns.rows.map((row) => [`(${row.table_name},${row.column_name})`, row.data_type]));
    for (const [tableName, columnName, expectedType] of REQUIRED_EXTERNAL_COLUMN_TYPES) {
        assert.equal(columnTypeByPair.get(`(${tableName},${columnName})`), expectedType, `column type: ${tableName}.${columnName}`);
    }
    assert.equal(columnPairs.length, REQUIRED_EXTERNAL_COLUMN_TYPES.length);
};

const verifyRuntimeGuards = async (client, state) => {
    const organization = await execute(
        client,
        state,
        'INSERT INTO seller_organizations (external_key, display_name) VALUES ($1, $2) RETURNING id',
        ['00000000-0000-4000-8000-000000000001', 'Disposable seller organization']
    );
    const organizationId = organization.rows[0].id;

    await execute(client, state, 'INSERT INTO users (id) VALUES (101), (102)');
    await execute(client, state, 'INSERT INTO stores (id) VALUES (501)');

    const bootstrapAuthorizationColumns = 'public_id, purpose, target_owner_user_id, target_legacy_store_id, intended_organization_external_key, intended_organization_display_name, intended_seller_store_display_name, decision_payload_sha256, operator_reference, status, expires_at';
    const bootstrapAuthorizationValues = ['00000000-0000-4000-8000-000000000041', 'FIRST_PARTY_SELLER_BOOTSTRAP', 101, 501, '00000000-0000-4000-8000-000000000042', 'Disposable bootstrap organization', 'Disposable bootstrap store', 'a'.repeat(64), 'disposable-operator-reference', 'pending'];
    await execute(
        client,
        state,
        `INSERT INTO seller_bootstrap_operator_authorizations (${bootstrapAuthorizationColumns}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
        bootstrapAuthorizationValues
    );
    await expectQueryFailure(
        client,
        state,
        `INSERT INTO seller_bootstrap_operator_authorizations (${bootstrapAuthorizationColumns}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
        ['00000000-0000-4000-8000-000000000043', ...bootstrapAuthorizationValues.slice(1)],
        '23505',
        'bootstrap pending target uniqueness'
    );
    await expectQueryFailure(
        client,
        state,
        `INSERT INTO seller_bootstrap_operator_authorizations (${bootstrapAuthorizationColumns}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
        ['00000000-0000-4000-8000-000000000044', 'WRONG_PURPOSE', 102, 501, '00000000-0000-4000-8000-000000000045', 'Wrong purpose organization', 'Wrong purpose store', 'b'.repeat(64), 'disposable-operator-reference-2', 'pending'],
        '23514',
        'bootstrap purpose binding'
    );
    await expectQueryFailure(
        client,
        state,
        `INSERT INTO seller_bootstrap_operator_authorizations (${bootstrapAuthorizationColumns}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
        ['00000000-0000-4000-8000-000000000046', 'FIRST_PARTY_SELLER_BOOTSTRAP', 102, 501, '00000000-0000-4000-8000-000000000047', 'Consumed without timestamp', 'Consumed without timestamp store', 'c'.repeat(64), 'disposable-operator-reference-3', 'consumed'],
        '23514',
        'bootstrap terminal timestamp binding'
    );

    const roles = await execute(
        client,
        state,
        "SELECT id, code FROM seller_roles WHERE organization_id IS NULL AND code IN ('owner', 'manager')"
    );
    const roleIdByCode = new Map(roles.rows.map((row) => [row.code, row.id]));
    assert.ok(roleIdByCode.has('owner'), 'seeded owner role');
    assert.ok(roleIdByCode.has('manager'), 'seeded manager role');

    const ownerMembership = await execute(
        client,
        state,
        'INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp) VALUES ($1, $2, $3, $4) RETURNING id',
        [organizationId, 101, roleIdByCode.get('owner'), '00000000-0000-4000-8000-000000000011']
    );
    const managerMembership = await execute(
        client,
        state,
        'INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp) VALUES ($1, $2, $3, $4) RETURNING id',
        [organizationId, 102, roleIdByCode.get('manager'), '00000000-0000-4000-8000-000000000012']
    );
    const ownerMembershipId = ownerMembership.rows[0].id;
    const managerMembershipId = managerMembership.rows[0].id;

    await expectQueryFailure(
        client,
        state,
        "UPDATE seller_memberships SET status = 'revoked' WHERE id = $1",
        [ownerMembershipId],
        '23514',
        'last active owner protection'
    );
    await expectQueryFailure(
        client,
        state,
        'INSERT INTO seller_role_permissions (role_id, permission_code) VALUES ($1, $2)',
        [roleIdByCode.get('manager'), 'platform.catalog.manage'],
        '23514',
        'platform permission protection'
    );

    const sellerStore = await execute(
        client,
        state,
        'INSERT INTO seller_stores (organization_id, legacy_store_id, display_name) VALUES ($1, $2, $3) RETURNING id',
        [organizationId, 501, 'Disposable seller store']
    );
    const sellerStoreId = sellerStore.rows[0].id;
    await expectQueryFailure(
        client,
        state,
        'INSERT INTO seller_invitations (organization_id, role_id, invited_by_membership_id, invitee_email_hash, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL \'1 hour\')',
        [organizationId, roleIdByCode.get('owner'), managerMembershipId, 'a'.repeat(64), 'b'.repeat(64)],
        '23514',
        'invitation role protection'
    );

    const sessionId = '00000000-0000-4000-8000-000000000021';
    const familyId = '00000000-0000-4000-8000-000000000022';
    await execute(
        client,
        state,
        'INSERT INTO seller_sessions (id, user_id, organization_id, membership_id, membership_revision, security_stamp, expires_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP + INTERVAL \'1 hour\')',
        [sessionId, 102, organizationId, managerMembershipId, 1, '00000000-0000-4000-8000-000000000012']
    );
    await execute(
        client,
        state,
        'INSERT INTO seller_refresh_token_families (id, session_id, current_generation, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL \'1 hour\')',
        [familyId, sessionId, 1]
    );
    await execute(
        client,
        state,
        'INSERT INTO seller_refresh_tokens (id, family_id, generation, token_hash, expires_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL \'1 hour\')',
        ['00000000-0000-4000-8000-000000000023', familyId, 1, 'c'.repeat(64)]
    );
    await expectQueryFailure(
        client,
        state,
        'INSERT INTO seller_refresh_tokens (id, family_id, generation, token_hash, expires_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL \'1 hour\')',
        ['00000000-0000-4000-8000-000000000024', familyId, 2, 'd'.repeat(64)],
        '23505',
        'single active refresh token protection'
    );

    const auditEvent = await execute(
        client,
        state,
        'INSERT INTO seller_audit_events (organization_id, store_id, actor_user_id, actor_membership_id, session_id, event_type, target_type, target_id, result_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
        [organizationId, sellerStoreId, 102, managerMembershipId, sessionId, 'verification', 'migration', 'audit', 'ok']
    );
    await expectQueryFailure(
        client,
        state,
        'UPDATE seller_audit_events SET result_code = $1 WHERE id = $2',
        ['changed', auditEvent.rows[0].id],
        '55000',
        'audit append-only protection'
    );

    const outboxEventId = '00000000-0000-4000-8000-000000000031';
    await execute(
        client,
        state,
        'INSERT INTO seller_outbox_events (id, organization_id, store_id, aggregate_type, aggregate_id, event_type, aggregate_revision) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [outboxEventId, organizationId, sellerStoreId, 'migration', 'outbox', 'verification', 1]
    );
    await expectQueryFailure(
        client,
        state,
        'UPDATE seller_outbox_events SET event_type = $1 WHERE id = $2',
        ['changed', outboxEventId],
        '55000',
        'outbox append-only protection'
    );
    const deliveryAttemptId = '00000000-0000-4000-8000-000000000032';
    await execute(
        client,
        state,
        'INSERT INTO seller_outbox_delivery_attempts (id, outbox_event_id, attempt_number, outcome) VALUES ($1, $2, $3, $4)',
        [deliveryAttemptId, outboxEventId, 1, 'delivered']
    );
    await expectQueryFailure(
        client,
        state,
        'UPDATE seller_outbox_delivery_attempts SET outcome = $1 WHERE id = $2',
        ['failed', deliveryAttemptId],
        '55000',
        'outbox delivery append-only protection'
    );
};

const verifyIntentionalFailureRollback = async (client, state) => {
    await execute(client, state, 'BEGIN');
    try {
        await execute(client, state, 'CREATE TABLE seller_f1_rollback_probe (id INTEGER PRIMARY KEY)');
        await execute(client, state, 'SELECT 1 / 0');
        assert.fail('intentional SQL failure did not occur');
    } catch (error) {
        assert.equal(error.code, '22012', 'intentional failure SQLSTATE');
        await execute(client, state, 'ROLLBACK');
    }
    const probe = await execute(client, state, "SELECT to_regclass('public.seller_f1_rollback_probe') AS relation_name");
    assert.equal(probe.rows[0].relation_name, null, 'intentional failure rollback residue');
};

const verifyReceiptAndChecksumPolicy = (registry) => {
    assert.equal(
        registry.F1A_MIGRATIONS.every((descriptor) => (
            descriptor.receiptChecksumPolicy.mode === 'FUTURE_DB_ENABLED_RUNNER_ONLY' &&
            descriptor.receiptChecksumPolicy.checksumRequired === true &&
            descriptor.receiptChecksumPolicy.writeReceiptOnlyAfterVerifiedApply === true &&
            descriptor.receiptChecksumPolicy.receiptKey === descriptor.id
        )),
        true,
        'receipt and checksum policy'
    );
    assert.throws(
        () => registry.verifyMigrationFiles(registry.F1A_MIGRATIONS, {
            lstatSync: fs.lstatSync,
            readFileSync: () => Buffer.from('synthetic checksum mismatch', 'utf8')
        }),
        /SELLER_F1_REGISTRY_CHECKSUM_MISMATCH/u
    );
};

const runFutureDbEnabledExecution = async (argumentsList, helper, registry) => {
    const authorization = authorizeFutureDatabaseExecution(argumentsList, helper, registry);
    const { Client } = await import('pg');
    const state = { sqlStatements: 0 };
    const targetDatabase = authorization.cleanupAuthorization.connection.database;
    const administratorConfig = Object.freeze({
        ...authorization.clientConfig,
        database: 'postgres'
    });
    const administrator = new Client(administratorConfig);
    const target = new Client(authorization.clientConfig);
    let administratorConnected = false;
    let targetConnected = false;
    let databaseCreated = false;
    let cleanupVerified = false;

    try {
        await administrator.connect();
        administratorConnected = true;
        const existing = await execute(
            administrator,
            state,
            'SELECT 1 FROM pg_database WHERE datname = $1',
            [targetDatabase]
        );
        assert.equal(existing.rowCount, 0, 'disposable database must be fresh');

        await execute(administrator, state, `CREATE DATABASE ${quoteIdentifier(targetDatabase)}`);
        databaseCreated = true;

        await target.connect();
        targetConnected = true;
        await execute(target, state, 'CREATE TABLE users (id SERIAL PRIMARY KEY)');
        await execute(target, state, 'CREATE TABLE stores (id BIGSERIAL PRIMARY KEY, is_active BOOLEAN NOT NULL DEFAULT TRUE, deleted_at TIMESTAMPTZ)');

        await applyVerifiedMigrations(target, state, authorization.verifiedDescriptors);
        await verifyFreshSchema(target, state);
        await verifyRuntimeGuards(target, state);
        await applyVerifiedMigrations(target, state, authorization.verifiedDescriptors);
        await verifyIntentionalFailureRollback(target, state);
        verifyReceiptAndChecksumPolicy(registry);

        return Object.freeze({
            verificationSteps: FUTURE_DATABASE_VERIFICATION_STEPS,
            receiptPolicy: 'FUTURE_DB_ENABLED_RUNNER_ONLY',
            cleanupAuthorization: authorization.cleanupAuthorization,
            sqlStatements: state.sqlStatements,
            databaseConnections: 2,
            get cleanupVerified() {
                return cleanupVerified;
            }
        });
    } finally {
        if (targetConnected) {
            await target.end();
            targetConnected = false;
        }
        if (administratorConnected && databaseCreated) {
            await execute(
                administrator,
                state,
                'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
                [targetDatabase]
            );
            await execute(administrator, state, `DROP DATABASE ${quoteIdentifier(targetDatabase)}`);
            const residue = await execute(
                administrator,
                state,
                'SELECT 1 FROM pg_database WHERE datname = $1',
                [targetDatabase]
            );
            assert.equal(residue.rowCount, 0, 'disposable database residue');
            cleanupVerified = true;
        }
        if (administratorConnected) {
            await administrator.end();
        }
    }
};

const runGuardOnly = () => {
    const helperPath = path.join(__dirname, 'helpers', 'sellerF1DisposableDb.js');
    const registryPath = path.join(__dirname, '..', 'models', 'sellerF1MigrationRegistry.js');
    const helperSource = fs.readFileSync(helperPath, 'utf8');
    const registrySource = fs.readFileSync(registryPath, 'utf8');
    const cachedBeforeImport = new Set(Object.keys(require.cache));
    const originalLoad = Module._load;
    const originalNetConnect = net.connect;
    const originalNetCreateConnection = net.createConnection;
    const originalTlsConnect = tls.connect;
    let postgresImports = 0;
    let socketCalls = 0;
    let remoteTargetsRejected = 0;
    let unsafeOptinsRejected = 0;
    let sqlStatements = 0;

    const rejectSocket = () => {
        socketCalls += 1;
        throw new Error('socket operation is forbidden in guard-only mode');
    };

    try {
        Module._load = function guardedModuleLoad(request, parent, isMain) {
            if (request === 'pg') {
                postgresImports += 1;
                throw new Error('PostgreSQL import is forbidden in guard-only mode');
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        net.connect = rejectSocket;
        net.createConnection = rejectSocket;
        tls.connect = rejectSocket;

        const helper = require('./helpers/sellerF1DisposableDb');
        const registry = require('../models/sellerF1MigrationRegistry');
        const validTarget = helper.validateDisposableDbTarget({
            host: '127.0.0.1',
            database: `${helper.TEST_DATABASE_PREFIX}integration_guard_only`,
            port: 5432,
            ssl: false
        });
        registry.verifyMigrationFiles();

        for (const host of ['db.example.test', '192.168.1.10', 'host.docker.internal']) {
            assert.throws(
                () => helper.validateDisposableDbTarget({
                    host,
                    database: `${helper.TEST_DATABASE_PREFIX}remote_probe`,
                    username: 'never-disclose-this',
                    password: 'never-disclose-this'
                }),
                (error) => error.code === 'SELLER_F1_DB_HOST_REJECTED' && !error.message.includes('never-disclose-this')
            );
            remoteTargetsRejected += 1;
        }

        for (const database of ['postgres', 'novastore_dev', 'novastore_seller_f1_test_production']) {
            assert.throws(
                () => helper.validateDisposableDbTarget({ host: 'localhost', database }),
                /SELLER_F1_DB_NAME_REJECTED/u
            );
            unsafeOptinsRejected += 1;
        }

        const migrationPaths = registry.F1A_MIGRATIONS.map((descriptor) => path.basename(descriptor.relativePath));
        assert.throws(
            () => helper.authorizeMigrationApply({ connection: validTarget, migrationPaths }),
            /SELLER_F1_DB_OPERATION_EXPLICIT_OPT_IN_REQUIRED/u
        );
        unsafeOptinsRejected += 1;
        assert.throws(
            () => helper.authorizeMigrationApply({
                allowDbOperation: true,
                connection: validTarget,
                migrationPaths
            }),
            /SELLER_F1_MIGRATION_APPLY_AUTHORIZATION_REQUIRED/u
        );
        unsafeOptinsRejected += 1;
        assert.throws(
            () => helper.authorizeDisposableDbCleanup({
                allowDbOperation: true,
                connection: validTarget
            }),
            /SELLER_F1_DB_CLEANUP_AUTHORIZATION_REQUIRED/u
        );
        unsafeOptinsRejected += 1;

        assert.throws(
            () => helper.validateMigrationPath('../package.json'),
            /SELLER_F1_MIGRATION_PATH_ESCAPE_REJECTED/u
        );
        assert.throws(
            () => helper.validateMigrationPath('20260701_category_v2_additive_foundation.sql'),
            /SELLER_F1_MIGRATION_PATH_UNAUTHORIZED/u
        );
        assert.throws(
            () => registry.resolveMigrationPath('../package.json'),
            /SELLER_F1_REGISTRY_PATH_ESCAPE_REJECTED/u
        );
        assert.throws(
            () => registry.resolveMigrationPath('migrations/20260701_category_v2_additive_foundation.sql'),
            /SELLER_F1_REGISTRY_UNEXPECTED_MIGRATION/u
        );

        const checksumMismatchIo = {
            lstatSync: fs.lstatSync,
            readFileSync: () => Buffer.from('synthetic checksum mismatch', 'utf8')
        };
        assert.throws(
            () => registry.verifyMigrationFiles(registry.F1A_MIGRATIONS, checksumMismatchIo),
            /SELLER_F1_REGISTRY_CHECKSUM_MISMATCH/u
        );

        assert.doesNotMatch(helperSource, /require\(['"]pg['"]\)|process\.env|DATABASE_URL/u);
        assert.doesNotMatch(registrySource, /require\(['"]pg['"]\)|process\.env|DATABASE_URL/u);
        assert.equal(postgresImports, 0);
        assert.equal(socketCalls, 0);
        assert.equal(sqlStatements, 0);
        assert.equal(
            Object.keys(require.cache)
                .filter((cacheKey) => !cachedBeforeImport.has(cacheKey))
                .some((cacheKey) => /[\\/]node_modules[\\/]pg[\\/]/u.test(cacheKey)),
            false
        );
    } finally {
        Module._load = originalLoad;
        net.connect = originalNetConnect;
        net.createConnection = originalNetCreateConnection;
        tls.connect = originalTlsConnect;
    }

    console.log('sellerF1MigrationDisposableDbIntegrationSmoke:');
    console.log('PASS');
    console.log('mode=guard-only');
    console.log('registry-migrations=4');
    console.log('db-connections=0');
    console.log('sql-statements=0');
    console.log(`remote-targets-rejected=${remoteTargetsRejected}`);
    console.log(`unsafe-optins-rejected=${unsafeOptinsRejected}`);
};

const main = async () => {
    const argumentsList = process.argv.slice(2);
    if (argumentsList.includes('--guard-only')) {
        runGuardOnly();
        return;
    }

    if (!argumentsList.includes('--db-enabled')) {
        fail('SELLER_F1_DB_GUARD_ONLY_MODE_REQUIRED');
    }

    const helper = require('./helpers/sellerF1DisposableDb');
    const registry = require('../models/sellerF1MigrationRegistry');
    const result = await runFutureDbEnabledExecution(argumentsList, helper, registry);
    console.log('sellerF1MigrationDisposableDbIntegrationSmoke:');
    console.log('PASS');
    console.log('mode=db-enabled');
    console.log('registry-migrations=4');
    console.log(`db-connections=${result.databaseConnections}`);
    console.log(`sql-statements=${result.sqlStatements}`);
    console.log(`verification-steps=${result.verificationSteps.join(',')}`);
    console.log(`receipt-policy=${result.receiptPolicy}`);
    console.log(`guarded-cleanup=${result.cleanupVerified ? 'PASS' : 'FAIL'}`);
};

main().catch((error) => {
    console.error('sellerF1MigrationDisposableDbIntegrationSmoke: BLOCKED');
    console.error(error && error.code ? error.code : 'SELLER_F1_DB_INTEGRATION_FAILED');
    if (error && error.code === 'ERR_ASSERTION') {
        console.error(error.stack);
    }
    process.exitCode = 1;
});

module.exports = Object.freeze({
    FUTURE_DATABASE_VERIFICATION_STEPS,
    authorizeFutureDatabaseExecution,
    parseDirectConnection
});
