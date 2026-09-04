const assert = require('node:assert/strict');
const { Client } = require('pg');
const { runBootstrap, SYNTHETIC_CATEGORY_PATH, SYNTHETIC_SKU } = require('../scripts/staging-migrations/bootstrap');
const { LOCAL_TEST_CAPABILITY } = require('../scripts/staging-migrations/guard');
const { loadRegistry } = require('../scripts/staging-migrations/registry');
const {
    LEDGER_TABLE,
    MIGRATION_LOCK_KEYS,
    executeTransactionalMigration,
    runApply,
    runStatus
} = require('../scripts/staging-migrations/runner');

const connectionString = String(process.env.P4D1A_TEST_DATABASE_URL || '').trim();
assert(connectionString, 'P4D1A_TEST_DATABASE_URL is required.');
const parsed = new URL(connectionString);
const host = parsed.hostname.replace(/^\[|\]$/g, '');
const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
assert(['127.0.0.1', 'localhost', '::1'].includes(host), 'Integration target must be loopback.');
assert(database.endsWith('_test'), 'Integration target must use a unique _test database.');

const env = {
    NODE_ENV: 'test',
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
    NOVASTORE_STAGING_BOOTSTRAP_ENABLED: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    NOVASTORE_EXPECTED_DATABASE_HOST: host,
    NOVASTORE_EXPECTED_DATABASE_NAME: database,
    [LOCAL_TEST_CAPABILITY]: 'true',
    DATABASE_URL: connectionString
};
const registry = loadRegistry();
assert.equal(registry.length, 38);
assert.equal(registry.at(-1).id, '20260904_01_seller_reputation_questions');
const silent = () => {};
const admin = new Client({ connectionString, application_name: 'p4d1a_integration_assertions' });

const resetPublic = async () => {
    await admin.query('DROP SCHEMA public CASCADE');
    await admin.query('CREATE SCHEMA public');
};

const publicObjectCount = async () => {
    const result = await admin.query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')`
    );
    return result.rows[0].count;
};

const ledgerReference = async () => (
    await admin.query(`SELECT to_regclass('public.${LEDGER_TABLE}') AS ledger`)
).rows[0].ledger;

const migrationMutationCount = async () => (
    await admin.query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname IN ('users', 'products', 'categories', 'orders')`
    )
).rows[0].count;

const assertUnmanagedRejection = async ({ name, sql }) => {
    await resetPublic();
    await admin.query(sql);
    await assert.rejects(
        runApply({ env, registry, output: silent }),
        (error) => error?.code === 'UNMANAGED_SCHEMA',
        `${name} must be rejected as unmanaged schema`
    );
    assert.equal(await ledgerReference(), null, `${name} rejection must precede ledger creation`);
    assert.equal(await migrationMutationCount(), 0, `${name} rejection must precede migration mutation`);
};

const tableCounts = async () => {
    const result = await admin.query(
        `SELECT
            (SELECT COUNT(*)::INTEGER FROM orders) AS orders,
            (SELECT COUNT(*)::INTEGER FROM payments) AS payments,
            (SELECT COUNT(*)::INTEGER FROM notifications) AS notifications,
            (SELECT COUNT(*)::INTEGER FROM webhook_events) AS webhooks`
    );
    return result.rows[0];
};

const bootstrapSnapshot = async ({ productId, categoryId }) => {
    const result = await admin.query(
        `SELECT
            (SELECT COUNT(*)::INTEGER FROM categories WHERE LOWER(path) = LOWER($1) AND deleted_at IS NULL) AS categories,
            (SELECT COUNT(*)::INTEGER FROM products WHERE normalized_sku = $2 AND deleted_at IS NULL) AS products,
            (SELECT COUNT(*)::INTEGER
             FROM product_categories
             WHERE product_id = $3 AND category_id = $4 AND is_primary = TRUE) AS relations,
            (SELECT updated_at::TEXT FROM categories WHERE id = $4) AS category_updated_at,
            (SELECT updated_at::TEXT FROM products WHERE id = $3) AS product_updated_at,
            (SELECT updated_at::TEXT FROM category_stats WHERE category_id = $4) AS stats_updated_at`,
        [SYNTHETIC_CATEGORY_PATH, SYNTHETIC_SKU, productId, categoryId]
    );
    return result.rows[0];
};

(async () => {
    await admin.connect();
    await resetPublic();

    const statusBefore = await runStatus({ env, registry, output: silent });
    assert.equal(statusBefore.filter((entry) => entry.status === 'pending').length, registry.length);
    assert.equal(await publicObjectCount(), 0, 'status must not create the ledger or any schema object');

    for (const probe of [
        {
            name: 'enum-only schema',
            sql: "CREATE TYPE public.p4d1f_enum_probe AS ENUM ('synthetic')"
        },
        {
            name: 'domain-only schema',
            sql: 'CREATE DOMAIN public.p4d1f_domain_probe AS TEXT CHECK (VALUE <> \'\')'
        },
        {
            name: 'standalone-composite-only schema',
            sql: 'CREATE TYPE public.p4d1f_composite_probe AS (value INTEGER)'
        },
        {
            name: 'range-and-generated-multirange-only schema',
            sql: 'CREATE TYPE public.p4d1f_range_probe AS RANGE (subtype = integer)'
        },
        {
            name: 'relation-only schema',
            sql: 'CREATE TABLE public.p4d1f_relation_probe (id INTEGER PRIMARY KEY)'
        },
        {
            name: 'function-only schema',
            sql: `CREATE FUNCTION public.p4d1f_function_probe()
                  RETURNS INTEGER LANGUAGE SQL IMMUTABLE AS 'SELECT 1'`
        }
    ]) await assertUnmanagedRejection(probe);

    await resetPublic();
    const mediaMigrationIndex = registry.findIndex(
        (migration) => migration.id === '20260813_04_product_media_operations'
    );
    assert.ok(mediaMigrationIndex > 0, 'Product media migration must follow its prerequisites.');
    const mediaMigration = registry[mediaMigrationIndex];
    assert.equal(mediaMigration.id, '20260813_04_product_media_operations');
    const preMediaRegistry = registry.slice(0, mediaMigrationIndex);
    const preMediaApply = await runApply({ env, registry: preMediaRegistry, output: silent });
    assert.deepEqual(preMediaApply.applied, preMediaRegistry.map((entry) => entry.id));
    const legacyVideoProduct = await admin.query(
        `INSERT INTO products (name, price, image_url)
         VALUES ('Legacy mislabeled video probe', 1, $1)
         RETURNING id`,
        ['https://res.cloudinary.com/demo/video/upload/v1/legacy-cover.mp4']
    );
    await admin.query(
        `INSERT INTO product_media (product_id, media_url, is_main, sort_order)
         VALUES ($1, $2, TRUE, 0)`,
        [
            legacyVideoProduct.rows[0].id,
            'https://res.cloudinary.com/demo/video/upload/v1/legacy-gallery.mp4'
        ]
    );
    await assert.rejects(
        runApply({ env, registry, output: silent }),
        (error) => error?.code === '23514' && /video rows|video media/i.test(error.message),
        'Mislabeled legacy video URLs must block the image-only publication migration.'
    );
    const mediaLedgerAfterRejection = await admin.query(
        `SELECT COUNT(*)::INTEGER AS count FROM ${LEDGER_TABLE} WHERE migration_id = $1`,
        [mediaMigration.id]
    );
    assert.equal(mediaLedgerAfterRejection.rows[0].count, 0);

    await resetPublic();
    const applicantBindingMigrationIndex = registry.findIndex(
        (migration) => migration.id === '20260830_01_seller_application_user_binding'
    );
    assert(applicantBindingMigrationIndex >= 0 && applicantBindingMigrationIndex < registry.length - 1,
        'The application binding migration must precede the R10 reputation migration.');
    const preApplicantBindingRegistry = registry.slice(0, applicantBindingMigrationIndex);
    const preApplicantBindingApply = await runApply({
        env,
        registry: preApplicantBindingRegistry,
        output: silent
    });
    assert.deepEqual(preApplicantBindingApply.applied, preApplicantBindingRegistry.map((entry) => entry.id));
    await admin.query(
        `INSERT INTO users (id, email, password)
         VALUES
            (92001, 'binding-unique@example.test', 'not-used'),
            (92002, 'binding-ambiguous@example.test', 'not-used'),
            (92003, 'BINDING-AMBIGUOUS@EXAMPLE.TEST', 'not-used')`
    );
    await admin.query(
        `INSERT INTO seller_applications
            (id, applicant_authority_hash, applicant_identity_hash, applicant_email,
             applicant_display_name, creation_idempotency_key_hash, creation_request_fingerprint)
         VALUES
            ('92000000-0000-4000-8000-000000000001', repeat('a', 64), repeat('b', 64),
             'BINDING-UNIQUE@EXAMPLE.TEST', 'Unique binding probe', repeat('c', 64), repeat('d', 64)),
            ('92000000-0000-4000-8000-000000000002', repeat('e', 64), repeat('f', 64),
             'binding-ambiguous@example.test', 'Ambiguous binding probe', repeat('1', 64), repeat('2', 64))`
    );
    const applicantBindingApply = await runApply({
        env,
        registry: registry.slice(0, applicantBindingMigrationIndex + 1),
        output: silent
    });
    assert.deepEqual(applicantBindingApply.applied, ['20260830_01_seller_application_user_binding']);
    const applicantBindings = await admin.query(
        `SELECT id::TEXT, applicant_user_id
           FROM seller_applications
          ORDER BY id`
    );
    assert.deepEqual(applicantBindings.rows, [
        { id: '92000000-0000-4000-8000-000000000001', applicant_user_id: null },
        { id: '92000000-0000-4000-8000-000000000002', applicant_user_id: null }
    ], 'migration must never infer a private account binding from applicant email');

    await resetPublic();

    const firstApply = await runApply({ env, registry, output: silent });
    assert.deepEqual(firstApply.applied, registry.map((entry) => entry.id));
    const ledgerRows = await admin.query(
        `SELECT migration_id, migration_path, sha256, applied_at
         FROM ${LEDGER_TABLE}
         ORDER BY migration_id`
    );
    assert.equal(ledgerRows.rowCount, registry.length);

    const expectedTables = [
        'admin_catalog_audit_events', 'attribute_definitions', 'attribute_options',
        'attribute_templates', 'auth_refresh_tokens', 'auth_sessions', 'campaign_configs', 'categories',
        'category_aliases', 'category_stats', 'collection_products', 'collection_rules',
        'collections', 'coupon_reservations', 'coupons', 'customer_addresses', 'customer_operation_audit_events', 'favorites', 'invoices',
        'menu_items', 'menus', 'messages', 'notification_audit_logs',
        'notification_deliveries', 'notification_delivery_attempts',
        'notification_outbox_events', 'notifications',
        'order_events', 'order_item_backfill_issues', 'order_items', 'orders',
        'page_visits', 'payments', 'product_actions', 'product_attribute_values',
        'product_categories', 'product_media', 'product_questions', 'products',
        'return_events', 'returns', 'review_media', 'reviews', 'shipments', 'store_follows', 'stores',
        'support_thread_events', 'support_threads', 'template_attributes', 'user_shared_state', 'users', 'visitor_sessions',
        'admin_coupon_audit_events', 'android_push_endpoints',
        'seller_applicant_sessions', 'seller_application_command_receipts',
        'seller_application_events', 'seller_application_verification_requests',
        'seller_application_terms_authority', 'seller_application_terms_authority_events',
        'seller_applications',
        'seller_audit_events', 'seller_bootstrap_operator_authorizations',
        'seller_fulfillment_packages', 'seller_inventory_items', 'seller_inventory_movements',
        'seller_invitations', 'seller_ledger_entries', 'seller_membership_store_scopes',
        'seller_memberships', 'seller_mutation_receipts', 'seller_offer_variants',
        'seller_offers', 'seller_order_items', 'seller_order_transitions', 'seller_orders',
        'seller_organizations', 'seller_outbox_delivery_attempts', 'seller_outbox_events',
        'seller_password_recovery_challenges', 'seller_password_recovery_events',
        'seller_permissions', 'seller_public_legal_identities', 'seller_public_legal_identity_events',
        'seller_refresh_token_families', 'seller_refresh_tokens',
        'seller_returns', 'seller_role_permissions', 'seller_roles', 'seller_sessions',
        'seller_settlements', 'seller_step_up_challenges', 'seller_store_profiles',
        'seller_stores', 'seller_support_conversations', 'seller_support_messages',
        'seller_support_ratings', 'web_push_subscriptions',
        'webhook_events', LEDGER_TABLE
    ].sort();
    const tables = await admin.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
         ORDER BY table_name`
    );
    assert.deepEqual(tables.rows.map((row) => row.table_name).sort(), expectedTables);

    const requiredColumns = await admin.query(
        `SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND (table_name, column_name) IN (
              ('users', 'auth_enabled'),
              ('seller_applications', 'applicant_user_id'),
              ('products', 'normalized_sku'),
              ('products', 'revision'),
              ('categories', 'path'),
              ('categories', 'revision'),
              ('orders', 'analytics_session_key'),
              ('orders', 'business_identity_snapshot'),
              ('orders', 'delivered_at'),
              ('returns', 'revision'),
              ('returns', 'decision_note'),
              ('returns', 'decided_by_admin_id'),
              ('returns', 'decided_at'),
              ('collections', 'show_on_home'),
              ('reviews', 'status'),
              ('reviews', 'revision'),
              ('reviews', 'moderated_by'),
              ('reviews', 'moderated_at'),
              ('reviews', 'moderation_note'),
              ('product_questions', 'revision'),
              ('product_questions', 'answered_by'),
              ('product_questions', 'updated_at'),
              ('notifications', 'entity_type'),
              ('notifications', 'entity_id'),
              ('messages', 'support_thread_id'),
              ('coupons', 'revision'),
              ('product_media', 'media_type'),
              ('product_media', 'card_focal_x'),
              ('product_media', 'card_focal_y'),
              ('product_media', 'card_zoom'),
              ('seller_application_terms_authority', 'active_revision'),
              ('seller_application_terms_authority', 'generation'),
              ('seller_application_terms_authority_events', 'active_revision'),
              ('seller_application_terms_authority_events', 'generation'),
              ('seller_order_items', 'source_item_index')
           )`
    );
    assert.equal(requiredColumns.rowCount, 35);

    const triggers = await admin.query(
        `SELECT trigger_name
         FROM information_schema.triggers
         WHERE trigger_schema = 'public'
           AND trigger_name IN (
              'trg_admin_catalog_audit_append_only',
              'trg_users_revoke_auth_sessions',
              'trg_auth_sessions_notify_revoked',
              'trg_customer_operation_audit_append_only',
              'trg_admin_coupon_audit_append_only',
              'trg_coupons_reject_hard_delete',
              'trg_support_thread_events_append_only',
              'trg_seller_memberships_no_hard_delete',
              'trg_seller_audit_events_append_only',
              'trg_seller_outbox_events_append_only',
              'trg_seller_support_messages_append_only',
              'trg_seller_application_terms_authority_events_append_only',
              'trg_return_events_append_only'
           )`
    );
    assert.equal(new Set(triggers.rows.map((row) => row.trigger_name)).size, 13);
    const truncateTrigger = await admin.query(
        `SELECT t.tgname
         FROM pg_trigger t
         WHERE t.tgrelid = 'seller_application_terms_authority_events'::regclass
           AND t.tgname = 'trg_seller_application_terms_authority_events_no_truncate'
           AND NOT t.tgisinternal`
    );
    assert.equal(truncateTrigger.rowCount, 1);

    const requiredConstraints = [
        'chk_reviews_operational_status', 'chk_reviews_revision_positive',
        'chk_reviews_comment_no_control', 'chk_reviews_moderation_note_no_control',
        'chk_product_questions_revision_positive', 'chk_product_questions_question_no_control',
        'chk_product_questions_answer_no_control', 'chk_customer_operation_audit_actor_role',
        'chk_customer_operation_audit_entity_type', 'chk_customer_operation_audit_action',
        'chk_customer_operation_audit_before_object', 'chk_customer_operation_audit_after_object',
        'chk_customer_operation_audit_metadata_object', 'chk_notifications_entity_pair',
        'chk_notifications_entity_type', 'chk_notifications_entity_id', 'uq_support_threads_customer',
        'chk_support_threads_status', 'chk_support_threads_source', 'chk_support_threads_assignment',
        'fk_messages_support_thread', 'chk_messages_handoff_dismissal_pair',
        'chk_messages_handoff_dismissal_scope', 'chk_messages_message_no_control',
        'chk_support_thread_events_type', 'chk_coupons_revision_positive',
        'chk_coupons_discount_value_positive', 'chk_coupons_amount_bounds', 'chk_coupons_usage_bounds',
        'chk_coupons_date_range', 'chk_admin_coupon_audit_actor_role', 'chk_admin_coupon_audit_action',
        'chk_admin_coupon_audit_revision', 'chk_admin_coupon_audit_metadata_object',
        'uq_seller_memberships_organization_id_id_user_id', 'fk_seller_sessions_membership_user',
        'chk_product_media_type', 'chk_product_media_image_cover', 'chk_product_media_card_framing',
        'chk_product_media_video_publication_disabled', 'chk_products_image_url_not_video',
        'chk_seller_application_terms_authority_singleton',
        'chk_seller_application_terms_authority_generation',
        'chk_seller_application_terms_authority_event_generation',
        'chk_seller_application_terms_authority_event_previous',
        'chk_orders_business_identity_snapshot_object',
        'chk_returns_launch_v1_status', 'chk_returns_revision_positive',
        'chk_return_events_actor_role', 'chk_return_events_event_type',
        'chk_return_events_payload_object', 'chk_seller_order_items_source_index',
        'chk_coupon_reservations_status', 'chk_coupon_reservations_terminal_times',
        'uq_coupon_reservations_order', 'uq_coupon_reservations_coupon_order',
        'fk_seller_applications_applicant_user'
    ].sort();
    const constraints = await admin.query(
        `SELECT conname
         FROM pg_constraint
         WHERE connamespace = 'public'::regnamespace
           AND conname = ANY($1::TEXT[])
         ORDER BY conname`,
        [requiredConstraints]
    );
    assert.deepEqual(constraints.rows.map((row) => row.conname), requiredConstraints);

    const safetyIndexes = await admin.query(
        `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = ANY($1::TEXT[])
         ORDER BY indexname`,
        [[
            'idx_product_media_one_main',
            'idx_product_media_product_url_unique',
            'idx_reviews_product_user_unique'
        ]]
    );
    assert.equal(safetyIndexes.rowCount, 3);
    for (const row of safetyIndexes.rows) assert.match(row.indexdef, /CREATE UNIQUE INDEX/i);
    assert.match(
        safetyIndexes.rows.find((row) => row.indexname === 'idx_product_media_one_main').indexdef,
        /WHERE \(is_main = true\)/i
    );
    const applicantBindingIndex = await admin.query(
        `SELECT indexdef
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'idx_seller_applications_applicant_user_updated'`
    );
    assert.equal(applicantBindingIndex.rowCount, 1);
    assert.doesNotMatch(applicantBindingIndex.rows[0].indexdef, /CREATE UNIQUE INDEX/i);
    assert.match(applicantBindingIndex.rows[0].indexdef, /applicant_user_id IS NOT NULL/i);
    const framingProduct = await admin.query(
        `INSERT INTO products (name, price)
         VALUES ('Main-6Y partial framing probe', 1)
         RETURNING id`
    );
    await assert.rejects(
        admin.query(
            `INSERT INTO product_media
                (product_id, media_url, media_type, card_focal_x, card_focal_y, card_zoom)
             VALUES ($1, '/uploads/local-products/main6y-partial-framing.jpg', 'image', 0.2, NULL, 1.2)`,
            [framingProduct.rows[0].id]
        ),
        (error) => error?.code === '23514' && error?.constraint === 'chk_product_media_card_framing',
        'Partial-null product card framing must be rejected by PostgreSQL.'
    );
    await admin.query('DELETE FROM products WHERE id = $1', [framingProduct.rows[0].id]);
    const platformStore = await admin.query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM stores
         WHERE LOWER(slug) = 'novastore-platform'
           AND is_active = TRUE
           AND deleted_at IS NULL`
    );
    assert.equal(platformStore.rows[0].count, 1);
    assert.equal((await admin.query('SELECT COUNT(*)::INTEGER AS count FROM users')).rows[0].count, 0);
    assert.equal((await admin.query('SELECT COUNT(*)::INTEGER AS count FROM coupons')).rows[0].count, 0);
    assert.equal((await admin.query('SELECT COUNT(*)::INTEGER AS count FROM campaign_configs')).rows[0].count, 0);

    await admin.query('BEGIN');
    try {
        await admin.query(
            "INSERT INTO users (id, email, password) VALUES (91001, 'main6t-binding-a@local.invalid', 'not-used'), (91002, 'main6t-binding-b@local.invalid', 'not-used')"
        );
        const bindingOrganization = await admin.query(
            "INSERT INTO seller_organizations (external_key, display_name) VALUES ('91000000-0000-4000-8000-000000000001', 'Main-6T binding probe') RETURNING id"
        );
        const bindingRole = await admin.query(
            "SELECT id FROM seller_roles WHERE organization_id IS NULL AND code = 'manager'"
        );
        const bindingMembership = await admin.query(
            "INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp) VALUES ($1, 91002, $2, '91000000-0000-4000-8000-000000000002') RETURNING id",
            [bindingOrganization.rows[0].id, bindingRole.rows[0].id]
        );
        await assert.rejects(
            admin.query(
                "INSERT INTO seller_sessions (id, user_id, organization_id, membership_id, membership_revision, security_stamp, expires_at) VALUES ('91000000-0000-4000-8000-000000000003', 91001, $1, $2, 1, '91000000-0000-4000-8000-000000000002', CURRENT_TIMESTAMP + INTERVAL '1 hour')",
                [bindingOrganization.rows[0].id, bindingMembership.rows[0].id]
            ),
            (error) => error?.code === '23503',
            'Seller session must not bind one valid user to another valid user membership.'
        );
    } finally {
        await admin.query('ROLLBACK');
    }

    const statusAfter = await runStatus({ env, registry, output: silent });
    assert.equal(statusAfter.filter((entry) => entry.status === 'applied').length, registry.length);
    const appliedAtBefore = ledgerRows.rows.map((row) => String(row.applied_at));
    const secondApply = await runApply({ env, registry, output: silent });
    assert.deepEqual(secondApply.applied, []);
    const appliedAtAfter = await admin.query(
        `SELECT applied_at FROM ${LEDGER_TABLE} ORDER BY migration_id`
    );
    assert.deepEqual(appliedAtAfter.rows.map((row) => String(row.applied_at)), appliedAtBefore);

    const firstMigration = registry[0];
    await admin.query(
        `UPDATE ${LEDGER_TABLE} SET sha256 = $1 WHERE migration_id = $2`,
        ['0'.repeat(64), firstMigration.id]
    );
    await assert.rejects(runStatus({ env, registry, output: silent }), /checksum mismatch/i);
    await assert.rejects(runApply({ env, registry, output: silent }), /checksum mismatch/i);
    await admin.query(
        `UPDATE ${LEDGER_TABLE} SET sha256 = $1 WHERE migration_id = $2`,
        [firstMigration.sha256, firstMigration.id]
    );

    await admin.query(
        `INSERT INTO ${LEDGER_TABLE} (migration_id, migration_path, sha256, runner_version)
         VALUES ('20990101_unknown_probe', 'migrations/unknown_probe.sql', $1, 'integration-test')`,
        ['1'.repeat(64)]
    );
    await assert.rejects(runStatus({ env, registry, output: silent }), /unknown migration ledger entry/i);
    await assert.rejects(runApply({ env, registry, output: silent }), /unknown migration ledger entry/i);
    await admin.query(`DELETE FROM ${LEDGER_TABLE} WHERE migration_id = '20990101_unknown_probe'`);

    const lockHolder = new Client({ connectionString, application_name: 'p4d1a_lock_holder' });
    await lockHolder.connect();
    try {
        const lock = await lockHolder.query(
            'SELECT pg_try_advisory_lock($1::INTEGER, $2::INTEGER) AS locked',
            MIGRATION_LOCK_KEYS
        );
        assert.equal(lock.rows[0].locked, true);
        await assert.rejects(runApply({ env, registry, output: silent }), /holds the staging migration lock/i);
    } finally {
        await lockHolder.query(
            'SELECT pg_advisory_unlock($1::INTEGER, $2::INTEGER)',
            MIGRATION_LOCK_KEYS
        ).catch(() => {});
        await lockHolder.end();
    }

    const rollbackProbe = {
        id: '20990102_transaction_rollback_probe',
        path: 'migrations/transaction_rollback_probe.sql',
        sha256: '2'.repeat(64),
        mode: 'transactional',
        executionSql: `
            CREATE TABLE p4d1a_transaction_rollback_probe (id INTEGER PRIMARY KEY);
            DO $p4d1a_failure$ BEGIN
                RAISE EXCEPTION 'intentional p4d1a rollback probe';
            END $p4d1a_failure$;
        `
    };
    await assert.rejects(
        executeTransactionalMigration(admin, rollbackProbe),
        /intentional p4d1a rollback probe/i
    );
    assert.equal(
        (await admin.query("SELECT to_regclass('public.p4d1a_transaction_rollback_probe') AS probe")).rows[0].probe,
        null
    );
    assert.equal(
        (await admin.query(
            `SELECT COUNT(*)::INTEGER AS count FROM ${LEDGER_TABLE} WHERE migration_id = $1`,
            [rollbackProbe.id]
        )).rows[0].count,
        0
    );

    const protectedCountsBefore = await tableCounts();
    const firstBootstrap = await runBootstrap({ env, registry, output: silent });
    const snapshotAfterFirst = await bootstrapSnapshot(firstBootstrap);
    assert.equal(snapshotAfterFirst.categories, 1);
    assert.equal(snapshotAfterFirst.products, 1);
    assert.equal(snapshotAfterFirst.relations, 1);
    const secondBootstrap = await runBootstrap({ env, registry, output: silent });
    assert.deepEqual(secondBootstrap, firstBootstrap);
    const snapshotAfterSecond = await bootstrapSnapshot(secondBootstrap);
    assert.deepEqual(snapshotAfterSecond, snapshotAfterFirst);
    assert.deepEqual(await tableCounts(), protectedCountsBefore);

    console.log('staging migration PostgreSQL integration smoke passed: 27 scenarios');
})().finally(async () => {
    await admin.end().catch(() => {});
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
