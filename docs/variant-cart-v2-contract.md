# B03 — Variant Cart V2 contract

This contract belongs to the coordinated B03 change. It does not select global
production Web/Android authority and does not authorize deployment or production
migration. Acceptance evidence is recorded separately; implementation is not PASS.

## Selected sources and ownership

- Backend: `codex/theme-platform-seller-experience-wave-2`, HEAD
  `408c70626137102d36bbf4a97ca852108bdd9563`, pre-change staged tree
  `01dbdf7ecf57951c9a605008c1ec2097509b4d52` (4345/0/0 preserved).
- Web consumer: separate `codex/customer-web-variant-cart-v2` worktree from R24
  `c83ff7170e640ba8443e9a6e48f6d123bc6e1352` / tree
  `f604f8050f7d235c3afdca9efd371c1fd575ed1c`.
- Android consumer: separate `codex/customer-android-variant-cart-v2` worktree
  from R26 `070ffed2f22962ef500e34df04e452cf7da22eed` / tree
  `997a751b3a6cb077b614f38f8b3ee41a1a4a615c`.

Reference worktrees remain untouched. The older Web/Kotlin copies in the Wave2
root are legacy consumers, not the selected B03 consumer implementations.

## Authenticated wire protocol

Existing normal customer authentication remains mandatory on
`/api/shared-state/cart` and `/api/shared-state/checkout`.
These headers negotiate data capabilities; they never establish identity:

```http
X-Cart-Schema-Version: 2
X-Cart-Variant-Line-Identity: true
X-Cart-CAS: true
```

All three are required for v2 GET, PUT, DELETE and POST cart/finalize.
User-Agent, browser keys and client store claims do not establish authority.
Responses are private (`Cache-Control: no-store`). CORS keeps the existing
configured origins and reflects requested headers; no broader origin is added.

```json
{
  "key": "cart",
  "exists": true,
  "revision": 3,
  "payload": {
    "cartSchemaVersion": 2,
    "items": [
      {"storeId": 10, "productId": 501, "variantId": 901, "quantity": 1},
      {"storeId": 10, "productId": 501, "variantId": 902, "quantity": 1}
    ]
  },
  "migration": {"status": "NONE", "unresolvedItems": []},
  "updatedAt": "server timestamp"
}
```

The server also supplies canonical `storeName`, `name`, `price`, `oldPrice`,
`imageUrl`, `stock`, `variantSelections`, `variantLabel`, and `unavailable`.
Price and stock remain informational until the existing quote/order service
validates them at purchase time. Saving a cart never reserves inventory. Existing
unavailable products remain visible/removable; unavailable cached lines cannot
be increased. A quantity above current stock is marked unavailable and canonical
quote rejects it; cart persistence is not a purchase or stock guarantee.

Line identity is canonical public `stores.id` + `products.id` + selected variant
ID. The server derives store from the product and validates variant ownership
using the existing purchasable variant service. A request may omit `storeId`; if
supplied, it must equal the canonical value. Simple products use explicit
`variantId: null`. A variant on a simple product, or a missing variant on a
variant-required product, is rejected for new input. Equal complete identities
merge quantities; sibling variants never merge. At most 200 input lines and 999
units per identity are accepted by storage; existing stricter purchase limits
remain in the commerce authority.

PUT is a complete revision-checked replacement, not an implicit merge:

```json
{
  "expectedRevision": 3,
  "payload": {
    "cartSchemaVersion": 2,
    "items": [{"productId": 501, "variantId": 902, "quantity": 1}]
  }
}
```

Only identity/quantity fields are permitted on input lines. Display prices,
names, stock, order ownership or client display keys cannot override server
values. Checkout additionally accepts selectedAddressId, couponCode and
paymentMethod as selection hints; address eligibility, coupon and payment
semantics remain canonical checkout checks.

An absent state has virtual revision 0. Every write increments revision. GET
does not change it. Missing expectedRevision produces HTTP 428
`CART_REVISION_REQUIRED`; stale revision produces HTTP 409
`CART_REVISION_CONFLICT` with current revision. An account advisory transaction
lock serializes both state keys, including concurrent first creation; two
writes with one revision cannot both succeed. Clients reload and disclose a
conflict instead of silently retrying a stale replacement.

DELETE requires the same capabilities plus `{ "expectedRevision": 3 }`. It
writes an empty v2 tombstone and increments revision. Clearing or logout must
never remove v2 authority. Pending legacy recovery data survives a cart clear.

## Legacy policy and migration

The additive migration adds separate schema/revision columns and creates raw v1
archives and finalization receipts. Applying the schema alone does not convert
customer payloads. V2 adoption occurs with an authenticated CAS mutation.

Before adoption, GET with v2 capabilities projects valid legacy simple lines
losslessly and reports ambiguous/unavailable legacy rows under
`migration.unresolvedItems` with productId, quantity and reason. It does not guess
a variant. A missing identity on a variant-required product reports
`VARIANT_REQUIRED`. Malformed/unknown schema fails closed.

First v2 mutation archives the entire original v1 payload once and carries
unresolved entries durably in `payload.pendingLegacyItems`. They are excluded
from purchasable lines, shown for explicit user review, and do not disappear
on reload or DELETE. Only an explicit `resolveLegacyProductIds` list
acknowledges removal of those pending entries. Selecting a replacement variant
uses the ordinary canonical add/write flow. Clients must not automatically
acknowledge, infer identities or import the same local cache twice.

Once either cart or checkout has v2 authority, legacy reads AND mutations of
both keys return HTTP 426 `CART_CLIENT_UPGRADE_REQUIRED`. There is no lossy
product-only read projection and no v2-to-v1 normalization. Unknown schema
returns HTTP 400 `CART_SCHEMA_UNSUPPORTED`, even before state exists. Variant
payloads sent through v1 are rejected rather than normalized lossily.

Database triggers additionally prevent an old backend writer from downgrading,
deleting or updating v2 without advancing revision. Canonical account deletion
can still cascade; logout is not account deletion. Triggers are the final
defence, not a substitute for route-level structured errors/capability checks.

## Finalization and retries

`POST /api/shared-state/cart/finalize` takes
`{ "expectedRevision": 3, "orderId": 123 }` plus the same capabilities. It
loads the authenticated customer's canonical PAID order. It never accepts
client-provided purchased lines, prices or a claimed paid status. Each purchased
store/product/variant quantity is subtracted only from that exact current line;
unpurchased siblings and leftover quantities remain.

A durable `(user_id, order_id)` receipt and the cart update share one DB
transaction. Replaying the same receipt returns current cart and `reused:true`
without subtracting again. A first stale attempt returns 409; refresh followed
by an explicit retry with the current revision is safe. Ownership failure is
404 `CART_ORDER_NOT_FOUND`; an unpaid order is 409 `CART_ORDER_NOT_PAID`.

## Rollback and acceptance

Rollback must retain the v2 schema, archive, receipt and capability guard. Do
not restore an old write-capable server against v2 carts and do not down-convert
v2 data. Legacy clients show upgrade-required. Reverting a consumer may block
cart access but may not destroy its state. No production migration or provider
operation is part of B03 local validation.

Gate 17 remains PARTIAL until actual disposable PostgreSQL, selected Web runtime,
isolated R26 Android runtime, cross-client sync, canonical quote/order/receipt
finalization and relevant regressions all pass. Memory doubles, UI fixtures,
compilation, source counts and previous suite results cannot replace these gates.
