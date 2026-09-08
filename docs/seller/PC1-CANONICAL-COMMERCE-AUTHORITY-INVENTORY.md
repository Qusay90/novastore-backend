# PC1 R18 canonical commerce authority inventory

Accepted starting authority: `fce4388bc089a02708138e6ff11f0993280c6090`, tree
`9a6b4cd545ccc06bb89717dfee175edb17384c3f`. This document describes the R18
simple-product reconciliation. Purchasable variant completion is a separate wave.

## Field ownership and consumers

| Field / concept | WRITE_OWNER | CANONICAL_STORAGE | READ_PROJECTION | CURRENT_CONSUMERS |
| --- | --- | --- | --- | --- |
| Product identity | Authorized catalog Admin | `products.id` | Public product/detail; Seller offer's `product_id` | Web, Android, quote, reservation, order |
| Public store ownership | Existing server catalog/store binding workflow | `products.store_id → stores.id` | Server-resolved sales party | Checkout legal/party projection, Seller fulfillment |
| Seller organization/store | Authorized membership/binding workflow | `seller_stores.organization_id`, `legacy_store_id → stores.id` | Live Seller tenant context | All Seller routes |
| Offer identity | Scoped Seller offer create | `seller_offers.id`, organization/store/product tuple | Seller offers | Seller business API; checkout sales-party allocation |
| Current purchasable price | Admin or owned Seller offer price mutation | **`products.price` in TRY major units** | Public `price`; Seller `variant.price_minor = round(price × 100)` | PDP/cart display, server pricing/checkout/order |
| Comparison/base reference price | Catalog Admin | `products.old_price` | Public old price; displayed only when above current price | Web/Android discount presentation |
| Sale price | Same as current purchasable price | `products.price` | Same as above | No second discount-derived checkout unit price |
| Coupon/bundle discount | Server pricing policy and authorized coupon writes | `coupons`, coupon reservations; pricing calculation | Authoritative quote totals | Checkout/order amount |
| Available-to-purchase quantity | Admin inventory update, scoped Seller adjustment, order reserve/release | **`products.stock`** | Public `stock`, Seller inventory `quantity` | Quantity UI hints, quote, reservation |
| Product commerce revision | All accepted product mutations and reserve/release | `products.revision` | Seller `commerce_revision`; public product revision | Compare-and-set Seller writes; Admin expected revision |
| Seller offer metadata revision | Scoped Seller offer mutations | `seller_offers.revision` | `offer.revision` | Offer optimistic concurrency |
| Seller inventory metadata revision | Scoped inventory/threshold mutation | `seller_inventory_items.revision` | `inventory.revision` | Inventory optimistic concurrency |
| Inventory threshold | Scoped Seller threshold mutation | `seller_inventory_items.low_stock_threshold` | Seller inventory/dashboard | Low-stock warnings using canonical product stock |
| Old Seller price/quantity columns | Compatibility writes in same transaction | `seller_offer_variants.price_minor`, `seller_inventory_items.quantity` | **Not authoritative reads** after R18 | Retained schema/compatibility records; no Customer price source |
| Seller inventory movement | Scoped atomic adjustment | `seller_inventory_movements` | Existing movement/audit infrastructure | Before/after available quantities, actor-linked mutation |
| Reservation identity/state | Order/payment lifecycle | `orders.items` + payment order binding and `payments.raw_request.stockReserved`/release markers | Existing lifecycle policy | Expiry, cancellation, payment finalization |
| Purchase snapshot | Server-priced order creation | `orders.items` JSON: product ID, name, SKU if stored, price, quantity, store ID, line total | Customer/Admin order reads | Historical order truth |
| Seller allocation snapshot | Checkout sales-party projection | `seller_order_items`, `seller_orders` | Scoped Seller order projection | Order allocation/fulfillment, not current catalog pricing |
| Product SKU | Authorized catalog Admin | `products.sku` + normalized pair | Admin; order item SKU snapshot | Product commerce/history |
| Seller SKU | Scoped Seller offer metadata write | `seller_offer_variants.seller_sku` | Seller offer | Seller reference, not a new Customer variant identity |
| Product publication | Existing authorized catalog workflow | `products.publication_status`, `is_customer_visible`, `deleted_at` | Public visibility predicate | Public catalog and checkout validation |
| Offer publish command | Scoped Seller with existing publish permission | `seller_offers.status` | Seller metadata and sales-party readiness | Does not publish a new canonical product by itself |
| Attribute definitions/options | Authorized taxonomy/catalog workflow | Existing attribute definitions/options and product attribute values | Product detail/specifications/filters | Descriptive data, not purchasable identity |

## Price and stock trace

Before R18, Seller offer/inventory writes succeeded only in Seller tables.
`pricingService.loadProductsForCart` selected `products.price/stock`; therefore
the Seller mutation could be ignored by Customer purchase. R18 resolves the
server-owned Seller-store binding, verifies the product belongs to it, locks
the product, checks `commerce_revision`, and writes that same canonical row in
the Seller mutation/audit/receipt transaction. There is one purchasable price
source, not a new Stocky or Customer pricing table.

`productController` public product/detail → Web `catalogAdapter` / Android product
DTO → display/cart hints → `pricingService.calculatePricing` →
`orderService.reserveStock` → `orders.items`. Incoming price, stock and store
fields are never purchase authority. The reservation update also matches the
server-priced unit price; a price change between quote and reservation fails
closed instead of purchasing at the old quote. Payment/legal/provider guards
remain in place; R18 does not bypass the PayTR initialize path.

The exact existing quantity arithmetic is:

- Available before reservation = current `products.stock`.
- Successful reservation of q: `stock := stock - q`, guarded by `stock >= q`,
  public visibility and the authoritative price comparison. Revision increments.
- Supported once-only release/cancellation: `stock := stock + q`, revision increments.
- Seller delta adjustment: `stock := locked current stock + delta`, with both
  inventory metadata revision and current commerce revision required; negative
  or out-of-range results fail. A stale mirror quantity is never the base.
- Initial offer quantity is an explicit **available quantity**, not a warehouse
  physical count. It needs the current product revision and cannot overwrite
  reservations that happened after the caller's read without a conflict.

There is **no separate canonical physical ON_HAND column or stock-bucket ledger**
in this accepted purchase model. Do not invent `AVAILABLE = ON_HAND - RESERVED`
using Seller's old quantity column. Reservation ownership is attached to the
Customer order/payment, not an independently mutable client reservation row.
Payment `stockReserved=true` alone is not an aggregate pending-reservation count:
successful payment paths retain the flag. Interpret it through payment/order
lifecycle state. A physical inventory/bucket/reconciliation model needs a
separate schema and lifecycle contract; R18 does not pretend to implement it.

## Variant state — not a full purchase feature

| Capability | Accepted state |
| --- | --- |
| Descriptive product attributes / option values | IMPLEMENTED |
| Seller offer variant IDs, Seller SKU, price and inventory rows | MODEL_ONLY for Customer purchase; Seller business support exists |
| Customer selectable canonical variant ID | NOT_IMPLEMENTED |
| Option combination uniqueness / required selection | NOT_IMPLEMENTED |
| Exact variant price override in Customer quote | NOT_IMPLEMENTED |
| Exact variant inventory reservation/release | NOT_IMPLEMENTED |
| Images associated with a purchasable variant | NOT_IMPLEMENTED |
| Different variants as separate cart lines | NOT_IMPLEMENTED |
| Selected variant/options snapshot through full order flow | NOT_IMPLEMENTED |

Simple identity remains `productId`; quantities for the same product combine.
There is no synthetic variant requirement. Existing Seller variant IDs are not
advertised as Customer purchasable IDs. Explicit variant/offer/option selection
in a checkout cart now fails with `PURCHASABLE_VARIANT_UNSUPPORTED`, rather than
silently collapsing it into a simple-product line. Seller projections refuse an
offer with ambiguous multiple variant rows (`PURCHASABLE_VARIANT_WAVE_REQUIRED`).

## Operational boundaries

Existing ownership, live Seller session/membership and permission middleware
remain authoritative. Read/write receipts are scoped to the organization and
idempotency key, with request fingerprints. The transaction serializes the same
key and checks the receipt again before mutation. Commit returns its receipt;
no post-commit refetch is required to call the mutation successful. Same-key
replay does not create another mutation, movement, audit or outbox event.

Legacy offers attached to a product belonging to another store now fail closed;
R18 does not reassign products or backfill legacy Seller values. No production
data was read or modified to reconcile those rows. Existing feature flags stay
unchanged. Product publication and legal identity readiness still gate a real
Seller purchase independently of these price/stock writes.
