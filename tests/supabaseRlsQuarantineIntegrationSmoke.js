const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { Client } = require('pg');

const REQUIRED_HOST = '127.0.0.1';
const REQUIRED_PORT = '55436';
const REQUIRED_DATABASE = 'novastore_rls_hardening_admin';
const FORBIDDEN_TARGET_MARKERS = [
    'supabase',
    'pooler',
    '.com',
    'amazonaws',
    'render',
    'railway',
    'neon.tech'
];
const migrationPath = path.join(
    __dirname,
    '..',
    'migrations',
    '20260806_supabase_rls_quarantine_fail_closed.sql'
);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

const canonicalTables = [
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
const dataApiRoles = ['anon', 'authenticated'];
const tablePrivileges = [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER'
];
const columnPrivileges = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'];
const sequencePrivileges = ['USAGE', 'SELECT', 'UPDATE'];

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;
const redact = (value) => String(value || 'unknown failure')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DB_URL]')
    .replace(/password\s*=\s*[^\s]+/gi, 'password=[REDACTED]');

const assertSafeLocalDatabaseUrl = (rawUrl) => {
    const normalized = String(rawUrl || '').trim();
    const parsed = new URL(normalized);
    assert.ok(
        ['postgres:', 'postgresql:'].includes(parsed.protocol),
        'RLS integration smoke requires a PostgreSQL URL.'
    );
    assert.equal(parsed.hostname, REQUIRED_HOST, 'RLS integration smoke only accepts 127.0.0.1.');
    assert.equal(parsed.port, REQUIRED_PORT, 'RLS integration smoke requires its fixed loopback port.');
    assert.equal(
        parsed.pathname.replace(/^\/+/, ''),
        REQUIRED_DATABASE,
        'RLS integration smoke requires its dedicated admin database.'
    );
    assert.ok(parsed.username, 'RLS integration smoke requires an explicit local admin role.');
    assert.ok(parsed.password, 'RLS integration smoke requires an explicit local synthetic password.');
    assert.ok(
        FORBIDDEN_TARGET_MARKERS.every((marker) => !normalized.toLowerCase().includes(marker)),
        'RLS integration smoke rejected a remote-provider marker.'
    );
    return parsed;
};

const rawAdminUrl = process.env.NOVASTORE_RLS_LOCAL_DATABASE_URL;
if (!rawAdminUrl) {
    console.log('Supabase RLS quarantine integration smoke: DB replay SKIP (explicit local URL absent)');
    process.exit(0);
}
const parsedAdminUrl = assertSafeLocalDatabaseUrl(rawAdminUrl);

let activeSchemaClient = null;
const dbModulePath = require.resolve('../config/db');
const dbStubModule = new Module(dbModulePath);
dbStubModule.filename = dbModulePath;
dbStubModule.loaded = true;
dbStubModule.exports = {
    query(...args) {
        assert.ok(activeSchemaClient, 'schema query attempted without an active disposable client');
        return activeSchemaClient.query(...args);
    }
};
require.cache[dbModulePath] = dbStubModule;

const createCoreSchema = require('../models/createCoreDb');
const createNotificationsSchema = require('../models/createNotificationDb');
const createCommerceSchema = require('../models/createCommerceDb');
const createAnalyticsSchema = require('../models/createAnalyticsDb');

const runRealSchemaChain = async (client) => {
    activeSchemaClient = client;
    try {
        await createCoreSchema();
        await createNotificationsSchema();
        await createCommerceSchema();
        await createAnalyticsSchema();
    } finally {
        activeSchemaClient = null;
    }
};

const assertCanonicalSchema = async (client) => {
    const result = await client.query(`
        SELECT relation.relname
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'f')
        ORDER BY relation.relname
    `);
    assert.deepEqual(result.rows.map((row) => row.relname), canonicalTables);
};

const createAssistantEventsFixture = async (client) => {
    await client.query(`
        CREATE TABLE public.assistant_events (
            id SERIAL,
            session_id VARCHAR(80) NOT NULL,
            user_id INTEGER,
            event_name VARCHAR(80) NOT NULL,
            tool_name VARCHAR(80),
            intent VARCHAR(80),
            product_id INTEGER,
            query_text TEXT,
            page VARCHAR(120),
            status VARCHAR(40) DEFAULT 'success',
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT assistant_events_pkey PRIMARY KEY (id),
            CONSTRAINT assistant_events_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL,
            CONSTRAINT assistant_events_product_id_fkey
                FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL
        );
        CREATE INDEX idx_assistant_events_name_created_at
            ON public.assistant_events (event_name, created_at DESC);
        CREATE INDEX idx_assistant_events_product_id
            ON public.assistant_events (product_id);
        CREATE INDEX idx_assistant_events_session_id
            ON public.assistant_events (session_id);
        INSERT INTO public.assistant_events (
            session_id, event_name, tool_name, intent, query_text, page, created_at
        ) VALUES (
            'synthetic-session', 'synthetic-event', 'synthetic-tool', 'synthetic-intent',
            'synthetic-query', '/synthetic', TIMESTAMP '2026-08-06 12:34:56'
        );
    `);
};

const snapshotAssistantEvents = async (client) => {
    const relation = await client.query(`
        SELECT relation.oid::TEXT AS oid
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'assistant_events'
    `);
    const columns = await client.query(`
        SELECT
            attribute.attname,
            pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
            attribute.attnotnull,
            pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid) AS default_expression
        FROM pg_catalog.pg_attribute AS attribute
        LEFT JOIN pg_catalog.pg_attrdef AS attribute_default
          ON attribute_default.adrelid = attribute.attrelid
         AND attribute_default.adnum = attribute.attnum
        WHERE attribute.attrelid = 'public.assistant_events'::pg_catalog.regclass
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
        ORDER BY attribute.attnum
    `);
    const constraints = await client.query(`
        SELECT constraint_entry.conname,
               pg_catalog.pg_get_constraintdef(constraint_entry.oid, FALSE) AS definition
        FROM pg_catalog.pg_constraint AS constraint_entry
        WHERE constraint_entry.conrelid = 'public.assistant_events'::pg_catalog.regclass
        ORDER BY constraint_entry.conname
    `);
    const indexes = await client.query(`
        SELECT index_relation.relname,
               pg_catalog.pg_get_indexdef(index_relation.oid) AS definition
        FROM pg_catalog.pg_index AS index_entry
        JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_entry.indexrelid
        WHERE index_entry.indrelid = 'public.assistant_events'::pg_catalog.regclass
        ORDER BY index_relation.relname
    `);
    const rows = await client.query(`
        SELECT to_jsonb(assistant_event) AS value
        FROM public.assistant_events AS assistant_event
        ORDER BY id
    `);
    return {
        oid: relation.rows[0].oid,
        columns: columns.rows,
        constraints: constraints.rows,
        indexes: indexes.rows,
        rows: rows.rows
    };
};

const grantSupabaseLikeAccess = async (client) => {
    await client.query(`
        GRANT USAGE ON SCHEMA public TO anon, authenticated;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
        GRANT SELECT (id), INSERT (name), UPDATE (name), REFERENCES (id)
            ON public.products TO anon, authenticated;
    `);
    const explicitColumnAcl = await client.query(`
        SELECT attribute.attname
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.products'::pg_catalog.regclass
          AND attribute.attname IN ('id', 'name')
          AND attribute.attacl IS NOT NULL
        ORDER BY attribute.attname
    `);
    assert.deepEqual(explicitColumnAcl.rows.map((row) => row.attname), ['id', 'name']);
};

const assertRollbackPreserved = async (client, options = {}) => {
    const tables = [...(options.tables || canonicalTables)].sort();
    const roles = options.roles || dataApiRoles;
    const rlsTables = [...(options.rlsTables || tables)].sort();
    const expectExplicitColumnAcl = options.expectExplicitColumnAcl !== false;

    const rlsResult = await client.query(`
        SELECT relation.relname, relation.relrowsecurity, relation.relforcerowsecurity
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = ANY($1::TEXT[])
        ORDER BY relation.relname
    `, [rlsTables]);
    assert.deepEqual(rlsResult.rows.map((row) => row.relname), rlsTables);
    assert.ok(
        rlsResult.rows.every((row) => row.relrowsecurity === false && row.relforcerowsecurity === false),
        'failed migration must preserve the pre-migration RLS state on every checked table'
    );

    const missingTablePrivileges = await client.query(`
        SELECT role_name, table_name, privilege_name
        FROM pg_catalog.unnest($1::TEXT[]) AS role_name
        CROSS JOIN pg_catalog.unnest($2::TEXT[]) AS table_name
        CROSS JOIN pg_catalog.unnest($3::TEXT[]) AS privilege_name
        WHERE NOT pg_catalog.has_table_privilege(
            role_name,
            pg_catalog.format('%I.%I', 'public', table_name),
            privilege_name
        )
    `, [roles, tables, tablePrivileges]);
    assert.equal(
        missingTablePrivileges.rowCount,
        0,
        'failed migration must preserve all seven table privileges for every fixture role/table pair'
    );

    const sequenceCount = await client.query(`
        SELECT pg_catalog.count(*)::INTEGER AS count
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind = 'S'
    `);
    assert.ok(sequenceCount.rows[0].count > 0, 'rollback fixture must contain public sequences');

    const missingSequencePrivileges = await client.query(`
        SELECT role_name, relation.relname, privilege_name
        FROM pg_catalog.unnest($1::TEXT[]) AS role_name
        CROSS JOIN pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN pg_catalog.unnest($2::TEXT[]) AS privilege_name
        WHERE namespace.nspname = 'public'
          AND relation.relkind = 'S'
          AND NOT pg_catalog.has_sequence_privilege(
              role_name,
              relation.oid,
              privilege_name
          )
    `, [roles, sequencePrivileges]);
    assert.equal(
        missingSequencePrivileges.rowCount,
        0,
        'failed migration must preserve all sequence privileges for every fixture role'
    );

    if (expectExplicitColumnAcl) {
        const explicitColumnAcl = await client.query(`
            SELECT owner_role.rolname, attribute.attname, acl.privilege_type
            FROM pg_catalog.pg_attribute AS attribute
            JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl ON TRUE
            JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = acl.grantee
            WHERE attribute.attrelid = 'public.products'::pg_catalog.regclass
              AND owner_role.rolname = ANY($1::TEXT[])
              AND attribute.attname IN ('id', 'name')
            ORDER BY owner_role.rolname, attribute.attname, acl.privilege_type
        `, [roles]);
        const actualAcl = new Set(explicitColumnAcl.rows.map((row) => (
            `${row.rolname}:${row.attname}:${row.privilege_type}`
        )));
        for (const roleName of roles) {
            for (const expectedAcl of [
                `${roleName}:id:REFERENCES`,
                `${roleName}:id:SELECT`,
                `${roleName}:name:INSERT`,
                `${roleName}:name:UPDATE`
            ]) {
                assert.ok(actualAcl.has(expectedAcl), `failed migration removed explicit column ACL ${expectedAcl}`);
            }
        }
        assert.equal(actualAcl.size, roles.length * 4);
    }
};

const expectMigrationFailure = async (client, expectedMessage) => {
    let failure = null;
    try {
        await client.query(migrationSql);
    } catch (error) {
        failure = error;
    }
    assert.ok(failure, 'migration was expected to fail closed');
    assert.match(redact(failure.message), expectedMessage);
    await client.query('ROLLBACK');
};

const assertHardened = async (client, expectedTables, backendRole) => {
    const rlsResult = await client.query(`
        SELECT relation.relname, relation.relrowsecurity, relation.relforcerowsecurity,
               pg_catalog.pg_get_userbyid(relation.relowner) AS owner_name
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
        ORDER BY relation.relname
    `);
    assert.deepEqual(rlsResult.rows.map((row) => row.relname), expectedTables);
    assert.ok(rlsResult.rows.every((row) => row.relrowsecurity === true));
    assert.ok(rlsResult.rows.every((row) => row.relforcerowsecurity === false));
    assert.ok(rlsResult.rows.every((row) => row.owner_name === backendRole));

    const policyResult = await client.query(`
        SELECT pg_catalog.count(*)::INTEGER AS count
        FROM pg_catalog.pg_policy AS policy
        JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
    `);
    assert.equal(policyResult.rows[0].count, 0);

    const tablePrivilegeResult = await client.query(`
        SELECT role_name, table_name, privilege_name
        FROM pg_catalog.unnest($1::TEXT[]) AS role_name
        CROSS JOIN pg_catalog.unnest($2::TEXT[]) AS table_name
        CROSS JOIN pg_catalog.unnest($3::TEXT[]) AS privilege_name
        WHERE pg_catalog.has_table_privilege(
            role_name,
            pg_catalog.format('%I.%I', 'public', table_name),
            privilege_name
        )
    `, [dataApiRoles, expectedTables, tablePrivileges]);
    assert.equal(tablePrivilegeResult.rowCount, 0);

    const columnPrivilegeResult = await client.query(`
        SELECT role_name, relation.relname, attribute.attname, privilege_name
        FROM pg_catalog.unnest($1::TEXT[]) AS role_name
        CROSS JOIN pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = relation.oid
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
        CROSS JOIN pg_catalog.unnest($2::TEXT[]) AS privilege_name
        WHERE namespace.nspname = 'public'
          AND relation.relname = ANY($3::TEXT[])
          AND pg_catalog.has_column_privilege(
              role_name,
              relation.oid,
              attribute.attname,
              privilege_name
          )
    `, [dataApiRoles, columnPrivileges, expectedTables]);
    assert.equal(columnPrivilegeResult.rowCount, 0);

    const sequencePrivilegeResult = await client.query(`
        SELECT role_name, namespace.nspname, relation.relname, privilege_name
        FROM pg_catalog.unnest($1::TEXT[]) AS role_name
        CROSS JOIN pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN pg_catalog.unnest($2::TEXT[]) AS privilege_name
        WHERE namespace.nspname = 'public'
          AND relation.relkind = 'S'
          AND pg_catalog.has_sequence_privilege(
              role_name,
              relation.oid,
              privilege_name
          )
    `, [dataApiRoles, sequencePrivileges]);
    assert.equal(sequencePrivilegeResult.rowCount, 0);

    const backendResult = await client.query(`
        SELECT role_entry.rolsuper, role_entry.rolbypassrls
        FROM pg_catalog.pg_roles AS role_entry
        WHERE role_entry.rolname = current_user
    `);
    assert.deepEqual(backendResult.rows[0], { rolsuper: false, rolbypassrls: true });
};

const assertDenied = async (client, roleName, sql) => {
    await client.query(`SET ROLE ${quoteIdentifier(roleName)}`);
    try {
        await assert.rejects(
            client.query(sql),
            (error) => error && error.code === '42501',
            `${roleName} query must fail with insufficient_privilege`
        );
    } finally {
        await client.query('RESET ROLE');
    }
};

const assertDataApiRuntimeDenied = async (client) => {
    for (const roleName of dataApiRoles) {
        await assertDenied(client, roleName, 'SELECT id FROM public.products LIMIT 1');
        await assertDenied(
            client,
            roleName,
            `INSERT INTO public.campaign_configs (key, value)
             VALUES ('data-api-denial-probe', 'denied')`
        );
        await assertDenied(client, roleName, `SELECT nextval('public.products_id_seq')`);
    }
};

const assertOwnerCrud = async (client) => {
    await client.query('BEGIN');
    try {
        await client.query(`
            INSERT INTO public.campaign_configs (key, value)
            VALUES ('rls-owner-crud-probe', 'created')
        `);
        let result = await client.query(`
            SELECT value FROM public.campaign_configs WHERE key = 'rls-owner-crud-probe'
        `);
        assert.equal(result.rows[0].value, 'created');
        await client.query(`
            UPDATE public.campaign_configs SET value = 'updated' WHERE key = 'rls-owner-crud-probe'
        `);
        result = await client.query(`
            DELETE FROM public.campaign_configs
            WHERE key = 'rls-owner-crud-probe'
            RETURNING value
        `);
        assert.equal(result.rows[0].value, 'updated');
    } finally {
        await client.query('ROLLBACK');
    }
};

const connectionUrlFor = (databaseName, username, password) => {
    const url = new URL(parsedAdminUrl.toString());
    url.pathname = `/${databaseName}`;
    url.username = username;
    url.password = password;
    return url.toString();
};

const adminClient = new Client({
    connectionString: parsedAdminUrl.toString(),
    application_name: 'novastore_rls_hardening_admin'
});
const backendRole = `novastore_rls_owner_${process.pid}`;
const backendPassword = crypto.randomBytes(24).toString('hex');
const helperRole = `novastore_rls_inherited_${process.pid}`;
const databasesToClean = new Set();
const rolesToClean = [];
const passedScenarios = [];
let scenarioCounter = 0;

const dropDatabase = async (databaseName) => {
    assert.match(databaseName, /^novastore_rls_case_[0-9]+_[0-9]+_[a-z0-9_]+$/);
    await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
    databasesToClean.delete(databaseName);
};

const runScenario = async (slug, callback) => {
    scenarioCounter += 1;
    const databaseName = `novastore_rls_case_${process.pid}_${scenarioCounter}_${slug}`;
    databasesToClean.add(databaseName);
    await adminClient.query(
        `CREATE DATABASE ${quoteIdentifier(databaseName)} OWNER ${quoteIdentifier(backendRole)} TEMPLATE template0`
    );
    const client = new Client({
        connectionString: connectionUrlFor(databaseName, backendRole, backendPassword),
        application_name: `novastore_rls_${slug}`
    });
    try {
        await client.connect();
        await runRealSchemaChain(client);
        await assertCanonicalSchema(client);
        await callback(client, { databaseName });
        passedScenarios.push(slug);
    } finally {
        await client.end().catch(() => {});
        await dropDatabase(databaseName);
    }
};

(async () => {
    await adminClient.connect();
    const targetProof = await adminClient.query(`
        SELECT current_database() AS database_name,
               current_setting('server_version_num')::INTEGER AS server_version_num,
               role_entry.rolsuper
        FROM pg_catalog.pg_roles AS role_entry
        WHERE role_entry.rolname = current_user
    `);
    assert.equal(targetProof.rows[0].database_name, REQUIRED_DATABASE);
    assert.equal(Math.floor(targetProof.rows[0].server_version_num / 10000), 16);
    assert.equal(targetProof.rows[0].rolsuper, true, 'disposable fixture setup requires its local admin role');

    const reservedRoles = await adminClient.query(
        `SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY($1::TEXT[]) ORDER BY rolname`,
        [[...dataApiRoles, backendRole, helperRole]]
    );
    assert.equal(
        reservedRoles.rowCount,
        0,
        'dedicated disposable cluster must not contain pre-existing test roles'
    );

    await adminClient.query('CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS');
    rolesToClean.push('anon');
    await adminClient.query(
        'CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS'
    );
    rolesToClean.push('authenticated');
    await adminClient.query(`
        CREATE ROLE ${quoteIdentifier(backendRole)}
        LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT BYPASSRLS
        PASSWORD '${backendPassword}'
    `);
    rolesToClean.push(backendRole);
    await adminClient.query(
        `GRANT anon, authenticated TO ${quoteIdentifier(backendRole)}`
    );

    await runScenario('assistant_absent', async (client) => {
        await grantSupabaseLikeAccess(client);
        await client.query(migrationSql);
        await assertHardened(client, canonicalTables, backendRole);
        const assistantResult = await client.query(`SELECT to_regclass('public.assistant_events') AS relation`);
        assert.equal(assistantResult.rows[0].relation, null);
        await assertDataApiRuntimeDenied(client);
        await assertOwnerCrud(client);
        await client.query(migrationSql);
        await assertHardened(client, canonicalTables, backendRole);
    });

    await runScenario('assistant_present', async (client) => {
        await createAssistantEventsFixture(client);
        const before = await snapshotAssistantEvents(client);
        await grantSupabaseLikeAccess(client);
        await client.query(migrationSql);
        await assertHardened(client, [...canonicalTables, 'assistant_events'].sort(), backendRole);
        const after = await snapshotAssistantEvents(client);
        assert.deepEqual(after, before, 'assistant_events structure and synthetic rows must be preserved');
        await assertDataApiRuntimeDenied(client);
        await assertDenied(client, 'anon', 'SELECT id FROM public.assistant_events LIMIT 1');
        await assertOwnerCrud(client);
        await client.query(migrationSql);
        await assertHardened(client, [...canonicalTables, 'assistant_events'].sort(), backendRole);
        assert.deepEqual(await snapshotAssistantEvents(client), before);
    });

    await runScenario('assistant_column_drift', async (client) => {
        await createAssistantEventsFixture(client);
        await client.query('ALTER TABLE public.assistant_events ADD COLUMN unexpected_probe TEXT');
        const before = await snapshotAssistantEvents(client);
        await grantSupabaseLikeAccess(client);
        await expectMigrationFailure(client, /assistant_events column count drifted/i);
        await assertRollbackPreserved(client, { tables: [...canonicalTables, 'assistant_events'] });
        assert.deepEqual(await snapshotAssistantEvents(client), before);
    });

    await runScenario('assistant_fk_drift', async (client) => {
        await createAssistantEventsFixture(client);
        await client.query(`
            ALTER TABLE public.assistant_events DROP CONSTRAINT assistant_events_user_id_fkey;
            ALTER TABLE public.assistant_events
                ADD CONSTRAINT assistant_events_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
        `);
        const before = await snapshotAssistantEvents(client);
        await grantSupabaseLikeAccess(client);
        await expectMigrationFailure(client, /assistant_events user foreign-key signature drifted/i);
        await assertRollbackPreserved(client, { tables: [...canonicalTables, 'assistant_events'] });
        assert.deepEqual(await snapshotAssistantEvents(client), before);
    });

    await runScenario('assistant_default_drift', async (client) => {
        await createAssistantEventsFixture(client);
        await client.query(`
            ALTER TABLE public.assistant_events ALTER COLUMN status SET DEFAULT 'pending'
        `);
        const before = await snapshotAssistantEvents(client);
        await grantSupabaseLikeAccess(client);
        await expectMigrationFailure(client, /assistant_events column signature drifted.*status/i);
        await assertRollbackPreserved(client, { tables: [...canonicalTables, 'assistant_events'] });
        assert.deepEqual(await snapshotAssistantEvents(client), before);
    });

    await runScenario('assistant_primary_key_drift', async (client) => {
        await createAssistantEventsFixture(client);
        await client.query(`
            ALTER TABLE public.assistant_events DROP CONSTRAINT assistant_events_pkey;
            ALTER TABLE public.assistant_events
                ADD CONSTRAINT assistant_events_pkey PRIMARY KEY (id, session_id);
        `);
        const before = await snapshotAssistantEvents(client);
        await grantSupabaseLikeAccess(client);
        await expectMigrationFailure(client, /assistant_events primary-key signature drifted/i);
        await assertRollbackPreserved(client, { tables: [...canonicalTables, 'assistant_events'] });
        assert.deepEqual(await snapshotAssistantEvents(client), before);
    });

    await runScenario('assistant_index_drift', async (client) => {
        await createAssistantEventsFixture(client);
        await client.query(`
            DROP INDEX public.idx_assistant_events_session_id;
            CREATE INDEX idx_assistant_events_session_id
                ON public.assistant_events (session_id, event_name);
        `);
        const before = await snapshotAssistantEvents(client);
        await grantSupabaseLikeAccess(client);
        await expectMigrationFailure(client, /assistant_events index signature drifted/i);
        await assertRollbackPreserved(client, { tables: [...canonicalTables, 'assistant_events'] });
        assert.deepEqual(await snapshotAssistantEvents(client), before);
    });

    await runScenario('missing_canonical', async (client) => {
        await client.query('DROP TABLE public.category_stats');
        await grantSupabaseLikeAccess(client);
        await expectMigrationFailure(client, /canonical public tables are missing.*category_stats/i);
        await assertRollbackPreserved(client, {
            tables: canonicalTables.filter((tableName) => tableName !== 'category_stats')
        });
    });

    await runScenario('unexpected_table', async (client) => {
        await client.query('CREATE TABLE public.unexpected_probe (id INTEGER PRIMARY KEY)');
        await grantSupabaseLikeAccess(client);
        await expectMigrationFailure(client, /unexpected public data relations exist.*unexpected_probe/i);
        await assertRollbackPreserved(client, { tables: [...canonicalTables, 'unexpected_probe'] });
    });

    await runScenario('unexpected_views', async (client) => {
        await client.query(`
            CREATE VIEW public.product_view_probe AS
                SELECT id, name FROM public.products;
            CREATE MATERIALIZED VIEW public.product_materialized_probe AS
                SELECT id, name FROM public.products WITH NO DATA;
        `);
        await grantSupabaseLikeAccess(client);
        await expectMigrationFailure(client, /unexpected public data relations exist/i);
        await assertRollbackPreserved(client);
        const viewPrivileges = await client.query(`
            SELECT relation.relname,
                   pg_catalog.has_table_privilege('anon', relation.oid, 'SELECT') AS retained
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname IN ('product_view_probe', 'product_materialized_probe')
            ORDER BY relation.relname
        `);
        assert.deepEqual(
            viewPrivileges.rows,
            [
                { relname: 'product_materialized_probe', retained: true },
                { relname: 'product_view_probe', retained: true }
            ],
            'failed migration must not mutate view ACLs'
        );
    });

    await runScenario('public_acl', async (client) => {
        await grantSupabaseLikeAccess(client);
        await client.query('GRANT SELECT ON public.products TO PUBLIC');
        await expectMigrationFailure(client, /PUBLIC table or column ACLs exist/i);
        await assertRollbackPreserved(client);
    });

    await runScenario('public_column_acl', async (client) => {
        await grantSupabaseLikeAccess(client);
        await client.query('GRANT SELECT (id) ON public.products TO PUBLIC');
        await expectMigrationFailure(client, /PUBLIC table or column ACLs exist/i);
        await assertRollbackPreserved(client);
        const publicColumnAcl = await client.query(`
            SELECT pg_catalog.count(*)::INTEGER AS count
            FROM pg_catalog.pg_attribute AS attribute
            JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl ON TRUE
            WHERE attribute.attrelid = 'public.products'::pg_catalog.regclass
              AND attribute.attname = 'id'
              AND acl.grantee = 0
        `);
        assert.equal(publicColumnAcl.rows[0].count, 1);
    });

    await runScenario('existing_policy', async (client) => {
        await grantSupabaseLikeAccess(client);
        await client.query(`
            ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
            CREATE POLICY existing_policy_probe ON public.products
                FOR SELECT TO anon USING (TRUE);
        `);
        await expectMigrationFailure(client, /unexpected policies exist.*existing_policy_probe/i);
        await assertRollbackPreserved(client, {
            rlsTables: canonicalTables.filter((tableName) => tableName !== 'products')
        });
        const policyResult = await client.query(`
            SELECT pg_catalog.count(*)::INTEGER AS count
            FROM pg_catalog.pg_policy
            WHERE polrelid = 'public.products'::pg_catalog.regclass
              AND polname = 'existing_policy_probe'
        `);
        assert.equal(policyResult.rows[0].count, 1);
    });

    await runScenario('existing_force_rls', async (client) => {
        await grantSupabaseLikeAccess(client);
        await client.query(`
            ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
            ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
        `);
        await expectMigrationFailure(client, /FORCE RLS is already enabled.*products/i);
        await assertRollbackPreserved(client, {
            rlsTables: canonicalTables.filter((tableName) => tableName !== 'products')
        });
        const forceResult = await client.query(`
            SELECT relforcerowsecurity
            FROM pg_catalog.pg_class
            WHERE oid = 'public.products'::pg_catalog.regclass
        `);
        assert.equal(forceResult.rows[0].relforcerowsecurity, true);
    });

    await runScenario('security_definer_rpc', async (client) => {
        await client.query(`
            CREATE FUNCTION public.security_definer_probe()
            RETURNS INTEGER
            LANGUAGE SQL
            SECURITY DEFINER
            SET search_path = pg_catalog, public
            AS $function$
                SELECT pg_catalog.count(*)::INTEGER FROM public.products
            $function$;
            GRANT EXECUTE ON FUNCTION public.security_definer_probe() TO anon, authenticated;
        `);
        await grantSupabaseLikeAccess(client);
        await expectMigrationFailure(
            client,
            /Data API roles can execute public SECURITY DEFINER routines.*security_definer_probe/i
        );
        await assertRollbackPreserved(client);
        const functionPrivilege = await client.query(`
            SELECT pg_catalog.has_function_privilege(
                'anon', 'public.security_definer_probe()', 'EXECUTE'
            ) AS retained
        `);
        assert.equal(functionPrivilege.rows[0].retained, true);
    });

    await runScenario('external_sequence', async (client) => {
        await client.query(`
            CREATE SCHEMA extension_probe;
            CREATE SEQUENCE extension_probe.external_product_id_seq;
            ALTER TABLE public.products ALTER COLUMN id
                SET DEFAULT nextval('extension_probe.external_product_id_seq'::regclass);
        `);
        await grantSupabaseLikeAccess(client);
        await client.query(`
            GRANT USAGE ON SCHEMA extension_probe TO anon, authenticated;
            GRANT ALL PRIVILEGES ON SEQUENCE extension_probe.external_product_id_seq
                TO anon, authenticated;
        `);
        await expectMigrationFailure(client, /target tables reference sequences outside public/i);
        await assertRollbackPreserved(client);
        const externalPrivilege = await client.query(`
            SELECT pg_catalog.has_sequence_privilege(
                'anon', 'extension_probe.external_product_id_seq', 'USAGE'
            ) AS retained
        `);
        assert.equal(
            externalPrivilege.rows[0].retained,
            true,
            'failed migration must not mutate another schema sequence'
        );
    });

    await runScenario('advisory_lock_contention', async (client, { databaseName }) => {
        await grantSupabaseLikeAccess(client);
        const lockClient = new Client({
            connectionString: connectionUrlFor(databaseName, backendRole, backendPassword),
            application_name: 'novastore_rls_lock_holder'
        });
        await lockClient.connect();
        try {
            await lockClient.query('BEGIN');
            await lockClient.query(`
                SELECT pg_catalog.pg_advisory_xact_lock(
                    pg_catalog.hashtextextended('novastore:public-schema-security-ddl:v1', 0)
                )
            `);
            await expectMigrationFailure(client, /another NovaStore public-schema DDL operation holds/i);
            await assertRollbackPreserved(client);
        } finally {
            await lockClient.query('ROLLBACK').catch(() => {});
            await lockClient.end().catch(() => {});
        }
    });

    await adminClient.query(`REVOKE authenticated FROM ${quoteIdentifier(backendRole)}`);
    await adminClient.query('DROP ROLE authenticated');
    try {
        await runScenario('missing_role', async (client) => {
            await client.query(`
                GRANT USAGE ON SCHEMA public TO anon;
                GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon;
                GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon;
            `);
            await expectMigrationFailure(client, /required Data API roles are missing.*authenticated/i);
            await assertRollbackPreserved(client, {
                roles: ['anon'],
                expectExplicitColumnAcl: false
            });
        });
    } finally {
        await adminClient.query(
            'CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS'
        );
        await adminClient.query(`GRANT authenticated TO ${quoteIdentifier(backendRole)}`);
    }

    await adminClient.query(
        `CREATE ROLE ${quoteIdentifier(helperRole)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS`
    );
    rolesToClean.push(helperRole);
    await adminClient.query(`GRANT ${quoteIdentifier(helperRole)} TO anon`);
    await runScenario('inherited_acl', async (client) => {
        await grantSupabaseLikeAccess(client);
        await client.query(`GRANT SELECT ON public.products TO ${quoteIdentifier(helperRole)}`);
        await expectMigrationFailure(client, /role anon retains SELECT on public\.products/i);
        await assertRollbackPreserved(client);
    });
    await adminClient.query(`REVOKE ${quoteIdentifier(helperRole)} FROM anon`);

    console.log(
        `Supabase RLS quarantine integration smoke: PASS (${passedScenarios.length} scenarios: ` +
        `${passedScenarios.join(', ')})`
    );
})().catch((error) => {
    console.error(`Supabase RLS quarantine integration smoke failed: ${redact(error.message)}`);
    process.exitCode = 1;
}).finally(async () => {
    for (const databaseName of [...databasesToClean]) {
        await dropDatabase(databaseName).catch((error) => {
            console.error(`Disposable database cleanup failed: ${redact(error.message)}`);
            process.exitCode = 1;
        });
    }
    for (const roleName of rolesToClean.reverse()) {
        await adminClient.query(`DROP ROLE IF EXISTS ${quoteIdentifier(roleName)}`).catch((error) => {
            console.error(`Disposable role cleanup failed: ${redact(error.message)}`);
            process.exitCode = 1;
        });
    }
    await adminClient.end().catch(() => {});
});
