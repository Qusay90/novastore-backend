# PC1 Seller Notification Authority Inventory

## Scope and source authority

This inventory closes only the PC1-owned Seller notification authorization gaps accepted from Seller Android R9-R1.

- PC1 parent: `189fe819d22b87b809bb5e6fa03b4c158bbdd56d` / tree `216507275a7c68d74a0636f93b3da8a5441114d8`
- Seller consumer reference: `1b57f07510dce1ce12b327139785ad2352da3ecd` / tree `2e619192b53ca6e0e5be2edf75572c21cfa897a1`
- Customer Android frozen reference: `67cdeb205f1a3587b4d99a912e7adaab579c2786` / tree `a34f73f98427682415a04a7fd58f23446830ac0a`
- Seller Android and Customer Android source are not modified by this closure.

Authoritative Seller evidence reported one PC1 HIGH and one PC1 MEDIUM:

1. Final private delivery did not rejoin current Seller membership, organization/store scope, revision/security stamp, role permission, entity ownership, and endpoint ownership.
2. Recipient and feed/read paths had no fail-closed event-to-permission map.

It also required server-authorized typed targets rather than client authorization or arbitrary navigation data.

## End-to-end authority inventory

| Boundary | Server truth | Previous decision | Closure |
|---|---|---|---|
| Domain event | Frozen event catalog and aggregate identity | Server-owned | Preserved |
| Outbox payload | Recipient/user/URL/route fields rejected recursively | Server-owned | Preserved |
| Seller recipient resolution | Entity -> Seller organization/store -> active membership/scope | Membership and scope only | Active account, organization, role, permission, store, and entity are now required; application identity uses an explicit account FK |
| Logical notification | One shared `notifications` table | Server-owned | Preserved; an unauthorized channel never deletes history |
| Channel fan-out | Current endpoint matched by stored recipient tuple | Session status/expiry only | Final delivery independently reauthorizes |
| Android/Web final send | Delivery + endpoint lock | Endpoint active and session unexpired | Recipient/endpoint equality plus live membership revision/stamp, organization, role permission, store scope, entity ownership, and stable endpoint binding |
| Retry | Same delivery record | Reused the weak final check | Re-runs the complete current authorization before every provider call |
| Feed/unread/read | Stored recipient user/org/store tuple | No event permission | Current middleware permissions map to an allowlisted event set; unknown events deny |
| Typed target | Stored `entity_type/id/key` | Structural parsing only | New server resolver accepts only notification ID and returns a typed Seller projection after current authorization |

## Canonical Seller event permission map

Unknown Seller events are denied. Recognition in the shared ten-type target grammar is not authorization.

| Seller event | Required current permission | Seller target |
|---|---|---|
| `SELLER_APPLICATION_STATUS_CHANGED` | `organization.read` plus exact applicant-user identity | `seller_application` |
| `ORDER_CONFIRMED` | `order.read` | `order` |
| `ORDER_CANCEL_REQUESTED` | `order.read` | `order` |
| `CANCELLATION_RESULT` | `order.read` | `order` |
| `REFUND_STATUS_CHANGED` | `finance.read` plus order/store ownership | `order` |
| `RETURN_REQUESTED` | `return.read` | `return_request` |
| `RETURN_STATUS_CHANGED` | `return.read` | `return_request` |
| `QUESTION_CREATED` | `offer.read` plus product/store ownership | `product_question` |
| `REVIEW_CREATED` | `offer.read` plus product/store ownership | `review` |

The current catalog therefore supports nine Seller event types and five Seller typed targets. The shared grammar also recognizes `payment`, `product`, `shipment`, `store`, and `support_thread`, but no current Seller-recipient event emits those types. No Seller destination is invented for them.

## Current entity authority paths

- Order: canonical `orders.id` -> `seller_orders.canonical_order_id` -> current organization/store/scope; the public result uses `sellerOrderId`.
- Return: canonical `returns.id` -> current Seller order/store and optional `seller_returns.canonical_return_id`; the result uses `sellerReturnId` and `sellerOrderId`.
- Product question: `product_questions` -> non-deleted product -> active Seller store -> current store scope.
- Review: `reviews` -> non-deleted product -> active Seller store -> current store scope.
- Seller application: UUID key -> `seller_applications.applicant_user_id` -> exact active current user. Email is never account authority and the application is not treated as organization ownership.

## Seller application account binding

`SELLER_APPLICATION_STATUS_CHANGED` requires a durable application-to-user identity. The additive `applicant_user_id` foreign key is intentionally not backfilled from email, including unique case-folded email matches. Email ownership was not verified by the account system and cannot safely establish notification authority.

The only production writer is `POST /api/seller/v1/applications/current/account-link`. It requires both an active Applicant token and an independently authenticated live Seller session in the same request, accepts an empty object only, locks both sessions and the application, and writes only the authenticated Seller user ID. A caller cannot submit a user, application, organization, membership, store, or target ID. Replays by the same user are idempotent; a different user cannot replace an existing binding.

## Final private delivery decision

For Seller Android and Seller Web Push, the locked final transaction requires all of the following immediately before provider send:

1. notification role/user/organization equals endpoint role/user/organization;
2. Android application is exactly `SELLER_ANDROID`;
3. endpoint is bound to a live Seller session;
4. session user/organization/membership still matches;
5. session membership revision and security stamp equal the current membership;
6. user, membership, organization, and role are active;
7. the current role has the mapped event permission;
8. the notification target type matches the event policy;
9. the current membership still owns the entity's Seller store scope;
10. the endpoint/subscription still has the same role, user, organization, session, and Android application binding captured by the claimed delivery.

The delivery, endpoint, session, membership, organization, role, permission, scope, store, and entity rows needed for this decision are locked through the provider attempt. A current authority mutation cannot pass between authorization and send.

Web Push provider I/O has a finite five-second default socket timeout, bounded to one through fifteen seconds. Expired Customer-session cleanup skips any session that still owns a `PENDING` or `RETRYABLE` Web/Android delivery, so cleanup cannot form the reverse session-to-binding-to-delivery lock cycle while a worker holds that delivery. Once the worker makes the delivery terminal, the next cleanup pass removes the expired session and cascaded binding safely.

If session/account authority is stale, the endpoint is revoked only when its binding is still the claimed binding, and the private delivery terminates. If only this event/entity/store pairing is unauthorized, the endpoint remains usable for other authorized events. In both cases the channel delivery becomes terminal `FAILED` with safe internal code `SELLER_DELIVERY_NOT_AUTHORIZED`; the logical notification row is retained. If the endpoint is revoked and rebound while a delivery is in flight, the old delivery terminates as `DELIVERY_BINDING_CHANGED` without sending or mutating the new owner's binding.

## Client-controlled identifiers

No closure path accepts client-selected Seller user, organization, store, entity type, entity ID, URL, route, screen, or destination. The new resolver accepts only the authenticated notification ID. It loads the stored target and recipient tuple server-side.

## Persistence decision

One additive, transactional migration is required: `20260830_01_seller_application_user_binding`. It adds nullable `seller_applications.applicant_user_id`, an `ON DELETE RESTRICT` foreign key to `users(id)`, and a non-unique partial lookup index. It performs no identity inference or data backfill. First apply and second no-op are verified on disposable local PostgreSQL. Existing memberships, roles, permissions, sessions, revisions/security stamps, store scopes, Seller projections, notification truth, channel deliveries, delivery attempts, and endpoint bindings remain the authorization source for all other targets.
