const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadRegistry } = require('../scripts/staging-migrations/registry');
const {
    applyLocalSellerMigrations,
    selectLocalSellerMigrations,
    selectSellerMigrations
} = require('../models/applyLocalSellerMigrations');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const count = (source, pattern) => (source.match(pattern) || []).length;

(async () => {
    const registry = loadRegistry();
    assert.equal(registry.length, 29);

    const sellerMigrations = selectSellerMigrations({ registry });
    assert.deepEqual(
        sellerMigrations.map((migration) => migration.path),
        [
            'migrations/20260730_seller_f1_organizations_roles_memberships.sql',
            'migrations/20260730_seller_f1_store_bindings_invitations.sql',
            'migrations/20260730_seller_f1_sessions_audit_outbox.sql',
            'migrations/20260806_seller_f1b_bootstrap_operator_authorizations.sql',
            'migrations/20260806_seller_wave3_business_verticals.sql'
        ]
    );
    const localSellerMigrations = selectLocalSellerMigrations({ registry });
    assert.deepEqual(
        localSellerMigrations.map((migration) => migration.path),
        [
            ...sellerMigrations.map((migration) => migration.path),
            'migrations/20260820_01_main6t_seller_session_membership_binding.sql',
            'migrations/20260821_01_seller_password_recovery.sql',
            'migrations/20260821_02_seller_applications.sql',
            'migrations/20260822_01_seller_application_terms_authority.sql'
        ]
    );

    const mismatchedRegistry = registry.map((migration) => (
        migration.path === sellerMigrations[0].path
            ? { ...migration, sha256: '0'.repeat(64) }
            : migration
    ));
    assert.throws(
        () => selectSellerMigrations({ registry: mismatchedRegistry }),
        /disagrees with Seller registry/
    );

    const statements = [];
    let released = false;
    const database = {
        async connect() {
            return {
                async query(sql) { statements.push(sql); },
                release() { released = true; }
            };
        }
    };
    const applied = await applyLocalSellerMigrations({ database, registry, output: () => {} });
    assert.deepEqual(applied, localSellerMigrations.map((migration) => migration.id));
    assert.equal(statements.filter((sql) => sql === 'BEGIN').length, 9);
    assert.equal(statements.filter((sql) => sql === 'COMMIT').length, 9);
    assert.equal(statements.filter((sql) => sql === 'ROLLBACK').length, 0);
    assert.equal(released, true);

    let failedRelease = false;
    let executionCount = 0;
    const failingDatabase = {
        async connect() {
            return {
                async query(sql) {
                    if (!['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
                        executionCount += 1;
                        if (executionCount === 2) throw new Error('synthetic Seller migration failure');
                    }
                },
                release() { failedRelease = true; }
            };
        }
    };
    await assert.rejects(
        applyLocalSellerMigrations({ database: failingDatabase, registry, output: () => {} }),
        /synthetic Seller migration failure/
    );
    assert.equal(failedRelease, true);

    const server = read('server.js');
    assert.equal(count(server, /http\.createServer\(/g), 1);
    assert.equal(count(server, /server\.listen\(/g), 1);
    assert.equal(count(server, /^start\(\);$/gmu), 1);
    assert.equal(count(server, /createSellerAuthRouter\(\{/g), 1);
    assert.equal(count(server, /createSellerContextRouter\(\{/g), 1);
    assert.equal(count(server, /createSellerBusinessRouter\(\{/g), 1);
    assert.match(server, /SELLER_API_V1_ENABLED[\s\S]*SELLER_API_V1_LOCAL_ONLY/);
    assert.match(server, /Seller API local mode requires a named loopback database/);
    assert.match(server, /Seller API local mode requires NOVASTORE_BIND_HOST=127\.0\.0\.1/);

    const coreIndex = server.indexOf('await createCoreSchema();');
    const sellerIndex = server.indexOf('await applyLocalSellerMigrations();');
    const main6sIndex = server.indexOf('await applyLocalMain6sOperationMigrations();');
    assert.ok(coreIndex >= 0 && coreIndex < sellerIndex && sellerIndex < main6sIndex);

    const settings = read('settings.gradle.kts');
    assert.equal(count(settings, /include\(":app"\)/g), 1);
    assert.equal(count(settings, /include\(":seller-app"\)/g), 1);

    console.log('main6t combined integration smoke passed: migrations=29 seller=5 binding=1 main6u=3 listeners=1 routes=38');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
