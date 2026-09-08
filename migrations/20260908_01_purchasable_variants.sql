BEGIN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_selection_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE seller_offer_variants ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE seller_offer_variants ADD COLUMN IF NOT EXISTS selections JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE seller_offer_variants ADD COLUMN IF NOT EXISTS publication_status VARCHAR(16) NOT NULL DEFAULT 'draft';
ALTER TABLE seller_offer_variants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_purchasable_variant_contract' AND conrelid='seller_offer_variants'::regclass) THEN
ALTER TABLE seller_offer_variants ADD CONSTRAINT chk_purchasable_variant_contract CHECK (
    publication_status IN ('draft','published','unpublished') AND
    (product_id IS NULL OR (currency = 'TRY' AND price_minor <= 9999999999 AND
      jsonb_typeof(selections) = 'array' AND jsonb_array_length(selections) BETWEEN 1 AND 8)));
END IF; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchasable_variant_combination ON seller_offer_variants(product_id,selections)
    WHERE product_id IS NOT NULL AND deleted_at IS NULL;
CREATE OR REPLACE FUNCTION guard_purchasable_variant_identity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.product_id IS NOT NULL THEN RAISE EXCEPTION 'PURCHASABLE_VARIANT_HARD_DELETE_FORBIDDEN'; END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.product_id IS NOT NULL AND
       (NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.offer_id <> OLD.offer_id OR
        NEW.organization_id <> OLD.organization_id OR NEW.store_id <> OLD.store_id) THEN
        RAISE EXCEPTION 'PURCHASABLE_VARIANT_IDENTITY_IMMUTABLE';
    END IF;
    IF NEW.product_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM products p JOIN seller_stores s ON s.legacy_store_id=p.store_id
        JOIN seller_offers o ON o.product_id=p.id AND o.store_id=s.id AND o.organization_id=s.organization_id
        WHERE p.id=NEW.product_id AND p.variant_selection_required AND o.id=NEW.offer_id
          AND s.id=NEW.store_id AND s.organization_id=NEW.organization_id
    ) THEN RAISE EXCEPTION 'PURCHASABLE_VARIANT_OWNERSHIP_INVALID'; END IF;
    RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER purchasable_variant_identity BEFORE INSERT OR UPDATE OR DELETE ON seller_offer_variants
    FOR EACH ROW EXECUTE FUNCTION guard_purchasable_variant_identity();
CREATE OR REPLACE FUNCTION guard_variant_product_identity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.variant_selection_required AND
       (NOT NEW.variant_selection_required OR NEW.store_id IS DISTINCT FROM OLD.store_id) THEN
        RAISE EXCEPTION 'VARIANT_PRODUCT_IDENTITY_IMMUTABLE';
    END IF;
    RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER variant_product_identity BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION guard_variant_product_identity();
CREATE OR REPLACE FUNCTION guard_variant_owner_binding() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'seller_stores' THEN
        IF (NEW.legacy_store_id IS DISTINCT FROM OLD.legacy_store_id OR NEW.organization_id <> OLD.organization_id)
           AND EXISTS (SELECT 1 FROM seller_offer_variants WHERE store_id=OLD.id AND product_id IS NOT NULL) THEN
            RAISE EXCEPTION 'VARIANT_STORE_BINDING_IMMUTABLE';
        END IF;
    ELSE
        IF (NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.store_id <> OLD.store_id OR NEW.organization_id <> OLD.organization_id)
           AND EXISTS (SELECT 1 FROM seller_offer_variants WHERE offer_id=OLD.id AND product_id IS NOT NULL) THEN
            RAISE EXCEPTION 'VARIANT_OFFER_BINDING_IMMUTABLE';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER variant_store_binding BEFORE UPDATE ON seller_stores
    FOR EACH ROW EXECUTE FUNCTION guard_variant_owner_binding();
CREATE OR REPLACE TRIGGER variant_offer_binding BEFORE UPDATE ON seller_offers
    FOR EACH ROW EXECUTE FUNCTION guard_variant_owner_binding();
COMMIT;
