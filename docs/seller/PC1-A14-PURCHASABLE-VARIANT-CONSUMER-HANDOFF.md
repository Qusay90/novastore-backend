# A14 — dedicated purchasable variant implementation required

Status: **DEDICATED_WAVE_REQUIRED**. R18 does not close A14, Android C03/C15 or a
variant-selection UI. Existing attributes/options are descriptive; Seller offer
variant rows are not a complete Customer variant purchase contract.

## Required backend foundation and rollout

1. Define an immutable opaque purchasable variant ID with an immutable product
   binding, versioned option groups/values and unique valid combinations. Decide
   which product requires selection. Simple product ID alone remains compatible.
2. Add authoritative variant inventory, price policy, revision and active/deleted
   semantics. Schema changes and migration handling must explicitly preserve
   existing simple products and historical orders; no guessed option backfill.
3. Public detail advertises enabled variant IDs, display options, canonical safe
   price/availability and selection constraints. Omit internal costs/private data.
4. Cart and quote accept product ID + exact variant ID + quantity; same product
   with different variants stays separate, same variant may combine quantity.
   Derive store, price and quantity availability on the server. Monetary totals,
   arbitrary deltas and stock from the client are not authority.
5. Resolve and lock/reserve the exact variant inventory, not `products.stock` as
   a fake variant bucket. Define pending/commit/release/expiry/cancellation/return
   effects, revision conflicts, lock ordering and replay behavior.
6. Extend authoritative pricing, final initialize validation, sales-party/legal
   projection, payment-bound order write and Seller package allocation together.
   Snapshot selected variant ID, options, canonical SKU/name, unit price, quantity
   and store. Later product/variant edits must not rewrite purchase history.

No backend path should silently discard a variant selection. R18 rejects explicit
variant/offer/options cart inputs with `PURCHASABLE_VARIANT_UNSUPPORTED`. An offer
with multiple legacy variant rows is rejected as ambiguous rather than choosing
its first row as purchase truth. These guards are not variant implementation.

## Customer Web and Android

Current Web `catalogAdapter` reads public `price`, `old_price`, `stock` and
`is_purchasable`; `checkoutAdapter.toCheckoutCartItems` serializes product identity
and quantity. R18 keeps that simple-product shape. No Web change is required for
A07; existing cart hints may be stale and server quote/checkout remains final.

A14 requires coordinated Web and Android changes: load actual selectable options,
show canonical selected price/availability, require the valid selection, key cart
lines by product+variant, limit visible quantity, retain identity through quote,
legal preview, initialize and order history. Handle disabled/deleted selections
and price/stock changes explicitly. Do not transform hard-coded color/size UI
or current product attributes into purchasable variant IDs.

R18 modified no Web or Android UI. Android C03 and C15 remain open. Seller clients
also need the `commerce_revision` request adaptation described in the S01 handoff.

## Mandatory negative/concurrency matrix for the dedicated wave

Missing required ID, malformed ID, another product's ID, foreign Seller/store,
disabled/deleted/out-of-stock variant, stale price, arbitrary price delta, stale
stock, duplicate retry, revoked session/membership, unavailable permissions and
Customer A/B isolation must fail closed. At stock one, two independent Customers
must not both reserve/purchase it. Prove two variants as separate cart/order lines,
correct price/quantity for each, reservation release once, and order snapshots
remaining unchanged after option/name/SKU edits. Only then may A14 be CLOSED.
