# Seller Wave 4 — Mobile Integration Contract

## Binding inputs and scope

This contract implements the phone-only seller surface in the existing repository. The authoritative visual package is `NovaStore-Seller-Theme-Integration-Handoff.zip`, verified locally with `tools/verify-handoff.sh`: 296 numbered phone PNGs, 194 deterministic full-screen SVG design sources, 13 shared illustration assets, accepted PNG dimensions, a valid SHA-256 manifest, and no tablet assets. For a reference with a full-screen SVG, that SVG is the first visual authority and its binding PNG is the rendered acceptance target; otherwise the numbered PNG is the geometry authority. `docs/SCREEN_CATALOG.tsv` remains the binding identity catalog.

`docs/seller/SCREEN-BACKEND-MATRIX.tsv` remains the 296-row route/state traceability source. No customer `:app` file is modified. The integration adds a real `:seller-app` Android application module and only explicitly enabled local seller API runtime paths.

The nine images supplied with the owner-reference follow-up are binding evidence and are inventoried without omission in `SELLER-WAVE4-OWNER-SUPPLEMENTAL-REFERENCE-MAP.tsv`. Byte, dimension, route, state and evidence-provenance checks show that all nine are exact duplicates of already committed Wave 4 evidence outputs for canonical references 001, 055 and 282: three normalized runtime captures, three algorithmic overlays and three two-panel comparison composites. They are not new raw authoring sources or additional canonical phone states. Consequently `REFERENCE_COUNT` remains 296, `SUPERSEDES` remains `NONE`, and no runtime output is promoted into its own visual acceptance target. This prevents a circular comparison while retaining all nine owner-supplied files as binding, auditable evidence.

## Exact launch mapping

| Canonical IDs | Domain | Runtime treatment |
| --- | --- | --- |
| 001–011 | Login and recovery | Seller-only login, refresh, current/all logout and revoked-session reauthentication are live. Password reset and challenge paths with no completed seller API remain explicitly unavailable; they never report success locally. |
| 012–054 | Application and onboarding | Explicit capability-unavailable states. No application, verification, bank, document, or seller-creation mutation is invented. |
| 055–073 | Dashboard | Live dashboard and active server context; loading, error, offline, empty and refresh states are native. |
| 074–123 | Offer and catalog | Live offer list/detail, permitted create/update/publish/archive and server validation. Canonical catalog fields and media are read-only/unavailable. |
| 124–141 | Inventory | Live inventory read, non-negative adjustment and threshold update. Backorder and negative inventory are unavailable. |
| 142–184 | Orders, fulfillment and returns | Live seller-safe order list/detail, allowed prepare/ship commands and return read. Full address is never rendered; return accept/contest is unavailable. |
| 185–204 | Finance | Live server finance summary, ledger and settlements with exact server money values. Payout initiation and unsupported bank actions are unavailable. |
| 205–222 | Analytics | Explicit capability-unavailable state; no client-side financial or performance calculation. |
| 223–242 | Campaigns and coupons | Explicit capability-unavailable state; no campaign mutation is invented. |
| 243–256 | Store | Live store read/update only for backend-allowed fields. Customer preview, policy and reputation actions remain unavailable when no route exists. |
| 257–270 | Notifications | Explicit capability-unavailable state; no fabricated notification stream. |
| 271–281 | Customer messages and seller support | Live seller support conversation/message/rating where permitted. Customer-order messaging without its route is unavailable and never exposes PII. |
| 282–291 | Team | Read-only team members and role data are live where `team.read` is granted; invitation, role and member mutations remain capability-unavailable. |
| 292–296 | Account and security | Live seller session list/current/all logout where implemented. Profile, 2FA and other unavailable security mutations are fail closed; bundled legal/help remains read-only. |

Every ID remains traceable through the existing 296-row matrix, the bundled catalog copied as test-only traceability data, and one native route, modal, sheet or state family. A non-live ID must display an explicit unavailable/error treatment rather than a fake action.

The reconciled inventory distinguishes catalog identity from launch scope: the matrix has 296 references, 32 distinct Android route identities, 190 included canonical runtime states, 106 accepted fail-closed exclusions and 19 distinct route identities among the included launch states. These values must not be collapsed into a claim of 296 separate screens.

## Local API and session contract

The Android debug application connects only to the explicit local emulator bridge URL `http://10.0.2.2:5001/`. Release builds have no mock provider and require an explicit non-empty API configuration before a client is created. The server mounts seller routes only when both `SELLER_API_V1_ENABLED=true` and `SELLER_API_V1_LOCAL_ONLY=true` are present; its seller token key is required at runtime and is never stored in source, Android resources, logs, or documentation.

The new seller auth boundary uses the existing core user password hash only to authenticate an already-active seller membership. It never turns a customer or admin role into seller authority. It issues audience `seller` access tokens, persists only SHA-256 refresh-token hashes through the accepted seller refresh-family schema, serializes refresh requests on Android, and clears the encrypted local session on logout, replay, revocation, expiration, audience failure, or tenant-context failure.

Server-owned membership, organization and store resolution remains authoritative. Client IDs, navigation arguments, cached records and UI permissions are not authorization inputs. Cache keys are partitioned by live organization, membership and store context and cleared on context change/logout.

## Native visual system and source reuse

The source package has no reusable Android layout/component source. Its 13 exact shared illustration files are copied unchanged into `seller-app` resources; its SVG and PNG files remain visual measurement and acceptance sources, never static full-screen production UI. The owner-supplied NovaStore mark is copied byte-for-byte to `seller-app/src/main/res/drawable-nodpi/novastore_logo.png` with SHA-256 `9024bd039e12e67fabe4c7e4614e86345a14bcf8bb8a7b5502c0f71d3fb3d872` and is rendered with `ContentScale.Fit`, without crop, tint or redraw. Native Compose components centralize the measured ivory background, navy text, NovaStore orange action gradient, rounded white cards, fine borders, soft shadows, chips, sheets, safe areas and the five-item bottom navigation.

The navigation labels are exactly `Genel Bakış`, `Ürünler`, `Siparişler`, `Finans` and `Mağazam`. The selected item has one unclipped orange bubble, rim/highlight and shadow; the outgoing selection flattens before another bubble is shown. A stock Material `NavigationBar` indicator is not an acceptance substitute.

All visible text preserves Turkish characters. Controls expose content descriptions, a 48 dp minimum touch target, focus order, text-scaling-safe layouts and accessible selected/error announcements.

## State and security rules

Every live data screen provides initial loading, content, empty, recoverable error, non-recoverable error, offline, unauthorized, feature-disabled, refreshing, mutation-in-progress, mutation-failure and retry states. Mutations have an idempotency key, disabled in-flight action and server refresh after success or revision conflict. No token, full address, payment data, full bank data, unmasked PII or cross-tenant cached data is displayed or logged.

Launch defaults are binding: return decision, negative inventory, backorder, seller canonical-catalog edits and payout initiation are not enabled in UI or created in backend routes.

## Visual, functional and release gates

Visual UAT uses the binding package at the same phone profile, locale, density and font scale. Each launch screen has a native emulator capture and its canonical ID. Active representative IDs `001, 055, 057, 066, 069, 074, 089, 124, 142, 156, 185, 243, 276, 282, 292` are compared side-by-side and with overlay/pixel-difference evidence. The previous fail-closed representatives remain excluded: `027→057`, `205→066`, `223→089`, `257→069`, and effective fail-closed customer messaging `271→276`. These replacements preserve design/navigation families without enabling an unavailable capability. Acceptance requires no structural/layout/asset/bottom-navigation mismatch and at most 5% non-transparent pixel delta after status-bar and platform-font antialiasing masks; any material typography, spacing, color or state mismatch fails.

Functional UAT uses synthetic organizations and stores in a disposable loopback PostgreSQL database, the explicit local seller flags and an Android emulator. It proves login, context resolution, dashboard, permitted store/offer/inventory/order/support paths, finance read, logout/revocation, offline retry, cross-tenant denial and disabled capabilities. No remote service, remote database, production data or mock release provider may be used.

## Explicit exclusions

Tablet work, customer/admin module changes, remote service access, production deployment, push, PR, merge, onboarding creation, OTP/2FA enrollment, campaign mutations, notification writes, team mutations, offer media upload, return decisions, payout initiation, negative stock, backorder and full delivery-address display are excluded.
