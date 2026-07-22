const { Client } = require('pg');
const { loadRegistry } = require('./registry');
const { validateTarget } = require('./guard');

const LEDGER_TABLE = 'novastore_schema_migrations';
const RUNNER_VERSION = 'p4d-1a-v1';
const MIGRATION_LOCK_KEYS = Object.freeze([764103, 20260722]);

const makeError = (message, code) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

const createDefaultClient = (target, applicationName = 'novastore_staging_migrations') => new Client({
    connectionString: target.connectionString,
    application_name: applicationName
});

const assertConnectedDatabase = async (client, target) => {
    const result = await client.query('SELECT current_database() AS database');
    const actual = String(result.rows[0]?.database || '');
    if (actual !== target.database) {
        throw makeError('Connected database does not match the explicit expected database.', 'CONNECTED_DATABASE_MISMATCH');
    }
    await client.query('SET search_path TO public, pg_catalog');
    const schemaResult = await client.query('SELECT current_schema() AS schema');
    if (schemaResult.rows[0]?.schema !== 'public') {
        throw makeError('Migration session could not establish the public schema.', 'SCHEMA_CONTEXT_MISMATCH');
    }
};

const ledgerExists = async (client) => {
    const result = await client.query(
        `SELECT to_regclass('public.${LEDGER_TABLE}') IS NOT NULL AS exists`
    );
    return result.rows[0]?.exists === true;
};

const readLedgerRows = async (client) => {
    if (!(await ledgerExists(client))) return [];
    const result = await client.query(
        `SELECT migration_id, migration_path, sha256, applied_at
         FROM ${LEDGER_TABLE}
         ORDER BY migration_id`
    );
    return result.rows;
};

const validateLedgerRows = (registry, rows) => {
    const known = new Map(registry.map((migration) => [migration.id, migration]));
    const applied = new Set();

    for (const row of rows) {
        const migration = known.get(row.migration_id);
        if (!migration) {
            throw makeError(`Unknown migration ledger entry: ${row.migration_id}.`, 'UNKNOWN_LEDGER_ENTRY');
        }
        if (row.migration_path !== migration.path) {
            throw makeError(`Migration path mismatch for ${row.migration_id}.`, 'LEDGER_PATH_MISMATCH');
        }
        if (row.sha256 !== migration.sha256) {
            throw makeError(`Migration checksum mismatch for ${row.migration_id}.`, 'LEDGER_CHECKSUM_MISMATCH');
        }
        applied.add(row.migration_id);
    }

    return applied;
};

const getMigrationStatus = (registry, rows) => {
    const applied = validateLedgerRows(registry, rows);
    return registry.map((migration) => ({
        id: migration.id,
        path: migration.path,
        sha256: migration.sha256,
        status: applied.has(migration.id) ? 'applied' : 'pending'
    }));
};

const acquireLock = async (client, keys = MIGRATION_LOCK_KEYS) => {
    const result = await client.query(
        'SELECT pg_try_advisory_lock($1::INTEGER, $2::INTEGER) AS locked',
        keys
    );
    if (result.rows[0]?.locked !== true) {
        throw makeError('Another migration runner holds the staging migration lock.', 'MIGRATION_LOCK_UNAVAILABLE');
    }
};

const releaseLock = async (client, keys = MIGRATION_LOCK_KEYS) => {
    await client.query('SELECT pg_advisory_unlock($1::INTEGER, $2::INTEGER)', keys);
};

const assertUnmanagedSchemaEmpty = async (client) => {
    const result = await client.query(
        `SELECT
            (SELECT COUNT(*)::INTEGER
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public'
               AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f'))
            +
            (SELECT COUNT(*)::INTEGER
             FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public')
            +
            (SELECT COUNT(*)::INTEGER
             FROM pg_type t
             JOIN pg_namespace n ON n.oid = t.typnamespace
             LEFT JOIN pg_class c ON c.oid = t.typrelid
             WHERE n.nspname = 'public'
               AND t.typisdefined
               AND (
                   t.typtype IN ('d', 'e', 'r', 'm')
                   OR (t.typtype = 'c' AND c.relkind = 'c')
                   OR (t.typtype = 'b' AND t.typelem = 0 AND t.typrelid = 0)
               )) AS object_count`
    );
    if (Number(result.rows[0]?.object_count || 0) !== 0) {
        throw makeError(
            'Refusing to adopt a non-empty schema without the NovaStore migration ledger.',
            'UNMANAGED_SCHEMA'
        );
    }
};

const createLedger = async (client) => {
    await client.query('BEGIN');
    try {
        await client.query(
            `CREATE TABLE ${LEDGER_TABLE} (
                migration_id TEXT PRIMARY KEY,
                migration_path TEXT NOT NULL UNIQUE,
                sha256 CHAR(64) NOT NULL,
                runner_version TEXT NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT novastore_schema_migrations_sha256_check
                    CHECK (sha256 ~ '^[0-9a-f]{64}$')
            )`
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
};

const executeTransactionalMigration = async (
    client,
    migration,
    { runnerVersion = RUNNER_VERSION } = {}
) => {
    if (migration.mode !== 'transactional') {
        throw makeError(`Unsupported migration mode for ${migration.id}.`, 'UNSUPPORTED_MIGRATION_MODE');
    }

    await client.query('BEGIN');
    try {
        await client.query(migration.executionSql);
        await client.query(
            `INSERT INTO ${LEDGER_TABLE} (
                migration_id,
                migration_path,
                sha256,
                runner_version
             ) VALUES ($1, $2, $3, $4)`,
            [migration.id, migration.path, migration.sha256, runnerVersion]
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
};

const runPlan = async ({ registry = loadRegistry(), output = console.log, createClient } = {}) => {
    if (createClient) {
        // Kept only as an injectable proof point: plan never invokes this factory.
    }
    output(`Migration plan: ${registry.length} canonical LF migration(s).`);
    for (const migration of registry) {
        output(`${migration.id} ${migration.path} sha256=${migration.sha256} mode=${migration.mode}`);
    }
    return registry.map(({ id, path, sha256, mode }) => ({ id, path, sha256, mode }));
};

const runStatus = async ({
    env = process.env,
    registry = loadRegistry(),
    createClient = createDefaultClient,
    output = console.log
} = {}) => {
    const target = validateTarget(env);
    const client = createClient(target, 'novastore_staging_migration_status');
    try {
        await client.connect();
        await assertConnectedDatabase(client, target);
        await client.query('BEGIN READ ONLY');
        try {
            const rows = await readLedgerRows(client);
            const status = getMigrationStatus(registry, rows);
            await client.query('COMMIT');
            for (const entry of status) output(`${entry.status.toUpperCase()} ${entry.id}`);
            return status;
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        }
    } finally {
        await client.end().catch(() => {});
    }
};

const runApply = async ({
    env = process.env,
    registry = loadRegistry(),
    createClient = createDefaultClient,
    output = console.log
} = {}) => {
    const target = validateTarget(env);
    const client = createClient(target, 'novastore_staging_migration_apply');
    let locked = false;
    try {
        await client.connect();
        await assertConnectedDatabase(client, target);
        await acquireLock(client);
        locked = true;

        if (!(await ledgerExists(client))) {
            await assertUnmanagedSchemaEmpty(client);
            await createLedger(client);
        }

        const rows = await readLedgerRows(client);
        const applied = validateLedgerRows(registry, rows);
        const pending = registry.filter((migration) => !applied.has(migration.id));

        for (const migration of pending) {
            await executeTransactionalMigration(client, migration);
            output(`APPLIED ${migration.id}`);
        }

        if (pending.length === 0) output('NO-OP all migrations are already applied.');
        return { applied: pending.map((migration) => migration.id), pending: 0 };
    } finally {
        if (locked) await releaseLock(client).catch(() => {});
        await client.end().catch(() => {});
    }
};

module.exports = {
    LEDGER_TABLE,
    MIGRATION_LOCK_KEYS,
    RUNNER_VERSION,
    acquireLock,
    assertConnectedDatabase,
    assertUnmanagedSchemaEmpty,
    createDefaultClient,
    createLedger,
    executeTransactionalMigration,
    getMigrationStatus,
    ledgerExists,
    readLedgerRows,
    releaseLock,
    runApply,
    runPlan,
    runStatus,
    validateLedgerRows
};
