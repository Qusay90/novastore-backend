BEGIN;

DO $$
DECLARE
    platform_store_count INTEGER;
    inserted_store_count INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER
    INTO platform_store_count
    FROM stores
    WHERE LOWER(slug) = 'novastore-platform'
      AND is_active = TRUE
      AND deleted_at IS NULL;

    IF platform_store_count > 1 THEN
        RAISE EXCEPTION 'stage A prerequisite failed: multiple active novastore-platform stores';
    END IF;

    INSERT INTO stores (name, slug, is_active)
    VALUES ('NovaStore', 'novastore-platform', TRUE)
    ON CONFLICT (LOWER(slug))
        WHERE slug IS NOT NULL AND deleted_at IS NULL
        DO NOTHING;

    GET DIAGNOSTICS inserted_store_count = ROW_COUNT;
    IF inserted_store_count NOT IN (0, 1) THEN
        RAISE EXCEPTION 'stage A prerequisite failed: unexpected platform-store insert count %', inserted_store_count;
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO platform_store_count
    FROM stores
    WHERE LOWER(slug) = 'novastore-platform'
      AND is_active = TRUE
      AND deleted_at IS NULL;

    IF platform_store_count <> 1 THEN
        RAISE EXCEPTION 'stage A prerequisite failed: expected one active novastore-platform store, found %', platform_store_count;
    END IF;
END;
$$;

COMMIT;
