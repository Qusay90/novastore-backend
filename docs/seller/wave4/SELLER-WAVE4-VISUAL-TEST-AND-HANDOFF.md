# Seller Wave 4 — Visual Test and PC1 Handoff Record

## Required evidence method

The local canonical handoff package is verified before use. Native emulator captures use the canonical phone portrait profile and Turkish locale. The evidence index records source PNG, runtime screenshot, side-by-side comparison, overlay/pixel-difference output, interaction capture and result for every launch screen/state.

Active representative full-resolution visual gates are IDs `001, 055, 057, 066, 069, 074, 089, 124, 142, 156, 185, 243, 276, 282, 292`. The remaining IDs are covered by the exact catalog traceability test and an appropriate native route/state capture. Structural mismatch, missing supplied asset, wrong bottom-navigation bubble/shine behavior or generic Material substitution is an immediate failure. The current comparer applies no pixel mask: the full normalized frame delta must not exceed 5%, including status-bar and platform font-antialiasing differences.

The animation evidence set covers bottom-tab transition, dialog/sheet, loading-to-content, error-to-retry, context switch and session revocation/logout. Accessibility evidence covers content descriptions, 48 dp targets, text scaling, focus order, contrast, error announcement and selected tab announcement.

## Functional evidence matrix

Local-only UAT uses an explicit local seller feature flag, a disposable loopback PostgreSQL database and synthetic seller data. It exercises seller login, context resolution, dashboard, permitted store/offer/inventory/order/support operations, finance read, logout, session revocation, offline/retry, cross-tenant denial and every disabled capability. No remote endpoint, remote database, production data, token or secret is permitted.

## PC1 handoff template

Status after all gates: `MERGE_READY_FOR_PC1_REVIEW` only. This record is updated in the final evidence commit with:

1. Starting/final SHA and ordered Wave 4 commits.
2. Exact integration and PC1 merge order.
3. Migration/registry statement, feature flags and local verification commands.
4. Android build variants and screen/API coverage matrix.
5. Visual evidence index and intentional launch exclusions.
6. Security findings/resolutions, test/build results and residual risks.
7. Rollback/forward-recovery steps and conflict-sensitive files.
8. Confirmation that customer/admin work was not altered outside compatibility verification.

No statement in this file may claim merge, PC1 acceptance, deployment, push or PR creation.

## Recovery execution record — 9 August 2026

Status: `PARTIAL_NOT_READY_FOR_PC1_REVIEW`.

### Git identity and regression correction

Starting SHA: `8d591c2c477b3ed3d06180772f86985a5178896c`.

The accepted parent `84a3f96d335b54ce8d5837223a0f4c2f745286af` was checked in a temporary detached worktree. `node tests/sellerF1NoRegressionSmoke.js` failed there with the same obsolete literal `server.js` assertion as at the starting SHA. The temporary worktree was removed after the comparison. Commit `3aef77b8050653aca384d2cabd7535ab1fc0e5c3` replaces only that stale assertion with the accepted two-local-flags plus named-loopback-database startup invariant; it does not weaken default-off, customer/admin isolation or no-remote-database protection.

The final handoff SHA is necessarily the Git object containing this document and is recorded by the post-commit verification/report, rather than self-declared in its own content. No history rewrite, push, PR, merge or deployment is part of this record.

### Canonical reference accounting

The binding archive remains verified: 296 phone PNG references, 194 full-screen SVG design sources, 13 supplied shared PNGs, matching manifest/catalog and no tablet scope. `SELLER-WAVE4-CANONICAL-SCREEN-MATRIX.tsv` is the exact 296-row record. It contains no `UNKNOWN`, `TBD` or `UNMAPPED` value and validates these totals:

| Measure | Count |
| --- | ---: |
| References | 296 |
| Derived Android route identities | 32 |
| Included canonical runtime states | 190 |
| Repeated variants | 0 |
| Accepted fail-closed exclusions | 106 |
| Helpers represented as runtime rows | 0 |
| Reconciliation | 296 / 296 |

The included-state categories are A=1, B=133, C=25 and E=31. `SELLER-WAVE4-EXCLUSION-AUDIT.tsv` expands every retained G row to a binding contract, screen-backend matrix and source-catalog locator. The 106 G rows are only accepted disabled password-recovery/challenge, onboarding/verification, analytics/campaign, notification and team-mutation surfaces; they remain fail closed rather than being represented as enabled placeholder actions. References 021 and 022 are now native session-expired/logout state families, while 282, 286, 288 and 289 are read-only `team.read` routing surfaces. The matrix records each route, component, API/local-state dependency, required action, test id and reserved screenshot/overlay location.

### Real local API and runtime evidence

The isolated seller module now routes dashboard, offer list, inventory, orders, finance summary, store, context, support conversations and live-session list through the accepted `/api/seller/v1` Retrofit boundary. It has no mock provider, fabricated dashboard total, fabricated inventory/order/finance/support content or release mock route. Security actions use existing local live-session logout endpoints; context and API calls still derive authority server-side.

Final local review found and closed the Android response-shape and session-action defects before the API-flow commit: variable list/object responses now use `JsonElement`; array/nested values render only structural safe rows; top-level sensitive field names are redacted; a second store-request `401` refreshes and retries; and “all sessions” revokes both other sessions and the current session before encrypted local state is cleared. The related Android unit and Wave 4 contract checks pass. The review closes HIGH=0 and MEDIUM=0; a future per-endpoint display-field allowlist is a non-blocking hardening recommendation.

A new loopback-only disposable PostgreSQL UAT proved `server.js` mount/authentication, seller login, refresh rotation, refresh replay revocation, re-login/logout, audit/outbox records and refresh-token redaction. It used synthetic fixtures, an in-memory password, `127.0.0.1`, a new official PostgreSQL container and explicit cleanup. F1 migration integration (fresh apply, second apply, constraints/triggers and rollback) and Wave 3 tenant/inventory/order/finance/support integration also passed with their approved disposable database prefixes and cleanup.

### Android verification and remaining visual gate

The dedicated `novastore-seller-wave4-uat` AVD completed three instrumentation tests with zero failures: isolated package launch, package separation and the debug-only deterministic state harness. The harness is compile-time disabled in release builds. Offline unit tests, debug build, release build and lint also passed. Lint reports the pre-existing `OldTargetApi` warning for `targetSdk = 35`; no build configuration was changed in this recovery.

The canonical visual gate is **not** passed. The automatic local AVD evidence for login reference `001` is real and reproducible at `artifacts/seller-wave4/visual/001-runtime-raw.png`, `001-side-by-side.png`, `001-overlay.png` and `001-diff.json`. Its normalized pixel delta is `18.1558%`, above the binding `5%` gate. The test-only team-state capture for `282` is separately recorded with the same file names prefixed `282-` and measures `23.7256%` after the final debug APK installation. The side-by-side comparisons show a material header/back-action, supplied-brand-mark, form-geometry, content-hierarchy and team-card mismatch. The bubble now has an explicit lifted selected state, rim, highlight gradient, shadow, 50 dp target and selected semantics, but no ordered canonical transition evidence exists yet. Accessibility is therefore only partially covered by existing labels/roles and the test harness, rather than a canonical-route runtime audit.

### Regression commands and local-only boundary

Passing local checks include all F0B document/matrix/security smoke tests; the F1 policy, tenant, session, audit/outbox, migration, registry and startup guards; Wave 3 contract/business boundary tests; Wave 4 auth/mobile contract tests; customer/admin compatibility tests; Android unit/instrumentation/lint/debug/release tasks; and F1, Wave 3 and Wave 4 disposable PostgreSQL checks described above. The startup safety test now accepts only an explicit loopback seller-test connection, rejects protected port 55432 and never infers a PC1 target. `git diff --check` is required before every commit.

The debug bridge is `http://10.0.2.2:5001/` only for the dedicated emulator. Production/staging systems, remote databases, provider APIs, email, `.env` values and customer/admin source were not accessed or changed.

### Integration, recovery and conflict-sensitive paths

Integration order is: accepted F0A–F1F and Wave 3 foundation, baseline regression correction, isolated Android real-read routing, then this canonical-matrix/handoff evidence. There are no new migrations or dependencies. Seller runtime requires both local-only seller feature flags and the existing named loopback-database startup guard; finance/write capabilities remain server controlled.

For local rollback, revert the ordered Wave 4 commits in reverse order after preserving this evidence; do not reset or rewrite shared history. Forward recovery is to restore the canonical 296-state Compose implementation and repeat the complete local visual/API UAT before taking a new handoff. Conflict-sensitive files are the Wave 4 allowlist, canonical matrix, `SellerApp.kt`, `SellerViewModel.kt`, `SellerRepository.kt`, `SellerModels.kt`, `SellerApi.kt` and seller Android tests.

PC1 is not merge-ready. The critical path is canonical native implementation and visual proof for the 190 included states, complete route-level instrumentation, real Android business E2E and the required accessibility/bottom-navigation evidence. No push, PR, merge, deployment, migration rewrite or customer/admin source modification occurred.

## Route binding and visual recovery continuation — 9 August 2026

Status remains `PARTIAL_NOT_READY_FOR_PC1_REVIEW`. This continuation began from
`0c75e82a6bda1f3e572a259e0cd4575b3cfdd4c6` with a clean seller worktree and
index.

### Brand-asset evidence

The required local-only asset search covered the seller handoff archive (all
194 full-screen SVG design sources and 13 supplied PNGs), seller resources, customer Android
resources, shared drawable/mipmap/assets paths, frontend static assets and
filename/XML matches for `novastore`, `nova`, `logo`, `brand`, `mark`,
`app_icon`, `launcher` and `symbol`.

The supplied handoff has no standalone NovaStore mark. The exact existing
official repository asset `frontend/novastore-logo.png` was selected and
copied byte-for-byte to
`seller-app/src/main/res/drawable-nodpi/novastore_logo.png` (SHA-256
`52F4E7327031113265ED809BCFFB5C91F2D39A2FBB0CEBAF11FBDD199011B788`). It is
used by the seller login screen. This is an official reusable asset, not a
cropped reference, generated mark or generic replacement. Its composition is
not identical to the binding login mark, so it does not by itself close the
visual gate.

### Canonical capture records

The visual runner now writes route, semantic-marker and fixture evidence
before it is allowed to create a score.

| Reference | Expected route | Route | Marker/fixture result | Capture status | Visual result |
| --- | --- | --- | --- | --- | --- |
| 001 | `seller://auth/login` | matched | all required login markers found | `YES` | `FAIL`, 22.1158% delta; hierarchy is improved but still structurally/visually incomplete |
| 282 | `seller://team` | matched | `seller-team-fixture-v1` present, all three required Team markers absent | `NO` | `INVALID_CAPTURE_WRONG_RUNTIME_ROUTE`; no score is accepted |

The previous numeric `282` comparison is superseded by the invalid capture
record. A temporary diagnostic image without the marker precondition is not
canonical evidence and is excluded from all totals.

The recovery introduced a production `loadTeam()` data path that reads the
accepted `/api/seller/v1/team/members`, context and role endpoints; it does
not use the reference names as production data. The debug-only fixture uses
owner/manager/operator roles and is compile-time unavailable in release.
The Team invite action remains disabled/read-only by contract.

### Shared-component and test results

The seller shell now constrains its content area to full width, login uses the
measured rounded top bar/form/card/footer family and official asset, and the
Team screen has context, role, member, security and disabled-invite native
components. Bottom-navigation bubble rendering exists but has no valid
canonical transition capture, so bubble/shine remains incomplete.

Passing local checks in this continuation are: all F0B smoke tests; Wave 4
mobile/auth tests; customer/admin compatibility tests; F1 policy/session/audit
and migration guards; Wave 3 contract/business tests; real fresh/second-apply
and cleanup evidence for F1 and Wave 3 on a new `127.0.0.1` disposable
PostgreSQL container; Android debug/release builds; debug lint; Android unit
tests; and five instrumentation tests. The disposable database used only
synthetic data, a generated in-memory password, approved seller test prefixes
and was removed after the run. No PC1 container, database or connection was
used.

Open acceptance work is deliberate and evidenced: fix the 282 runtime
semantic/render mismatch before scoring it; reduce the 001 structural delta;
then implement and validate the remaining launch families, state variants,
accessibility audit, bottom-navigation transitions and at least 30 valid
canonical visual states. Therefore no PC1 merge-ready statement is valid.

## Launch, fixed chrome and binding-brand correction â€” 9 August 2026

Status remains `PARTIAL_NOT_READY_FOR_PC1_REVIEW`.

### Launch trace and correction

The rejected full-screen `Genel Bakış`/home-icon view was not a binding seller
screen and was not Android platform splash content. It was the first
`SellerNavigationItem`: its unconstrained `widthIn`/`heightIn` container let
the child `fillMaxSize()` consume the shell, leaving the real content at zero
height. The primitive now uses fixed `72 dp × 60 dp` bounds, so all five tabs
render and the content area remains available.

Cold launch evidence after `pm clear` on the isolated UAT AVD is recorded in
`artifacts/seller-wave4/visual/launch-no-session-0500ms.png`,
`launch-no-session-3500ms.png` and `launch-no-session-11500ms.png`.

| Screen | Route/composable | Duration | Source | Release-visible | Binding accepted |
| --- | --- | ---: | --- | --- | --- |
| Minimal Android platform splash | platform launch window | 0.5 s sample | Android platform | yes | yes; no seller home icon |
| Seller login | `seller://auth/login` / `SellerLogin` | visible by 3.5 s; `Displayed` at 3.975 s | `SellerMainActivity.kt`, `SellerApp.kt` | yes | route/state yes |

The final accessibility dump found `seller://auth/login` and no `Genel Bakış`
placeholder. The no-session instrumentation check also clears the seller-only
encrypted store and rejects a dashboard route. The test harness remains
compile-time disabled in a release build; its canonical-state flag cannot
become a release launch route.

### Shared chrome and scroll verification

`SellerTopAppBar` is the one rounded top-bar primitive used by login, generic
content pages and Team & Permissions: `TOP_BAR_SHARED_SCREEN_COUNT=3`.
It is outside each `LazyColumn`; the shell no longer nests a full-page
`verticalScroll` around the Team list.

`SellerCanonicalCaptureInstrumentationTest` passes its six checks on the
isolated AVD. It verifies a fixed Y position plus visible title/back action
while lower login-family and Team content moves, captures before/after PNGs,
and separately verifies that the login field requests the system IME. A
test-harness-only offscreen scroll tail makes the structurally identical login
`LazyColumn` scrollable for this assertion; it is gated by the debug-only
canonical-state intent and absent from release output. The manifest also uses
`adjustResize` for normal IME-safe application layout.

### Binding brand search

The existing circular/cart logo is rejected. No locally supplied file matches
the simple navy/orange `N` mark in reference 001, and the source reference was
not cropped, redrawn or generated. The substantive local candidates were:

| Path | Format | Visual description | Matches reference 001 mark |
| --- | --- | --- | --- |
| `seller-app/src/main/res/drawable-nodpi/novastore_logo.png` | PNG | circular/cart NovaStore composition | no |
| `frontend/novastore-logo.png` | PNG | byte-identical circular/cart composition | no |
| seller handoff `source/phone/seller-phone-001*.png` | PNG | complete canonical screen, not a reusable mark | no |
| seller handoff 194 full-screen SVG design sources and 13 supplied PNGs | SVG/PNG | full-screen visual authority plus illustrations; no standalone brand mark | no |

`BRAND_ASSET_GATE=USER_DECISION_REQUIRED`. The incorrect circular/cart asset
is no longer rendered on the login screen, but no replacement mark is claimed
as binding. `CURRENT_CIRCULAR_CART_LOGO_ACCEPTED=NO`.

### Canonical runtime captures after correction

| Reference | Capture validity | State/route result | Pixel delta | Result |
| --- | --- | --- | ---: | --- |
| 001 | yes | empty enabled login, `seller://auth/login`, required markers present | 20.6672% (previous 22.1158%) | structural improvement; visual gate fails pending exact brand asset and remaining geometry work |
| 282 | yes | `seller://team`, `seller-team-fixture-v1`, title/team-management/member markers present | 27.0610% | valid Team capture; visual gate fails |

The 001 footer is fully visible in the closed-form runtime capture and
reachable through the canonical scroll container. Team production code still
uses `loadTeam()` against the accepted local `/team/members`, context and role
reads; the 282 visual capture is intentionally a debug-only synthetic fixture,
so it is not evidence of a live Android API session.

The exact side-by-side, overlay, runtime and JSON records are in
`artifacts/seller-wave4/visual/001-*` and `282-*`. Local checks rerun in this
continuation passed: Wave 4 auth/mobile, all F0B checks, admin compatibility,
and the focused six-test canonical Android instrumentation class. No remote
service, PC1 database, push, PR, merge or deployment was used.

## Real Android API, shared visual system and batch UAT — 13 August 2026

Status: `PARTIAL_NOT_READY_FOR_PC1_REVIEW`. This continuation started from
`a857f44fcfd1232685e74b92c971ef08e9647512` with a clean seller worktree and
index. The final SHA is reported after the local commits; it is not
self-declared in this document.

### Reconciled scope and exact owner asset

The current matrix reconciles 296 references into 32 distinct Android route
identities, 190 included canonical runtime states and 106 accepted fail-closed
exclusions. The 190 included states use 19 distinct route identities. The
remaining references are state and interaction variants, not additional
standalone screens.

The owner-supplied 1254 x 1254 ARGB PNG was copied byte-for-byte to
`seller-app/src/main/res/drawable-nodpi/novastore_logo.png`. Its SHA-256 is
`9024bd039e12e67fabe4c7e4614e86345a14bcf8bb8a7b5502c0f71d3fb3d872`.
Login and dashboard consume the asset with `ContentScale.Fit`; there is no
crop, tint, redraw, AI generation or screenshot-derived asset. The previous
circular/cart candidate is superseded.

### Real Android to real local API evidence

The dedicated seller AVD exercised the normal accessibility-driven Android UI,
ViewModel, repository, Retrofit client, `/api/seller/v1` middleware and
tenant-safe services against synthetic data in a new disposable PostgreSQL
container bound only to `127.0.0.1`. It covered these 11 UI route identities:
login/session, dashboard, offer/catalog list, inventory, orders, finance,
store, context, team, security sessions and support. Reference 282 rendered
the three synthetic live role rows after real `/team/members` and role/context
HTTP requests. No repository or ViewModel injection was used for this E2E.

The local execution observed valid-session cold launch, no login flash, access-token
expiry followed by one successful refresh, revoked-session fail-closed and
refresh-family replay fail-closed. The redacted trace contains only HTTP
method, seller-relative path and status. The machine-readable result reports
70 actual requests and two real Android instrumentation runs. The generated
password remained in memory; no `.env`, remote database, provider or PC1
resource was used. Device state, container and temporary storage cleanup all
passed. Evidence is under the local Git-ignored
`artifacts/seller-wave4/visual/real-api/` directory and is not part of these
commits. The opted-in Android instrumentation path is committed, but the
one-off container/server orchestrator is not; therefore this observation does
not qualify as independently reproducible PC1 evidence and is not a
merge-readiness claim.

This is a material real-read/session expansion, but it is not complete mobile
business E2E. Store/offer/inventory/order/support write paths, conflicts and
cross-tenant denials remain proven at the backend disposable-DB layer rather
than through every Android UI mutation.

### High-throughput capture and visual result

The parameterized debug-only harness captured these current-source families:
dashboard `055-073`, store `243-251`, and team `282, 286, 288, 289`. All 32
rows passed route, marker, fixture, UI-idle and wrong-context gates. This adds
31 distinct canonical states to the previously accepted two-state baseline
because reference 282 overlaps that baseline, for 33/190 cumulative distinct
capture-valid states.

Capture validity is not visual acceptance. At the binding 5% threshold, 0/32
batch comparisons passed: mean delta 33.0535%, minimum 14.9320% and maximum
59.9168%. Current reference 001 is 18.9631%; masking only the exact logo box
still yields 18.7199%, so its non-brand structure fails. Current reference 282
is 28.5733%. The local, Git-ignored full summary is
`artifacts/seller-wave4/visual/high-throughput-visual-summary.json`, with a
runtime, side-by-side, overlay, capture JSON and diff JSON for each reference.
Those generated files support this execution report but are not durable
committed evidence for an independent PC1 reviewer.

### Shared visual root-cause inventory

| Root cause | Shared primitive | Measured affected state count | Severity |
| --- | --- | ---: | --- |
| Canvas and safe-area placement differ from canonical frames | seller shell / `SellerVisualTokens` | 32/32 batch states | high |
| App-bar height, radius and title geometry are not family-exact | `SellerTopAppBar` | 32/32 | high |
| One global page inset and vertical rhythm is applied to distinct families | shell and family layout tokens | 32/32 | high |
| Typography scale, weight and line height remain oversized in dense screens | shared text styles | 32/32 | high |
| Generic hero/data cards replace binding graph, list, form and policy structures | `CanonicalFamilyPage`, `SellerHeroCard`, `SellerDataCard` | 29/32 | high |
| Form field, radio and policy geometries are not reconstructed per binding family | field/form primitives | 7/32 | high |
| CTA height/radius/position and outlined actions are not family-exact | `SellerPrimaryButton` and action rows | 24/32 | high |
| Loading/error/offline variants exist but do not cover every mutation/conflict family | shared state surfaces | 3/32 measured plus generic state rows | medium |
| Selected-tab endpoints are correct, but no intermediate animation frame is captured | `SellerBottomNavigation` / `SellerNavigationItem` | 5/5 root tabs | medium |
| Small muted/orange/white-on-orange text falls below 4.5:1 in measured combinations | shared color/type tokens | all families using those tokens | medium |
| Some canonical fixture affordances expose inert button/chevron/info semantics | button, list-row and app-bar primitives | multiple batch families | medium |

These findings explain why token consolidation and route correctness did not
produce canonical parity. Further screen-specific margin tuning without the
missing family structures is not an acceptable closure strategy.

### Bottom navigation and accessibility

All five current static captures pass exact route, single-selected semantics
and capture validity. Dashboard uses the binding pale-peach selected family;
Products, Orders, Finance and Store use the elevated orange gradient, white
icon, rim, shadow and shine family without clipping. A real same-activity tab
click produces distinct before/mid/after files. The bottom 400 px changes
13.289120% from before to mid and 13.291204% from before to after, but mid to
after is 0%; therefore endpoint/state evidence passes while intermediate
deflate/inflate motion remains unproven. The combined bubble/shine result is
`PARTIAL`.

Accessibility remains `FAIL`, not a deferred pass. Navigation targets are at
least 48 dp and expose `Role.Tab` plus selected state, but measured small-text
contrast combinations range from 2.583:1 to 4.025:1, below 4.5:1. Inert
canonical-fixture button, info and chevron affordances also prevent a complete
keyboard/screen-reader claim.

### Regression and handoff state

Passing checks include the full seller F0B/F1/Wave 3/Wave 4 static suite,
customer/admin compatibility, F1 migration guard-only checks, four real
disposable PostgreSQL runs (F1 migration, F1 persistence, Wave 3 business
isolation and startup safety), 12 discovered Android instrumentation tests
with the explicit real-API case safely skipped in the generic suite, two
separate opted-in real-API instrumentation runs, Android unit tests, debug
lint, debug APK and release APK. Security re-review is `PASS` with no open
HIGH or MEDIUM security finding. Disposable containers and storage were
removed.

PC1 remains not ready because the 32-state visual gate is 0/32, 001 and 282
remain above threshold, accessibility fails, intermediate bottom-navigation
motion is unproven and Android mutation E2E is incomplete. No push, PR, merge,
deployment, remote service, migration, package/lock or customer/admin source
change occurred.

## Representative family reconstruction continuation — 13 August 2026

This section supersedes the earlier Wave 4 observations where the current
source and current AVD evidence differ. It does not turn a failed visual gate
into a pass.

### Binding family map and current representative result

The universal final-body use of `ContentPage`, `SellerHeroCard` and
`SellerDataCard` was decomposed for the representative set. Those components
remain only as legacy/fallback or debug-state primitives. The representative
runtime now dispatches through `SellerRepresentativeFamilyScreen` to the
binding-derived Auth, Dashboard, Offer, Inventory, Order List, Order Detail,
Finance, Store, Team, Security, Seller Support and Capability-Unavailable
families.

| Ref | Route | Family / state | Runtime dependency | Current implementation | Binding structure status | Current delta | Result |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| 001 | `seller://auth/login` | Auth / default | real login API | `SellerLogin` | PARTIAL | 19.3674% | FAIL |
| 027 | `seller://onboarding/store-identity` | Onboarding / capability unavailable | local fail-closed | `CapabilityUnavailableFamily` | FAIL | 23.7667% | FAIL |
| 055 | `seller://dashboard` | Dashboard / populated | real dashboard API or deterministic canonical fixture | `DashboardFamily` | PARTIAL | 37.1573% | FAIL |
| 074 | `seller://offers` | Catalog and offers / list | real offers API or deterministic canonical fixture | `OfferListFamily` | PARTIAL | 26.0886% | FAIL |
| 124 | `seller://inventory` | Inventory / summary | real inventory API or deterministic canonical fixture | `InventoryFamily` | PARTIAL | 26.7893% | FAIL |
| 142 | `seller://orders` | Orders / list | real orders API or deterministic canonical fixture | `OrderListFamily` | PARTIAL | 23.6677% | FAIL |
| 156 | `seller://orders/detail` | Fulfillment / order detail | deterministic canonical fixture; live detail route remains unproven | `OrderDetailFamily` | PARTIAL | 28.6960% | FAIL |
| 185 | `seller://finance` | Finance / summary and ledger | real finance API or deterministic canonical fixture | `FinanceFamily` | PARTIAL | 45.3216% | FAIL |
| 205 | `seller://analytics` | Analytics / capability unavailable | local fail-closed | `CapabilityUnavailableFamily` | FAIL | 30.6810% | FAIL |
| 223 | `seller://campaigns` | Campaigns / capability unavailable | local fail-closed | `CapabilityUnavailableFamily` | FAIL | 30.3287% | FAIL |
| 243 | `seller://store` | Store / overview | real store API or deterministic canonical fixture | `StoreFamily` | PARTIAL | 29.8535% | FAIL |
| 257 | `seller://notifications` | Notifications / capability unavailable | local fail-closed | `CapabilityUnavailableFamily` | FAIL | 25.9429% | FAIL |
| 271 | `seller://support` | Customer messages / capability unavailable | local fail-closed; seller support API is not reused | `CapabilityUnavailableFamily` | FAIL | 31.3116% | FAIL |
| 282 | `seller://team` | Team and RBAC / member list | real team API or deterministic canonical fixture | `TeamFamily` | PARTIAL | 28.2215% | FAIL |
| 292 | `seller://settings/security` | Account security / session center | real sessions API or deterministic canonical fixture | `SecurityFamily` | PARTIAL | 27.9955% | FAIL |

All 15 current-source captures pass route, state, fixture, marker, wrong-context
and two-frame application-region stability validation. Strict visual acceptance
remains 0/15. The mean representative delta is 29.0126%, minimum 19.3674%
and maximum 45.3216%. The execution produced 15 current captures, of which
11 are net-new canonical IDs beyond the accepted 33-state baseline; cumulative
distinct capture-valid coverage is therefore 44/190. No additional family was
expanded after the representative threshold failed.

### Shared primitive corrections

| Primitive | Binding evidence | Previous behavior | Current behavior | Representative refs | Canonical fanout |
| --- | --- | --- | --- | --- | ---: |
| Family shell | 055, 243, 282 and the remaining representative sources | one generic hero/data-card body | family-specific top bar/header, context, hero, metric, row, guardrail and action composition | 055, 074, 124, 142, 156, 185, 243, 282, 292 | 15 representative gates plus default production family routes; non-representative debug fixtures remain separate |
| App bar and insets | 001, 243, 282 | one global page inset and oversized generic app bar | auth plus family-specific fixed rounded bars and family list insets | all 15 | all representative families |
| Action and row semantics | list, store, team, security and support references | inert info, chevron and CTA affordances | real action, explicit disabled/read-only semantics, or no interactive affordance | all 15 | shared primitive users |
| Text contrast | small labels across 001, 055, 243 and 282 | measured 2.583:1–4.025:1 combinations | muted `#52657D`, orange text `#A93600`, accessible actions `#B13200`→`#902A00` | all 15 | shared text/action users |
| Bottom navigation | 055, 074, 142, 185 and 243 | endpoint-only state with no proven midpoint | 720 ms scale/lift/alpha/shadow/rim/shine transition and T0/T25/T50/T75/T100 evidence | 055, 074, 142, 185, 243 | five root tabs |

The lowest measured normal-text ratio in the changed shared combinations is
5.433:1 (`#52657D` on `#EDF5FF`). Orange text and white action text combinations
measure from 5.626:1 to 8.343:1. Contrast therefore passes the 4.5:1 normal-text
gate. This accessibility correction is intentionally not hidden by a visual
mask; it contributes to the still-failing canonical deltas. The owner visual
versus accessibility conflict remains visible at the visual acceptance gate.

The selected navigation foreground no longer interpolates through
low-contrast intermediate colors. Selected non-dashboard tabs keep white text
on the accessible dark-orange surface while scale, lift, shadow, rim and shine
animate; unselected tabs keep navy on white. Login pre-auth actions, section
header actions and unavailable offer creation now expose explicit disabled or
read-only semantics. Production API pages never substitute canonical demo
members, store names, roles, order identifiers or finance totals; canonical
copy is restricted to `SellerPageSource.CANONICAL_FIXTURE`.

The focused `closedAffordancesExposeDisabledReadOnlySemantics` instrumentation
test passed on `novastore-seller-wave4-uat`. It inspects the real Compose
accessibility tree for the three disabled pre-auth actions, the read-only
dashboard section action and the unavailable offer-creation action, and
requires every node to be disabled and non-clickable. The finance parser unit
test also requires integral minor units and rejects fractional or out-of-range
JSON numbers rather than truncating them.

### Real Android mutation and motion evidence

The opted-in Android instrumentation now drives only visible UI controls. It
does not call a ViewModel or repository method directly. Against an official
local PostgreSQL image in a loopback-only disposable container, it passed:

* store update and protected-field denial;
* offer update and canonical-product-field denial;
* inventory update, negative-stock denial, stale revision and one-winner
  concurrent conflict;
* allowed order transition, invalid transition and stale transition;
* seller-support create/send, idempotent retry and cross-tenant safe not-found;
* logout-all followed by current-session logout.

Observed safe HTTP outcomes include `200` for permitted mutations, `400` for
protected-field validation, `409` for inventory/order safety conflicts, `404`
for the cross-tenant support target and `200` for both logout operations. Empty
seller-support and empty security-session lists retain valid content surfaces
so creation/revocation actions are not incorrectly hidden by a generic empty
route.

The five static bottom-navigation states pass. A real same-activity
Dashboard-to-Store click produced current-source T0, T25, T50, T75 and T100
artifacts. The bottom 400 px differs by 31.776620% from T0 to T25 and by
9.997222% from T25 to T100; T50/T75/T100 are the stable endpoint. T25 is thus
a real intermediate frame materially different from both endpoints, not a
fabricated midpoint. All five labels remain rendered in that frame. The
combined bottom-navigation motion gate is now `PASS`.

### Route identity classification

The canonical matrix remains 32 route identities, 190 included runtime states
and 106 fail-closed exclusions. Classification uses the strictest dependency
of every route identity: 19 identities are `REAL_API_REQUIRED`, 13 are
`FAIL_CLOSED_EXCLUSION`, and no distinct identity is purely `LOCAL_UI_STATE`
or `NAVIGATION_ONLY` once all variants under that identity are considered.
Eleven of the 19 real-API-required identities have current Android-to-HTTP
proof. The remaining eight are offers batch/detail/editor, order detail,
order fulfillment, returns, finance payout accounts and store reputation.

### Historical generated-artifact index (superseded)

Generated PNG/JSON evidence remains excluded by repository policy
(`.gitignore` entry `artifacts/`). It was not force-added. The following
committed hash index makes the exact local evidence set identifiable, but the
binary set itself is not independently retrievable from Git; durable evidence
therefore remains `PARTIAL`, not PC1-complete. Paths are deterministic:
`artifacts/seller-wave4/visual/<ref>-runtime.png`,
`<ref>-side-by-side.png`, `<ref>-overlay.png` and `<ref>-diff.json`.

`HISTORICAL_DURABLE_EVIDENCE_GATE: SUPERSEDED_BY_BOUNDED_DOCS_EVIDENCE_BELOW`

Build identity: starting source `5949eb9e925cbf249dc0262721bfd8143a3b841d`
plus the local Wave 4 diff described by the commits that contain this section.
AVD: `novastore-seller-wave4-uat`, serial `emulator-5554`, phone profile,
Turkish locale, current capture source 13 August 2026.

| Ref | Delta | Gate | Runtime SHA-256 | Side-by-side SHA-256 | Overlay SHA-256 | Diff JSON SHA-256 |
| --- | ---: | --- | --- | --- | --- | --- |
| 001 | 19.3674% | FAIL | 3fca3afec2720278f67cb7f3b68fa21047fdd6542efde1bfef58ed42a8e6afcb | 620e1fce996adccbe4e8f66453db19257f90c9fd65d6530d4e32e7df65ba0cf2 | e6ba16d1a6df6e450649175c7e0af1eacb04358aefb93106c3d543bc65afc75d | f6ffdaef746e820d46535191d04ca64238dd25ca420dfef371d5a8114cd2ce28 |
| 027 | 23.7667% | FAIL | 419c9b8c9bd1146846efd0c12a094a804900ce58ffd1a5287c915bba31ee741d | f7551b0ba956c10745713ef5dadb14477de5956e38f4d5370b78c5c124c50efd | 57bff1f183e1cc696da0114ff9e061f3e25c4f9584cf59c767e783932abd2e5c | bcea0d107127617ffea2d26697359f2beb50589f2d0da8b471a8c4b443cb9c29 |
| 055 | 37.1573% | FAIL | 034461d533f95bcb652ba058b509fdcce5aaeda8c00aec80107c6e398625d14f | 87152edde80bb2e3ddb493c0cf54abf215144d8dc91c2c640799e1d7e76ea01e | f0c27f5335cd45661bf5f19fa251bc5f4846713f38a7816cdae97889b5818a4e | c6f028cc7a942dc67948aa845de1fe15a9b7c390d8f7ba7e0d3caa56fc37c701 |
| 074 | 26.0886% | FAIL | 8bd623d837e25110b3a359658cc5416b3ebf21b8eab10188d7c5550c4b3a5d3e | 1159689073ff2245a0bb6cc03d9126fc437686da2bf3cb65be0291499dab9e0d | 1632a805a1b7adf17e31a267c32733d8919f0244ee10f174ef264220662b2fda | fe662fed47ddc2618c671e24aa3b92fefa391a5187bceb34942375a04f6ae222 |
| 124 | 26.7893% | FAIL | d870aaed4975d09928b9d9955864e1d47f8b196df0b1521dcf639ca24042d962 | 84ca2cdf594d93df9c5ca37cd5ef2aaad96d1e25f8ffb20ecc6bb363746f5091 | 836e68a696508ccdcb6da9509d31c0b67b0532072e3ad6c89cc54de19d2c8564 | 80bbced1c09e5bd84ca29f8f1f3f0b936f4e539bc6da83980a0ad85473481013 |
| 142 | 23.6677% | FAIL | 4ec8bf0bad3ee1146ddfc0c51c5c43279153a369572ed8e7f27b5e2eb7067666 | 110e4c0abfb7569d43c2d9bf31862bd7c0290aed1477f25385672719b231e0ae | 6518e7244c02f09157d62e864c72e655206c64509db8e303872889ea2a335461 | 287ecfca480cfa02a6187ab2a8c6082c0194e15ed3e24130ffca09bca8644cc6 |
| 156 | 28.6960% | FAIL | 966cde222b17fedf192dec2285252d6adbe6671f24740e3e84b7c597c050eb1e | 9d3850616472c8e5a0a2272a9700b3591246a257c6849f6d55e67df820b3a822 | db71040e4c51b140e216180c032f65f202e62f4984f46712863395a9812f336e | 132f9bce0b6335442ca0cd4f3c48a8edd215dec8844de972348bb12c89068d2c |
| 185 | 45.3216% | FAIL | 40ce74e0189e0c20878f27a15cb5b218717f8d1435a8d6058869f5d72ffd90de | 6e53797bb6c5a5ad031353d3a8886e639e230463462a7acd77673793220ab509 | f33558347efb141ce4a4b5336db0ad04ef5d565b2504c36f3ed031264f7adef9 | 298f91de65ee3d722584845a0eb9c9ce8daea12c461cad4568b31146f7f4c573 |
| 205 | 30.6810% | FAIL | be3a17a33c931d5ff1b66ef04cb7e9fc0346629758d0bfdc9645b9e6fefcbea6 | c23ea52861a9d6d0f19c749f0f004a5154240b30ecb9bef75dc9e9951ba34ee4 | 020d98a8f1cb738c005c8e51393f06cf81526127ac72c26be296b453c961ac2a | 24b1597e978670c1c2f689794451e8db821954f78ec2cca8baa1c43eaa0ae04a |
| 223 | 30.3287% | FAIL | 49d4cb5390b62a008cad32aa57a80de883dbfb3f1546423fef1d4c5cd0badcd4 | 70d0f35439e1960f8f84537c4f1533f51daa0d757a369923e153e72bc8307ff0 | 8e003390bcc6e8b0a493ae8354dd58dcd321cde31518f6a126226550df35bcfc | 3d5faa8f2051a7479441d446dbea595f4256af16c9d6eb2f480eb6ea921de92f |
| 243 | 29.8535% | FAIL | 165912dcf688e15c99b8358fc7ff2e26043dc017cac1b0346c10e37dcbf243ef | b20199321e3ad146f8bbde7c071c25439317cb6a5949f87c650e0402c66175b0 | 1084cdc63fc8b50327b83fd8dbe2933f9f56a8ba75bc8daefa146c84b27b1e82 | bcabc71c487ff8f47446ce647f5684645a4138ad0e6b43bca8953046d0714357 |
| 257 | 25.9429% | FAIL | a0ccb1f922084e60ad31c607c93e2eb3beea4b44ea53931db71fa97385f6256c | 025b9683e8c5117ba21ebe8c05b559d7a4bf65920fb203c4b3bb322f277ced82 | 4b75beed40e1172417bab418440063987b4d2a1fb12a52a7b2e1a40a34cf5172 | 600ee935d9dd246e5a5a10b57d0a3cfb80f7522b9b3d6839d743d94bad42c5a1 |
| 271 | 31.3116% | FAIL | 1da7efdc64f6e4673f3118b207eea08dba3a9a135eab7a1408183f805444ca56 | a8169c318cda7d2cc0c45e6eebd193553ea2714d9f718aa06cc84aaa988afbe3 | ddb47a3cb5d9e3f18367f117b7b91647e317bbf3c711dac7c84aceab935f6349 | 3f71587174026f1ea93f1e80da134dfa108377cb2b4ac742e44863204cb85dff |
| 282 | 28.2215% | FAIL | daade0466b27200a370655bf6104ae2d5092faf7527b5f6bd8c981d3ef8993dc | 1605e1d53b643988918051330b3c115c53e6b9651c85b887917911f55487fa4f | c3fcd1ddfc0580dd4eb509f04dac6f7b15fc4c63d029f706cc4372938d131183 | a1a7e2cc8b082cd9c24b7bd052c2b9e611be7ebd5c1aea6127eddd8dff230eec |
| 292 | 27.9955% | FAIL | 90b3651b21121dec2b90d228044d84c2bf7943d7e2a72d902a1779f6a6af357f | c188db7611ff1fa4b57649f8c968aa32fa111a0107065f64d49f44b91a224dd7 | d5a080c25b561f2ff6e557a20fd1f41a4abbe06d986cd9a7cc1b6fb690afdad4 | 4f1307981864ac4dc618bbd715b51528b3332e178b8ce04f6b1c1f08515c4713 |

PC1 remains `NOT_READY`: representative visual pass count is 0/15, eight
real-API-required route identities remain without Android HTTP proof, and the
hash index cannot replace the ignored binary evidence set.

## SVG source-of-truth recovery — 13 August 2026

This section supersedes the earlier description of the archived SVG files as
helpers. `SELLER-WAVE4-SVG-SOURCE-MAP.tsv` accounts for all 296 binding phone
references: 194 have a full-screen `852×1846` SVG with viewBox
`0 0 852 1846`, while 102 are PNG-only. Illustration, icon and other helper
SVG counts are all zero. Every PNG and SVG hash is checked against
`PACKAGE_MANIFEST.sha256` before use.

The deterministic local renderer first pins the owner-authorized package
manifest SHA-256, verifies every PNG/SVG/local image resource, and rejects
script, event-handler, animation, external URL and escaping resource content
before starting Edge. The renderer then uses JavaScript disabled, all DNS
resolution blocked, no proxy, background networking disabled, a fresh
per-reference profile, canonical canvas size and device scale one. Pixel classification uses the same RGB
absolute-difference-sum threshold `>36` as the Android visual comparer. Of the
194 full-screen sources, 191 materially reproduce their binding PNG at the
5% gate. References 031 (`24.364188%`), 209 (`5.016684%`) and 271
(`5.280291%`) fail and therefore fall back to their binding PNG authority; no
runtime scope is broadened. Reference 282 passes SVG-to-PNG at `3.158523%` and
its manifest SHA-256 is verified. References 001 and 055 have no surviving
full-screen SVG and use the binding PNG plus normalized region specifications.

The former representative contract mixed enabled screens with deliberate
fail-closed surfaces. The active 15 are now exactly
`001,055,057,066,069,074,089,124,142,156,185,243,276,282,292`. The repair is
`027→057`, `205→066`, `223→089`, `257→069`, and effective fail-closed customer
messaging `271→276`. Every new gate is unique and included. The original
excluded capabilities remain excluded and the 190 included / 106 excluded
accounting is unchanged.

The binding reconciliation record is:

| Old representative ID | Exclusion evidence | New representative ID | Selection reason | Canonical route | Family |
| --- | --- | --- | --- | --- | --- |
| 027 | `EXCLUSION-AUDIT:012-018,023-054`; canonical matrix ref 027 is `EXCLUDED_FAIL_CLOSED` | 057 | Nearest substantial included first-use/post-login root state; onboarding remains excluded | `seller://dashboard` | Dashboard first-use/root |
| 205 | `EXCLUSION-AUDIT:205-222`; canonical matrix ref 205 is `EXCLUDED_FAIL_CLOSED` | 066 | Included live dashboard performance/insight state replaces unavailable analytics without inventing analytics data | `seller://dashboard` | Dashboard performance |
| 223 | `EXCLUSION-AUDIT:223-242`; canonical matrix ref 223 is `EXCLUDED_FAIL_CLOSED` | 089 | Included live offer detail-card/list state is the nearest substantial catalog/promotion visual family | `seller://offers` | Offer listing/catalog |
| 257 | `EXCLUSION-AUDIT:257-270`; canonical matrix ref 257 is `EXCLUDED_FAIL_CLOSED` | 069 | Included dashboard notification-summary state preserves the notification-disclosure family without enabling a notification service | `seller://dashboard` | Dashboard notification summary |
| 271 | Mobile integration contract keeps customer-order messaging unavailable; canonical matrix ref 271 is `LOCAL_CAPABILITY_DISABLED:customer-conversation.read` and `IMPLEMENTED_FAIL_CLOSED_SURFACE` | 276 | Same customer-communication/support flow and route, using the completed read-only support-conversation API | `seller://support` | Customer communication/support |

### Owner-supplied supplemental visual inventory

All nine owner-supplied images are accounted for in
`SELLER-WAVE4-OWNER-SUPPLEMENTAL-REFERENCE-MAP.tsv`. Their bytes match the
already committed Wave 4 evidence files exactly. They comprise one normalized
runtime image, one algorithmic overlay and one canonical/runtime comparison
composite for each of references 001, 055 and 282. The left half of each
side-by-side is pixel-identical to the corresponding binding canonical PNG;
the right half and runtime-only image are the Android result under test. An
overlay or two-panel composite is not a standalone phone state.

The classification is therefore `EXACT_DUPLICATE` of existing durable evidence,
with `SUPERSEDES=NONE` and
`OWNER_SUPPLIED_DUPLICATE_EVIDENCE_NO_SUPERSESSION`. This records the files as
binding owner evidence without treating a generated runtime image as its own
golden source. No image is unknown, unmapped or ignored; no supplemental state
is added and the canonical count remains 296. References 001 and 055 remain
PNG-only. Reference 282 retains its full-screen SVG authority because its SVG
render matches the original binding PNG at `3.158523%`, while the supplied
runtime/overlay/composite files remain evidence of the Android comparison.

Machine-readable specifications under `docs/seller/wave4/spec/` are generated
from SVG XML for active SVG-backed representatives 156, 185, 243, 276, 282 and
292. They include canvas, cards, text, paths, gradients, filters, images,
normalized geometry, package-manifest verification and SVG-render delta.
PNG-only specs 001 and 055 record binding-raster regions and normalized
coordinates. Runtime remains native Compose; no full-screen binding raster or
transparent hotspot is used by the application.

### Golden freeze result retained as owner-supplied historical evidence

The owner supplied the already committed 001, 055 and 282 evidence files back
to this execution. Their bytes remain unchanged and the following table is the
historical comparison represented by those exact attachments. The executable region gate
records each source box, direct region delta, three-pixel edge delta and the
best translation inside a ±12 px diagnostic search. A region passes geometry
only when both translation axes are within 2 px and translated edge delta is at
most 8%. This diagnostic never replaces or lowers the full-screen 5% gate.

| Ref | Source authority | Route/state/fixture | Region geometry | Full-screen delta | Result |
| --- | --- | --- | --- | ---: | --- |
| 001 | PNG-only | PASS | FAIL, 5/5 critical regions fail | 9.6047% | FAIL |
| 055 | PNG-only | PASS | FAIL, 8/8 critical regions fail | 19.8533% | FAIL |
| 282 | verified SVG (`3.158523%` to binding PNG) | PASS | FAIL, 6/9 critical regions fail | 11.2235% | FAIL |

The quantitative remaining blockers are preserved in each durable diff JSON.
The highest-signal examples are:

| Ref/region | Source bounds (x,y,w,h px) | Best translation (x,y px) | Region delta | Translated edge delta | Classification |
| --- | --- | --- | ---: | ---: | --- |
| 001 identifier field | 91,780,668,99 | +5,+6 | 20.6693% | 67.3894% | input border, height and Material field internals |
| 001 password field | 91,983,668,98 | -2,+1 | 13.8030% | 81.6009% | input border/radius and font metrics |
| 001 primary CTA | 52,1306,744,106 | -12,+1 | 23.3706% | 34.6169% | width/edge/shadow and text raster |
| 055 sales hero | 30,314,792,460 | +3,-1 | 14.8603% | 29.0396% | fill/graph/iconography despite near-aligned origin |
| 055 primary CTA | 30,1599,792,64 | +3,+10 | 57.6507% | 40.2353% | vertical placement and edge treatment |
| 055 bottom navigation | 27,1681,798,119 | +12,-5 | 20.7072% | 19.4292% | accepted accessible colors/icons differ from binding raster |
| 282 guardrail | 48,1152,756,112 | -9,-8 | 17.3587% | 32.5986% | border, info affordance and typography |
| 282 bottom navigation | 28,1658,796,152 | +4,+7 | 28.9441% | 29.1047% | accepted accessible nav treatment and platform raster |

Reference 001 retains the owner-approved NovaStore logo, but that accepted
asset does not explain the remaining non-brand field/card/CTA differences.
References 001 and 055 also lack full-screen SVG structure and separate binding
icon/avatar assets. Reference 055 therefore uses the binding PNG without
inventing a portrait or cropping the screen. Reference 282 uses the exact
supplied team illustration. Accessibility-safe orange/nav colors are retained
and recorded as `ACCESSIBILITY_VISUAL_DELTA_EXCEPTION`; no large mask is used.

Golden pass count is `0/3`, so the fail-closed freeze remains active. No visual
capture expansion, family propagation or remaining eight Android real-API
route proofs were started in this recovery. Active representative pass count
remains `0/15`.

### Durable bounded evidence

Repository policy ignores `artifacts/` but does not ignore or prohibit bounded
Wave 4 evidence under `docs/`. The allowlist therefore authorizes only
`docs/seller/wave4/evidence/representative/**`. The current directory contains
exactly the four owner-authorized evidence files for each attempted golden
reference (runtime, side-by-side, overlay and diff JSON), plus one SHA-256
manifest: 13 bounded files in total. Each diff embeds the capture receipt and
binds the unmasked comparison algorithm, source/runtime/capture hashes, pinned
capture-manifest hash and row hash, stable seller APK fingerprint, AVD name,
route, markers, fixture, UI-idle state and wrong-context result. The ignored
local capture manifest is not part of the bounded committed evidence set.
It intentionally contains 3/15 representative sets because the golden freeze
forbids capturing the other twelve after a golden failure.

`DURABLE_EVIDENCE_POLICY: BOUNDED_DOCS_PATH_ALLOWED`

`DURABLE_EVIDENCE_GATE: PARTIAL_3_OF_15_GOLDEN_FAILURES_PERSISTED`

### Post-inventory golden recovery result

After the nine owner files were mapped, none qualified as a newer raw design
source. The latest-owner-wins rule therefore did not supersede a canonical PNG
or the verified 282 SVG. The Android candidate was still rebuilt from native
Compose, installed on `novastore-seller-wave4-uat`, and recaptured for the same
three exact states. The owner-supplied historical files above were not
overwritten; the new comparison is stored separately under
`docs/seller/wave4/evidence/owner-supplemental-recovery/`.

| Ref | Exact route/state evidence | Region geometry | Full-screen delta | Change from historical evidence | Result |
| --- | --- | --- | ---: | ---: | --- |
| 001 | PASS | FAIL, 5/5 critical regions fail | 8.9735% | -0.6312 percentage points | FAIL |
| 055 | PASS | FAIL, 8/8 critical regions fail | 19.2761% | -0.5772 percentage points | FAIL |
| 282 | PASS | FAIL, 6/9 critical regions fail | 10.4813% | -0.7422 percentage points | FAIL |

The follow-up improved all three full-frame deltas without lowering the 5%
threshold. It introduced native login field geometry, source-supported
dashboard icons, fixture-only role copy and family-aware navigation alignment.
An experimental dashboard gradient increased the mismatch and was rejected
before the final capture. The final APK SHA-256 embedded in all three evidence
records is
`9f6912d428112ef3d612ecf8136433d373f9b5b0b1f70b847646e3e9bd82b713`.

The comparison runner also exposed a Turkish-locale edge case in its Android
installed-APK path allowlist. The path contract remains limited to
`/data/app/.../base.apk`, but invalid-character matching is now explicitly
case-sensitive so a valid uppercase `I` cannot be rejected by locale-aware
case folding.

`OWNER_REFERENCE_COUNT: 9`

`REFERENCE_COUNT: 296`

`OWNER_REFERENCE_SUPERSESSION: NONE`

`POST_OWNER_MAP_GOLDEN_PASS_COUNT: 0/3`

`POST_OWNER_MAP_REPRESENTATIVE_EXPANSION: NOT_STARTED_FAIL_CLOSED`

`POST_OWNER_MAP_DURABLE_EVIDENCE_GATE: PARTIAL_3_OF_15_GOLDEN_FAILURES_PERSISTED`

### Runtime-bounds convergence checkpoint — 14 August 2026

The latest native candidate adds schema-v2 capture receipts with an exact
`1080 x 2400` capture canvas and raw accessibility bounds for every committed
layout-spec region. The comparison runner normalizes those bounds to each
binding canvas and keeps the same unmasked full-frame `<=5%` rule plus the
critical-region `<=2 px` bounds and `<=8%` translated-edge rules. Route,
marker, fixture, UI-idle, frame-stability, wrong-context, AVD and installed-APK
hash checks passed for all three fresh local captures. Their generated
comparison artifacts remain under the Git-ignored
`artifacts/seller-wave4/final-convergence-{001,055,282}/` paths and are not
durable PC1 evidence. All three rows below were freshly captured from the same
installed debug APK SHA-256
`68bc490950b6c2cb09fb5ccd10415d2ac6ba8286323e33cd50a2dcd6f48d025f`.

| Ref | Start delta | Current delta | Critical geometry remaining | Change | Result |
| --- | ---: | ---: | --- | ---: | --- |
| 001 | 8.9735% | 7.2439% | `identifier_field`, `password_field`, `primary_cta` (3/5) | -1.7296 pp | FAIL |
| 055 | 19.2761% | 13.4472% | `sales_hero` (1/8) | -5.8289 pp | FAIL |
| 282 | 10.4813% | 9.1824% | `svg_major_09` (1/9) | -1.2989 pp | FAIL |

This is coherent measurable convergence, not visual acceptance. The 055
position-driven task, balance, recent-order, CTA and navigation regions now
pass geometry. Reference 282 now passes eight of nine SVG major regions while
retaining its native 720 ms bottom-navigation motion. Reference 001 now passes
the top bar and form-card critical geometry but retains binding-visible field
and CTA edge differences. Both committed evidence sets under
`docs/seller/wave4/evidence/representative/` and
`owner-supplemental-recovery/` remain immutable owner-supplied historical
evidence. The local schema-v2 convergence measurements do not supersede either
binding/evidence set and cannot be presented as durable visual acceptance.

`FINAL_CONVERGENCE_GOLDEN_PASS_COUNT: 0/3`

`FINAL_CONVERGENCE_REPRESENTATIVE_EXPANSION: NOT_STARTED_FAIL_CLOSED`

`FINAL_CONVERGENCE_PC1_STATUS: NOT_READY`

### Verification state

The complete source-map/spec generator and its default local handoff lookup are
reproducible with `python tools/sellerWave4SvgSourceSpec.py --check`; the final
pre-commit rerun passed after 296 manifest-backed PNG records, 194 local SVG
renders and eight layout specifications were checked. The Wave 4 mobile
contract smoke also passed without creating an unexpected Git-visible path.

The final Android gate passed nine debug unit tests, debug lint with zero
errors, debug APK, Android-test APK and release APK assembly. The seller UAT
AVD passed the full instrumentation suite with 16 tests accounted for, zero
failures and the two separately opted-in real-API tests skipped. A subsequent
fresh 15-reference capture-only run also passed route, fixture, marker, idle
and frame-stability validation, then regenerated the three bounded golden
comparisons above from the final APK sources.

The complete named F0B, F1A–F1F, Wave 3, Wave 4, startup-safety and
customer/admin non-database regression set passed in this execution. The
already accepted disposable PostgreSQL and Android real-API evidence was not
repeated because this recovery changed no backend, persistence, route, DTO,
repository or session source. API-mode Compose rendering now exposes only
contract-backed dashboard fields; it labels low stock correctly, shows every
team member in a scrollable access-review list and maps an unknown role to a
fail-closed unverified description. Canonical fixture copy remains isolated to
debug-only fixture mode. The visual runner now requires a 0–5% threshold,
route, markers, explicit fixture sentinel, UI-idle proof and pinned capture
hashes; live mode computes wrong-context directly. Final local review has
`HIGH=0` and `MEDIUM=0`. None of these functional/security passes overrides
the failed golden pixel and region-geometry gates.

### Owner-authority R2 visual closure — 20 August 2026

The owner has issued a binding authority correction for references 001 and 055.
The current owner-approved NovaStore Seller design system now supersedes older
visual details where they conflict. The older rasters remain authoritative for
screen purpose, major regions, information hierarchy, basic layout, component
classes and overall character, but not for obsolete font/icon assets, missing
portrait or illustration assets, old field/CTA contours, old bottom-navigation
treatment or conflicting decorative details. Reference 282 retains its exact
SVG/PNG and `<=5%` golden contract.

R2 removed reference-specific scale and condensed-font workarounds from 001 and
055, aligned fields, primary actions, cards, shadows, radii, typography and the
generic selected-tab bubble to the current shared Seller system, and preserved
the disabled customer-question capability. No portrait, bespoke icon or missing
font was fabricated. The 282-specific changes already present in the preserved,
accepted R2 starting WIP were not changed further by the owner-authority rebind
step, and fresh regression evidence passed.

Fresh exact-state instrumentation captured 001, 055 and 282 from the same
installed APK SHA-256
`5efdba9e3e26530539fb80bb8890924a6fc6d3887638a91f4fd00c1ada8b2a44`
on `novastore-seller-wave4-uat`. Every receipt reports the expected route,
markers and fixture, `capture_valid=YES`, `frame_stable=YES`, `ui_idle=YES` and
`wrong_context=NO`. The bounded, hash-verified evidence is committed under
`docs/seller/wave4/evidence/representative/r2-owner-authority/`; its manifest
binds all three captures to that same APK.

The unchanged 282 binding comparator evidence is
`docs/seller/wave4/evidence/representative/r2-owner-authority/282-diff.json`,
SHA-256
`accbcf36b4cfb20b804a50800d21defa3dba355f6ca628a69ecb66afda26836a`.

| Ref | Current authority | R2 result |
| --- | --- | --- |
| 001 | Owner-current Seller system plus old structural intent | PASS |
| 055 | Owner-current Seller system plus old structural intent | PASS |
| 282 | Unchanged binding SVG/PNG, full-frame and geometry gate | PASS: 4.8425%, geometry PASS |

The earlier 001/055 pixel values remain valid historical diagnostics against
details that the owner has now explicitly superseded; they are not current
acceptance failures. The 282 comparator remains unchanged and passed without a
threshold adjustment.

R2 accessibility regression also proves that invalid 001 submission expands
without clipping and announces both errors, while the enabled 055 task actions
retain at least 48 dp touch targets. Disabled actions remain non-clickable.

`OWNER_AUTHORITY_R2_GOLDEN_PASS_COUNT: 3/3`

`OWNER_AUTHORITY_R2_RUNTIME_VISUAL_UAT: PASS`

`OWNER_AUTHORITY_R2_PC1_VISUAL_STATUS: READY`
