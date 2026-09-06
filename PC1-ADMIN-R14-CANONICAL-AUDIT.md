# PC1 Admin R14 canonical return audit

## Scope and identity

- Initial authority: HEAD `63e604627bca919d2f38143e7d2a65eb82364695`, tree `0ea2a645f7fd3216a5369bd37e858a45ad1024e1`.
- Scope: canonical return read contract and bounded Admin summary continuation only. No return mutation/business-rule or migration change was made.
- `graphify-out/graph.json` was absent in this clean R14 worktree, so the audit used the narrowly relevant routes, controllers, services, contracts, and tests.

## Admin summary pagination contract

`GET /api/admin/returns/summary` remains current-Admin-only through `privateNoStore`, authentication, Admin principal/role, and live DB Admin checks (`routes/adminRoutes.js`).

- Query: `limit` is clamped to `1..100`; omit `cursor` for page one, then send the server-returned opaque cursor verbatim.
- Success: `{ items, limit, hasMore, nextCursor }`; `nextCursor` is a string only when `hasMore=true`, otherwise `null`.
- Stable keyset order: `REQUESTED`, `IN_REVIEW`, `APPROVED`, `COMPLETED`, other statuses; then `created_at DESC NULLS LAST`; then `id DESC`.
- The cursor retains `created_at` as integer epoch microseconds so equal-time rows continue by `id` without a millisecond truncation duplicate; the visible summary `created_at` field remains unchanged.
- Invalid, malformed, over-512-character, or out-of-range cursor: `400 { code: "ADMIN_RETURN_CURSOR_INVALID", error: "İade sayfalama imleci geçersiz." }`, with no DB query.
- Each request fetches at most `limit + 1`; no unbounded list load was introduced. Existing minimized item fields remain `id`, `order_id`, `reason_code`, `status`, `refund_amount`, `revision`, `decision_note`, `decided_at`, `created_at`, `updated_at`, `order_status`, `refund_status`, `payment_status`, `currency`, and `customer_name`. Cursor-only rank/timestamp aliases are removed from the response.

The legacy `GET /api/returns/admin/all` route remains an unbounded read in `controllers/returnController.js:79-96`. The Admin Commerce Pro adapter must use only the bounded summary route. Removing or changing the legacy route is outside this narrow R14 pagination patch and needs a separate compatibility decision.

## Exact detail and authorization

`GET /api/returns/:id` reads the exact return joined to its canonical order (`controllers/returnController.js:27-52`). Its serialized response contains `id`, `order_id`, `user_id`, `reason_code`, customer `note`, `status`, `refund_amount`, `revision`, `decision_note`, `decided_at`, `created_at`, `updated_at`, `order_status`, `payment_status`, and `refund_status` (`services/returnWorkflowService.js:95-109`).

The controller permits only an Admin principal with Admin role or the owning Customer; all other authenticated principals and foreign Customers receive the same 404 (`controllers/returnController.js:41-47`). The Admin route also checks live DB Admin state; disabled/deleted Admin is 401 and a demoted Admin is 403 (`services/currentAdminGuard.js`). Customer and Seller credentials cannot pass the Admin PATCH chain (`routes/returnRoutes.js:15`).

The detail response does not advertise `allowed_transitions`. Admin UI may mirror the exact current table for control availability, while the PATCH remains final authority. Adding a server-advertised transition/capability DTO would be a broader read-contract change.

## Canonical write lifecycle

The canonical statuses remain `REQUESTED`, `IN_REVIEW`, `APPROVED`, `REJECTED`, and `COMPLETED`. Server transitions are exactly (`services/returnWorkflowService.js:8-33`):

| Current | Allowed Admin target |
| --- | --- |
| `REQUESTED` | `IN_REVIEW`, `REJECTED` |
| `IN_REVIEW` | `APPROVED`, `REJECTED` |
| `APPROVED`, `REJECTED`, `COMPLETED` | none |

There is no supported Admin command to reach `COMPLETED`; the Admin UI must not expose one.

`PATCH /api/returns/:id/status` accepts only `status`, `expected_revision`, and `decision_note`. `expected_revision` is a required positive integer. Terminal `APPROVED`/`REJECTED` decisions require a trimmed decision note of at most 1000 characters; control characters and unknown fields are rejected (`services/returnWorkflowService.js:45-76,216-225`).

The service locks the return and order, compares the authoritative revision, checks the transition, increments the revision, updates the order refund projection, updates linked Seller projections, appends a return event, and enqueues the canonical notification in one transaction (`services/returnWorkflowService.js:226-318`). A stale pre-lock comparison returns `409` with `code=RETURN_REVISION_CONFLICT` and `details={expectedRevision,currentRevision}`. A narrow compare-and-update race also returns the same code without details; clients must refetch exact detail on every 409.

Submitting the already-current status with the current revision is a reused no-op: no new event, notification, or revision is produced (`services/returnWorkflowService.js:247-250`). Every real transition uses one `RETURN_STATUS_CHANGED` outbox key scoped by return ID and resulting revision (`services/returnWorkflowService.js:286-307`); the existing event catalog targets Seller and Customer (`services/notificationEventCatalog.js:130-135`).

## Capability and refund truth

Admin writes are default-disabled. `returnWrite` is derived only from exact boolean-like `NOVASTORE_ADMIN_RETURN_WRITE_ENABLED=true` and is returned in the Admin session capabilities (`services/adminCommerceCapabilityService.js:1-60`, `services/adminCommerceReadService.js:82-92`). The PATCH middleware and controller both reject the disabled capability before mutation, returning 503.

`APPROVED` sets the canonical order `refund_status` to `PENDING`, leaves payment state untouched, makes no provider call, and returns `refundProviderExecuted=false` plus `refundProviderRequired=true` (`services/returnWorkflowService.js:256-315`). Admin presentation must keep return approval distinct from money-refund completion.

## Seller-owned decision authority

`SELLER_OWNED_RETURN_DECISION_POLICY: PLATFORM_ADMIN_OWNER_CONFIRMED`

Current code proves the technical reach:

- The Admin PATCH is platform-global and updates every linked `seller_returns` projection for the canonical return (`services/returnWorkflowService.js:216-315`).
- The implemented Seller runtime exposes a store/organization-scoped return list only and no decision command (`services/sellerOrderFulfillmentService.js:229-239`).
- The Seller API contract explicitly marks Seller return `accept|contest` decision authority as `PROPOSED_NOT_IMPLEMENTED` (`docs/seller/SELLER-API-V1.md:479-486`).

Source alone did not establish intentional business ownership. During the current R14 conversation, the owner explicitly answered “Platform Admin yetkisini kabul et” when asked whether Platform Admin should be accepted as decision authority for Seller-owned returns in this wave. That direct owner decision authorizes preserving the existing global canonical Admin behavior for R14. No permission model, Seller command, or canonical mutation was changed.

## Focused verification

- `node --check services/adminCommerceReadService.js`
- `node --check tests/adminCommerceProSessionContractSmoke.js`
- `node tests/adminCommerceProSessionContractSmoke.js` — PASS
- `git diff --check -- services/adminCommerceReadService.js tests/adminCommerceProSessionContractSmoke.js` — PASS (line-ending notices only)

The focused test proves first/next-page cursor parameters, stable bounded continuation SQL, hidden cursor aliases, terminal `nextCursor=null`, and invalid-cursor rejection before DB access. Real HTTP/PostgreSQL record-101 and end-to-end lifecycle evidence belongs to the disposable R14 UAT harness.
