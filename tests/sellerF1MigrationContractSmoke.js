'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const repositoryRoot = path.resolve(__dirname, '..');
const migrationsDirectory = path.join(repositoryRoot, 'migrations');
const expectedMigrations = [
    '20260730_seller_f1_organizations_roles_memberships.sql',
    '20260730_seller_f1_store_bindings_invitations.sql',
    '20260730_seller_f1_sessions_audit_outbox.sql',
    '20260806_seller_f1b_bootstrap_operator_authorizations.sql'
];
const expectedTablesByMigration = new Map([
    [expectedMigrations[0], [
        'seller_organizations',
        'seller_roles',
        'seller_permissions',
        'seller_role_permissions',
        'seller_memberships'
    ]],
    [expectedMigrations[1], [
        'seller_stores',
        'seller_membership_store_scopes',
        'seller_invitations'
    ]],
    [expectedMigrations[2], [
        'seller_sessions',
        'seller_refresh_token_families',
        'seller_refresh_tokens',
        'seller_step_up_challenges',
        'seller_audit_events',
        'seller_outbox_events',
        'seller_outbox_delivery_attempts'
    ]],
    [expectedMigrations[3], [
        'seller_bootstrap_operator_authorizations'
    ]]
]);

const readStrictUtf8 = (filePath) => {
    const bytes = fs.readFileSync(filePath);
    assert.ok(bytes.length > 0, `migration is empty: ${filePath}`);
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], `UTF-8 BOM is forbidden: ${filePath}`);

    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
        assert.fail(`invalid UTF-8: ${filePath}: ${error.message}`);
    }

    assert.equal(text.includes('\r'), false, `CR or CRLF found: ${filePath}`);
    assert.equal(text.endsWith('\n'), true, `missing final LF newline: ${filePath}`);
    text.split('\n').forEach((line, index) => {
        assert.doesNotMatch(line, /[ \t]$/, `trailing ASCII space or tab: ${filePath}:${index + 1}`);
    });
    return text;
};

const requireMatch = (text, expression, label) => {
    assert.match(text, expression, `missing F1A migration contract: ${label}`);
};

const sourceEvidence = () => {
    const usersSource = fs.readFileSync(path.join(repositoryRoot, 'models', 'createCoreDb.js'), 'utf8');
    const storesSource = fs.readFileSync(
        path.join(migrationsDirectory, '20260701_category_v2_additive_foundation.sql'),
        'utf8'
    );

    requireMatch(usersSource, /CREATE TABLE IF NOT EXISTS users\s*\(\s*id SERIAL PRIMARY KEY,/s, 'users.id SERIAL source evidence');
    requireMatch(storesSource, /CREATE TABLE IF NOT EXISTS stores\s*\(\s*id BIGSERIAL PRIMARY KEY,/s, 'stores.id BIGSERIAL source evidence');
    assert.doesNotMatch(usersSource, /ALTER TABLE users[\s\S]*?ALTER COLUMN id\s+TYPE/iu, 'users.id source type must not be widened');
    assert.doesNotMatch(storesSource, /ALTER TABLE stores[\s\S]*?ALTER COLUMN id\s+TYPE/iu, 'stores.id source type must not be changed');
};

try {
    const matchingNames = fs.readdirSync(migrationsDirectory)
        .filter((name) => expectedMigrations.includes(name))
        .sort();
    assert.deepEqual(matchingNames, [...expectedMigrations].sort(), 'F1A migration file set must be exact');

    const migrations = new Map();
    for (const name of expectedMigrations) {
        const filePath = path.join(migrationsDirectory, name);
        const stats = fs.lstatSync(filePath);
        assert.equal(stats.isSymbolicLink(), false, `migration must not be a symbolic link: ${name}`);
        assert.equal(stats.isFile(), true, `migration must be a regular file: ${name}`);
        migrations.set(name, readStrictUtf8(filePath));
    }

    sourceEvidence();

    const allSql = [...migrations.values()].join('\n');
    for (const [name, expectedTables] of expectedTablesByMigration) {
        const sql = migrations.get(name);
        const actualTables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/gu)]
            .map((match) => match[1])
            .sort();
        assert.deepEqual(actualTables, [...expectedTables].sort(), `table assignment mismatch: ${name}`);
        requireMatch(sql, /^BEGIN;[\s\S]*SET LOCAL lock_timeout = '5s';[\s\S]*SET LOCAL statement_timeout = '30s';/u, `${name} transaction and bounded timeouts`);
        requireMatch(sql, /\nCOMMIT;\n$/u, `${name} commit boundary`);
        assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/gu) || []).length, expectedTables.length, `${name} table idempotency`);
    }

    const destructivePatterns = [
        /\bDROP\s+(?:TABLE|SCHEMA|DATABASE|INDEX|FUNCTION|TRIGGER)\b/iu,
        /\bTRUNCATE\b/iu,
        /\bDELETE\s+FROM\b/iu,
        /\bALTER\s+TABLE\b[\s\S]*?\bDROP\b/iu
    ];
    destructivePatterns.forEach((pattern) => {
        assert.doesNotMatch(allSql, pattern, `destructive SQL is forbidden: ${pattern}`);
    });

    const remotePatterns = [
        /postgres(?:ql)?:\/\//iu,
        /\b(?:render|railway|supabase|pooler|staging|production)\b/iu,
        /\b(?:[a-z0-9-]+\.)+(?:com|net|org)\b/iu
    ];
    remotePatterns.forEach((pattern) => {
        assert.doesNotMatch(allSql, pattern, `remote or credential marker is forbidden: ${pattern}`);
    });

    requireMatch(migrations.get(expectedMigrations[0]), /user_id INTEGER NOT NULL REFERENCES users\(id\)/u, 'seller_memberships.user_id INTEGER parity');
    requireMatch(migrations.get(expectedMigrations[1]), /legacy_store_id BIGINT REFERENCES stores\(id\)/u, 'seller_stores.legacy_store_id BIGINT parity');
    requireMatch(migrations.get(expectedMigrations[2]), /user_id INTEGER NOT NULL REFERENCES users\(id\)/u, 'seller_sessions.user_id INTEGER parity');
    requireMatch(migrations.get(expectedMigrations[2]), /actor_user_id INTEGER REFERENCES users\(id\)/u, 'seller_audit_events.actor_user_id INTEGER parity');
    assert.doesNotMatch(allSql, /(?:user_id|actor_user_id) BIGINT[^\n]*REFERENCES users/iu, 'users FKs must not use BIGINT');
    assert.doesNotMatch(allSql, /legacy_store_id INTEGER[^\n]*REFERENCES stores/iu, 'stores FK must not use INTEGER');

    requireMatch(allSql, /FOREIGN KEY \(organization_id, membership_id\)[\s\S]*?REFERENCES seller_memberships\(organization_id, id\)/u, 'membership composite tenant foreign keys');
    requireMatch(migrations.get(expectedMigrations[1]), /FOREIGN KEY \(organization_id, store_id\)[\s\S]*?REFERENCES seller_stores\(organization_id, id\)/u, 'scope composite store foreign key');
    requireMatch(migrations.get(expectedMigrations[0]), /seller_guard_membership_role_scope/u, 'membership role scope trigger');
    requireMatch(migrations.get(expectedMigrations[0]), /seller_guard_last_active_owner/u, 'last owner guard');
    requireMatch(migrations.get(expectedMigrations[0]), /uq_seller_memberships_live_organization_user/u, 'live membership uniqueness');
    requireMatch(migrations.get(expectedMigrations[0]), /seller_prevent_platform_permission_grant/u, 'platform permission deny guard');
    requireMatch(migrations.get(expectedMigrations[0]), /\('owner', 'Owner', FALSE\)/u, 'non-assignable owner seed');
    requireMatch(migrations.get(expectedMigrations[1]), /seller_guard_invitation_role_scope/u, 'invitation role scope guard');
    requireMatch(migrations.get(expectedMigrations[1]), /scope_kind = 'assigned'/u, 'no wildcard scope');
    requireMatch(migrations.get(expectedMigrations[2]), /uq_seller_refresh_tokens_active_family/u, 'single active refresh token guard');
    requireMatch(migrations.get(expectedMigrations[2]), /status IN \('active', 'consumed', 'replaced', 'revoked', 'expired'\)/u, 'refresh lifecycle states');
    requireMatch(migrations.get(expectedMigrations[2]), /seller_reject_append_only_mutation/u, 'append-only rejection function');
    requireMatch(migrations.get(expectedMigrations[3]), /target_owner_user_id INTEGER NOT NULL/u, 'bootstrap owner INTEGER parity');
    requireMatch(migrations.get(expectedMigrations[3]), /target_legacy_store_id BIGINT NOT NULL/u, 'bootstrap store BIGINT parity');
    requireMatch(migrations.get(expectedMigrations[3]), /FOREIGN KEY \(target_owner_user_id\) REFERENCES users\(id\)/u, 'bootstrap owner foreign key');
    requireMatch(migrations.get(expectedMigrations[3]), /FOREIGN KEY \(target_legacy_store_id\) REFERENCES stores\(id\)/u, 'bootstrap store foreign key');
    requireMatch(migrations.get(expectedMigrations[3]), /FIRST_PARTY_SELLER_BOOTSTRAP/u, 'bootstrap purpose binding');
    requireMatch(migrations.get(expectedMigrations[3]), /decision_payload_sha256/u, 'bootstrap payload hash');
    requireMatch(migrations.get(expectedMigrations[3]), /intended_organization_display_name/u, 'bootstrap organization display binding');
    requireMatch(migrations.get(expectedMigrations[3]), /intended_seller_store_display_name/u, 'bootstrap store display binding');
    requireMatch(migrations.get(expectedMigrations[3]), /status IN \('pending', 'consumed', 'revoked', 'expired'\)/u, 'bootstrap authorization lifecycle states');
    requireMatch(migrations.get(expectedMigrations[3]), /uq_seller_bootstrap_operator_authorizations_pending_target/u, 'bootstrap pending uniqueness');
    ['seller_audit_events', 'seller_outbox_events', 'seller_outbox_delivery_attempts'].forEach((tableName) => {
        requireMatch(migrations.get(expectedMigrations[2]), new RegExp(`BEFORE UPDATE OR DELETE ON ${tableName}`, 'u'), `${tableName} append-only trigger`);
    });
    assert.doesNotMatch(allSql, /\braw_?(?:refresh_)?token\b/iu, 'raw token storage is forbidden');

    const tableCount = [...expectedTablesByMigration.values()].reduce((count, tables) => count + tables.length, 0);
    console.log('sellerF1MigrationContractSmoke:');
    console.log('PASS');
    console.log(`migrations=${expectedMigrations.length}`);
    console.log(`tables=${tableCount}`);
    console.log('external-fk-type-mismatches=0');
    console.log('destructive-statements=0');
    console.log('remote-targets=0');
} catch (error) {
    console.error('sellerF1MigrationContractSmoke: FAIL');
    console.error(error.stack || error.message);
    process.exitCode = 1;
}
