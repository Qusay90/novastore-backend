BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
SET LOCAL search_path = pg_catalog;

-- Structural actions below are EXACTLY_REVERSIBLE for the verified production pre-state.
-- The seven historical order_items are NOT_SAFELY_REVERSIBLE after application activity.
-- This rollback intentionally retains them and therefore has CONDITIONAL overall exactness.

DO $rollback_preflight$
DECLARE
    column_spec RECORD;
    index_spec RECORD;
    actual_type TEXT;
    actual_default TEXT;
    actual_not_null BOOLEAN;
    exact_index_ok BOOLEAN;
    matching_item_count BIGINT;
    missing_item_count BIGINT;
    issue_count BIGINT;
    inbound_reference_count BIGINT;
BEGIN
    IF NOT pg_catalog.pg_try_advisory_xact_lock(
        pg_catalog.hashtextextended('novastore:legacy-drift-reconciliation:v1', 0)
    ) THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation rollback failed: another reconciliation holds the advisory lock';
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
        IF actual_type IS DISTINCT FROM column_spec.data_type OR
           actual_default IS DISTINCT FROM column_spec.default_expression OR
           NOT actual_not_null THEN
            RAISE EXCEPTION
                'Legacy drift reconciliation rollback failed: %.% is not at the exact reconciled signature',
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
        ) INTO exact_index_ok;
        IF NOT exact_index_ok THEN
            RAISE EXCEPTION
                'Legacy drift reconciliation rollback failed: exact migration-created index % is absent or drifted',
                index_spec.index_name;
        END IF;
    END LOOP;

    WITH expected_items AS (
        SELECT orders.id AS order_id,
               products.id AS product_id,
               LEFT(COALESCE(NULLIF(item.value->>'name', ''), products.name, 'Legacy product'), 255) AS product_name,
               (item.value->>'quantity')::INTEGER AS quantity,
               CASE
                   WHEN COALESCE(item.value->>'price', item.value->>'unit_price', '') ~ '^[0-9]+([.][0-9]+)?$'
                       THEN COALESCE(item.value->>'price', item.value->>'unit_price')::DECIMAL(12, 2)
                   ELSE 0::DECIMAL(12, 2)
               END AS unit_price,
               (item.ordinality - 1)::INTEGER AS source_item_index,
               orders.created_at AS created_at
        FROM public.orders
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(orders.items)
            WITH ORDINALITY AS item(value, ordinality)
        LEFT JOIN public.products ON products.id = CASE
            WHEN COALESCE(item.value->>'id', item.value->>'product_id', item.value->>'productId', '') ~ '^[1-9][0-9]*$'
                THEN COALESCE(item.value->>'id', item.value->>'product_id', item.value->>'productId')::INTEGER
            ELSE NULL
        END
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
                 AND keyed.total_price = expected_items.quantity * expected_items.unit_price
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
            'Legacy drift reconciliation rollback failed: historical backfill rows changed (matching %, missing %)',
            matching_item_count, missing_item_count;
    END IF;

    SELECT pg_catalog.count(*)
    INTO issue_count
    FROM public.order_item_backfill_issues;
    IF issue_count <> 0 THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation rollback failed: issue table is no longer at the verified zero-row state';
    END IF;

    SELECT pg_catalog.count(*)
    INTO inbound_reference_count
    FROM pg_catalog.pg_constraint AS constraint_entry
    WHERE constraint_entry.contype = 'f'
      AND constraint_entry.confrelid IN (
          'public.order_items'::pg_catalog.regclass,
          'public.order_item_backfill_issues'::pg_catalog.regclass
      );
    IF inbound_reference_count <> 0 THEN
        RAISE EXCEPTION
            'Legacy drift reconciliation rollback failed: new inbound foreign keys reference backfill tables';
    END IF;

    -- DATA RETENTION BOUNDARY: no DELETE of historical order_items is authorized here.
END
$rollback_preflight$;

ALTER TABLE public.visitor_sessions
    ALTER COLUMN started_at DROP NOT NULL,
    ALTER COLUMN last_seen_at DROP NOT NULL;
ALTER TABLE public.page_visits
    ALTER COLUMN entered_at DROP NOT NULL,
    ALTER COLUMN last_seen_at DROP NOT NULL,
    ALTER COLUMN duration_seconds DROP NOT NULL,
    ALTER COLUMN heartbeat_count DROP NOT NULL;
ALTER TABLE public.product_actions
    ALTER COLUMN quantity DROP NOT NULL,
    ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE public.notifications
    ALTER COLUMN is_read DROP NOT NULL,
    ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE public.returns
    ALTER COLUMN status DROP NOT NULL,
    ALTER COLUMN created_at DROP NOT NULL,
    ALTER COLUMN updated_at DROP NOT NULL;

DROP INDEX public.idx_product_actions_user_id;
DROP INDEX public.idx_product_actions_created_at;
DROP INDEX public.idx_notifications_created_at;
DROP INDEX public.idx_returns_status;
DROP INDEX public.idx_returns_created_at;

DO $rollback_postconditions$
DECLARE
    column_spec RECORD;
    index_name TEXT;
    actual_not_null BOOLEAN;
BEGIN
    FOR column_spec IN
        SELECT *
        FROM (VALUES
            ('visitor_sessions', 'started_at'), ('visitor_sessions', 'last_seen_at'),
            ('page_visits', 'entered_at'), ('page_visits', 'last_seen_at'),
            ('page_visits', 'duration_seconds'), ('page_visits', 'heartbeat_count'),
            ('product_actions', 'quantity'), ('product_actions', 'created_at'),
            ('notifications', 'is_read'), ('notifications', 'created_at'),
            ('returns', 'status'), ('returns', 'created_at'), ('returns', 'updated_at')
        ) AS expected(table_name, column_name)
    LOOP
        SELECT attribute.attnotnull
        INTO actual_not_null
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = column_spec.table_name
          AND attribute.attname = column_spec.column_name;
        IF actual_not_null THEN
            RAISE EXCEPTION
                'Legacy drift reconciliation rollback postcondition failed: %.% remains NOT NULL',
                column_spec.table_name, column_spec.column_name;
        END IF;
    END LOOP;

    FOREACH index_name IN ARRAY ARRAY[
        'idx_product_actions_user_id', 'idx_product_actions_created_at',
        'idx_notifications_created_at', 'idx_returns_status', 'idx_returns_created_at'
    ]
    LOOP
        IF pg_catalog.to_regclass(pg_catalog.format('public.%I', index_name)) IS NOT NULL THEN
            RAISE EXCEPTION
                'Legacy drift reconciliation rollback postcondition failed: index % remains', index_name;
        END IF;
    END LOOP;
END
$rollback_postconditions$;

COMMIT;
