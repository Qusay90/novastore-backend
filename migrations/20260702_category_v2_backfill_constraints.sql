BEGIN;

DO $$
DECLARE
    category_name_attnum SMALLINT;
    constraint_record RECORD;
BEGIN
    SELECT attnum::SMALLINT
    INTO category_name_attnum
    FROM pg_attribute
    WHERE attrelid = 'categories'::regclass
      AND attname = 'name'
      AND NOT attisdropped;

    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'categories'::regclass
          AND contype = 'u'
          AND array_length(conkey, 1) = 1
          AND conkey[1] = category_name_attnum
    LOOP
        EXECUTE format(
            'ALTER TABLE categories DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_sibling_name_unique
    ON categories (
        COALESCE(parent_id, 0),
        LOWER(BTRIM(name))
    )
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_path_unique
    ON categories (LOWER(path))
    WHERE path IS NOT NULL AND deleted_at IS NULL;

DO $$
DECLARE
    category_parent_attnum SMALLINT;
    constraint_record RECORD;
BEGIN
    SELECT attnum::SMALLINT
    INTO category_parent_attnum
    FROM pg_attribute
    WHERE attrelid = 'categories'::regclass
      AND attname = 'parent_id'
      AND NOT attisdropped;

    FOR constraint_record IN
        SELECT conname, confdeltype
        FROM pg_constraint
        WHERE conrelid = 'categories'::regclass
          AND confrelid = 'categories'::regclass
          AND contype = 'f'
          AND array_length(conkey, 1) = 1
          AND conkey[1] = category_parent_attnum
    LOOP
        IF constraint_record.confdeltype NOT IN ('r', 'a') THEN
            EXECUTE format(
                'ALTER TABLE categories DROP CONSTRAINT %I',
                constraint_record.conname
            );
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'categories'::regclass
          AND confrelid = 'categories'::regclass
          AND contype = 'f'
          AND array_length(conkey, 1) = 1
          AND conkey[1] = category_parent_attnum
          AND confdeltype IN ('r', 'a')
    ) THEN
        ALTER TABLE categories
            ADD CONSTRAINT categories_parent_id_restrict_fkey
            FOREIGN KEY (parent_id)
            REFERENCES categories(id)
            ON DELETE RESTRICT;
    END IF;
END
$$;

COMMIT;
