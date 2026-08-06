const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationName = '20260806_supabase_rls_quarantine_fail_closed.sql';
const migrationPath = path.join(__dirname, '..', 'migrations', migrationName);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

const expectedCanonicalTables = [
    'admin_catalog_audit_events',
    'attribute_definitions',
    'attribute_options',
    'attribute_templates',
    'campaign_configs',
    'categories',
    'category_aliases',
    'category_stats',
    'collection_products',
    'collection_rules',
    'collections',
    'coupons',
    'customer_addresses',
    'favorites',
    'invoices',
    'menu_items',
    'menus',
    'messages',
    'notification_audit_logs',
    'notifications',
    'order_events',
    'order_item_backfill_issues',
    'order_items',
    'orders',
    'page_visits',
    'payments',
    'product_actions',
    'product_attribute_values',
    'product_categories',
    'product_media',
    'product_questions',
    'products',
    'returns',
    'review_media',
    'reviews',
    'shipments',
    'stores',
    'template_attributes',
    'user_shared_state',
    'users',
    'visitor_sessions',
    'webhook_events'
];

const canonicalBlock = migrationSql.match(
    /-- CANONICAL_PUBLIC_TABLES_BEGIN([\s\S]*?)-- CANONICAL_PUBLIC_TABLES_END/
);
assert.ok(canonicalBlock, 'migration must expose an auditable canonical-table block');

const actualCanonicalTables = [...canonicalBlock[1].matchAll(/'([^']+)'/g)]
    .map((match) => match[1]);
assert.deepEqual(actualCanonicalTables, expectedCanonicalTables);
assert.equal(actualCanonicalTables.length, 42);
assert.equal(new Set(actualCanonicalTables).size, 42);

assert.match(migrationSql, /^BEGIN;\s*$/im);
assert.match(migrationSql, /^COMMIT;\s*$/im);
assert.match(migrationSql, /SET LOCAL search_path = pg_catalog/i);
assert.match(migrationSql, /ARRAY\['anon', 'authenticated'\]/i);
assert.match(
    migrationSql,
    /'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'/i
);

const mutationMarkerIndex = migrationSql.indexOf('-- MUTATIONS_BEGIN');
assert.notEqual(mutationMarkerIndex, -1, 'migration must make its preflight/mutation boundary explicit');
const preflightSql = migrationSql.slice(0, mutationMarkerIndex);
const mutationAndPostconditionsSql = migrationSql.slice(mutationMarkerIndex);

assert.doesNotMatch(
    preflightSql,
    /^\s*(?:ALTER\s+TABLE|REVOKE)\b/im,
    'all preflight checks must complete before any mutation'
);
assert.match(mutationAndPostconditionsSql, /ENABLE ROW LEVEL SECURITY/i);
assert.match(mutationAndPostconditionsSql, /REVOKE ALL PRIVILEGES ON TABLE/i);
assert.match(mutationAndPostconditionsSql, /REVOKE ALL PRIVILEGES \(%s\) ON TABLE/i);
assert.match(mutationAndPostconditionsSql, /REVOKE ALL PRIVILEGES ON SEQUENCE/i);
assert.match(mutationAndPostconditionsSql, /has_table_privilege/i);
assert.match(mutationAndPostconditionsSql, /has_column_privilege/i);
assert.match(mutationAndPostconditionsSql, /has_sequence_privilege/i);

assert.match(migrationSql, /canonical public tables are missing/i);
assert.match(migrationSql, /unexpected public data relations/i);
assert.match(migrationSql, /unexpected policies exist/i);
assert.match(migrationSql, /PUBLIC table or column ACLs exist/i);
assert.match(migrationSql, /PUBLIC sequence ACLs exist/i);
assert.match(migrationSql, /target tables reference sequences outside public/i);
assert.match(migrationSql, /a Data API role owns target tables/i);
assert.match(migrationSql, /a Data API role owns target sequences/i);
assert.match(migrationSql, /pg_try_advisory_xact_lock/i);
assert.match(migrationSql, /LOCK TABLE %s IN ACCESS EXCLUSIVE MODE/i);
assert.match(migrationSql, /Data API roles can execute public SECURITY DEFINER routines/i);
assert.match(migrationSql, /relation\.relkind IN \('r', 'p', 'f', 'v', 'm'\)/i);

assert.match(migrationSql, /relation\.relname = 'assistant_events'/i);
assert.match(migrationSql, /IF assistant_oid IS NOT NULL THEN/i);
assert.match(migrationSql, /array_append\(target_tables, 'assistant_events'\)/i);
assert.match(migrationSql, /assistant_events column signature drifted/i);
assert.match(migrationSql, /assistant_events user foreign-key signature drifted/i);
assert.match(migrationSql, /assistant_events product foreign-key signature drifted/i);
assert.match(migrationSql, /assistant_events index signature drifted/i);
for (const indexName of [
    'assistant_events_pkey',
    'idx_assistant_events_name_created_at',
    'idx_assistant_events_product_id',
    'idx_assistant_events_session_id'
]) {
    assert.match(migrationSql, new RegExp(indexName));
}

const forbiddenContracts = [
    ['table creation', /\bCREATE\s+(?:UNLOGGED\s+)?TABLE\b/i],
    ['table deletion', /\bDROP\s+TABLE\b/i],
    ['row insertion', /\bINSERT\s+INTO\b/i],
    ['row deletion', /\bDELETE\s+FROM\b/i],
    ['row truncation', /\bTRUNCATE\s+(?:TABLE\s+)?public\./i],
    ['row update', /\bUPDATE\s+public\./i],
    ['RLS disablement', /\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i],
    ['FORCE RLS', /\bFORCE\s+ROW\s+LEVEL\s+SECURITY\b/i],
    ['policy creation', /\bCREATE\s+POLICY\b/i],
    ['policy deletion', /\bDROP\s+POLICY\b/i],
    ['broad grant', /\bGRANT\s+/i],
    ['default-privilege mutation', /\bALTER\s+DEFAULT\s+PRIVILEGES\b/i],
    ['historical ownership comment', /\bCOMMENT\s+ON\s+TABLE\b/i],
    ['Supabase Auth policy', /auth\.uid\s*\(/i],
    ['connection URL', /postgres(?:ql)?:\/\//i]
];
for (const [label, pattern] of forbiddenContracts) {
    assert.doesNotMatch(migrationSql, pattern, `migration contains forbidden ${label}`);
}

assert.doesNotMatch(
    migrationSql,
    /CREATE\s+(?:UNLOGGED\s+)?TABLE[\s\S]{0,100}assistant_events/i,
    'the optional quarantine table must never be created by this migration'
);

for (const startupPath of [
    'server.js',
    'models/createCoreDb.js',
    'models/createCommerceDb.js',
    'models/createAnalyticsDb.js',
    'models/createNotificationDb.js'
]) {
    const startupSource = fs.readFileSync(path.join(__dirname, '..', startupPath), 'utf8');
    assert.doesNotMatch(
        startupSource,
        /supabase_rls_quarantine_fail_closed/i,
        `${migrationName} must remain an explicit deployment operation, not a startup side effect`
    );
}

console.log('Supabase RLS quarantine contract smoke: PASS (42 canonical tables)');
