# R21 system commerce implementation ledger

## Accepted authority and scope

- PC1 base: `d3e5fdadf961429c6860f18bd1706fac23add9e7`, tree `b4004e0856ac0902374d8c04026a05bc9bb3c4dc`.
- Stocky base: `fe893c276d968a4eb9fbb95aa8fd2332d8eb84d3`, tree `f1cb4af88a98658a7a47ca0061daca4e6521e87d`.
- Both implementations start in new clean worktrees. The interrupted Seller identity/session bridge is unaccepted and excluded.
- Local disposable validation and local commits are authorized. Production, provider calls, real payment, push, PR, merge, and deployment are excluded.

## Phase 0: read-only reconciliation

This ledger was reconciled before implementation edits.

| Target | Accepted implementation | Classification and decision |
| --- | --- | --- |
| R01 | `server.js` mounts Seller V1 only with both legacy flags, named loopback DB, and loopback listener. Session audience, live membership, store scope, permissions and revocation are already enforced. | Explicit production activation policy `MISSING`; `IMPLEMENTABLE_WITHOUT_S10`. Preserve local protection and require verified runtime/DB identity and security configuration. |
| S01 simple | Existing Seller offer attachment, price and inventory commands use `products.price`, `products.stock`, `products.revision`, mutation receipts, audit and outbox. | `REQUIRES_S10`: accepted handoff requires live Seller membership/permission. `BLOCKED_BY_S10`; no HMAC replacement. |
| S01 variants | Existing Seller variant commands use PC1-owned `seller_offer_variants.id`, `price_minor`, and `seller_inventory_items.quantity`, with revision/idempotency receipts. | `REQUIRES_S10`: R19 handoff expressly requires the separately accepted Seller session bridge. `BLOCKED_BY_S10`. |
| S01 creation/publication | Creating a canonical product and discovering unpublished products have no accepted Stocky workflow. Offer publication does not establish public product visibility or Seller legal readiness. | `MISSING` accepted scoped workflow, plus human authority dependency. No publication implementation in R21. |
| S02 | Stocky has tenant-scoped signed `order.created` ingestion. PC1 has canonical Seller allocation materialization and append-only Seller outbox/attempt tables. PC1 has no accepted Stocky connector binding/client/producer. | Receiver `ALREADY_PRESENT`; producer and delivery `MISSING`, `IMPLEMENTABLE_WITHOUT_S10`. Reuse Seller outbox and exact server-owned store mapping. |
| S04 | Stocky inbox persists committed/manual_required/stale/retryable states and signed-request status GET. Result outbox exists without a delivery/acknowledgement mechanism. | `MISSING` return completion, `IMPLEMENTABLE_WITHOUT_S10`. Persist exact business result; HTTP success alone is insufficient. |
| S09 | Stocky projected Sale uses POS `completed`/`unpaid` bookkeeping, without distinct NovaStore payment/fulfillment truth. | `MISSING` truthful consumer projection, `IMPLEMENTABLE_WITHOUT_S10`. Separate ingestion, canonical status snapshots, and local accounting. |
| S03 | Fulfillment commands and recipient access depend on live human Seller session, membership, permission, and order assignment. | `REQUIRES_S10`; `BLOCKED_BY_S10_AS_EXPECTED`. No prepare/ship/cancel_request command. |

## Existing connector trust

Stocky resolves the tenant before connector routes, checks the runtime gate,
then authenticates a connection key and rotating server-side secret. The HMAC
canonical message contains method, path, host, connection, key ID, timestamp,
nonce and request-body hash. A database uniqueness constraint rejects nonce
replay. Event identity is separately unique per connection; a fresh nonce may
retry the exact event after a lost response. An incompatible payload with the
same event ID conflicts. The connection binds `remote_store_id`, exact tenant
host and local warehouse/client/integration user. Product, variant and order
mappings are connection-scoped.

No such PC1 connector exists in the accepted base. R21 system identity must
remain limited to order delivery/result reconciliation, without Seller API or
Admin authority. The server owns organization/store/connection mapping.

## Privacy and first-sale limits

The R17 recipient handoff requires an authorized exact-order human fulfillment
view. R21 system order envelopes omit recipient name, phone, address, email,
Customer profile/account metadata and provider payloads. Only assigned order
lines, canonical identity and status snapshots belong in the system projection.

S01's blocked Stocky publication means the full requested Stocky product-to-order
chain cannot be declared closed. Tests may use synthetic approved Seller/product
fixtures to verify independent order delivery and preserve R18/R19 behavior;
that is not Stocky publication or real payment acceptance.

## R21 S02/S04 implementation contract

R21 adds one immutable server-owned binding per active PC1 Seller store. The
binding records the exact Seller organization/store, Stocky `remote_store_id`,
endpoint origin, HMAC key ID and a secret reference. The secret value stays in
runtime configuration. Binding rows cannot be retargeted; the only accepted
state transition is `active` to `disabled` with the next revision. Creation and
an exact retry are exposed through:

```js
createStockyConnectorBinding(database, {
  id, organizationId, storeId, remoteStoreId,
  endpointOrigin, keyId, secretRef
}, { runtime })
```

The insert and redacted `stocky.connector.bound` system audit are one database
statement. An exact active-scope retry returns `reused: true`; a changed origin,
key or secret reference conflicts. There is no browser or Seller-token binding
route in this wave.

`materializeSellerOrderProjection` now creates `stocky.order.created` in the
existing `seller_outbox_events` transaction only when that exact store has an
active binding. Globally enabling the connector does not make a binding
mandatory for every store: an unbound store continues canonical checkout and
creates no Stocky event. The outbox aggregate ID is the canonical `orders.id`.
`payload_redacted` contains the binding ID, canonical order ID, frozen request
body hash and immutable `r21.v1` envelope.

The envelope includes canonical order/payment/fulfillment statuses and only the
assigned order line identity, quantity and money snapshot. Simple lines send
`remote_variant_id: null` even though the Seller projection has a legacy wrapper
variant. A selected R19 variant sends the exact immutable
`orders.items[source_item_index].variant_id`. The accepted order snapshot stores
the product SKU on a variant line, not the canonical variant SKU, so R21 sends
`sku: null` for selected variants instead of mislabelling that value. Stocky uses
the exact remote variant ID and does not fall back to SKU. Event retries always
send the persisted body; they never re-read changed order status or catalog data.
`order.grand_total` is the assigned lines' gross sum and exactly equals their
declared totals. It excludes unallocated shipping and order-level discounts and
must not be presented as Customer payable amount or provider settlement.
`financial_facts` is intentionally omitted because R21 has no accepted clearing,
commission, refund or payout fact projection.

The signed transport paths are:

- `POST /api/integrations/novastore/v1/orders/events`
- `GET /api/integrations/novastore/v1/orders/events/{eventId}`
- `POST /api/integrations/novastore/v1/orders/events/{eventId}/receipt`

Requests bind method, path, hostname without port, connection UUID, key ID,
timestamp, fresh nonce and raw-body SHA-256. Responses use the separate
`v1-response` domain and additionally bind HTTP status plus the request timestamp
and nonce. PC1 verifies the raw response bytes before parsing JSON or persisting
a result. Remote transport resolves and pins public IP addresses, rejects unsafe
IPv4/IPv6 translation ranges and redirects, and only connects to the explicit
hostname allowlist. Local transport is limited to literal loopback in an attested
safe local runtime.

PC1 appends signed terminal results by `(source_event_id, result_revision)` before
acknowledging them. `committed` is business completion. `manual_required` and
`stale` are durable business outcomes, but never `delivered` in the legacy Seller
delivery-attempt ledger merely because HTTP returned 2xx. Receipt attempts have
a separate append-only ledger. A repeated revision must have the same result ID
and result core. An independently authorized Stocky dead-letter replay may replace
`manual_required` with a strictly higher `committed` revision; PC1 stores both.

An uncertain POST is reconciled with signed GET. A missing event is sent again
using the frozen body and a fresh nonce. A lost receipt response repeats only the
idempotent receipt call. Signed permanent 4xx validation failures become a dead
letter and cannot starve newer events. Unsigned or invalidly signed errors remain
retryable and cannot decide permanent business state. Transport failures, 5xx and
nonterminal processing states use backoff without rewriting append-only attempt
rows.

The worker prioritizes new events over receipt polling. Acknowledged `committed`
and `stale` results are settled. Acknowledged `manual_required` results receive a
bounded periodic signed GET so the existing authorized Stocky replay path can
surface a higher revision; the worker does not initiate that human replay. The
poll interval is runtime-configured and derived from the most recent durable GET
attempt.

## Runtime and worker operation

All flags default off. The runtime is resolved by
`resolveStockySystemCommerceRuntime({ environment, startupSafety })`.

| Name | Meaning |
| --- | --- |
| `NOVASTORE_STOCKY_SYSTEM_COMMERCE_ENABLED` | Enables binding lookup and transactional order event creation. |
| `NOVASTORE_STOCKY_SYSTEM_COMMERCE_WORKER_ENABLED` | Separately enables outbound delivery. |
| `NOVASTORE_STOCKY_SYSTEM_COMMERCE_ACTIVATION_MODE` | Required `local`, `uat`, or `production` mode. |
| `NOVASTORE_STOCKY_SYSTEM_COMMERCE_LOCAL_TRANSPORT_ENABLED` | Required only for explicit safe-local loopback transport. |
| `NOVASTORE_STOCKY_SYSTEM_COMMERCE_ALLOWED_HOSTS` | Exact comma-separated remote hostname allowlist for UAT/production. |
| `NOVASTORE_STOCKY_SYSTEM_COMMERCE_SECRETS_JSON` | Secret-reference to HMAC-secret object; values are never stored or logged. |
| `NOVASTORE_STOCKY_SYSTEM_COMMERCE_WORKER_INTERVAL_MS` | Worker cycle interval, clamped to 1–60 seconds. |
| `NOVASTORE_STOCKY_SYSTEM_COMMERCE_WORKER_BATCH_SIZE` | Cycle batch size, clamped to 1–100. |
| `NOVASTORE_STOCKY_SYSTEM_COMMERCE_MANUAL_RESULT_POLL_INTERVAL_MS` | Manual-result GET interval, clamped to 30 seconds–1 hour; default 5 minutes. |
| `NOVASTORE_STOCKY_SYSTEM_COMMERCE_WORKER_ONCE` | Standalone worker one-cycle mode when exactly `true`. |

Server startup resolves this runtime independently from Seller route activation,
applies the shared local migration set when either capability needs it, and proves
the connected database identity before starting the worker. The standalone
`scripts/stockyOrderDeliveryWorker.js` performs the same database identity proof.
The callable interfaces are `deliverStockyOrderEvent`,
`reconcileStockyOrderEvent`, `deliverNextStockyOrderEvent`, and
`runStockyOrderDeliveryWorkerCycle`.

This configuration is implementation and local-UAT documentation. It does not
authorize production flags, remote endpoints, provider traffic, publication,
deployment or secret installation.

## Remaining boundaries

- S01 product/price/stock publication remains `BLOCKED_BY_S10`; R21 does not add
  product creation, publication, stock commands, Seller tokens or a human bridge.
- S03 fulfillment and recipient disclosure remain `BLOCKED_BY_S10_AS_EXPECTED`.
  The R21 envelope and all new audit/outbox/result records omit name, email,
  phone, address, Customer account/profile data and provider payloads.
- S09 becomes truthful for the delivered immutable status snapshot: Stocky stores
  NovaStore order/payment/fulfillment facts separately and never turns `PAID`
  into a Stocky payment row. The projected gross is the assigned line sum, not
  the canonical payable total. R21 does not claim later status synchronization,
  settlement, payout or accounting facts.
