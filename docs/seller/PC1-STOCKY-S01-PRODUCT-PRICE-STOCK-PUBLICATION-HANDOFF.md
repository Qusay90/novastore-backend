> R19 update: simple-product R18 authority below remains valid. The historical A14 limitation is superseded by the canonical variant contract appended here. Stocky source and the unaccepted identity/session bridge remain untouched.

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


## R19 canonical variant publication contract

After a separately accepted Stocky-to-PC1 Seller session bridge, use scoped Seller authority, never HMAC/Stocky Passport as Seller identity. Product creation/catalog mapping remains a separately accepted prerequisite; attach an already owned canonical product through the existing offer contract. For simple products keep the R18 product-backed writes above.

For an owned variant product:
- `GET /api/seller/v1/offers/:offerId/variants`: product ID, `variant_selection_required`, product `commerce_revision`, undeleted variants with safe selections/price/stock/publication and variant `commerce_revision`.
- `POST /api/seller/v1/offers/:offerId/variants`: `sku`, `selections:[{group,value}]`, integer `price_minor` in TRY, integer available `quantity`, current **product** `commerce_revision`; `Idempotency-Key` header (nonempty <=96 characters). Creates a draft canonical variant and opts the product into irreversible variant mode. No historical simple-order conversion/backfill.
- `PATCH /api/seller/v1/offers/:offerId/variants/:variantId`: current **variant** `commerce_revision` plus any of `sku`, `selections`, `price_minor`, available `quantity`, `publication_status` (`draft|published|unpublished`), or `deleted:true`. Same idempotency header. No ownership fields, deltas, currency or client-generated IDs.
- Reads require `offer.read`. Create requires `offer.create`, `offer.publish`, `inventory.adjust`; update requires `offer.update`, `offer.publish`, `inventory.adjust`, in addition to existing enabled offer-write capability and live Seller scope.
- Write result: `{reused,variant:{id,sku,selections,price,availableStock,purchasable,commerce_revision,product_id,publication_status,deleted,product_commerce_revision}}`. Receipt is committed in the same transaction as write/audit/outbox and returned without post-commit refetch. Retry the identical request/key; a changed payload is `IDEMPOTENCY_KEY_REUSED` (409). Revision conflict is `COMMERCE_REVISION_CONFLICT` (409); ownership failures are `RESOURCE_NOT_FOUND` (404); duplicate scoped SKU/combination is `VARIANT_UNIQUE_CONFLICT` (409).

Publishing the variant alone is insufficient: canonical product visibility, active parent offer/store/organization and checkout legal readiness still apply. Offer unpublish/archive removes availability; publishing an inactive offer still follows existing offer state transitions. Generic product/Seller price-stock APIs reject variant mode (`VARIANT_MODE_REQUIRES_VARIANT_WRITE`). Stocky must use returned canonical variant IDs and revisioned available quantity; no parallel Customer-facing IDs, stock bucket or reconstructed combinations. Physical inventory synchronization requires a separately accepted reservation-aware policy.

Customer consumption: `PC1-A14-CUSTOMER-WEB-VARIANT-CONSUMER-HANDOFF.md` and `PC1-A14-CUSTOMER-ANDROID-VARIANT-CONSUMER-HANDOFF.md`. Stocky S01 is HANDOFF_READY only; its bridge, source implementation and deployment are not completed by R19.
