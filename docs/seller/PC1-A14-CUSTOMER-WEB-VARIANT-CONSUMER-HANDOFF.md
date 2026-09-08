# A14 canonical purchasable variants — R19 backend contract

Backend baseline: `4f09e3b63ec34d1f5ea712dae4fee997f3add8f4`, tree `011cdeaa001542ecca37971a6b1429917fb0a28e`.
This handoff enables a future consumer implementation. It is not evidence that a Web/Android consumer, deployment, provider or release gate passed.

## Public detail and selection

`GET /api/products/:productId` retains the existing product response. Simple products have `variant_selection_required: false` and need no variant ID. Variant products have `variant_selection_required: true` and `variants`:

```json
{"variant_selection_required":true,"variants":[{"id":123,"sku":"RED-M","selections":[{"group":"Color","value":"Red"},{"group":"Size","value":"M"}],"price":100,"availableStock":4,"purchasable":true,"commerce_revision":2}]}
```

IDs are existing `seller_offer_variants.id`, positive decimal integers bounded by 2147483647 on the purchase API. Do not use offer IDs, SKU, attributes, array indexes or generated option combinations as identity. Only complete server-returned rows are valid combinations. Labels are display data. Product media remains shared; there is no new variant-image override.

Only active, published, undeleted variants with a valid active product/offer/store/organization ownership chain appear. Zero-stock published variants remain visible with `purchasable: false`. An empty list means no selectable combination. Unknown, foreign, disabled, unpublished or deleted selection fails server validation. Never silently fall back to product-only checkout.

`price` is TRY major units, resolved from the variant's explicit integer `price_minor`. `availableStock` is available inventory after reservations. Product `price` is the minimum and product `stock` the sum of active published variant inventory under active offers; these are display aggregates, never an additional stock bucket or selected-variant price. Parent product/store visibility remains a separate eligibility gate. Use the selected row for price, stock and availability.

## Cart, quote and checkout

Simple cart key: product ID. Variant cart key: product ID + variant ID. Same combination aggregates quantity; different variants remain separate. Quantity is a positive integer (current per-line maximum 20; total cart maximum 50). Do not merge by product ID alone.

`POST /api/campaigns/quote` body:
```json
{"cartItems":[{"product_id":42,"variant_id":123,"quantity":1},{"product_id":42,"variant_id":124,"quantity":1}],"couponCode":null}
```

Response keeps `items`, `totals`, `campaigns`, `coupon`. Each variant item includes existing product name, canonical store, SKU, price, quantity, line total, plus `variant_id` and `variant_selections`. Server ignores client price/stock/store/SKU hints as authority. No option price delta or arbitrary option combination is accepted. `id`/`productId` and `variantId` aliases remain accepted, but conflicting IDs fail.

Send the same `cartItems` shape to customer-authenticated `POST /api/payments/agreements/preview` with the existing owned `addressId`, and `POST /api/payments/initialize` with the existing address, agreement acceptance, idempotency and payment fields. Preserve the accepted payment protocol; a quote does not authorize payment. Final initialize reloads server price/eligibility and binds the agreement to the exact variant ID, SKU, selections and price. Changes require a fresh preview/acceptance according to existing checkout conflict handling. This wave does not enable provider calls.

Stable variant errors: `VARIANT_ID_INVALID` (400), `VARIANT_REQUIRED` (400), `VARIANT_NOT_ALLOWED` on a simple product (400), `VARIANT_NOT_PURCHASABLE` (409), `VARIANT_STOCK_UNAVAILABLE` (409), `VARIANT_PRICE_CHANGED` at reservation (409). Existing checkout/agreement/capability errors still apply. Remove or require reselection of invalid lines; never replace a variant automatically. Refetch/requote stale price or stock; do not trust cached monetary values.

## Orders and lifecycle

Orders snapshot product ID/name, variant ID, selection labels, canonical SKU, unit price, quantity and canonical public store ID in `orders.items`. Seller allocation stores exact variant ID and source item index. Legal transaction context also binds selections. Later catalog/variant edits do not rewrite snapshots.

Reservation subtracts only the selected `seller_inventory_items.quantity`, advances variant/inventory/product revisions and refreshes display aggregates in the order transaction. Conditional decrement and locks prevent oversale. Existing payment reservation metadata owns one-time release. Cancellation/failure restores the same variant, including an unpublished/soft-deleted historical variant. Never add product stock independently. Returns remain ORDER_LEVEL: no partial variant return UI or endpoint is introduced.

## Required consumer validation

Test simple products unchanged; missing selection; separate M/L cart lines; duplicate same-variant aggregation; stale prices/stock; unavailable selections; server error display; order history after SKU/label changes; existing order-level returns. Persist canonical IDs, and render historical order selections from the order snapshot instead of the current catalog.

## WEB follow-up

Update the existing Web cart key and checkout serialization together. No Customer Web files were changed in R19.
