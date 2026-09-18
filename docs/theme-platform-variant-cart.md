# B03 — VARIANT_CART_DEFERRED_WITH_PLAN

Decision: defer the shared cart migration from Theme Platform Wave 1. This is an
existing commerce defect, not a defect introduced by the additive theme platform.
The theme platform must not advertise cross-device variant cart readiness.

## Reproduction and consumer inventory

On the owner-selected backend base `b654dada7a67ce8904eed9ccd1ff037e5f16e5ed`, an
in-memory execution of the actual `controllers/sharedStateController.js` normalizer
with its database import replaced by a throwing stub reproduced this input:

```json
[{"productId":501,"variantId":901,"name":"Fixture","price":100,"quantity":1},
 {"productId":501,"variantId":902,"name":"Fixture","price":120,"quantity":1}]
```

Output is one product 501, quantity 2, with no variant identity. No database call,
provider request or file mutation was part of that reproduction.

| Consumer | Evidence at the selected baseline | Impact |
|---|---|---|
| Shared cart and checkout API | `controllers/sharedStateController.js:21–94` strips variants and merges by product; both states use the same normalizer. GET returns stored JSON; PUT replaces it. | Variant identity lost on persistence; no optimistic concurrency contract. |
| Browser shared-state owner | `frontend/shared-state-sync.js:103–138` normalizes and merges by product ID. | A server-only change is lost again on read/write. |
| Selected base storefront | `storefront-commerce-pro/src/adapters/cartAdapter.js:38` compacts to product ID and quantity; enrichment and authentication merge also use product identity. | Sibling variants collapse; aggregate product price/stock is not a purchasable variant quote. |
| Legacy Kotlin app in this repository | `app/src/main/java/com/novastore/app/data/model/CartItem.kt:10` uses product ID as Room primary key; `CartRepository.kt:232` groups by product. | Requires an explicit Room migration plus repository/API changes if this older consumer remains supported. |
| Canonical pricing/quote | `services/pricingService.js:41–91,194–229` already accepts and validates variant aliases, keys product+variant, resolves canonical price/stock, rejects absent/foreign selections. | Keep this authority; never use shared-state display price as checkout truth. |
| Stock/order/payment | `services/purchasableVariantService.js:28–60` validates ownership and exact variant stock; `controllers/paymentController.js:824` retains variant identity in returned item projections. Order creation consumes canonical pricing. | Preserve selected-variant reservation/release and immutable historical order item snapshots. |
| Favorites | `migrations/20260629_shared_customer_state.sql:3–8`, `controllers/favoriteController.js:37–66,103–133` intentionally use user+product uniqueness. | Favorites should remain product-level; require option selection on add-to-cart. Do not silently redefine favorite identity. |
| Accepted newer Web R24, separate read-only reference | `customer-web-r24-a14-canonical-variants/storefront-commerce-pro/src/adapters/variantContract.js:34–55`, `cartAdapter.js:48–182` preserve product+variant and canonical refetches. Lines 104–106 explicitly identify shared-state v1 loss; variant rows use a separate account-scoped local cache and only simple rows sync remotely. | R24 deliberately avoids B03 rather than fixing server sync. Integrate only after separately fixing the accepted consumer authority; R24 and selected R27 are divergent, not an assumed drop-in copy. |
| Accepted newer Android R25/R26, separate read-only reference | `customer-android-r26-marketplace-catalog/v413-ui/src/checkout/deviceCart.ts:25–63`; `docs/customer-android/R25-CANONICAL-VARIANT-ACCEPTANCE.md:13–18`. | Canonical variant cart is device-local by design. That acceptance explicitly does not add a cross-device cart contract. Kotlin legacy source is not evidence of current R25 UI runtime. |

## Exact migration sequence for a separately authorized commerce wave

1. Lock accepted backend, Web and Android heads and supported legacy clients. Adopt
   one canonical identity `{productId, variantId?, quantity}`; simple rows retain
   product identity, variant rows use the tuple. Validate positive bounded integers,
   reject conflicting aliases; never infer variants from colors, SKU or display text.
2. Define shared-state v2, capability negotiation and revision/CAS before changing
   writes. Keep v1 readable for simple products. A v1 write must not overwrite a
   persisted v2 variant cart: reject with a stable upgrade-required error and leave
   the prior state intact. Unknown future versions must fail closed. Do not implement
   a lossy dual-write. Agree session/guest merge and stale-request cancellation rules.
3. Add a reviewed additive migration only if the revision/version contract needs a
   database column or constraint. Existing JSONB can preserve identity without table
   replacement, but that alone does not solve lost updates. Run migration on a fresh
   disposable PostgreSQL cluster first; no blanket rewrite or deletion of user carts.
4. Migrate untouched simple rows lazily and losslessly. A legacy row for a product
   that now requires a variant becomes `selection_required`; retain quantity/display
   snapshot for repair and require the customer to choose. Previously merged sibling
   variants cannot be reconstructed from v1: do not invent, silently substitute or
   double their quantities. Explain the recovery action in the client.
5. Update shared-state owner, Web cart adapter, line controls, drawer, checkout,
   login merge and persistence atomically in the accepted Web worktree. Make all
   add/update/remove and UI keys tuple-aware. Refetch canonical product/variant on
   restore/add/quote. Snapshot names/images/prices are caches, never authority.
6. Add v2 sync deliberately to accepted Android v413 UI; preserve device-local data
   and account isolation on refresh/logout. If older Kotlin consumer is supported,
   add a Room composite identity migration and compatibility tests; do not change
   its primary key without a migration. Otherwise explicitly block its v2 writes.
7. Preserve quote/order/payment normalization, variant ownership, reserved stock,
   totals, consent invalidation, idempotency and exact cart clearing. Require a fresh
   quote when selection, address or coupon changes. Favorites remain product-level.
8. Validate real disposable PostgreSQL+HTTP and the separately accepted Web/Android
   runtimes: two sibling variants separate; same variant aggregates; simple+variant
   mismatch rejected; foreign/deleted/out-of-stock variant; aliases/overflow; stale
   revision and concurrent writes; legacy client cannot erase v2; guest/login/logout
   and account isolation; quote identity equality; stock reserve/release; failed
   payment cannot clear a new cart; order history retains exact selected labels.
9. Roll out server capability first, clients second, opt-in v2 writes last with
   monitoring. Rollback disables new writes while keeping persisted v2 rows; never
   downgrade them through v1 normalization. Publication and production migration
   remain separate owner gates.

## Disposable test approach

Existing repository harness `tests/publicMarketplacePostgresSmoke.js:43–91` owns a
fresh `postgres:16-bookworm` container, random database/password, loopback mapping,
and full migration registry; no existing database URL is used. The new
`tests/helpers/themePlatformDisposableDb.js` follows that approach with strict
container-name ownership, auth secrets generated per run, provider HTTP guards,
no server bootstrap workers, migration re-run checks and `finally` cleanup. Run
only `node tests/themePlatformPostgresSmoke.js --execute-disposable-db` for the
separate theme foundation suite. Its results do not close B03 or constitute real
browser, Android device, staging or production UAT.
