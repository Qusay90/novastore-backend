const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    MAIN6S_OPERATION_MIGRATION_IDS,
    applyLocalMain6sOperationMigrations,
    selectOperationMigrations
} = require('../models/applyLocalMain6sOperationMigrations');
const { loadRegistry } = require('../scripts/staging-migrations/registry');

const root = path.resolve(__dirname, '..');
const registry = loadRegistry();
const selected = selectOperationMigrations(registry);
assert.deepEqual(selected.map(({ id }) => id), MAIN6S_OPERATION_MIGRATION_IDS);
assert(selected.every(({ executionSql }) => !/^\s*BEGIN\s*;/i.test(executionSql)));

const queries = [];
let released = 0;
const database = {
    async connect() {
        return {
            async query(sql) {
                queries.push(sql);
                return { rows: [] };
            },
            release() {
                released += 1;
            }
        };
    }
};

(async () => {
    const logs = [];
    const applied = await applyLocalMain6sOperationMigrations({
        database,
        registry,
        output: (line) => logs.push(line)
    });
    assert.deepEqual(applied, MAIN6S_OPERATION_MIGRATION_IDS);
    assert.equal(released, 1);
    assert.equal(queries.length, MAIN6S_OPERATION_MIGRATION_IDS.length * 3);
    for (let index = 0; index < MAIN6S_OPERATION_MIGRATION_IDS.length; index += 1) {
        assert.equal(queries[index * 3], 'BEGIN');
        assert.equal(queries[index * 3 + 1], selected[index].executionSql);
        assert.equal(queries[index * 3 + 2], 'COMMIT');
        assert.equal(logs[index], `LOCAL_SCHEMA_READY ${MAIN6S_OPERATION_MIGRATION_IDS[index]}`);
    }

    const failedQueries = [];
    let failedRelease = 0;
    const failingDatabase = {
        async connect() {
            return {
                async query(sql) {
                    failedQueries.push(sql);
                    if (sql === selected[1].executionSql) throw new Error('synthetic migration failure');
                    return { rows: [] };
                },
                release() {
                    failedRelease += 1;
                }
            };
        }
    };
    await assert.rejects(
        () => applyLocalMain6sOperationMigrations({
            database: failingDatabase,
            registry,
            output: () => {}
        }),
        /synthetic migration failure/
    );
    assert.deepEqual(failedQueries.slice(-2), [selected[1].executionSql, 'ROLLBACK']);
    assert.equal(failedRelease, 1);

    assert.throws(
        () => selectOperationMigrations(registry.filter(({ id }) => id !== MAIN6S_OPERATION_MIGRATION_IDS[0])),
        /registry is incomplete/
    );

    const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    const analyticsInit = serverSource.indexOf('await createAnalyticsSchema();');
    const operationInit = serverSource.indexOf('await applyLocalMain6sOperationMigrations();');
    assert(analyticsInit >= 0 && operationInit > analyticsInit);

    console.log('local Main6S schema init smoke passed: migrations=4 rollback=PASS ordering=PASS');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
