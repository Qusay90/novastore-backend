BEGIN;

ALTER TABLE product_media
    ADD COLUMN IF NOT EXISTS media_type VARCHAR(20);

UPDATE product_media
SET media_type = CASE
    WHEN media_url ~* '/video/upload/' THEN 'video'
    ELSE COALESCE(media_type, 'image')
END
WHERE media_type IS NULL
   OR media_url ~* '/video/upload/';

ALTER TABLE product_media
    ALTER COLUMN media_type SET DEFAULT 'image';

ALTER TABLE product_media
    ALTER COLUMN media_type SET NOT NULL;

ALTER TABLE product_media
    DROP CONSTRAINT IF EXISTS chk_product_media_type;

ALTER TABLE product_media
    ADD CONSTRAINT chk_product_media_type CHECK (media_type IN ('image', 'video'));

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM product_media
        GROUP BY product_id, media_url
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'product_media contains duplicate product/media URL rows; resolve them before applying the uniqueness gate'
            USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM product_media
        WHERE media_type = 'video'
           OR media_url ~* '/video/upload/'
    ) THEN
        RAISE EXCEPTION 'product_media contains video rows; complete the Android and web renderer handoff before enabling video publication'
            USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM product_media
        WHERE is_main = TRUE
        GROUP BY product_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'product_media contains multiple covers for a product; resolve them before applying the one-cover gate'
            USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM products product
        WHERE product.image_url ~* '/video/upload/'
    ) THEN
        RAISE EXCEPTION 'products.image_url points to video media; choose an image cover or clear image_url before applying the media contract'
            USING ERRCODE = '23514';
    END IF;
END;
$$;

ALTER TABLE product_media
    DROP CONSTRAINT IF EXISTS chk_product_media_image_cover;

ALTER TABLE product_media
    ADD CONSTRAINT chk_product_media_image_cover
    CHECK (media_type = 'image' OR is_main = FALSE);

ALTER TABLE product_media
    DROP CONSTRAINT IF EXISTS chk_product_media_video_publication_disabled;

ALTER TABLE product_media
    ADD CONSTRAINT chk_product_media_video_publication_disabled
    CHECK (media_type <> 'video' AND media_url !~* '/video/upload/');

ALTER TABLE products
    DROP CONSTRAINT IF EXISTS chk_products_image_url_not_video;

ALTER TABLE products
    ADD CONSTRAINT chk_products_image_url_not_video
    CHECK (image_url IS NULL OR image_url !~* '/video/upload/');

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_media_product_url_unique
    ON product_media (product_id, media_url);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_media_one_main
    ON product_media (product_id)
    WHERE is_main = TRUE;

CREATE INDEX IF NOT EXISTS idx_product_media_deterministic_order
    ON product_media (product_id, is_main DESC, sort_order ASC, id ASC);

COMMIT;
