BEGIN;

ALTER TABLE product_media
    ADD COLUMN IF NOT EXISTS card_focal_x NUMERIC(6,5),
    ADD COLUMN IF NOT EXISTS card_focal_y NUMERIC(6,5),
    ADD COLUMN IF NOT EXISTS card_zoom NUMERIC(4,2);

ALTER TABLE product_media
    DROP CONSTRAINT IF EXISTS chk_product_media_card_framing;

ALTER TABLE product_media
    ADD CONSTRAINT chk_product_media_card_framing CHECK (
        (card_focal_x IS NULL AND card_focal_y IS NULL AND card_zoom IS NULL)
        OR (
            card_focal_x IS NOT NULL
            AND card_focal_y IS NOT NULL
            AND card_zoom IS NOT NULL
            AND card_focal_x BETWEEN 0 AND 1
            AND card_focal_y BETWEEN 0 AND 1
            AND card_zoom BETWEEN 1 AND 3
        )
    );

COMMIT;
