# A14 existing model inventory and R19 decision

Authority inspected: accepted R18 commit `4f09e3b63ec34d1f5ea712dae4fee997f3add8f4` in a new isolated R19 worktree. Protected Stocky bridge WIP was not used.

| Existing model | Classification before R19 | R19 decision |
| --- | --- | --- |
| `attribute_definitions`, `attribute_options`, `attribute_templates`, `template_attributes`, `product_attribute_values` (`20260704_attribute_filter_foundation.sql`, `productAttributeService`) | Descriptive/filter values, including option ID arrays; no purchasable combination, price or inventory identity | Preserve; never infer a purchasable variant from arbitrary attribute combinations |
| `products.sku`, product price/stock, revision, public visibility | R18 simple-product canonical authority | Preserve simple mode; explicit variant mode is opt-in, one-way and ownership-bound |
| `seller_offers.product_id` with organization/store, status/visibility/archive | Seller operational product attachment | Reuse immutable variant-to-offer-to-product ownership chain; parent publication remains required |
| `seller_offer_variants.id`, `seller_sku`, `price_minor`, currency, status/revision | Operational row with scoped unique SKU; R18 required one row, not Customer selection | Reuse this ID/table; add nullable explicit product binding, complete display selections, publication and soft deletion |
| `seller_inventory_items.variant_id`, quantity/revision | Operational per-variant bucket; simple commerce had products-backed projection | Reuse as the sole available-stock authority for bound canonical variants; legacy NULL-bound rows are not purchase inventory |
| `products.image_url`, `product_media` | Product-level media | Shared by variants; no variant-specific image truth or invented image association |
| `seller_order_items.variant_id`, source item index | Existing Seller allocation | Reuse for exact selected variant, including multiple lines of one product |
| `orders.items` JSONB and legal context | Immutable purchase snapshots by convention | Add selected variant ID, SKU and labels; preserve historical rendering |

There is no separate canonical variant identity table or client-built cross product of options. Complete selections are server validated (1–8 unique group labels, nonempty labels <=96 characters, stable sorting); SKU uniqueness remains `(organization_id, store_id, seller_sku)`, including soft-deleted rows. Selection combination uniqueness is per product among undeleted bound variants.

Migration `20260908_01_purchasable_variants.sql` is additive, registry-hashed and transactional. Existing variants remain `product_id=NULL`, products remain simple by default, and no historical backfill or synthetic legacy variants are created. A product with any existing canonical order history cannot be converted (`SIMPLE_ORDER_HISTORY_PREVENTS_VARIANT_CONVERSION`); use a separately authored new product. DB guards prevent bound variant/product/offer/store reassignment and hard deletion, retain nonnegative inventory/price checks, and restrict canonical currency/price/selections. Services enforce public eligibility and strict bounded IDs.

Variant product price/stock are maintained aggregates of active published undeleted variants under active offers. Stock is available quantity, not physical on-hand; reservation subtracts only variant inventory. Product/variant writers and reservations lock product before variant inventory. Generic product price/stock writes reject variant mode. Generic Seller inventory read omits variant-mode buckets; use the scoped variants endpoint.

Forward migration is tested by applying all 38 accepted R18 migrations first, then only R19, then asserting a no-op second full apply in a uniquely owned disposable PostgreSQL database. Local bootstrap also includes the idempotent additive migration. No existing database, provider or runtime flag was changed.
