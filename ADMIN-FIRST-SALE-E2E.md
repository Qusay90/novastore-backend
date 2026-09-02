# NovaStore Admin first-sale E2E

Prompt: `NOVASTORE-FIRST-SALE-R4-ADMIN-COMMERCE-OPERATIONS-FINAL-LAUNCH-GATE`

## Test boundary

| Field | Evidence |
|---|---|
| Accepted parent | HEAD `a7e2e282a5aec59a1a3c6cc110465877e6d611ac`, tree `7545ee38f656157a9550ca22c09fd0db2365bc3f` |
| Runtime | local same-origin server on `127.0.0.1:5006` |
| Database | disposable PostgreSQL `novastore_launch_wave1_test` in local container `novastore-r4-admin-postgres-20260902`, exposed only on `127.0.0.1:55432` |
| Admin identity | disposable DB-backed current Admin account; no fixture-authority or role override |
| Browser | headed Chromium driven through Playwright CLI against `admin-commerce-pro-live.html` |
| Provider boundary | PayTR credentials absent; no external provider/payment/refund/email/push/carrier network call was made; deterministic provider test doubles are counted separately |
| Protected lanes | Customer Android, Seller Android, Stocky and Customer Web source were not modified |

The PostgreSQL scenario applies all 37 migrations once and proves the second
application is a no-op. All UAT records are synthetic local records. A local
`PAID` seed is used only to enter an already-authorized operational shipment
state; it is not described as provider settlement evidence.

## Canonical journey

1. The disposable catalog creates one platform store, two Seller stores, two
   platform products and one Seller product. Store and product ownership are
   read from the canonical tables used by the public and Seller projections.
2. Agreement preview, payment preflight and the final authoritative load use
   the same fulfillment sales-party projection. Platform-only and exactly one
   Seller store remain supported. Mixed platform/Seller and multi-Seller carts
   return `409 CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED` before provider calls or
   order, payment, stock, coupon and Seller-projection writes. A separate
   time-of-check/time-of-use regression changes the binding only after a local
   provider test-double response and proves rollback with no commerce writes.
3. A Customer order reserves server stock and records canonical order items,
   price, quantity, total and payment state. Replayed initiation produces one
   logical payment row and the concurrent last-unit scenario produces one
   successful payment and zero oversales.
4. The authenticated Admin summary returns one row per order with Customer-safe
   identity, canonical items, Seller allocation, store, total, payment/refund,
   shipment/tracking and timestamps. No client amount, stock or status is
   accepted as authority.
5. A Seller-owned order cancellation converges the canonical order and Seller
   order to cancelled in one transaction, restores stock once and records an
   audit transition. An already-cancelled replay repairs a stale Seller
   projection without repeating stock, payment proof, order-event or outbox
   writes.
6. Admin manual shipment rejects Seller-owned orders. For a disposable platform
   order, the live browser submits the explicit physical handoff confirmation,
   provider `Nova Kargo UAT` and tracking number `R4-UAT-0002`. The UI then
   exposes the exact delivery command only in `Kargoya Verildi` / `IN_TRANSIT`.
7. The same live browser confirms physical delivery. The backend transaction
   moves order and shipment to `Teslim Edildi` / `DELIVERED`, retains the exact
   provider/tracking tuple and emits the typed Customer delivery notification.
   The rendered row immediately reports `Teslim Edildi`; no carrier proof is
   invented.
8. A Seller-order delivery scenario additionally converges the Seller order,
   single package and transition audit. Replay is idempotent; ambiguous or
   multi-package projections fail closed.
9. A Customer return remains ownership-scoped, becomes visible to Admin with
   canonical order/payment/refund context, and propagates its current state to
   Customer and Seller projections where authorized. Admin UI explicitly says
   local `refund_status=PENDING` is not a provider money movement.

## Live Admin browser proof

| Check | Result |
|---|---|
| Admin login and current-session verification | PASS — DB-backed Admin role accepted; Customer, Seller and stale/disabled Admin negative cases are covered by HTTP tests |
| Default destination | PASS — login and legacy Admin entry open the integrated live surface, not the mock preview |
| Seller/store view | PASS — two Seller stores show exact organization, Seller Store ID, active state and verified ownership binding |
| Product view | PASS — three canonical records visible; platform products expose capability-controlled operations, Seller product is visibly salt okunur |
| Price/stock view | PASS — canonical values rendered, including zero stock after the last-unit scenario |
| Order view | PASS — five bounded rows show store/Seller allocation, item, quantity, total, payment/refund and shipment truth |
| Provider readiness | PASS — `Sağlayıcı seçilmedi` and payment-initiation-disabled banner shown with no secret or false readiness |
| Platform shipment and delivery | PASS — live forms submitted, exact states returned and final row rendered as delivered with the supplied local tracking tuple |
| Seller fulfillment boundary | PASS — Seller rows show disabled Admin shipment action and explain Seller fulfillment authority |
| Return/refund view | PASS — return visible as approved; local refund pending is explicitly separated from provider proof |
| Keyboard navigation | PASS — first Tab focuses `Ana içeriğe geç` with a solid focus outline; Enter moves focus to `main#main-content` |
| Narrow reflow | PASS — 720 x 900 viewport has no document-level horizontal overflow; wide operational tables remain in their labelled scroll region |
| Offline/error/retry | PASS — refresh while offline shows `Entegre veri alınamadı` and `Yeniden dene`; reconnect restores live data, without mock fallback |
| Runtime console/network | PASS — recorded console errors are only the deliberate offline `ERR_INTERNET_DISCONNECTED` requests; 42 loaded resources and zero cross-origin resources |

## PostgreSQL assertions

The final disposable-database smoke reported:

```text
migrationFirstApply=37
migrationSecondApply=0
idempotentPaymentRows=1
oversaleSuccessfulPaymentRows=1
sellerOrderRows=1
returnEventRows=3
typedNotificationRows=32
refundProviderExecuted=false
mixedFulfillmentGuard=CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED
multiSellerFulfillmentGuard=CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED
fulfillmentDriftGuard=CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED
unsupportedFulfillmentProviderCalls=0
fulfillmentDriftProviderCalls=1
deterministicProviderSessionCalls=8
```

`deterministicProviderSessionCalls` is an injected local test double used to
exercise server-authoritative callback/session logic. It is not a network call
and does not claim PayTR UAT. The one fulfillment-drift call intentionally
changes the sales-party mapping after the test-double response; the final
authoritative load returns 409 and rolls back without orders, payments, coupon
reservations/usage or stock changes.

## Security and authority assertions

- Real Admin authorization is server- and database-owned. A valid token with a
  Customer or Seller role cannot reach Admin reads or writes; a disabled/stale
  Admin cannot reuse old authority.
- Customer order/return reads remain self-owned; cross-Customer and cross-Seller
  probes are denied without existence or private-data leakage.
- Seller product/store/order projections are scoped by current organization and
  exact store binding. Legacy product/media writes are retired. Canonical
  create/update/archive and media register/reorder/framing/delete operations
  lock and recheck the platform store, returning
  `ADMIN_CATALOG_SELLER_BOUND_STORE_READ_ONLY` with zero catalog DML when an
  active Seller binding exists.
- Legacy category reads remain public. Its create/delete routes require a
  DB-current Admin and default-off `catalogStructureWrite`; Customer, Seller,
  stale/disabled Admin and capability-off requests cannot reach controllers.
- Mixed platform/Seller and multi-Seller carts cannot create a partial
  fulfillment truth. The launch boundary is enforced by the backend, not a
  client cart hint, and rejected preflights make zero provider calls and zero
  persistent writes.
- Admin order writes are narrow commands with current-Admin, capability,
  expected-state and idempotency checks. There is no generic client status,
  paid or refunded mutation.
- The Admin DTO allowlists provider-safe references and normalized statuses. It
  excludes PAN, CVV, provider secrets, 3D passwords, password hashes, reset
  tokens and unrestricted provider payloads.

## Result

The disposable journey closes `15/15` R4-owned blockers with `0` remaining and
proves Customer-to-Admin, Admin-to-Customer and Admin-to-Seller propagation
with `STATE_DIVERGENCE=0`, `OVERSALE_COUNT=0` and no payment-authority bypass.
The eight post-launch items do not weaken this launch boundary. The Admin
first-sale lane is technically ready for the future authorized provider/release
gate; the four PayTR gates and four company gates in
`ADMIN-FIRST-SALE-GAP-LEDGER.md` remain external and are not silently converted
into local PASS results.
