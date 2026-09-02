BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
    IF TO_REGCLASS('public.seller_fulfillment_packages') IS NULL THEN
        RAISE EXCEPTION 'SELLER_FULFILLMENT_PACKAGES_REQUIRED';
    END IF;

    ALTER TABLE seller_fulfillment_packages
        DROP CONSTRAINT IF EXISTS chk_seller_fulfillment_packages_status;

    ALTER TABLE seller_fulfillment_packages
        ADD CONSTRAINT chk_seller_fulfillment_packages_status
        CHECK (status IN ('pending', 'prepared', 'shipped', 'delivered'));

    ALTER TABLE seller_order_transitions
        DROP CONSTRAINT IF EXISTS chk_seller_order_transitions_command;

    ALTER TABLE seller_order_transitions
        ADD CONSTRAINT chk_seller_order_transitions_command
        CHECK (command IN ('prepare', 'ship', 'cancel_request', 'delivery_confirm'));
END;
$$;

COMMIT;
