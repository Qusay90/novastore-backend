# R24 canonical variant consumer validation

The accepted R20 implementation already consumes R19 canonical variant rows,
uses exact product/variant cart identity, persists only identity and quantity,
and sends the accepted quote, agreement preview and initialize contracts.
See [authority convergence](CUSTOMER-WEB-R24-AUTHORITY.md) for the exact history.

R24 adds a visible `✓ Seçili` cue and explicit keyboard focus to the existing
selector. It strengthens acceptance evidence around exact viewport sizes,
keyboard controls, geometry, stale legal snapshots, invalid variants, simple
checkout and order/return history. Canonical layout sources are unchanged.

## Verification commands

From `storefront-commerce-pro`:

```powershell
npm ci --ignore-scripts
npm run build
npm run build:integration
npm run build:fixture
npm run build:cutover
npm test
node scripts/verify-variant-consumer.mjs
node scripts/verify-return-tracking.mjs
npm run verify:r19-backend
```

The real backend harness requires local Chrome, Docker, the already available
`postgres:16-bookworm` image and the immutable R19 sibling checkout with its
dependencies. `NOVASTORE_R19_ROOT` may select that exact checkout; the harness
rejects a different R19 commit/tree. It owns a disposable loopback database and
never uses a production database or real provider. Successful initialize is a
pending payment action; it is not a settled purchase.

After the final local commit, from repository root run:

```powershell
node tests/commerceProNavigationOriginSmoke.js
node tests/commerceProCutoverArtifactSmoke.js
```

The byte matrix performs two offline builds in its own clean checkout and checks
blob, checkout, build1 and build2 equality. It also seals the outer HEAD, index,
status, lockfiles and artifact. Run it after concurrent source edits stop.

## Evidence scopes

| Evidence | Scope |
| --- | --- |
| `artifacts/r24-variant-consumer-fixture/runtime-result.json` | Real Web adapters and production-mode bundle against a synthetic HTTP contract fixture |
| `artifacts/r24-real-r19/result.json` | Production Web artifact, exact R19 purchase controllers and disposable PostgreSQL; deterministic provider requester |
| `artifacts/r13-return-tracking/runtime-result.json` | Real Web return/auth adapters against an isolated HTTP fixture; 34 R13 checks |
| `artifacts/r24-verification/` | Broad Web tests, dependency review, final patch/build identity and final report |

The fixture and real-backend reports distinguish browser interactions from direct
API negative probes. Required responsive dimensions are 1440x1000, 1280x720,
1024x768, 768x1024, 390x844 and 360x800. Tests measure document overflow, control
hit targets and overlap in addition to recording screenshots.

The final fixture run passes 154 checks with all 28 negative counters at zero,
30 geometry records (five surfaces at each viewport) and 38 screenshots. It
records zero browser errors, external requests, unknown API routes and provider
calls. Four initialize attempts reach its deliberately unsuccessful provider
boundary after valid server-fixture legal acceptance. The R13 return runner
passes 34 checks. The package suite passes 109 tests, including the five new
selector, escaping, malformed-row and purchase-body tests.

The geometry tests scroll each commerce control into reach and check its center
and four inset corners. Floating NovaBot may cross scrolling content in a full
page screenshot; the measured gate is no persistent obstruction after scrolling,
with separate fixed-surface overlap checks for comparison and mobile navigation.

The real R19 run passes 27 checks. It applies all 39 accepted migrations and
verifies a second apply is a no-op. Real browser interactions exercise login,
canonical variant/simple PDP and cart, stock depletion, a stale P1 legal snapshot,
fresh unchecked acceptance at P2, and successful initialize. Direct API probes
separately cover malformed/missing/foreign/disabled/deleted/insufficient-stock
variants, duplicate aggregation and forged authority fields. Exactly one pending
customer order and the canonical inventory reservations are verified in the
disposable database. No payment settlement is simulated.

The final initialized order contains the simple product at 80 TRY and the chosen
variant at its updated 125 TRY price. Its payment state is `REQUIRES_ACTION`.
The deterministic provider requester runs once; backend non-loopback attempts
are zero. The unchanged legacy PayTR handoff page attempts its existing Google
Fonts and PayTR iframe origins; both are intercepted before network access and
are explicitly listed in the real-backend report. They are not counted as
successful external calls or hidden behind the fixture's zero-attempt result.

## Broad Web regressions and inherited legacy tests

Current relevant checks cover logout, principal isolation, shared cart state,
PayTR handoff/result contracts, catalog/category routes, canonical presentation,
review isolation, cutover/origin rules, public stores/follow, NovaBot, customer
refresh, return write controls and legal sales-party projection.

Three additional optional historical tests fail identically on clean accepted
R20 (`7a9f218e2d2e329cb39548ec979321e83d0502f6`) and R24:

- `commerceProFoundationSmoke.js:51` requires legacy `style.css` in the retired
  `checkout.html` surface.
- `commerceProNavigationHomeSmoke.js:34` expects an obsolete literal route regex.
- `commerceProNavigationHomeBrowserSmoke.mjs:284` requires `/` without a hash
  after clicking the brand. Accepted canonical source deliberately uses `#/`.
  Both baseline browser runs render Home with no overflow or uncaught errors.

The test and relevant input blobs match the accepted base; none of these three
tests belongs to the current CI runner. They remain recorded as inherited
failures. The source and tests are not weakened to satisfy obsolete expectations.

## Dependency security boundary

On 2026-09-15, the inherited Web lockfile reported one high and one moderate
dependency warning in its development build chain. R24 updates only Browserslist
and baseline-browser-mapping plus their browser metadata dependencies. Web
`npm audit` now reports zero vulnerabilities, including development dependencies.
Direct runtime dependency versions and backend dependency locks are unchanged.

The fixes follow the upstream
[Browserslist cache advisory](https://github.com/browserslist/browserslist/security/advisories/GHSA-c83g-rgw3-j3cx),
[custom statistics advisory](https://github.com/browserslist/browserslist/security/advisories/GHSA-73wf-gq98-2v4g),
and [baseline mapping advisory](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv).

The separate inherited repository/backend lockfile reports two high packages
(`multer`, `nodemailer`) and one moderate package (`qs`). These are outside the
Customer Web bundle and this immutable-backend consumer lane. They are not
silently included in a Web zero-finding claim or fixed by changing R19 authority.
No repository-wide security clearance or production release is asserted.
