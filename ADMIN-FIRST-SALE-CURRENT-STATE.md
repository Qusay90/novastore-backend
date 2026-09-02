# NovaStore Admin first-sale current state

Prompt: `NOVASTORE-FIRST-SALE-R4-ADMIN-COMMERCE-OPERATIONS-FINAL-LAUNCH-GATE`

## Authority and scope

| Field | Value |
|---|---|
| Accepted parent HEAD | `a7e2e282a5aec59a1a3c6cc110465877e6d611ac` |
| Accepted parent tree | `7545ee38f656157a9550ca22c09fd0db2365bc3f` |
| R4 branch | `codex/pc1-first-sale-r4-admin-launch-gate` |
| R4 worktree | `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\pc1-first-sale-r4-admin-launch-gate` |
| Protected lanes | Customer Android, Seller Android, Stocky and Customer Web redesign were not modified |
| Runtime boundary | Disposable loopback PostgreSQL and local same-origin browser only; no real PayTR, remote DB, push, PR, merge or deploy |

The canonical Admin entry is `frontend/admin-login.html` with the allowlisted
default destination `admin-commerce-pro-live.html`. The separate
`admin-commerce-pro.html` remains an explicitly isolated design preview and is
not an operational authority.

## Inventory and classification

`Initial` records the accepted R3 authority at the start of R4. `Final` records
the R4 contract; runtime proof is listed in `ADMIN-FIRST-SALE-E2E.md`.

| Surface | Initial | Final | Canonical route or contract | First-sale conclusion |
|---|---|---|---|---|
| Admin authentication/session | READY | READY | `/api/auth/login`, `/api/admin/session`, DB-backed current-admin guard | Server role only; customer, Seller and disabled/stale Admin denied |
| Default Admin destination | FIRST_SALE_BLOCKER | READY | `admin-login.html?next=admin-commerce-pro-live.html` allowlist | Operational UI is the default; mock preview is not opened by the legacy link |
| Dashboard | READY | READY | `/api/admin/stats` plus bounded order summaries | Read-only operational overview; cosmetic charts are not a launch gate |
| Sellers/stores | FIRST_SALE_BLOCKER | READY | `/api/admin/stores/summary`, `/api/admin/stores/:id/detail` | Legacy store, Seller Store and organization identity/status are bound; missing or ambiguous ownership is inactive and read-only |
| Products | FIRST_SALE_BLOCKER | READY | `/api/admin/catalog/products/summary` and canonical Admin catalog routes | Platform and Seller products share one projection; Seller products and unresolved ownership are never Admin-editable; even a nominal platform product is read-only when its store has an active Seller binding (`ADMIN_CATALOG_SELLER_BOUND_STORE_READ_ONLY`) |
| Price/stock | FIRST_SALE_BLOCKER | READY | Canonical `products.price` and `products.stock` read by Customer/Admin; server pricing/reservation on order | No client price or stock authority; Admin does not create a second Seller offer truth |
| Categories/attributes/collections/menus | FIRST_SALE_BLOCKER | READY | canonical `/api/admin/*` structure routes plus legacy `/api/categories` | Reads remain available; every canonical write and legacy category POST/DELETE is current-admin plus all-environment default-off capability |
| Orders | FIRST_SALE_BLOCKER | READY | `/api/admin/orders/summary` | Customer-safe identity, canonical items, quantities, totals, store, Seller allocation, tracking and safe payment metadata are visible |
| Checkout fulfillment topology | FIRST_SALE_BLOCKER | READY | agreement preview and `/api/payment/initialize` authoritative sales-party projection | Launch checkout permits platform-only or exactly one Seller store; mixed platform/Seller and multi-Seller carts fail closed before provider or persistent writes |
| Cancellation | FIRST_SALE_BLOCKER | READY | `/api/orders/:id/cancel` | Locked/idempotent transition, stock release and Seller-order convergence; provider refund is not invented |
| Fulfillment/shipment | FIRST_SALE_BLOCKER | READY | `/api/shipments/:orderId/manual` and `/manual-delivery-confirmation` | Admin manual shipment is platform-only; Seller-owned fulfillment cannot acquire a second Admin shipping authority; delivery is exact-state/idempotent |
| Returns | FIRST_SALE_BLOCKER | READY | `/api/returns`, `/api/returns/admin/all`, `/api/returns/:id/status` | Customer ownership, Seller projection, Admin revision transition and Customer propagation; write gate applies in every environment |
| Payments | FIRST_SALE_BLOCKER | READY | latest bounded payment projection plus session `paymentProvider` capability | Provider readiness and payment state are observable without credentials or secrets; browser redirect is never authority |
| Refunds | EXTERNAL_PAYTR_GATE | EXTERNAL_PAYTR_GATE | Canonical local `refund_status` and return projection | Pending/partial/refunded states are representable; no provider refund or settlement is claimed |
| Customers | POST_LAUNCH_ALLOWED | POST_LAUNCH_ALLOWED | Bounded order, return and support context | Dedicated CRM/segmentation directory is not required for the first safe sale |
| Support | READY | READY | `/api/messages` Admin inbox/takeover/reply contract | Shared thread identity, ownership and bounded customer context; no auth material exposed |
| Questions/reviews | READY | READY | `/api/questions`, `/api/reviews` Admin contracts | Existing moderation/answer operations are capability-gated and server-authoritative |
| Coupons | READY | READY | `/api/campaigns/coupons` | Server-authoritative checkout pricing; Admin writes remain exact capability-gated |
| Notifications | READY | READY | typed Admin notification projection/targets | Typed entities only; no arbitrary URL authority |
| Settlements/payouts | POST_LAUNCH_ALLOWED | POST_LAUNCH_ALLOWED | No provider transfer executor in Admin | Internal Seller ledger must not be represented as PayTR settlement |

## Authority matrix

| Operation | Customer | Seller | Admin | Truth owner |
|---|---:|---:|---:|---|
| View own order/return | own only | tenant projection only | bounded all-order operation | backend ownership checks |
| Change product price/stock | no | Seller contract only | platform product only when its store has no active Seller binding | canonical backend; never UI state |
| Create Seller shipment | no | own tenant/package only | no | Seller fulfillment service |
| Create platform manual shipment | no | no | capability + current Admin | manual shipment service |
| Confirm single-party delivery | no | no | capability + exact current shipment | manual delivery service |
| Cancel eligible order | owner/current Admin according to route policy | no generic order mutation | exact cancel command | order lifecycle service |
| Change return state | request/own read | tenant read/action where allowed | revision-controlled decision | return workflow service |
| Mark paid/refunded | no | no | no arbitrary status write | verified provider callback / future refund integration |

## Privacy and security boundary

- Admin summaries are bounded and exact-key normalized. They do not expose PAN,
  CVV, provider secrets, password hashes, reset tokens or unrestricted provider
  payloads.
- Payment observability exposes only provider name, NovaStore reference, safe
  external reference, normalized status/reason and timestamps.
- Store ownership is active only when exactly one current Seller Store binding
  and one current organization tuple are valid and active. Missing, closed or
  ambiguous bindings fail closed.
- Legacy `/api/products` Customer reads remain intact. Authenticated legacy
  Admin product/media writes terminate with
  `410 LEGACY_ADMIN_PRODUCT_WRITE_RETIRED` before upload/provider middleware.
- Canonical Admin product and media mutations lock the platform store and reject
  an active Seller binding with
  `409 ADMIN_CATALOG_SELLER_BOUND_STORE_READ_ONLY` before catalog writes.
- Legacy `/api/categories` reads remain public; `POST` and `DELETE` require a
  DB-current Admin plus the all-environment, default-off
  `catalogStructureWrite` capability.
- Checkout agreement preview, read-only payment preflight and the final
  authoritative transaction all consume the same sales-party projection.
  Unsupported mixed or multi-Seller carts return
  `CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED`; the UI cannot convert them into a
  paid or delivered canonical order.
- All first-sale Admin writes are default-off environment capabilities. UI
  visibility never replaces backend authorization.
