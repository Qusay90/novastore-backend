BEGIN;

ALTER TABLE collections
    ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_collections_home_public
    ON collections(sort_order, id)
    WHERE show_on_home = TRUE
      AND is_active = TRUE
      AND deleted_at IS NULL;

COMMIT;
