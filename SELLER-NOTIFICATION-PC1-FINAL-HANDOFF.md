# Seller Notification PC1 Final Handoff

## Contract status

PC1 provides one server-authoritative Seller notification contract. Seller Android must not duplicate the permission map, translate canonical IDs locally, trust transport targets for navigation, or construct a route/URL from notification data.

Base path: `/api/seller/v1`

All endpoints below retain the accepted guard chain:

1. private/no-store response headers;
2. Seller-audience authentication;
3. live Seller session validation;
4. server-resolved current tenant context.

## Existing notification center and device endpoints

- `GET /notifications?limit={1..100}&cursor={opaque}`
- `GET /notifications/unread-count`
- `PATCH /notifications/{notificationId}/read`
- `PATCH /notifications/read-all`
- `POST /notifications/android-push/tokens`
- `DELETE /notifications/android-push/tokens`
- `DELETE /notifications/android-push/tokens/session`

Feed, unread count, mark-one, and mark-all now apply the same current event-permission filter. Events outside the current permission set are invisible and cannot be marked read. Unknown Seller event types are denied.

Device register/rotate/revoke bodies remain unchanged. User, organization, session, application, and endpoint ownership continue to be derived and enforced server-side.

## Seller application account link

Application-status notifications use the stable `seller_applications.applicant_user_id` relation. PC1 never infers this relation from an email address and the migration performs no backfill.

The Seller application flow must link the two independently authenticated authorities once it holds both credentials:

```http
POST /api/seller/v1/applications/current/account-link
Authorization: Bearer {sellerAccessToken}
Applicant-Token: {applicantToken}
Content-Type: application/json

{}
```

Success:

```json
{
  "linked": true,
  "idempotent": false,
  "application_id": "11111111-1111-4111-8111-111111111111"
}
```

A replay by the same Seller returns `idempotent: true`. The body must be an empty object; Seller Android must not send a user, application, organization, membership, store, or target identifier. Missing/expired Applicant authority fails `401`; an unavailable live Seller/application pairing fails safely; a different Seller cannot replace an existing binding and receives `409 APPLICATION_ACCOUNT_ALREADY_LINKED`. No response exposes another user ID.

## New typed-target resolver

Request:

```http
GET /api/seller/v1/notifications/{notificationId}/target
```

The request has no target body or query authority. Seller Android supplies only the notification ID already received from the authenticated notification center.

The resolver does not mark the notification read.

### Order

```json
{
  "notificationId": 123,
  "target": {
    "type": "order",
    "destination": "SELLER_ORDER_DETAIL",
    "sellerOrderId": 456
  }
}
```

`sellerOrderId` is the Seller projection ID accepted by the Seller order API. It is not the canonical Customer/Admin order ID stored in the notification.

### Return request

```json
{
  "notificationId": 124,
  "target": {
    "type": "return_request",
    "destination": "SELLER_RETURNS",
    "sellerReturnId": 77,
    "sellerOrderId": 456
  }
}
```

`sellerReturnId` can be `null` when the authorized canonical return exists but its Seller return projection is not yet materialized. `SELLER_RETURNS` remains a safe list destination; Seller Android must not substitute the canonical return ID.

### Product question

```json
{
  "notificationId": 125,
  "target": {
    "type": "product_question",
    "destination": "NOTIFICATION_CENTER",
    "questionId": 31,
    "productId": 19,
    "sellerStoreId": 8
  }
}
```

### Review

```json
{
  "notificationId": 126,
  "target": {
    "type": "review",
    "destination": "NOTIFICATION_CENTER",
    "reviewId": 42,
    "productId": 19,
    "sellerStoreId": 8
  }
}
```

### Seller application

```json
{
  "notificationId": 127,
  "target": {
    "type": "seller_application",
    "destination": "NOTIFICATION_CENTER",
    "applicationId": "11111111-1111-4111-8111-111111111111"
  }
}
```

Question, review, and application have no accepted live-Seller detail route at this PC1 authority. The resolver authorizes their identity but deliberately returns `NOTIFICATION_CENTER`; Seller Android must stay in the center instead of inventing a screen.

## Supported Seller events and permissions

| Event | Permission | Target |
|---|---|---|
| `SELLER_APPLICATION_STATUS_CHANGED` | `organization.read` plus applicant identity | `seller_application` |
| `ORDER_CONFIRMED` | `order.read` | `order` |
| `ORDER_CANCEL_REQUESTED` | `order.read` | `order` |
| `CANCELLATION_RESULT` | `order.read` | `order` |
| `REFUND_STATUS_CHANGED` | `finance.read` plus order ownership | `order` |
| `RETURN_REQUESTED` | `return.read` | `return_request` |
| `RETURN_STATUS_CHANGED` | `return.read` | `return_request` |
| `QUESTION_CREATED` | `offer.read` plus product/store ownership | `product_question` |
| `REVIEW_CREATED` | `offer.read` plus product/store ownership | `review` |

The shared target parser recognizes five additional types (`payment`, `product`, `shipment`, `store`, `support_thread`). They are not current Seller event targets and the resolver rejects them rather than creating a second navigation truth.

## Safe failure contract

Foreign notification, foreign organization/store, wrong Seller, lost permission, revoked scope, stale membership/session revision, deleted target, mismatched event/target, unsupported target, and malformed stored target all fail without target data:

```json
{
  "code": "SELLER_NOTIFICATION_TARGET_NOT_FOUND",
  "error": "Bildirim hedefi güncel Seller kapsamınızda bulunamadı."
}
```

HTTP status: `404`.

This common response avoids an entity-existence oracle. No response contains a URL, route path, raw screen name, other tenant identity, or private Customer/Admin data.

## Delivery and retry semantics

- A logical notification can remain in history after membership or scope changes.
- Every Seller-private Android/Web provider attempt reauthorizes the current endpoint owner, session, membership, revision/security stamp, organization, role permission, store scope, and entity.
- A retry never inherits the authorization decision from its first attempt.
- Revocation between a transient failure and retry prevents the provider call.
- A subscription/endpoint rebound after delivery claim is never used for the old notification; the old delivery terminates with `DELIVERY_BINDING_CHANGED` and the new binding remains active.
- Unauthorized private channel delivery terminates only that delivery; it does not create a replacement logical notification.
- Session/account-invalid endpoints are revoked. Event/entity-only denial does not revoke an otherwise valid endpoint.
- Web Push provider calls use a finite bounded socket timeout; a stalled provider cannot hold Seller authority locks indefinitely.
- Expired Customer-session cleanup defers deletion while a Web/Android delivery remains `PENDING` or `RETRYABLE`, preventing cleanup-versus-delivery reverse lock ordering; cleanup resumes after the delivery becomes terminal.
- FCM/Web Push targets remain transport hints only. Seller Android must fetch the notification center and call the typed-target resolver before navigation.

## Seller Android consumption sequence

1. Receive a refresh signal or privacy-minimal FCM payload.
2. Fetch the authoritative notification center.
3. Mark the selected notification read using its notification ID.
4. Call `GET /notifications/{notificationId}/target`.
5. Navigate only when the returned `destination` is explicitly supported.
6. For `NOTIFICATION_CENTER` or any `404`, stay safely in the notification center.
7. The destination business API performs its own current authorization again.
