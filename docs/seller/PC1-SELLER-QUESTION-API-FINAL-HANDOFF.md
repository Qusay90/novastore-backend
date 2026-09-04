# PC1 Seller Customer Questions — Android / Stocky handoff

PC1_PROMPT_NUMBER: `PC1-R10-SELLER-REP01-REP02-CUSTOMER-QUESTIONS-BACKEND-CONTRACT-AND-SECURITY-CLOSURE`

STATUS: `IMPLEMENTED`

SELLER_QUESTION_BACKEND_CONTRACT: `GO`. Implementation, disposable end-to-end UAT, security review and targeted regression tests passed. This status covers the shared backend contract; consumer UI and production deployment are separate.

Accepted source parent: `f564ad1f74e8408db60084755e9a8f2b63ba94f0` / tree `d50da322d17f9e119677ea0ede7313d198830751`.

## Scope and routes

One shared Seller API writes the canonical `product_questions` answer. Seller Android, Stocky Seller Web and later Seller consumers use the same endpoints. No Android or Stocky source change is included. Admin answer authority remains rejected for Seller-bound stores.

| Registry | Method and route | Permission | Success |
| --- | --- | --- | --- |
| REP-01 | `GET /api/seller/v1/reputation/inbox` | `reputation.read` | `{items,next_cursor}` |
| REP-03 | `GET /api/seller/v1/reputation/items/{itemId}` | `reputation.read` | `{item}` |
| REP-02 | `POST /api/seller/v1/reputation/items/{itemId}/commands` | `reputation.read` and `reputation.reply` for `reply` | `{item,status,revision}` |

Responses follow the existing Seller business runtime's raw JSON convention. They are not nested in the proposed V1 `data/meta` envelope. Errors are `{code:"STABLE_CODE",error:"STABLE_CODE"}`. Authentication is Seller bearer audience plus current server-side session, membership and permission state; Customer/Admin bearer tokens do not grant Seller authority.

The implemented type is `product_question`. Other types return `400 UNSUPPORTED_REPUTATION_TYPE`. Reviews and `report` remain unavailable; a report request never silently succeeds. A caller without `reputation.report` is rejected with `403 PERMISSION_DENIED`; even if explicitly granted that permission, the command returns `400 UNSUPPORTED_COMMAND`.

The additive permission migration grants `reputation.read` and `reputation.reply` to the built-in owner, manager and operator roles, and `reputation.read` to viewer. Custom roles are not automatically broadened. `reputation.report` is not granted or implemented in this wave. Every role still requires current assigned store scope.

## Existing activation gate

The canonical REP routes are mounted through the existing Seller business API gate. Both `SELLER_API_V1_ENABLED=true` and `SELLER_API_V1_LOCAL_ONLY=true` are required. The existing startup safety check also requires a named loopback database and `NOVASTORE_BIND_HOST=127.0.0.1`. The R10 change preserves this global gate; it does not create a fake fixture endpoint or a second local-only question implementation.

The shared backend code is ready for consuming clients within the authorized runtime. This handoff does not authorize opening a production gate or deploying it. Production deployment remains `NOT_DONE`.

## Ownership and identity

Every list, detail, reply and replay resolves current server authority. The resource chain is:

`product_questions.product_id → products.store_id → seller_stores.legacy_store_id → Seller organization / current membership / current assigned store scope`.

Products and stores must satisfy current active/deleted/binding rules. Closed or disabled Seller bindings, revoked scope/membership and prior bearer tokens whose membership has since been revoked lose access. Client `sellerId`, `organizationId`, `storeId` or `ownerId` never supplies authority. Tenant SQL predicates apply before a question is disclosed and again within the reply transaction.

`item_id` is the existing numeric `product_questions.id`. `product_id` is the canonical product ID. `store_id` is the **Seller** store ID, not the legacy `stores.id`. `offer_id` is a distinct Seller offer ID; it is resolved against current organization/store/product ownership and is only a filter.

## Inbox, filters and pagination

Allowed query fields are `cursor`, `limit`, `type`, `status`, `offer_id`.

- `limit`: default `25`, integer `1–50`; oversized/invalid values are rejected.
- `type`: default and only supported value `product_question`.
- `status`: omitted for all questions, or `unanswered` / `answered`.
- `offer_id`: optional positive Seller offer ID belonging to the current Seller scope.
- `cursor`: use the returned opaque `next_cursor` unchanged, with the same filters. `null` means there is no next page.

Rows are ordered by immutable canonical question ID descending. Cursor pagination continues below the last returned ID; new questions do not cause duplicates in later pages. Concurrent status changes can change a filtered result set; refresh from page one when the user wants current counts/state.

The cursor contains a versioned base64url payload with a scope/filter digest and last ID, protected by a server-owned HMAC signature. It is bound to the current organization, membership and assigned store scope. Invalid signatures and mismatched-scope/filter cursors yield `400 INVALID_CURSOR`; membership security rotation invalidates prior cursors. A valid signature never grants resource authority: SQL independently enforces current ownership on every request. Clients must not construct or decode cursors as business data.

Example request:

```http
GET /api/seller/v1/reputation/inbox?type=product_question&status=unanswered&limit=25
```

## Canonical item DTO

```json
{
  "item_id": 123,
  "type": "product_question",
  "product_id": 37,
  "product_name": "Örnek ürün",
  "store_id": 8,
  "store_name": "Örnek mağaza",
  "question": "Ürünün ölçüsü nedir?",
  "answer": null,
  "status": "unanswered",
  "revision": 1,
  "created_at": "2026-09-04T12:00:00.000Z",
  "answered_at": null,
  "can_reply": true
}
```

The example contains synthetic values, not a persisted fixture. IDs and revisions are positive JSON integers. Dates are UTC ISO-8601. `answer` and `answered_at` are nullable. `can_reply` is false for answered items or insufficient reply permission; it is a UI hint and never substitutes for server authorization.

No Customer ID, email, phone, address, document/identity number, auth/session data or unnecessary display identity is returned. Question and answer text are user content and must be rendered as text, never injected as HTML.

## Reply request and validation

```http
POST /api/seller/v1/reputation/items/123/commands
Content-Type: application/json
Idempotency-Key: question-reply-123-example
```

```json
{"command":"reply","body":"Ürünümüzün eni 40 cm, boyu 60 cm'dir.","revision":1}
```

`body` is trimmed; accepted size is `1–2000` JavaScript UTF-16 character units. Blank, oversized and forbidden control-character values return `400 VALIDATION_FAILED`. Reply is for an unanswered question; answer editing is not part of this command.

The reply validator rejects explicit contact/URL/email/phone, payment instrument/IBAN, HTML markup, address-marker and order-reference patterns with `400 CONTENT_POLICY_VIOLATION`. This is a deterministic bounded pattern guard, not a claim to detect all private information expressed in natural language. Consumers must keep answers focused on public product information and must not render them as HTML.

Revision is an explicit positive JSON integer in the body. This runtime does not require the proposed future `If-Match` header. Missing revision is `428 PRECONDITION_REQUIRED`; invalid revision is `400 VALIDATION_FAILED`; stale revision or an already answered question is `409 REVISION_CONFLICT`.

Idempotency keys are mandatory and contain `8–160` ASCII letters, digits or `._:-`. Missing key is `428 IDEMPOTENCY_KEY_REQUIRED`; invalid key is `400 VALIDATION_FAILED`.

| Situation | Result |
| --- | --- |
| Current ownership/permission, unanswered question, matching revision | One canonical answer and incremented revision |
| Same key + same exact validated request | Same saved response; no new answer, audit or event |
| Same key + incompatible request | `409 IDEMPOTENCY_KEY_REUSED` |
| Same command + another key after success | `409 REVISION_CONFLICT` |
| Stale revision / already answered / losing concurrent reply | `409 REVISION_CONFLICT` |
| Retry after ownership, permission or membership loss | Access rejected; saved response is not an authorization bypass |
| Transient backend failure or authority-lock contention | `503 SELLER_BUSINESS_UNAVAILABLE`; no partial reply is committed |
| Unknown or unavailable command/type | Deterministic rejection, never success |

Use a new key only for a new intentional command. If the response is lost, retry the same request with the same key; do not manufacture a second command. Offline mutation queues are unsupported. Refetch detail after a conflict and preserve the user's draft locally only if permitted by the consumer's established security policy.

A transient `503 SELLER_BUSINESS_UNAVAILABLE` also covers authority-lock contention: the server fails safely instead of waiting on a stale authority snapshot. Back off and refetch current detail/context when appropriate. If retrying the original command, retain its exact request and Idempotency-Key; do not change revision/body under the same key or generate a new key merely because the earlier result was uncertain.

## Transaction, audit, event and Customer propagation

Reply writes `product_questions.answer`, `answered_at`, `answered_by` and increments `revision`. Seller audit/outbox, idempotency receipt and canonical `QUESTION_ANSWERED` notification event belong to the same transaction. Failure must roll back all these effects. `answered_by` refers to the authenticated Seller user, not a client-supplied actor.

Seller audit stores safe actor/organization/store/question identifiers and action metadata. It does not store tokens or unnecessary Customer identity. The event reuses the existing notification architecture with source identity `QUESTION_ANSWERED:product_question:{questionId}:r{revision}`. No duplicate question-event architecture or Seller-only answer table exists.

After commit, the existing Customer own-question endpoint `GET /api/questions/user` exposes the persisted answer. `GET /api/questions/product/{productId}` exposes answered questions where the current public product/store visibility rules allow. The Customer endpoint uses Customer authentication where required; Seller credentials must never be sent to Customer or Admin answer routes.

## Stable errors and consumer behavior

| HTTP | Code | Consumer behavior |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | Correct request fields; do not retry unchanged |
| 400 | `CONTENT_POLICY_VIOLATION` | Remove private/contact/payment/order or markup content; do not retry unchanged |
| 400 | `UNSUPPORTED_REPUTATION_TYPE` | Use `product_question`; reviews are not enabled |
| 400 | `UNSUPPORTED_COMMAND` | Use supported `reply`; do not simulate report success |
| 400 | `INVALID_CURSOR` | Drop cursor and reload page one using current filters |
| 403 | `PERMISSION_DENIED` | Disable unavailable action; refresh current context |
| 404 | `RESOURCE_NOT_FOUND` | Safe unavailable/deleted/unowned fallback; disclose no cross-Seller detail |
| 428 | `PRECONDITION_REQUIRED` | Refetch revision before constructing reply |
| 428 | `IDEMPOTENCY_KEY_REQUIRED` | Add a valid command key |
| 409 | `REVISION_CONFLICT` | Refetch; never silently overwrite |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Do not reuse that key for a different request |
| 503 | `SELLER_BUSINESS_UNAVAILABLE` | Back off; refetch when appropriate, and retry the same command with its original request/key |

Existing Seller session/audience/revocation errors retain their current runtime meanings. Authentication expiry/revocation returns the user through the existing Seller sign-in flow. Do not display backend internals, request credentials or hidden entity contents in error UI.

## Notification target and required refetch

Current resolved navigation payload is unchanged:

```json
{
  "type": "product_question",
  "destination": "NOTIFICATION_CENTER",
  "questionId": 123,
  "productId": 37,
  "sellerStoreId": 8
}
```

The existing notification authorization layer uses `offer.read` for this event. It does not grant `reputation.read` or `reputation.reply`. Android/Stocky should retain the notification center fallback and fetch `GET /api/seller/v1/reputation/items/{questionId}` before showing current question contents. This rechecks live membership, permission and ownership. The fetched `item_id`, product/store classification, revision and `can_reply` govern the surface; notification text/IDs alone do not.

For unauthorized, removed or deleted targets, return safely to the notification center/inbox with a generic unavailable message. Never open a payload-provided URL. Current `NOTIFICATION_CENTER` destination is not a claim that Android/Stocky question UI has been implemented. FCM or other real-provider delivery is not required for this backend readiness gate.

## Consumption and evidence status

Seller Android must implement its own inbox, detail and reply UI against these shared endpoints. Stocky Seller Web can consume the same contract using its established Seller session and permission mechanisms. Neither consumer should proxy an Admin answer endpoint or invent a local question store.

Run from the repository root:

```powershell
npm run test:seller-reputation
npm run test:seller-reputation:integration
```

| Evidence | Verified result |
| --- | --- |
| `npm run test:seller-reputation` | `PASS`: 67 rejected-input cases, 3 routes, migration checks; remote calls 0 |
| `npm run test:seller-reputation:integration` | `PASS`: 172 HTTP checks against disposable PostgreSQL with real Customer/Seller/Admin auth |
| Canonical Customer → Seller REP-01/detail/REP-02 → Customer/public answer | `PASS` |
| Admin sees Seller-owned question; Admin answer still rejected | `PASS` |
| Seller A/B isolation, prior-session membership revocation, binding/store-scope revocation | `PASS` |
| Exact invalid-cursor rejection for tampering, changed scope and filters | `PASS` |
| Concurrent replies, deterministic retry/idempotency and authority-lock contention | `PASS` |
| Four failure injections after answer SQL | `PASS`: canonical reply, audit, receipt and event roll back together |
| Notification materialization and dedupe | `PASS` |
| Independent final review | High findings `0`, medium findings `0` |
| Production writes / provider calls / secret exposure | `0` / `0` / `0` |

The integration command creates an owned disposable local database, exercises real mounted HTTP routes and canonical SQL reads/writes, and removes its test container. It does not use production data or send a real provider notification. Source commit identity is recorded by the coordinating final report after the authorized single local commit; this document does not invent a pending commit SHA.

SELLER_REP01_REP02: `IMPLEMENTED`

SELLER_ANDROID_QUESTION_HANDOFF: `READY`

STOCKY_SELLER_QUESTION_CONSUMPTION: `BACKEND_READY`

PRODUCTION_DEPLOY: `NOT_DONE`
