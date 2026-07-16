const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const migrationPath = path.join(
    __dirname,
    '..',
    'migrations',
    '20260716_00_stage_a_catalog_prerequisites.sql'
);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

assert.match(migrationSql, /^BEGIN;/i);
assert.match(migrationSql, /LOWER\(slug\) = 'novastore-platform'/i);
assert.match(migrationSql, /ON CONFLICT \(LOWER\(slug\)\)/i);
assert.match(migrationSql, /inserted_store_count NOT IN \(0, 1\)/i);
assert.match(migrationSql, /platform_store_count <> 1/i);
assert.match(migrationSql, /COMMIT;\s*$/i);
assert.doesNotMatch(migrationSql, /\b(?:UPDATE|DELETE|TRUNCATE|DROP)\b/i);

const connectionString = process.env.STAGE_A_PREREQUISITE_TEST_DATABASE_URL;
if (!connectionString) {
    console.log('stage A catalog prerequisite migration smoke: SQL contract PASS; DB smoke SKIP');
    process.exit(0);
}

const parsed = new URL(connectionString);
assert.ok(
    ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname),
    'Stage A prerequisite smoke only accepts a local PostgreSQL target.'
);
const databaseName = parsed.pathname.replace(/^\/+/, '');
assert.notEqual(databaseName, 'postgres', 'Stage A prerequisite smoke rejects the postgres maintenance DB.');

const schemaName = `stage_a_prerequisite_${process.pid}`;
const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

(async () => {
    const client = new Client({ connectionString, application_name: 'stage_a_prerequisite_smoke' });
    await client.connect();
    try {
        await client.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
        await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
        await client.query(`
            CREATE TABLE stores (
                id BIGSERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(255),
                owner_user_id INTEGER,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMPTZ
            );
            CREATE UNIQUE INDEX idx_stores_slug_unique
                ON stores (LOWER(slug))
                WHERE slug IS NOT NULL AND deleted_at IS NULL;
        `);

        await client.query(migrationSql);
        let result = await client.query(`
            SELECT id, name, slug, is_active, deleted_at
            FROM stores
            WHERE LOWER(slug) = 'novastore-platform'
            ORDER BY id
        `);
        assert.equal(result.rowCount, 1);
        assert.equal(result.rows[0].name, 'NovaStore');
        assert.equal(result.rows[0].slug, 'novastore-platform');
        assert.equal(result.rows[0].is_active, true);
        assert.equal(result.rows[0].deleted_at, null);

        await client.query("UPDATE stores SET name = 'Existing Owner Value' WHERE id = $1", [result.rows[0].id]);
        await client.query(migrationSql);
        result = await client.query(`
            SELECT id, name
            FROM stores
            WHERE LOWER(slug) = 'novastore-platform'
              AND is_active = TRUE
              AND deleted_at IS NULL
        `);
        assert.equal(result.rowCount, 1);
        assert.equal(result.rows[0].name, 'Existing Owner Value', 're-run must not overwrite an existing row');

        await client.query('TRUNCATE stores RESTART IDENTITY');
        const rollbackSql = migrationSql.replace(/COMMIT;\s*$/i, () => `
            DO $forced_failure$ BEGIN
                RAISE EXCEPTION 'intentional partial-failure smoke';
            END $forced_failure$;
            COMMIT;
        `);
        await assert.rejects(client.query(rollbackSql), /intentional partial-failure smoke/);
        await client.query('ROLLBACK');
        result = await client.query("SELECT COUNT(*)::INTEGER AS count FROM stores WHERE LOWER(slug) = 'novastore-platform'");
        assert.equal(result.rows[0].count, 0, 'partial failure must roll back the seed');

        console.log('stage A catalog prerequisite migration smoke: PASS');
    } finally {
        await client.end();
    }
})().catch((error) => {
    const code = error && error.code ? ` ${error.code}` : '';
    const message = String(error?.message || 'unknown failure').replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DB_URL]');
    console.error(`stage A prerequisite smoke failed:${code} ${message}`);
    process.exitCode = 1;
});
