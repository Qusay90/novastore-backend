const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migrationName = '20260820_supabase_legacy_drift_reconciliation.sql';
const migrationPath = path.join(root, 'migrations', migrationName);
const rollbackPath = path.join(
    root,
    'migrations',
    'rollback',
    '20260820_supabase_legacy_drift_reconciliation.rollback.sql'
);
const pr26Path = path.join(root, 'migrations', '20260806_supabase_rls_quarantine_fail_closed.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');
const pr26Bytes = fs.readFileSync(pr26Path);
const pr26GitBlobBytes = execFileSync(
    'git',
    ['cat-file', 'blob', 'HEAD:migrations/20260806_supabase_rls_quarantine_fail_closed.sql'],
    { cwd: root }
);

const columnPairs = [
    ['visitor_sessions', 'started_at'],
    ['visitor_sessions', 'last_seen_at'],
    ['page_visits', 'entered_at'],
    ['page_visits', 'last_seen_at'],
    ['page_visits', 'duration_seconds'],
    ['page_visits', 'heartbeat_count'],
    ['product_actions', 'quantity'],
    ['product_actions', 'created_at'],
    ['notifications', 'is_read'],
    ['notifications', 'created_at'],
    ['returns', 'status'],
    ['returns', 'created_at'],
    ['returns', 'updated_at']
];
const expectedIndexes = [
    'idx_product_actions_user_id',
    'idx_product_actions_created_at',
    'idx_notifications_created_at',
    'idx_returns_status',
    'idx_returns_created_at'
];

assert.match(migrationSql, /^BEGIN;\s*$/im);
assert.match(migrationSql, /^COMMIT;\s*$/im);
assert.match(migrationSql, /SET LOCAL search_path = pg_catalog/i);
assert.match(migrationSql, /SET LOCAL lock_timeout = '5s'/i);
assert.match(migrationSql, /pg_try_advisory_xact_lock/i);
assert.match(migrationSql, /IN ACCESS EXCLUSIVE MODE/i);
assert.match(migrationSql, /MUTATIONS_BEGIN/i);
assert.match(migrationSql, /PARTIAL_FAILURE_TEST_HOOK/i);
assert.match(migrationSql, /expected exactly 7 qualifying source items/i);
assert.match(migrationSql, /partial prior execution detected/i);
assert.match(migrationSql, /business-equivalent order items exist under different keys/i);
assert.match(migrationSql, /no deterministic historical repair source/i);
assert.match(migrationSql, /original sequential issue query still expects/i);
assert.match(migrationSql, /pg_get_serial_sequence\('public\.order_items', 'id'\)/i);
assert.match(migrationSql, /ALTER SEQUENCE public\.order_items_id_seq RESTART WITH/i);
assert.match(migrationSql, /GET DIAGNOSTICS inserted_item_count = ROW_COUNT/i);
assert.doesNotMatch(migrationSql, /INSERT\s+INTO\s+public\.order_item_backfill_issues/i);
assert.doesNotMatch(migrationSql, /\b(?:GRANT|REVOKE)\b/i);
assert.doesNotMatch(migrationSql, /ALTER\s+TABLE[\s\S]{0,80}(?:ENABLE|DISABLE|FORCE|NO FORCE)\s+ROW\s+LEVEL\s+SECURITY/i);
assert.doesNotMatch(migrationSql, /CREATE\s+POLICY|DROP\s+POLICY/i);

const mutationBoundary = migrationSql.indexOf('-- MUTATIONS_BEGIN');
assert.notEqual(mutationBoundary, -1);
const preflight = migrationSql.slice(0, mutationBoundary);
assert.doesNotMatch(preflight, /^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/im);

for (const [table, column] of columnPairs) {
    assert.match(
        migrationSql,
        new RegExp(`\\('${table}', '${column}'`, 'i'),
        `${table}.${column} must be in the preflight contract`
    );
    assert.match(
        migrationSql,
        new RegExp(`ALTER TABLE public\\.%I ALTER COLUMN %I SET NOT NULL`, 'i'),
        'migration must use the guarded NOT NULL mutation loop'
    );
    assert.match(
        rollbackSql,
        new RegExp(`'${table}', '${column}'`, 'i'),
        `${table}.${column} must be in the rollback contract`
    );
}
assert.equal(new Set(columnPairs.map(([table, column]) => `${table}.${column}`)).size, 13);

for (const indexName of expectedIndexes) {
    assert.match(migrationSql, new RegExp(indexName, 'i'));
    assert.match(rollbackSql, new RegExp(`DROP INDEX public\\.${indexName}`, 'i'));
}

assert.match(rollbackSql, /NOT_SAFELY_REVERSIBLE/i);
assert.match(rollbackSql, /CONDITIONAL overall exactness/i);
assert.match(rollbackSql, /DATA RETENTION BOUNDARY/i);
assert.doesNotMatch(rollbackSql, /^\s*(?:DELETE|TRUNCATE)\b/im);
assert.match(rollbackSql, /ALTER COLUMN started_at DROP NOT NULL/i);
assert.match(rollbackSql, /^COMMIT;\s*$/im);

assert.equal(
    crypto.createHash('sha256').update(pr26GitBlobBytes).digest('hex'),
    '0dff91788290d7b75192759aa061a65d49be2498c38b28d8c973e00fcdbe5353',
    'PR26 migration bytes must remain exact'
);
assert.equal(
    pr26Bytes.toString('utf8').replace(/\r\n/g, '\n'),
    pr26GitBlobBytes.toString('utf8'),
    'PR26 worktree content must normalize to the exact committed Git blob'
);
assert.ok(
    migrationName.localeCompare(path.basename(pr26Path)) > 0,
    'newly authored migration is intentionally later by filename; runbook must impose explicit order'
);

console.log('Supabase legacy drift reconciliation contract smoke: PASS');
