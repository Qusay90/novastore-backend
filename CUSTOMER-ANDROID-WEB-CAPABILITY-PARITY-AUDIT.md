# Customer Web / Android Capability Parity Audit

PC1 prompt: `CUSTOMER-ANDROID-R11-R5-FOLLOW-PERSISTENCE-NOVABOT-ADVANCED-INTERACTION-AND-FINAL-WEB-PARITY-CLOSURE`

## Authority and audit boundary

- Customer Android baseline: `71464a39d1b2bb0a00819981e66da4b7c54493f0` / `cda756c25abd93f63a759d138259400360a4c42d`.
- Customer Android root: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\android-customer-r8-r3-carousel-wrap`.
- Customer Web / PC1 read-only authority: `47c085973ecd27bb3e8577b2cd48fb4d36523ffa` / `91bf3f5f4c1898e81fff300ee3506a8c6b4f64bf`.
- PC1 root: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\pc1-first-sale-r4-admin-launch-gate`.
- The existing `CUSTOMER-ANDROID-WEB-ACCOUNT-PARITY-MATRIX.md` was an input, not proof. This audit rechecked current render paths, client transports, PC1 routes, and server ownership.
- The 18 requested topics resolve to 21 separately testable capability units because privacy/security, questions, and reviews each contain a distinct mutation capability.
- This document records the post-convergence R11-R5 state. The five canonical Android parity gaps were closed and physically exercised; NovaBot's Android-owned presentation/interaction work is complete, while real advanced-mode exposure remains intentionally provider-gated behind the exact PC1 handoff documented in `NOVABOT-MODES-PROVIDER-INVENTORY.md`.

## Classification rules

- `FIX_NOW_CANONICAL_PARITY`: Customer Web has a real canonical capability and PC1 contract, while Android is missing it, uses only local state, or is still being completed in this wave.
- `NATIVE_EQUIVALENT`: Android has a discoverable native path with equivalent customer outcome. Platform-specific presentation or delivery mechanics may differ.
- `PROVIDER_SECURITY_EXCEPTION`: parity is intentionally gated by a confirmed external provider security contract.
- `POST_LAUNCH_EXPLICITLY_ACCEPTED`: an owner-approved post-launch difference. No row in this audit qualifies merely because implementation is inconvenient.
- `NOT_APPLICABLE`: no customer capability should exist on the compared platform. No row in this audit requires this classification.

`ANDROID_RENDERED = YES` does not prove a server contract. A control that mutates only React state is explicitly reported as local-only.

## Capability matrix

| # | Capability unit | Customer Web evidence | Customer Android evidence | Real server contract | Classification | R11-R5 disposition |
|---:|---|---|---|---|---|---|
| 1 | Profile / account overview and update | Account overview and profile edit use the connected account adapter. | Account card and `profile` route use `CustomerAccountRuntime`; name/phone update revalidates the returned profile. | `GET/PATCH /api/users/me` | `NATIVE_EQUIVALENT` | No parity change required. |
| 2 | Orders | Connected account pages render owned orders and detail/actions. | `Siparişlerim` is discoverable; list, detail, refresh, and guarded cancellation use runtime data. | `GET /api/orders/user/:userId`, `POST /api/orders/:id/cancel`; self-or-admin guard | `NATIVE_EQUIVALENT` | No parity change required. |
| 3 | Addresses | Connected address book provides list/create/update/delete/default actions. | `Adreslerim` is discoverable and performs real CRUD/default mutations. | `GET/POST /api/addresses`, `PUT/DELETE /api/addresses/:id`, `PATCH /api/addresses/:id/default`; current user ownership | `NATIVE_EQUIVALENT` | No parity change required. |
| 4 | Favorites collection and mutations | Web runtime hydrates and mutates favorites through `NovaStoreFavorites`; PC1 persists them. | Account runtime hydrates the authoritative product-id set; PDP/card controls mutate through the canonical endpoint and update UI only from a validated server confirmation. Refresh, rejection preservation, and delayed Customer A response isolation are covered. | `GET /api/favorites`, `POST /api/favorites/sync`, `POST/DELETE /api/favorites/:productId` | `NATIVE_EQUIVALENT` | Closed in R11-R5: no optimistic/local favorite authority and no cross-customer late-response leak. |
| 5 | Active coupons | Web account reads and displays active coupons; checkout independently quotes the code. | `Kuponlarım` reads active coupons. Checkout sends the selected cart coupon for PC1 quote/preview validation. | `GET /api/campaigns/coupons/active`, checkout quote/preview | `NATIVE_EQUIVALENT` | Account selection/copy is presentation state; discount truth remains PC1-owned. |
| 6 | Notifications and delivery preferences | Server notification list/read state plus Web Push subscription controls. | Server notification list/read state plus Android FCM device enable/disable/settings controls. | Notification list/unread/read endpoints and platform-specific Web Push/Android token endpoints | `NATIVE_EQUIVALENT` | The three category switches in `Prototype.tsx` are local presentation state; neither this audit nor their rendering establishes a server preference contract. |
| 7 | Privacy/security status | Connected security route reads current account security state. | Discoverable `Gizlilik ve Güvenlik` route shows only server-returned security state. | `GET /api/users/security-status` | `NATIVE_EQUIVALENT` | Read/status capability is equivalent; password mutation is audited separately. |
| 8 | Change current password | Connected Web form validates and calls the account adapter. | A discoverable Android form validates current/new/confirmation input, calls the exact allowlisted endpoint, and reports success only after the server confirms it. Password material is neither persisted nor logged. | `POST /api/users/change-password` | `NATIVE_EQUIVALENT` | Closed in R11-R5 with pre-transport validation, server-confirmed success, and secret-storage regression coverage. |
| 9 | Help/support history and message send | Connected support page reads current-customer history and sends messages. | Help hub is discoverable; native history/live views use the account runtime and real PC1 messages. | `GET /api/messages/history/:userId`, `POST /api/messages/send`; current-customer scope | `NATIVE_EQUIVALENT` | No parity change required. Local non-native demo is not Android authority. |
| 10 | FAQ | Web help surfaces canonical static guidance. | Account and Support routes expose searchable/expandable FAQ guidance. | No mutable private server truth is required for static FAQ copy. | `NATIVE_EQUIVALENT` | Keep content/version review separate from account data authority. |
| 11 | Questions history | Connected account page lists the signed-in customer's questions. | `Sorularım` is discoverable and renders only normalized current-customer results. | `GET /api/questions/user` | `NATIVE_EQUIVALENT` | History parity is present; question creation is audited separately. |
| 12 | Submit a product question | Product Community sends the authenticated question through its adapter. | Native PDP exposes the authenticated question form, submits the canonical product id/text, and refreshes private question history only after a validated server success. Guest/preview submission remains disabled. | `POST /api/questions/ask` | `NATIVE_EQUIVALENT` | Closed in R11-R5; rejected or invalid input cannot create optimistic question truth. |
| 13 | Reviews history | Connected account page lists the signed-in customer's reviews. | `Değerlendirmelerim` is discoverable and renders the self-scoped normalized list. | `GET /api/reviews/user/:userId`; self-or-admin guard | `NATIVE_EQUIVALENT` | History parity is present; review creation is audited separately. |
| 14 | Submit a product review | Product Community sends authenticated, eligibility-checked review input through its adapter. | Native PDP submits rating/comment through the canonical account runtime and refreshes private review history only after server confirmation. PC1 remains the purchase/eligibility authority, and a rejection preserves the last confirmed view. | `POST /api/reviews`; PC1 owns purchase/eligibility enforcement | `NATIVE_EQUIVALENT` | Closed in R11-R5 with eligibility-failure and server-confirmation coverage. |
| 15 | Followed stores: follow, reload, list, unfollow | Web store adapter uses authenticated follow state/mutations and account list. | The Store route now GETs current per-store truth, POSTs/DELETEs without optimistic authority, refreshes the Account collection after confirmation, re-fetches on route/remount, and rejects stale route/session replies. Guest/preview modes cannot read or mutate follow authority. | `GET /api/store-follows`, `GET/POST/DELETE /api/store-follows/:storeSlug`; current user ownership | `NATIVE_EQUIVALENT` | Closed in R11-R5 on the physical Customer device: Customer A follow survived route return and process reopen, propagated to Account, unfollow converged, and Customer B observed no stale A follow. |
| 16 | Returns/exchanges | Connected orders/returns flow uses owned orders and return requests. | Discoverable equivalent path is Orders detail and Support; Android lists/creates real requests and never fabricates eligibility. | `GET /api/returns/mine`, `POST /api/returns`, owned order/return checks | `NATIVE_EQUIVALENT` | No layout identity requirement. |
| 17 | Global NovaBot and real modes | Web singleton uses PC1 assistant transport and server-returned capabilities/modes. | R11-R5 completes one global native launcher, drag/snap/persist, hide/fix/movable/reset controls, Settings/Help recovery, nested-scroll transfer, keyboard-safe composer, session-isolated transient history, and validated basic PC1 chat. The adapter can strictly normalize the nine canonical mode IDs and returned metadata, but production Android intentionally exposes no selector because PC1 has no safe provider-capability authority. | `POST /api/assistant/chat`; provider/mode truth must remain server-owned; safe capability endpoint absent | `PROVIDER_SECURITY_EXCEPTION` | Android-owned interaction closure is complete. Real advanced-mode UI/behavior remains withheld behind the exact PC1 capability and strict-validation handoff; Android does not fabricate provider readiness. |
| 18 | Settings / recovery hub | Web account settings are distributed across canonical account/security/notification/support routes. | Account gear opens a discoverable native hub for the same destinations and includes a NovaBot recovery action; Help exposes an independent recovery action. Either restores visibility, movable mode, and safe default position. | Per-capability contracts; presentation-only launcher settings are local device preferences. | `NATIVE_EQUIVALENT` | Closed in R11-R5; recovery remains reachable even after the launcher is hidden or fixed. |
| 19 | Legal/checkout consent and order preview | Web checkout uses PC1 quote/agreement snapshots and provider handoff. | Native checkout requires real address/cart, server preview documents, explicit consent, and provider readiness before initialize. | `POST /api/payments/agreements/preview`, payment capability/initialize contracts | `NATIVE_EQUIVALENT` | Technical parity remains closed; `OWNER_VISUAL_ACCEPTANCE: PENDING_OWNER_REVIEW`. |
| 20 | Payment status | Web result page polls server-owned payment state and rejects query-string success. | Android polls PC1 and shows success only when provider and commerce are finalized with no reconciliation gate. | `GET /api/payments/status` | `NATIVE_EQUIVALENT` | Real payment remains unauthorized in this wave. |
| 21 | Saved payment methods | No confirmed PayTR marketplace tokenized-card-storage contract is present. | Native route truthfully shows provider-gated empty status; no Android card-management authority. | No confirmed provider tokenized-card contract | `PROVIDER_SECURITY_EXCEPTION` | View: `PROVIDER_GATED`; add: `PROVIDER_GATED_IF_SUPPORTED`; delete: `WEB_ONLY`. No fake/local cards. |

## FIX_NOW closure ledger

The six original audit findings were reconciled as follows:

1. Favorites server hydration/mutation/session isolation — closed as `NATIVE_EQUIVALENT`.
2. Current-password change UI and mutation — closed as `NATIVE_EQUIVALENT`.
3. Product-question submission — closed as `NATIVE_EQUIVALENT`.
4. Product-review submission with server eligibility truth — closed as `NATIVE_EQUIVALENT`.
5. Owner-reproduced followed-store persistence and Account propagation — closed as `NATIVE_EQUIVALENT`, including physical Customer A/B isolation evidence.
6. Global NovaBot — Android-owned interaction/presentation work closed; real provider-mode exposure classified `PROVIDER_SECURITY_EXCEPTION` because the required safe capability contract and strict server-mode rejection are PC1-owned.

No canonical parity item remains `FIX_NOW_CANONICAL_PARITY`. The two remaining differences are explicit provider/security exceptions: NovaBot advanced provider modes and saved payment methods. Neither exception authorizes Android-local simulation.

## Evidence index

Customer Android:

- `v413-ui/src/Prototype.tsx` — discoverable routes and rendered controls, including server-backed favorites, password, question/review entry points, followed-store Account propagation, and the Settings/Help NovaBot recovery paths.
- `v413-ui/src/account/CustomerAccountRuntime.tsx` — authenticated profile, addresses, coupons, questions/reviews, favorites, followed stores, orders, returns, support, security and password mutation; session replacement clearing and stale-response quarantine.
- `v413-ui/src/account/customerAccountApi.ts` — normalized Customer account, favorites, product-community, password and followed-store requests with response validation.
- `v413-ui/src/account/useCustomerStoreFollowRuntime.ts` — server-authoritative per-store GET/POST/DELETE lifecycle, route/session guards, Account refresh, and guest/preview fail-closed policy.
- `v413-ui/src/notifications/CustomerNotificationRuntime.tsx` and `v413-ui/src/notifications/customerNotificationApi.ts` — server notification truth, session guards, Android push lifecycle, and HTTP allowlist.
- `v413-ui/src/assistant/customerNovaBotApi.ts` — PC1 assistant transport, bounded canonical selected-mode request normalization, returned-mode/`availableModes` validation, and cross-validation.
- `v413-ui/src/assistant/novabotPresentation.tsx` — singleton launcher, drag/snap/persistence, menu controls, safe exclusions, nested scroll transfer, and recovery commands.
- `v413-ui/src/checkout/customerCheckoutApi.ts` and `v413-ui/src/checkout/CheckoutLegalConsent.tsx` — provider capability, agreement snapshot, payment initialize/status, and explicit legal consent.
- `v413-ui/android/app/src/main/java/com/novastore/app/NovaNotificationApiPlugin.java` — native HTTP allowlist boundary.

Customer Web / PC1 read-only authority:

- `storefront-commerce-pro/src/ConnectedCustomerPages.jsx` — connected Account, security, support, notification, coupon, checkout, and payment-result surfaces.
- `storefront-commerce-pro/src/ProductCommunity.jsx` and `storefront-commerce-pro/src/adapters/productCommunityAdapter.js` — real product question/review create flows.
- `storefront-commerce-pro/src/integration/createCommerceRuntime.js`, `storefront-commerce-pro/src/adapters/favoritesAdapter.js`, and `frontend/favorites-sync.js` — Web favorites hydration/mutation.
- `storefront-commerce-pro/src/adapters/customerAccountAdapter.js` — account/history/security/password/support transports.
- `storefront-commerce-pro/src/adapters/storeFollowAdapter.js` — Web follow state/mutations.
- `storefront-commerce-pro/src/adapters/assistantAdapter.js` — Web NovaBot transport.
- `storefront-commerce-pro/src/adapters/checkoutAdapter.js` — quote, agreement, provider initialize, and status transport.
- `server.js`; `routes/userRoutes.js`; `routes/orderRoutes.js`; `routes/addressRoutes.js`; `routes/favoriteRoutes.js`; `routes/campaignRoutes.js`; `routes/notificationRoutes.js`; `routes/questionRoutes.js`; `routes/reviewRoutes.js`; `routes/storeFollowRoutes.js`; `routes/returnRoutes.js`; `routes/messageRoutes.js`; `routes/assistantRoutes.js`; `routes/paymentRoutes.js` — mounted PC1 contracts and authorization boundaries.

## Audit result at R11-R5 closure

```text
WEB_ANDROID_CAPABILITY_PARITY_AUDIT: PASS_WITH_PROVIDER_SECURITY_EXCEPTIONS
REQUESTED_TOPIC_COUNT: 18
WEB_CAPABILITIES_AUDITED_COUNT: 21
NATIVE_EQUIVALENT_COUNT: 19
FIX_NOW_CANONICAL_PARITY_COUNT: 0
PROVIDER_SECURITY_EXCEPTION_COUNT: 2
POST_LAUNCH_EXPLICITLY_ACCEPTED_COUNT: 0
NOT_APPLICABLE_COUNT: 0
UNEXPLAINED_WEB_ONLY_CUSTOMER_CAPABILITY_COUNT: 0
FIX_NOW_PENDING_AT_R11_R5_CLOSURE: 0
NOVABOT_ANDROID_PRESENTATION_AND_INTERACTION: PASS
NOVABOT_ADVANCED_PROVIDER_MODES: PROVIDER_SECURITY_EXCEPTION
EXACT_PC1_NOVABOT_MODES_HANDOFF_REQUIRED: YES
FOLLOW_PERSISTENCE_PHYSICAL_CUSTOMER_A_B: PASS
PAYMENT_METHODS_PARITY: PROVIDER_SECURITY_EXCEPTION
ANDROID_SAVED_CARD_VIEW_POLICY: PROVIDER_GATED
ANDROID_SAVED_CARD_ADD_POLICY: PROVIDER_GATED_IF_SUPPORTED
ANDROID_SAVED_CARD_DELETE_POLICY: WEB_ONLY
PAN_STORAGE_COUNT: 0
CVV_STORAGE_COUNT: 0
OWNER_VISUAL_ACCEPTANCE: PENDING_OWNER_REVIEW
```

`UNEXPLAINED_WEB_ONLY_CUSTOMER_CAPABILITY_COUNT: 0` means every observed difference has an explicit, evidenced disposition. The two provider/security exceptions remain fail-closed and are not mislabeled as native capability completion.
