BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

DO $supabase_rls_quarantine$
DECLARE
    -- CANONICAL_PUBLIC_TABLES_BEGIN
    canonical_tables CONSTANT TEXT[] := ARRAY[
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
    -- CANONICAL_PUBLIC_TABLES_END
    data_api_roles CONSTANT TEXT[] := ARRAY['anon', 'authenticated'];
    table_privileges CONSTANT TEXT[] := ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ];
    column_privileges CONSTANT TEXT[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'];
    sequence_privileges CONSTANT TEXT[] := ARRAY['USAGE', 'SELECT', 'UPDATE'];
    target_tables TEXT[];
    target_sequence_oids OID[];
    assistant_oid OID;
    assistant_relkind "char";
    missing_roles TEXT[];
    missing_tables TEXT[];
    unexpected_tables TEXT[];
    drift_items TEXT[];
    policy_items TEXT[];
    exposed_security_definer_items TEXT[];
    force_rls_tables TEXT[];
    public_acl_items TEXT[];
    unsafe_owner_tables TEXT[];
    column_list TEXT;
    table_lock_list TEXT;
    table_name TEXT;
    role_name TEXT;
    privilege_name TEXT;
    column_name TEXT;
    sequence_record RECORD;
    actual_count INTEGER;
BEGIN
    IF NOT pg_catalog.pg_try_advisory_xact_lock(
        pg_catalog.hashtextextended('novastore:public-schema-security-ddl:v1', 0)
    ) THEN
        RAISE EXCEPTION
            'Supabase RLS preflight failed: another NovaStore public-schema DDL operation holds the advisory lock';
    END IF;

    SELECT pg_catalog.array_agg(expected_role ORDER BY expected_role)
    INTO missing_roles
    FROM pg_catalog.unnest(data_api_roles) AS expected_role
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS role_entry
        WHERE role_entry.rolname = expected_role
    );

    IF missing_roles IS NOT NULL THEN
        RAISE EXCEPTION 'Supabase RLS preflight failed: required Data API roles are missing: %', missing_roles;
    END IF;

    SELECT pg_catalog.array_agg(expected_table ORDER BY expected_table)
    INTO missing_tables
    FROM pg_catalog.unnest(canonical_tables) AS expected_table
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = expected_table
          AND relation.relkind IN ('r', 'p')
    );

    IF missing_tables IS NOT NULL THEN
        RAISE EXCEPTION 'Supabase RLS preflight failed: canonical public tables are missing: %', missing_tables;
    END IF;

    SELECT relation.oid, relation.relkind
    INTO assistant_oid, assistant_relkind
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'assistant_events';

    IF assistant_oid IS NOT NULL AND assistant_relkind <> 'r' THEN
        RAISE EXCEPTION
            'Supabase RLS preflight failed: public.assistant_events has unexpected relation kind %',
            assistant_relkind;
    END IF;

    SELECT pg_catalog.array_agg(relation.relname ORDER BY relation.relname)
    INTO unexpected_tables
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'f', 'v', 'm')
      AND relation.relname <> ALL(canonical_tables)
      AND relation.relname <> 'assistant_events';

    IF unexpected_tables IS NOT NULL THEN
        RAISE EXCEPTION
            'Supabase RLS preflight failed: unexpected public data relations exist: %',
            unexpected_tables;
    END IF;

    target_tables := canonical_tables;
    IF assistant_oid IS NOT NULL THEN
        target_tables := pg_catalog.array_append(target_tables, 'assistant_events');
    END IF;

    SELECT pg_catalog.string_agg(
        pg_catalog.format('%I.%I', 'public', expected_table),
        ', ' ORDER BY expected_table
    )
    INTO table_lock_list
    FROM pg_catalog.unnest(target_tables) AS expected_table;

    EXECUTE pg_catalog.format(
        'LOCK TABLE %s IN ACCESS EXCLUSIVE MODE',
        table_lock_list
    );

    IF assistant_oid IS NULL AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'assistant_events'
    ) THEN
        RAISE EXCEPTION
            'Supabase RLS preflight failed: public.assistant_events appeared while target locks were acquired';
    ELSIF assistant_oid IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE relation.oid = assistant_oid
          AND namespace.nspname = 'public'
          AND relation.relname = 'assistant_events'
          AND relation.relkind = 'r'
    ) THEN
        RAISE EXCEPTION
            'Supabase RLS preflight failed: public.assistant_events changed while target locks were acquired';
    END IF;

    SELECT pg_catalog.array_agg(relation.relname ORDER BY relation.relname)
    INTO unexpected_tables
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'f', 'v', 'm')
      AND relation.relname <> ALL(canonical_tables)
      AND relation.relname <> 'assistant_events';

    IF unexpected_tables IS NOT NULL THEN
        RAISE EXCEPTION
            'Supabase RLS preflight failed: unexpected public data relations appeared while target locks were acquired: %',
            unexpected_tables;
    END IF;

    SELECT pg_catalog.array_agg(relation.relname ORDER BY relation.relname)
    INTO force_rls_tables
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY(target_tables)
      AND relation.relforcerowsecurity;

    IF force_rls_tables IS NOT NULL THEN
        RAISE EXCEPTION 'Supabase RLS preflight failed: FORCE RLS is already enabled: %', force_rls_tables;
    END IF;

    SELECT pg_catalog.array_agg(
        pg_catalog.format('%I.%I:%I', namespace.nspname, relation.relname, policy.polname)
        ORDER BY relation.relname, policy.polname
    )
    INTO policy_items
    FROM pg_catalog.pg_policy AS policy
    JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY(target_tables);

    IF policy_items IS NOT NULL THEN
        RAISE EXCEPTION 'Supabase RLS preflight failed: unexpected policies exist: %', policy_items;
    END IF;

    SELECT pg_catalog.array_agg(
        pg_catalog.format(
            '%I.%I(%s)',
            namespace.nspname,
            procedure_entry.proname,
            pg_catalog.pg_get_function_identity_arguments(procedure_entry.oid)
        )
        ORDER BY procedure_entry.proname, procedure_entry.oid
    )
    INTO exposed_security_definer_items
    FROM pg_catalog.pg_proc AS procedure_entry
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure_entry.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure_entry.prosecdef
      AND EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(data_api_roles) AS role_entry
          WHERE pg_catalog.has_function_privilege(role_entry, procedure_entry.oid, 'EXECUTE')
      );

    IF exposed_security_definer_items IS NOT NULL THEN
        RAISE EXCEPTION
            'Supabase RLS preflight failed: Data API roles can execute public SECURITY DEFINER routines: %',
            exposed_security_definer_items;
    END IF;

    SELECT pg_catalog.array_agg(relation.relname ORDER BY relation.relname)
    INTO unsafe_owner_tables
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY(target_tables)
      AND owner_role.rolname = ANY(data_api_roles);

    IF unsafe_owner_tables IS NOT NULL THEN
        RAISE EXCEPTION
            'Supabase RLS preflight failed: a Data API role owns target tables and would bypass non-FORCE RLS: %',
            unsafe_owner_tables;
    END IF;

    SELECT pg_catalog.array_agg(item ORDER BY item)
    INTO public_acl_items
    FROM (
        SELECT pg_catalog.format('table:%I.%I:%s', namespace.nspname, relation.relname, acl.privilege_type) AS item
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS acl ON TRUE
        WHERE namespace.nspname = 'public'
          AND relation.relname = ANY(target_tables)
          AND acl.grantee = 0

        UNION ALL

        SELECT pg_catalog.format(
            'column:%I.%I.%I:%s', namespace.nspname, relation.relname, attribute.attname, acl.privilege_type
        ) AS item
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = relation.oid
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
        JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl ON TRUE
        WHERE namespace.nspname = 'public'
          AND relation.relname = ANY(target_tables)
          AND acl.grantee = 0
    ) AS public_acl;

    IF public_acl_items IS NOT NULL THEN
        RAISE EXCEPTION 'Supabase RLS preflight failed: PUBLIC table or column ACLs exist: %', public_acl_items;
    END IF;

    IF assistant_oid IS NOT NULL THEN
        SELECT pg_catalog.count(*)
        INTO actual_count
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = assistant_oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped;

        IF actual_count <> 12 THEN
            RAISE EXCEPTION
                'Supabase RLS preflight failed: assistant_events column count drifted (expected 12, found %)',
                actual_count;
        END IF;

        SELECT pg_catalog.array_agg(attribute.attname ORDER BY attribute.attnum)
        INTO drift_items
        FROM pg_catalog.pg_attribute AS attribute
        LEFT JOIN pg_catalog.pg_attrdef AS attribute_default
          ON attribute_default.adrelid = attribute.attrelid
         AND attribute_default.adnum = attribute.attnum
        WHERE attribute.attrelid = assistant_oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND NOT CASE attribute.attname
              WHEN 'id' THEN
                   pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'integer'
                   AND attribute.attnotnull
                   AND pg_catalog.pg_get_serial_sequence('public.assistant_events', 'id') =
                       'public.assistant_events_id_seq'
                   AND pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid) =
                       'nextval(''public.assistant_events_id_seq''::regclass)'
              WHEN 'session_id' THEN
                  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'character varying(80)'
                  AND attribute.attnotnull
                  AND attribute_default.oid IS NULL
              WHEN 'user_id' THEN
                  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'integer'
                  AND NOT attribute.attnotnull
                  AND attribute_default.oid IS NULL
              WHEN 'event_name' THEN
                  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'character varying(80)'
                  AND attribute.attnotnull
                  AND attribute_default.oid IS NULL
              WHEN 'tool_name' THEN
                  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'character varying(80)'
                  AND NOT attribute.attnotnull
                  AND attribute_default.oid IS NULL
              WHEN 'intent' THEN
                  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'character varying(80)'
                  AND NOT attribute.attnotnull
                  AND attribute_default.oid IS NULL
              WHEN 'product_id' THEN
                  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'integer'
                  AND NOT attribute.attnotnull
                  AND attribute_default.oid IS NULL
              WHEN 'query_text' THEN
                  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
                  AND NOT attribute.attnotnull
                  AND attribute_default.oid IS NULL
              WHEN 'page' THEN
                  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'character varying(120)'
                  AND NOT attribute.attnotnull
                  AND attribute_default.oid IS NULL
              WHEN 'status' THEN
                  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'character varying(40)'
                  AND NOT attribute.attnotnull
                  AND pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid) =
                      '''success''::character varying'
              WHEN 'metadata' THEN
                  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'jsonb'
                  AND NOT attribute.attnotnull
                  AND pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid) = '''{}''::jsonb'
              WHEN 'created_at' THEN
                  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'timestamp without time zone'
                  AND NOT attribute.attnotnull
                  AND pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid) = 'CURRENT_TIMESTAMP'
              ELSE FALSE
          END;

        IF drift_items IS NOT NULL THEN
            RAISE EXCEPTION 'Supabase RLS preflight failed: assistant_events column signature drifted: %', drift_items;
        END IF;

        SELECT pg_catalog.count(*)
        INTO actual_count
        FROM pg_catalog.pg_constraint AS constraint_entry
        WHERE constraint_entry.conrelid = assistant_oid;

        IF actual_count <> 3 THEN
            RAISE EXCEPTION
                'Supabase RLS preflight failed: assistant_events constraint count drifted (expected 3, found %)',
                actual_count;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint AS constraint_entry
            JOIN pg_catalog.pg_attribute AS id_attribute
              ON id_attribute.attrelid = assistant_oid
             AND id_attribute.attname = 'id'
            WHERE constraint_entry.conrelid = assistant_oid
              AND constraint_entry.conname = 'assistant_events_pkey'
              AND constraint_entry.contype = 'p'
              AND constraint_entry.convalidated
              AND constraint_entry.conkey = ARRAY[id_attribute.attnum]::SMALLINT[]
        ) THEN
            RAISE EXCEPTION 'Supabase RLS preflight failed: assistant_events primary-key signature drifted';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint AS constraint_entry
            JOIN pg_catalog.pg_attribute AS source_attribute
              ON source_attribute.attrelid = assistant_oid
             AND source_attribute.attname = 'user_id'
            JOIN pg_catalog.pg_class AS referenced_table
              ON referenced_table.oid = constraint_entry.confrelid
            JOIN pg_catalog.pg_namespace AS referenced_namespace
              ON referenced_namespace.oid = referenced_table.relnamespace
            JOIN pg_catalog.pg_attribute AS referenced_attribute
              ON referenced_attribute.attrelid = referenced_table.oid
             AND referenced_attribute.attname = 'id'
            WHERE constraint_entry.conrelid = assistant_oid
              AND constraint_entry.conname = 'assistant_events_user_id_fkey'
              AND constraint_entry.contype = 'f'
              AND constraint_entry.convalidated
              AND constraint_entry.conkey = ARRAY[source_attribute.attnum]::SMALLINT[]
              AND referenced_namespace.nspname = 'public'
              AND referenced_table.relname = 'users'
              AND constraint_entry.confkey = ARRAY[referenced_attribute.attnum]::SMALLINT[]
              AND constraint_entry.confdeltype = 'n'
        ) THEN
            RAISE EXCEPTION 'Supabase RLS preflight failed: assistant_events user foreign-key signature drifted';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint AS constraint_entry
            JOIN pg_catalog.pg_attribute AS source_attribute
              ON source_attribute.attrelid = assistant_oid
             AND source_attribute.attname = 'product_id'
            JOIN pg_catalog.pg_class AS referenced_table
              ON referenced_table.oid = constraint_entry.confrelid
            JOIN pg_catalog.pg_namespace AS referenced_namespace
              ON referenced_namespace.oid = referenced_table.relnamespace
            JOIN pg_catalog.pg_attribute AS referenced_attribute
              ON referenced_attribute.attrelid = referenced_table.oid
             AND referenced_attribute.attname = 'id'
            WHERE constraint_entry.conrelid = assistant_oid
              AND constraint_entry.conname = 'assistant_events_product_id_fkey'
              AND constraint_entry.contype = 'f'
              AND constraint_entry.convalidated
              AND constraint_entry.conkey = ARRAY[source_attribute.attnum]::SMALLINT[]
              AND referenced_namespace.nspname = 'public'
              AND referenced_table.relname = 'products'
              AND constraint_entry.confkey = ARRAY[referenced_attribute.attnum]::SMALLINT[]
              AND constraint_entry.confdeltype = 'n'
        ) THEN
            RAISE EXCEPTION 'Supabase RLS preflight failed: assistant_events product foreign-key signature drifted';
        END IF;

        SELECT pg_catalog.count(*)
        INTO actual_count
        FROM pg_catalog.pg_index AS index_entry
        WHERE index_entry.indrelid = assistant_oid;

        IF actual_count <> 4 THEN
            RAISE EXCEPTION
                'Supabase RLS preflight failed: assistant_events index count drifted (expected 4, found %)',
                actual_count;
        END IF;

        SELECT pg_catalog.array_agg(index_definition ORDER BY index_name)
        INTO drift_items
        FROM (
            SELECT index_relation.relname AS index_name,
                   pg_catalog.pg_get_indexdef(index_relation.oid) AS index_definition
            FROM pg_catalog.pg_index AS index_entry
            JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_entry.indexrelid
            WHERE index_entry.indrelid = assistant_oid
        ) AS actual_indexes
        WHERE (index_name, index_definition) NOT IN (
            ('assistant_events_pkey',
             'CREATE UNIQUE INDEX assistant_events_pkey ON public.assistant_events USING btree (id)'),
            ('idx_assistant_events_name_created_at',
             'CREATE INDEX idx_assistant_events_name_created_at ON public.assistant_events USING btree (event_name, created_at DESC)'),
            ('idx_assistant_events_product_id',
             'CREATE INDEX idx_assistant_events_product_id ON public.assistant_events USING btree (product_id)'),
            ('idx_assistant_events_session_id',
             'CREATE INDEX idx_assistant_events_session_id ON public.assistant_events USING btree (session_id)')
        );

        IF drift_items IS NOT NULL THEN
            RAISE EXCEPTION 'Supabase RLS preflight failed: assistant_events index signature drifted: %', drift_items;
        END IF;
    END IF;

    SELECT COALESCE(pg_catalog.array_agg(DISTINCT sequence_oid), ARRAY[]::OID[])
    INTO target_sequence_oids
    FROM (
        SELECT sequence_relation.oid AS sequence_oid
        FROM pg_catalog.pg_depend AS dependency
        JOIN pg_catalog.pg_class AS sequence_relation
          ON sequence_relation.oid = dependency.objid
         AND sequence_relation.relkind = 'S'
        JOIN pg_catalog.pg_class AS target_relation ON target_relation.oid = dependency.refobjid
        JOIN pg_catalog.pg_namespace AS target_namespace ON target_namespace.oid = target_relation.relnamespace
        WHERE dependency.classid = 'pg_class'::pg_catalog.regclass
          AND dependency.refclassid = 'pg_class'::pg_catalog.regclass
          AND dependency.deptype IN ('a', 'i')
          AND target_namespace.nspname = 'public'
          AND target_relation.relname = ANY(target_tables)

        UNION

        SELECT sequence_relation.oid AS sequence_oid
        FROM pg_catalog.pg_attrdef AS attribute_default
        JOIN pg_catalog.pg_class AS target_relation ON target_relation.oid = attribute_default.adrelid
        JOIN pg_catalog.pg_namespace AS target_namespace ON target_namespace.oid = target_relation.relnamespace
        JOIN pg_catalog.pg_depend AS dependency
          ON dependency.classid = 'pg_attrdef'::pg_catalog.regclass
         AND dependency.objid = attribute_default.oid
         AND dependency.refclassid = 'pg_class'::pg_catalog.regclass
        JOIN pg_catalog.pg_class AS sequence_relation
          ON sequence_relation.oid = dependency.refobjid
         AND sequence_relation.relkind = 'S'
        WHERE target_namespace.nspname = 'public'
          AND target_relation.relname = ANY(target_tables)
    ) AS target_sequences;

    SELECT pg_catalog.array_agg(
        pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
        ORDER BY namespace.nspname, relation.relname
    )
    INTO drift_items
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE relation.oid = ANY(target_sequence_oids)
      AND namespace.nspname <> 'public';

    IF drift_items IS NOT NULL THEN
        RAISE EXCEPTION
            'Supabase RLS preflight failed: target tables reference sequences outside public: %',
            drift_items;
    END IF;

    SELECT pg_catalog.array_agg(
        pg_catalog.format('sequence:%I.%I:%s', namespace.nspname, relation.relname, acl.privilege_type)
        ORDER BY namespace.nspname, relation.relname, acl.privilege_type
    )
    INTO public_acl_items
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS acl ON TRUE
    WHERE relation.oid = ANY(target_sequence_oids)
      AND namespace.nspname = 'public'
      AND acl.grantee = 0;

    IF public_acl_items IS NOT NULL THEN
        RAISE EXCEPTION 'Supabase RLS preflight failed: PUBLIC sequence ACLs exist: %', public_acl_items;
    END IF;

    SELECT pg_catalog.array_agg(pg_catalog.format('%I.%I', namespace.nspname, relation.relname))
    INTO unsafe_owner_tables
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = relation.relowner
    WHERE relation.oid = ANY(target_sequence_oids)
      AND namespace.nspname = 'public'
      AND owner_role.rolname = ANY(data_api_roles);

    IF unsafe_owner_tables IS NOT NULL THEN
        RAISE EXCEPTION 'Supabase RLS preflight failed: a Data API role owns target sequences: %', unsafe_owner_tables;
    END IF;

    -- MUTATIONS_BEGIN: every validation above completes before the first ALTER or REVOKE.
    FOREACH table_name IN ARRAY target_tables LOOP
        EXECUTE pg_catalog.format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', table_name);

        SELECT pg_catalog.string_agg(pg_catalog.format('%I', attribute.attname), ', ' ORDER BY attribute.attnum)
        INTO column_list
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = table_name
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped;

        FOREACH role_name IN ARRAY data_api_roles LOOP
            EXECUTE pg_catalog.format(
                'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
                'public', table_name, role_name
            );
            EXECUTE pg_catalog.format(
                'REVOKE ALL PRIVILEGES (%s) ON TABLE %I.%I FROM %I',
                column_list, 'public', table_name, role_name
            );
        END LOOP;
    END LOOP;

    FOR sequence_record IN
        SELECT namespace.nspname AS schema_name, relation.relname AS sequence_name
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE relation.oid = ANY(target_sequence_oids)
          AND namespace.nspname = 'public'
        ORDER BY namespace.nspname, relation.relname
    LOOP
        FOREACH role_name IN ARRAY data_api_roles LOOP
            EXECUTE pg_catalog.format(
                'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM %I',
                sequence_record.schema_name, sequence_record.sequence_name, role_name
            );
        END LOOP;
    END LOOP;
    -- MUTATIONS_END

    SELECT pg_catalog.array_agg(relation.relname ORDER BY relation.relname)
    INTO drift_items
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY(target_tables)
      AND (NOT relation.relrowsecurity OR relation.relforcerowsecurity);

    IF drift_items IS NOT NULL THEN
        RAISE EXCEPTION 'Supabase RLS postcondition failed: RLS state mismatch: %', drift_items;
    END IF;

    SELECT pg_catalog.array_agg(
        pg_catalog.format('%I.%I:%I', namespace.nspname, relation.relname, policy.polname)
        ORDER BY relation.relname, policy.polname
    )
    INTO policy_items
    FROM pg_catalog.pg_policy AS policy
    JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY(target_tables);

    IF policy_items IS NOT NULL THEN
        RAISE EXCEPTION 'Supabase RLS postcondition failed: policies appeared: %', policy_items;
    END IF;

    FOREACH role_name IN ARRAY data_api_roles LOOP
        FOREACH table_name IN ARRAY target_tables LOOP
            FOREACH privilege_name IN ARRAY table_privileges LOOP
                IF pg_catalog.has_table_privilege(
                    role_name,
                    pg_catalog.format('%I.%I', 'public', table_name),
                    privilege_name
                ) THEN
                    RAISE EXCEPTION
                        'Supabase RLS postcondition failed: role % retains % on public.%',
                        role_name, privilege_name, table_name;
                END IF;
            END LOOP;

            FOR column_name IN
                SELECT attribute.attname
                FROM pg_catalog.pg_attribute AS attribute
                JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
                JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
                WHERE namespace.nspname = 'public'
                  AND relation.relname = table_name
                  AND attribute.attnum > 0
                  AND NOT attribute.attisdropped
                ORDER BY attribute.attnum
            LOOP
                FOREACH privilege_name IN ARRAY column_privileges LOOP
                    IF pg_catalog.has_column_privilege(
                        role_name,
                        pg_catalog.format('%I.%I', 'public', table_name),
                        column_name,
                        privilege_name
                    ) THEN
                        RAISE EXCEPTION
                            'Supabase RLS postcondition failed: role % retains column % on public.%.%',
                            role_name, privilege_name, table_name, column_name;
                    END IF;
                END LOOP;
            END LOOP;
        END LOOP;

        FOR sequence_record IN
            SELECT namespace.nspname AS schema_name, relation.relname AS sequence_name
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE relation.oid = ANY(target_sequence_oids)
              AND namespace.nspname = 'public'
        LOOP
            FOREACH privilege_name IN ARRAY sequence_privileges LOOP
                IF pg_catalog.has_sequence_privilege(
                    role_name,
                    pg_catalog.format('%I.%I', sequence_record.schema_name, sequence_record.sequence_name),
                    privilege_name
                ) THEN
                    RAISE EXCEPTION
                        'Supabase RLS postcondition failed: role % retains sequence % on %.%',
                        role_name, privilege_name, sequence_record.schema_name, sequence_record.sequence_name;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    SELECT pg_catalog.array_agg(relation.relname ORDER BY relation.relname)
    INTO unexpected_tables
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'f', 'v', 'm')
      AND relation.relname <> ALL(canonical_tables)
      AND relation.relname <> 'assistant_events';

    IF unexpected_tables IS NOT NULL THEN
        RAISE EXCEPTION
            'Supabase RLS final check failed: unexpected public data relations appeared: %',
            unexpected_tables;
    END IF;

    SELECT pg_catalog.array_agg(
        pg_catalog.format(
            '%I.%I(%s)',
            namespace.nspname,
            procedure_entry.proname,
            pg_catalog.pg_get_function_identity_arguments(procedure_entry.oid)
        )
        ORDER BY procedure_entry.proname, procedure_entry.oid
    )
    INTO exposed_security_definer_items
    FROM pg_catalog.pg_proc AS procedure_entry
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure_entry.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure_entry.prosecdef
      AND EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(data_api_roles) AS role_entry
          WHERE pg_catalog.has_function_privilege(role_entry, procedure_entry.oid, 'EXECUTE')
      );

    IF exposed_security_definer_items IS NOT NULL THEN
        RAISE EXCEPTION
            'Supabase RLS final check failed: Data API roles can execute public SECURITY DEFINER routines: %',
            exposed_security_definer_items;
    END IF;
END
$supabase_rls_quarantine$;

COMMIT;
