BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
SET LOCAL search_path = pg_catalog;

DO $reconciliation$
DECLARE
    column_spec RECORD;
    index_spec RECORD;
    actual_type TEXT;
    actual_default TEXT;
    actual_not_null BOOLEAN;
    null_count BIGINT;
    exact_name_count BIGINT;
    exact_name_is_equivalent BOOLEAN;
    equivalent_index_count BIGINT;
    expected_item_count BIGINT;
    matching_item_count BIGINT;
    missing_item_count BIGINT;
    conflicting_key_count BIGINT;
    different_key_equivalent_count BIGINT;
    unresolved_product_count BIGINT;
    source_order_without_timestamp_count BIGINT;
    pre_item_issue_count BIGINT;
    matching_pre_item_issue_count BIGINT;
    candidate_order_issue_row_count BIGINT;
    post_item_issue_count BIGINT;
    inserted_item_count BIGINT;
    next_item_id_base BIGINT;
BEGIN
    IF NOT pg_catalog.pg_try_advisory_xact_lock(
        pg_catalog.hashtextextended('novastore:legacy-drift-reconciliation:v1', 0)
    ) THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation preflight failed: another reconciliation holds the advisory lock';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
          AND relation.relname = ANY(ARRAY[
              'orders', 'products', 'order_items', 'order_item_backfill_issues',
              'visitor_sessions', 'page_visits', 'product_actions', 'notifications', 'returns'
          ])
    ) <> 9 THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation preflight failed: one or more required public tables are missing';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = ANY(ARRAY[
              'orders', 'products', 'order_items', 'order_item_backfill_issues',
              'visitor_sessions', 'page_visits', 'product_actions', 'notifications', 'returns'
          ])
          AND NOT pg_catalog.pg_has_role(current_user, relation.relowner, 'USAGE')
    ) THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation preflight failed: current role does not inherit every target owner role';
    END IF;

    LOCK TABLE
        public.orders,
        public.products,
        public.order_items,
        public.order_item_backfill_issues,
        public.visitor_sessions,
        public.page_visits,
        public.product_actions,
        public.notifications,
        public.returns
    IN ACCESS EXCLUSIVE MODE;

    IF pg_catalog.pg_get_serial_sequence('public.order_items', 'id') IS DISTINCT FROM
       'public.order_items_id_seq' THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation preflight failed: order_items.id sequence ownership drifted';
    END IF;

    FOR column_spec IN
        SELECT *
        FROM (VALUES
            ('visitor_sessions', 'started_at', 'timestamp without time zone', 'CURRENT_TIMESTAMP'),
            ('visitor_sessions', 'last_seen_at', 'timestamp without time zone', 'CURRENT_TIMESTAMP'),
            ('page_visits', 'entered_at', 'timestamp without time zone', 'CURRENT_TIMESTAMP'),
            ('page_visits', 'last_seen_at', 'timestamp without time zone', 'CURRENT_TIMESTAMP'),
            ('page_visits', 'duration_seconds', 'integer', '0'),
            ('page_visits', 'heartbeat_count', 'integer', '0'),
            ('product_actions', 'quantity', 'integer', '1'),
            ('product_actions', 'created_at', 'timestamp without time zone', 'CURRENT_TIMESTAMP'),
            ('notifications', 'is_read', 'boolean', 'false'),
            ('notifications', 'created_at', 'timestamp without time zone', 'CURRENT_TIMESTAMP'),
            ('returns', 'status', 'character varying(40)', '''REQUESTED''::character varying'),
            ('returns', 'created_at', 'timestamp without time zone', 'CURRENT_TIMESTAMP'),
            ('returns', 'updated_at', 'timestamp without time zone', 'CURRENT_TIMESTAMP')
        ) AS expected(table_name, column_name, data_type, default_expression)
    LOOP
        SELECT pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
               pg_catalog.pg_get_expr(default_entry.adbin, default_entry.adrelid),
               attribute.attnotnull
        INTO actual_type, actual_default, actual_not_null
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        LEFT JOIN pg_catalog.pg_attrdef AS default_entry
          ON default_entry.adrelid = attribute.attrelid
         AND default_entry.adnum = attribute.attnum
        WHERE namespace.nspname = 'public'
          AND relation.relname = column_spec.table_name
          AND attribute.attname = column_spec.column_name
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped;

        IF actual_type IS NULL THEN
            RAISE EXCEPTION
                'Legacy drift reconciliation preflight failed: missing column %.%',
                column_spec.table_name, column_spec.column_name;
        END IF;
        IF actual_type <> column_spec.data_type THEN
            RAISE EXCEPTION
                'Legacy drift reconciliation preflight failed: wrong type for %.%: %',
                column_spec.table_name, column_spec.column_name, actual_type;
        END IF;
        IF actual_default IS DISTINCT FROM column_spec.default_expression THEN
            RAISE EXCEPTION
                'Legacy drift reconciliation preflight failed: wrong default for %.%: %',
                column_spec.table_name, column_spec.column_name, actual_default;
        END IF;

        EXECUTE pg_catalog.format(
            'SELECT pg_catalog.count(*) FROM public.%I WHERE %I IS NULL',
            column_spec.table_name,
            column_spec.column_name
        ) INTO null_count;
        IF null_count <> 0 THEN
            RAISE EXCEPTION
                'Legacy drift reconciliation preflight failed: %.% has % NULL rows and no deterministic historical repair source',
                column_spec.table_name, column_spec.column_name, null_count;
        END IF;
    END LOOP;

    FOR index_spec IN
        SELECT *
        FROM (VALUES
            ('idx_product_actions_user_id', 'product_actions', 'user_id', FALSE),
            ('idx_product_actions_created_at', 'product_actions', 'created_at', TRUE),
            ('idx_notifications_created_at', 'notifications', 'created_at', TRUE),
            ('idx_returns_status', 'returns', 'status', FALSE),
            ('idx_returns_created_at', 'returns', 'created_at', TRUE)
        ) AS expected(index_name, table_name, column_name, descending)
    LOOP
        SELECT pg_catalog.count(*)
        INTO exact_name_count
        FROM pg_catalog.pg_class AS index_relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = index_relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND index_relation.relkind = 'i'
          AND index_relation.relname = index_spec.index_name;

        SELECT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_index AS index_entry
            JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_entry.indexrelid
            JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid = index_entry.indrelid
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
            JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
            WHERE namespace.nspname = 'public'
              AND table_relation.relname = index_spec.table_name
              AND index_relation.relname = index_spec.index_name
              AND access_method.amname = 'btree'
              AND NOT index_entry.indisunique
              AND index_entry.indisvalid
              AND index_entry.indisready
              AND index_entry.indnkeyatts = 1
              AND index_entry.indnatts = 1
              AND index_entry.indpred IS NULL
              AND pg_catalog.pg_get_indexdef(index_relation.oid, 1, TRUE) = index_spec.column_name
              AND ((index_entry.indoption[0] & 1) = 1) = index_spec.descending
              AND ((index_entry.indoption[0] & 2) = 2) = index_spec.descending
        ) INTO exact_name_is_equivalent;

        IF exact_name_count > 0 AND NOT exact_name_is_equivalent THEN
            RAISE EXCEPTION
                'Legacy drift reconciliation preflight failed: named index % exists with a different definition',
                index_spec.index_name;
        END IF;

        SELECT pg_catalog.count(*)
        INTO equivalent_index_count
        FROM pg_catalog.pg_index AS index_entry
        JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_entry.indexrelid
        JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid = index_entry.indrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
        JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
        WHERE namespace.nspname = 'public'
          AND table_relation.relname = index_spec.table_name
          AND access_method.amname = 'btree'
          AND NOT index_entry.indisunique
          AND index_entry.indisvalid
          AND index_entry.indisready
          AND index_entry.indnkeyatts = 1
          AND index_entry.indnatts = 1
          AND index_entry.indpred IS NULL
          AND pg_catalog.pg_get_indexdef(index_relation.oid, 1, TRUE) = index_spec.column_name
          AND ((index_entry.indoption[0] & 1) = 1) = index_spec.descending
          AND ((index_entry.indoption[0] & 2) = 2) = index_spec.descending;

        IF equivalent_index_count > 1 THEN
            RAISE EXCEPTION
                'Legacy drift reconciliation preflight failed: multiple semantic equivalents exist for %',
                index_spec.index_name;
        END IF;
    END LOOP;

    SELECT GREATEST(
        COALESCE((SELECT pg_catalog.max(id) FROM public.order_items), 0),
        COALESCE((
            SELECT sequence.last_value
            FROM pg_catalog.pg_sequences AS sequence
            WHERE sequence.schemaname = 'public'
              AND sequence.sequencename = 'order_items_id_seq'
        ), 0)
    )
    INTO next_item_id_base;

    WITH expected_items AS (
        SELECT
            orders.id AS order_id,
            products.id AS product_id,
            parsed.requested_product_id,
            LEFT(COALESCE(NULLIF(item.value->>'name', ''), products.name, 'Legacy product'), 255) AS product_name,
            parsed.quantity,
            parsed.unit_price,
            parsed.quantity * parsed.unit_price AS total_price,
            (item.ordinality - 1)::INTEGER AS source_item_index,
            orders.created_at AS source_order_created_at,
            COALESCE(orders.created_at, CURRENT_TIMESTAMP) AS created_at
        FROM public.orders
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
            CASE WHEN pg_catalog.jsonb_typeof(orders.items) = 'array' THEN orders.items ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS item(value, ordinality)
        CROSS JOIN LATERAL (
            SELECT
                CASE
                    WHEN COALESCE(item.value->>'quantity', '') ~ '^[1-9][0-9]*$'
                        THEN (item.value->>'quantity')::INTEGER
                    ELSE NULL
                END AS quantity,
                CASE
                    WHEN COALESCE(item.value->>'price', item.value->>'unit_price', '') ~ '^[0-9]+([.][0-9]+)?$'
                        THEN COALESCE(item.value->>'price', item.value->>'unit_price')::DECIMAL(12, 2)
                    ELSE 0::DECIMAL(12, 2)
                END AS unit_price,
                CASE
                    WHEN COALESCE(item.value->>'id', item.value->>'product_id', item.value->>'productId', '') ~ '^[1-9][0-9]*$'
                        THEN COALESCE(item.value->>'id', item.value->>'product_id', item.value->>'productId')::INTEGER
                    ELSE NULL
                END AS requested_product_id
        ) AS parsed
        LEFT JOIN public.products ON products.id = parsed.requested_product_id
        WHERE orders.items IS NOT NULL
          AND pg_catalog.jsonb_typeof(orders.items) = 'array'
          AND pg_catalog.jsonb_typeof(item.value) = 'object'
          AND parsed.quantity IS NOT NULL
    ),
    analyzed AS (
        SELECT expected_items.*,
               keyed.id AS keyed_id,
               CASE WHEN keyed.id IS NULL THEN FALSE ELSE
                   keyed.product_id IS NOT DISTINCT FROM expected_items.product_id
                   AND keyed.product_name = expected_items.product_name
                   AND keyed.quantity = expected_items.quantity
                   AND keyed.unit_price = expected_items.unit_price
                   AND keyed.total_price = expected_items.total_price
                   AND keyed.created_at = expected_items.created_at
               END AS keyed_value_match,
               (
                   SELECT pg_catalog.count(*)
                   FROM public.order_items AS equivalent
                   WHERE equivalent.order_id = expected_items.order_id
                     AND equivalent.source_item_index IS DISTINCT FROM expected_items.source_item_index
                     AND equivalent.product_id IS NOT DISTINCT FROM expected_items.product_id
                     AND equivalent.product_name = expected_items.product_name
                     AND equivalent.quantity = expected_items.quantity
                     AND equivalent.unit_price = expected_items.unit_price
                     AND equivalent.total_price = expected_items.total_price
                     AND equivalent.created_at = expected_items.created_at
               ) AS different_key_equivalents
        FROM expected_items
        LEFT JOIN public.order_items AS keyed
          ON keyed.order_id = expected_items.order_id
         AND keyed.source_item_index = expected_items.source_item_index
    )
    SELECT pg_catalog.count(*),
           pg_catalog.count(*) FILTER (WHERE keyed_id IS NOT NULL AND keyed_value_match),
           pg_catalog.count(*) FILTER (WHERE keyed_id IS NULL),
           pg_catalog.count(*) FILTER (WHERE keyed_id IS NOT NULL AND NOT keyed_value_match),
           COALESCE(pg_catalog.sum(different_key_equivalents), 0),
           pg_catalog.count(*) FILTER (WHERE requested_product_id IS NOT NULL AND product_id IS NULL),
           pg_catalog.count(*) FILTER (WHERE source_order_created_at IS NULL)
    INTO expected_item_count,
         matching_item_count,
         missing_item_count,
         conflicting_key_count,
         different_key_equivalent_count,
         unresolved_product_count,
         source_order_without_timestamp_count
    FROM analyzed;

    IF expected_item_count <> 7 THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation preflight failed: expected exactly 7 qualifying source items, found %',
            expected_item_count;
    END IF;
    IF conflicting_key_count <> 0 THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation preflight failed: % deterministic order-item keys contain different values',
            conflicting_key_count;
    END IF;
    IF different_key_equivalent_count <> 0 THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation preflight failed: % business-equivalent order items exist under different keys',
            different_key_equivalent_count;
    END IF;
    IF unresolved_product_count <> 0 THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation preflight failed: % qualifying product references no longer resolve',
            unresolved_product_count;
    END IF;
    IF source_order_without_timestamp_count <> 0 THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation preflight failed: % qualifying orders have no deterministic created_at source',
            source_order_without_timestamp_count;
    END IF;
    IF NOT (
        (missing_item_count = 7 AND matching_item_count = 0) OR
        (missing_item_count = 0 AND matching_item_count = 7)
    ) THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation preflight failed: partial prior execution detected (matching %, missing %)',
            matching_item_count, missing_item_count;
    END IF;

    WITH expected_issues AS (
        SELECT orders.id AS order_id,
               CASE
                   WHEN orders.items IS NULL THEN 'items_null'
                   WHEN pg_catalog.jsonb_typeof(orders.items) <> 'array' THEN 'items_not_array'
                   WHEN pg_catalog.jsonb_array_length(orders.items) = 0 THEN 'items_empty'
                   ELSE 'items_partially_unreadable'
               END AS reason,
               orders.items AS source_items
        FROM public.orders
        WHERE orders.items IS NULL
           OR pg_catalog.jsonb_typeof(orders.items) <> 'array'
           OR CASE
                WHEN pg_catalog.jsonb_typeof(orders.items) = 'array'
                    THEN pg_catalog.jsonb_array_length(orders.items) = 0
                ELSE FALSE
              END
           OR (
                pg_catalog.jsonb_typeof(orders.items) = 'array'
                AND (
                    SELECT pg_catalog.count(*)
                    FROM public.order_items
                    WHERE order_items.order_id = orders.id
                ) < CASE
                        WHEN pg_catalog.jsonb_typeof(orders.items) = 'array'
                            THEN pg_catalog.jsonb_array_length(orders.items)
                        ELSE 0
                    END
           )
    )
    SELECT pg_catalog.count(*),
           pg_catalog.count(*) FILTER (
               WHERE existing.order_id IS NOT NULL
                 AND existing.reason = expected_issues.reason
                 AND existing.source_items IS NOT DISTINCT FROM expected_issues.source_items
           )
    INTO pre_item_issue_count, matching_pre_item_issue_count
    FROM expected_issues
    LEFT JOIN public.order_item_backfill_issues AS existing
      ON existing.order_id = expected_issues.order_id;

    WITH candidate_orders AS (
        SELECT DISTINCT orders.id AS order_id
        FROM public.orders
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
            CASE WHEN pg_catalog.jsonb_typeof(orders.items) = 'array' THEN orders.items ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS item(value, ordinality)
        WHERE orders.items IS NOT NULL
          AND pg_catalog.jsonb_typeof(orders.items) = 'array'
          AND pg_catalog.jsonb_typeof(item.value) = 'object'
          AND COALESCE(item.value->>'quantity', '') ~ '^[1-9][0-9]*$'
    )
    SELECT pg_catalog.count(*)
    INTO candidate_order_issue_row_count
    FROM public.order_item_backfill_issues AS issue
    JOIN candidate_orders ON candidate_orders.order_id = issue.order_id;

    IF missing_item_count = 7 AND (
        pre_item_issue_count <> 2 OR
        matching_pre_item_issue_count <> 0 OR
        candidate_order_issue_row_count <> 0
    ) THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation preflight failed: initial issue discrepancy changed (expected %, matching %, candidate rows %)',
            pre_item_issue_count, matching_pre_item_issue_count, candidate_order_issue_row_count;
    END IF;
    IF missing_item_count = 0 AND (
        pre_item_issue_count <> 0 OR
        candidate_order_issue_row_count <> 0
    ) THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation preflight failed: replay issue state changed (expected %, candidate rows %)',
            pre_item_issue_count, candidate_order_issue_row_count;
    END IF;

    -- MUTATIONS_BEGIN: every schema, NULL, index, source, duplicate and issue validation above passed.
    WITH expected_items AS (
        SELECT
            orders.id AS order_id,
            products.id AS product_id,
            LEFT(COALESCE(NULLIF(item.value->>'name', ''), products.name, 'Legacy product'), 255) AS product_name,
            parsed.quantity,
            parsed.unit_price,
            parsed.quantity * parsed.unit_price AS total_price,
            (item.ordinality - 1)::INTEGER AS source_item_index,
            orders.created_at AS created_at
        FROM public.orders
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(orders.items)
            WITH ORDINALITY AS item(value, ordinality)
        CROSS JOIN LATERAL (
            SELECT
                (item.value->>'quantity')::INTEGER AS quantity,
                CASE
                    WHEN COALESCE(item.value->>'price', item.value->>'unit_price', '') ~ '^[0-9]+([.][0-9]+)?$'
                        THEN COALESCE(item.value->>'price', item.value->>'unit_price')::DECIMAL(12, 2)
                    ELSE 0::DECIMAL(12, 2)
                END AS unit_price,
                CASE
                    WHEN COALESCE(item.value->>'id', item.value->>'product_id', item.value->>'productId', '') ~ '^[1-9][0-9]*$'
                        THEN COALESCE(item.value->>'id', item.value->>'product_id', item.value->>'productId')::INTEGER
                    ELSE NULL
                END AS requested_product_id
        ) AS parsed
        LEFT JOIN public.products ON products.id = parsed.requested_product_id
        WHERE orders.items IS NOT NULL
          AND pg_catalog.jsonb_typeof(orders.items) = 'array'
          AND pg_catalog.jsonb_typeof(item.value) = 'object'
          AND COALESCE(item.value->>'quantity', '') ~ '^[1-9][0-9]*$'
    )
    INSERT INTO public.order_items (
        id,
        order_id,
        product_id,
        product_name,
        quantity,
        unit_price,
        total_price,
        source_item_index,
        created_at
    )
    SELECT
        next_item_id_base + pg_catalog.row_number() OVER (
            ORDER BY expected_items.order_id, expected_items.source_item_index
        ),
        expected_items.order_id,
        expected_items.product_id,
        expected_items.product_name,
        expected_items.quantity,
        expected_items.unit_price,
        expected_items.total_price,
        expected_items.source_item_index,
        expected_items.created_at
    FROM expected_items
    ON CONFLICT (order_id, source_item_index) DO NOTHING;

    GET DIAGNOSTICS inserted_item_count = ROW_COUNT;
    IF inserted_item_count <> missing_item_count THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation mutation failed: expected % order-item inserts, inserted %',
            missing_item_count, inserted_item_count;
    END IF;

    IF inserted_item_count > 0 THEN
        EXECUTE pg_catalog.format(
            'ALTER SEQUENCE public.order_items_id_seq RESTART WITH %s',
            next_item_id_base + inserted_item_count + 1
        );
    END IF;

    -- PARTIAL_FAILURE_TEST_HOOK

    FOR column_spec IN
        SELECT *
        FROM (VALUES
            ('visitor_sessions', 'started_at'),
            ('visitor_sessions', 'last_seen_at'),
            ('page_visits', 'entered_at'),
            ('page_visits', 'last_seen_at'),
            ('page_visits', 'duration_seconds'),
            ('page_visits', 'heartbeat_count'),
            ('product_actions', 'quantity'),
            ('product_actions', 'created_at'),
            ('notifications', 'is_read'),
            ('notifications', 'created_at'),
            ('returns', 'status'),
            ('returns', 'created_at'),
            ('returns', 'updated_at')
        ) AS expected(table_name, column_name)
    LOOP
        EXECUTE pg_catalog.format(
            'ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL',
            column_spec.table_name,
            column_spec.column_name
        );
    END LOOP;

    FOR index_spec IN
        SELECT *
        FROM (VALUES
            ('idx_product_actions_user_id', 'product_actions', 'user_id', FALSE),
            ('idx_product_actions_created_at', 'product_actions', 'created_at', TRUE),
            ('idx_notifications_created_at', 'notifications', 'created_at', TRUE),
            ('idx_returns_status', 'returns', 'status', FALSE),
            ('idx_returns_created_at', 'returns', 'created_at', TRUE)
        ) AS expected(index_name, table_name, column_name, descending)
    LOOP
        SELECT pg_catalog.count(*)
        INTO equivalent_index_count
        FROM pg_catalog.pg_index AS index_entry
        JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_entry.indexrelid
        JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid = index_entry.indrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
        JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
        WHERE namespace.nspname = 'public'
          AND table_relation.relname = index_spec.table_name
          AND access_method.amname = 'btree'
          AND NOT index_entry.indisunique
          AND index_entry.indisvalid
          AND index_entry.indisready
          AND index_entry.indnkeyatts = 1
          AND index_entry.indnatts = 1
          AND index_entry.indpred IS NULL
          AND pg_catalog.pg_get_indexdef(index_relation.oid, 1, TRUE) = index_spec.column_name
          AND ((index_entry.indoption[0] & 1) = 1) = index_spec.descending
          AND ((index_entry.indoption[0] & 2) = 2) = index_spec.descending;

        IF equivalent_index_count = 0 THEN
            EXECUTE pg_catalog.format(
                'CREATE INDEX %I ON public.%I (%I %s)',
                index_spec.index_name,
                index_spec.table_name,
                index_spec.column_name,
                CASE WHEN index_spec.descending THEN 'DESC' ELSE 'ASC' END
            );
        END IF;
    END LOOP;

    WITH expected_items AS (
        SELECT
            orders.id AS order_id,
            products.id AS product_id,
            LEFT(COALESCE(NULLIF(item.value->>'name', ''), products.name, 'Legacy product'), 255) AS product_name,
            parsed.quantity,
            parsed.unit_price,
            parsed.quantity * parsed.unit_price AS total_price,
            (item.ordinality - 1)::INTEGER AS source_item_index,
            orders.created_at AS created_at
        FROM public.orders
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(orders.items)
            WITH ORDINALITY AS item(value, ordinality)
        CROSS JOIN LATERAL (
            SELECT
                (item.value->>'quantity')::INTEGER AS quantity,
                CASE
                    WHEN COALESCE(item.value->>'price', item.value->>'unit_price', '') ~ '^[0-9]+([.][0-9]+)?$'
                        THEN COALESCE(item.value->>'price', item.value->>'unit_price')::DECIMAL(12, 2)
                    ELSE 0::DECIMAL(12, 2)
                END AS unit_price,
                CASE
                    WHEN COALESCE(item.value->>'id', item.value->>'product_id', item.value->>'productId', '') ~ '^[1-9][0-9]*$'
                        THEN COALESCE(item.value->>'id', item.value->>'product_id', item.value->>'productId')::INTEGER
                    ELSE NULL
                END AS requested_product_id
        ) AS parsed
        LEFT JOIN public.products ON products.id = parsed.requested_product_id
        WHERE orders.items IS NOT NULL
          AND pg_catalog.jsonb_typeof(orders.items) = 'array'
          AND pg_catalog.jsonb_typeof(item.value) = 'object'
          AND COALESCE(item.value->>'quantity', '') ~ '^[1-9][0-9]*$'
    )
    SELECT pg_catalog.count(*) FILTER (
               WHERE keyed.id IS NOT NULL
                 AND keyed.product_id IS NOT DISTINCT FROM expected_items.product_id
                 AND keyed.product_name = expected_items.product_name
                 AND keyed.quantity = expected_items.quantity
                 AND keyed.unit_price = expected_items.unit_price
                 AND keyed.total_price = expected_items.total_price
                 AND keyed.created_at = expected_items.created_at
           ),
           pg_catalog.count(*) FILTER (WHERE keyed.id IS NULL)
    INTO matching_item_count, missing_item_count
    FROM expected_items
    LEFT JOIN public.order_items AS keyed
      ON keyed.order_id = expected_items.order_id
     AND keyed.source_item_index = expected_items.source_item_index;

    IF matching_item_count <> 7 OR missing_item_count <> 0 THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation postcondition failed: matching %, missing %',
            matching_item_count, missing_item_count;
    END IF;

    SELECT pg_catalog.count(*)
    INTO post_item_issue_count
    FROM public.orders
    WHERE orders.items IS NULL
       OR pg_catalog.jsonb_typeof(orders.items) <> 'array'
       OR CASE
            WHEN pg_catalog.jsonb_typeof(orders.items) = 'array'
                THEN pg_catalog.jsonb_array_length(orders.items) = 0
            ELSE FALSE
          END
       OR (
            pg_catalog.jsonb_typeof(orders.items) = 'array'
            AND (
                SELECT pg_catalog.count(*)
                FROM public.order_items
                WHERE order_items.order_id = orders.id
            ) < CASE
                    WHEN pg_catalog.jsonb_typeof(orders.items) = 'array'
                        THEN pg_catalog.jsonb_array_length(orders.items)
                    ELSE 0
                END
       );

    IF post_item_issue_count <> 0 THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation postcondition failed: original sequential issue query still expects % rows',
            post_item_issue_count;
    END IF;

    FOR column_spec IN
        SELECT *
        FROM (VALUES
            ('visitor_sessions', 'started_at'),
            ('visitor_sessions', 'last_seen_at'),
            ('page_visits', 'entered_at'),
            ('page_visits', 'last_seen_at'),
            ('page_visits', 'duration_seconds'),
            ('page_visits', 'heartbeat_count'),
            ('product_actions', 'quantity'),
            ('product_actions', 'created_at'),
            ('notifications', 'is_read'),
            ('notifications', 'created_at'),
            ('returns', 'status'),
            ('returns', 'created_at'),
            ('returns', 'updated_at')
        ) AS expected(table_name, column_name)
    LOOP
        SELECT attribute.attnotnull
        INTO actual_not_null
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = column_spec.table_name
          AND attribute.attname = column_spec.column_name
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped;
        IF NOT actual_not_null THEN
            RAISE EXCEPTION
                'Legacy drift reconciliation postcondition failed: %.% remains nullable',
                column_spec.table_name, column_spec.column_name;
        END IF;
    END LOOP;

    FOR index_spec IN
        SELECT *
        FROM (VALUES
            ('idx_product_actions_user_id', 'product_actions', 'user_id', FALSE),
            ('idx_product_actions_created_at', 'product_actions', 'created_at', TRUE),
            ('idx_notifications_created_at', 'notifications', 'created_at', TRUE),
            ('idx_returns_status', 'returns', 'status', FALSE),
            ('idx_returns_created_at', 'returns', 'created_at', TRUE)
        ) AS expected(index_name, table_name, column_name, descending)
    LOOP
        SELECT pg_catalog.count(*)
        INTO equivalent_index_count
        FROM pg_catalog.pg_index AS index_entry
        JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_entry.indexrelid
        JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid = index_entry.indrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
        JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
        WHERE namespace.nspname = 'public'
          AND table_relation.relname = index_spec.table_name
          AND access_method.amname = 'btree'
          AND NOT index_entry.indisunique
          AND index_entry.indisvalid
          AND index_entry.indisready
          AND index_entry.indnkeyatts = 1
          AND index_entry.indnatts = 1
          AND index_entry.indpred IS NULL
          AND pg_catalog.pg_get_indexdef(index_relation.oid, 1, TRUE) = index_spec.column_name
          AND ((index_entry.indoption[0] & 1) = 1) = index_spec.descending
          AND ((index_entry.indoption[0] & 2) = 2) = index_spec.descending;
        IF equivalent_index_count <> 1 THEN
            RAISE EXCEPTION
                'Legacy drift reconciliation postcondition failed: % has % semantic equivalents',
                index_spec.index_name, equivalent_index_count;
        END IF;
    END LOOP;
END
$reconciliation$;

COMMIT;
