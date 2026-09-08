# Stocky S01 — canonical product/price/stock publication handoff

R18 defines a simple-product backend contract. This document does not authorize
Stocky code, an identity bridge, feature flags, providers or production activation.

## One downstream authority

PC1 `products.id`, `products.price` (TRY), `products.stock` (available to purchase)
and `products.revision` are the Customer purchase authority. Stocky must submit
authorized PC1 commands and consume their receipts; it must not publish its own
Customer-facing price/stock truth or write PC1 database tables directly.

PC1 maps the live Seller organization's assigned `seller_stores.id` through its
`legacy_store_id` to `products.store_id`. Neither a Stocky product ID nor a
client-selected store ID grants ownership. HMAC connector authentication or a
Stocky login is not PC1 Seller membership/session authority. The interrupted
Trusted Access bridge is not accepted by R18.

## Existing simple offer commands

With existing offer-write capability enabled in an authorized environment:

- `POST /api/seller/v1/offers`: attach **an existing owned PC1 product** using
  `product_id`, `seller_sku`, TRY `price_minor`, `initial_quantity`, and the current
  `commerce_revision`. Initial quantity means available, not physical on-hand.
  It is not a create-product endpoint. The transaction returns `{reused, offer}`.
- `GET /api/seller/v1/offers/:offerId`: returns canonical `variant.price_minor`,
  `inventory.quantity`, `commerce_revision`, plus existing offer/inventory revisions.
- `PATCH /api/seller/v1/offers/:offerId`: price writes send `price_minor`, existing
  offer `revision`, and **`commerce_revision`**. SKU/visibility remain Seller
  metadata. The result includes the committed offer receipt.
- `POST /api/seller/v1/inventory/adjustments`: each item sends
  `inventory_item_id`, signed nonzero `delta`, `reason_code`, inventory `revision`,
  and **`commerce_revision`**. Server applies the delta to locked canonical
  available stock. Receipt is `{reused, inventory: [...]}` for initial and replay.
- Writes use the `Idempotency-Key` header. Reuse the same key and identical body
  after an uncertain response. Changed payload with the same key is rejected.

After an acknowledged success, a failed GET/refetch is **readback unavailable**,
not mutation failure. Retain the successful receipt. Do not generate a fresh
mutation/key to repair a read failure. A changed product, Admin edit or checkout
reservation can invalidate `commerce_revision`; show conflict and re-read before
the operator explicitly submits a revised intention. Missing revision fails closed.

For an existing visible product, the canonical public detail currently includes
its product revision; after attachment, use the scoped offer/inventory read.
Unpublished-product discovery and creation need an accepted scoped publication
workflow; do not use broad Admin credentials in Stocky to acquire authority.

## Create / publish / unpublish boundary

Stocky product creation is not implemented here. Future S01 must define an
authorized create-product mapping, required catalog/category/media/legal fields,
revision handling and then create the owned offer. Existing offer `publish`,
`unpublish`, `archive` commands change Seller offer state; they do not replace
`products.publication_status`, Customer visibility or legal-identity readiness.
Do not report a product publicly published merely because an offer command
returned success. Future publication must validate both canonical product
visibility and Seller sales-party readiness and return a truthful receipt.

R18 introduces no new migration, currency-conversion policy, physical inventory
ledger, Stocky-owned stock bucket, historical backfill or release activation.
Never feed a physical on-hand count into the available-stock field without a
separately accepted reservation-aware reconciliation policy.

## Variant and consumer handoff

Purchasable variants require the dedicated A14 wave described in
`PC1-A14-PURCHASABLE-VARIANT-CONSUMER-HANDOFF.md`. No Stocky variant publication
may be advertised as purchasable before that end-to-end identity is accepted.
The `variant` object in today's Seller offer is not that Customer contract.

Seller Android or another existing Seller consumer must carry the new commerce
revision for price/stock/create writes and preserve the write/readback distinction.
R18 changes no Android source and does not claim that UI adaptation is complete.

S01 acceptance must prove current live membership/permission, foreign organization
and same-organization foreign-store denial, lost revision conflict, same-key
concurrent replay, price/readback/quote equality, stock/reservation concurrency,
publication truth, unpublish behavior and historical order stability against
disposable data. No secret or Customer-private metadata belongs in receipts,
audit/outbox payloads or published catalog projections.
