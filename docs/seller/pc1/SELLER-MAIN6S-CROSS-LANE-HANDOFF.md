# Seller Main-6S Cross-Lane Handoff

## Identity and authority

- Phase: `SELLER-MAIN6S-CROSS-LANE-HANDOFF-CLOSURE-AND-PC1-READY-FINALIZATION`
- PC1 shared-backend source commit: `8daaaade5a8d9776eac71eb679927239af465a02`
- PC1 shared-backend source tree: `ef69f643058275ba97baca6857375d756780dc35`
- PC1 evidence result: `PARTIAL`
- Seller starting commit: `2796fc2f65c5cad15045e97c5d6c2b499536bb73`
- Seller starting tree: `5c94178e8fdc7cff6c8168ddc9d07a5a0c73323f`
- Seller R2 visual-closure starting commit:
  `3dd2f9e671131f211bca4f1ea7a6e7b4825297b2`
- Seller R2 visual-closure starting tree:
  `d5ea984bc95f1be48e20a152198ca5c11dc550fc`
- Seller branch: `codex/seller-theme-integration`
- Exact PC1 dependency: `seller application/mutation/tenant ownership`
- Exact PC1 acceptance test: `seller vs foreign-store mutation matrix`

This record is the Seller-owned return handoff. It does not claim that the PC1
source was merged into this branch, and it does not replace either lane's
accepted history.

## Exact handoff disposition

`EXACT_HANDOFF_STATUS: PASS`

The locally enabled Seller test boundary now proves the acceptance test against real
disposable PostgreSQL and through the real Android UI-to-HTTP path:

1. A live Seller session resolves immutable organization and assigned-store
   context. The validated session UUID is retained in mutation audit context.
2. A same-organization Seller assigned only to Store A receives the same safe
   `404 RESOURCE_NOT_FOUND` treatment when attempting Store B update, offer
   update/command, inventory adjustment/threshold, order command, support
   message, or support rating.
3. The Store B aggregate revisions, inventory quantity, order state, support
   message set, mutation-receipt count, audit count, and outbox count remain
   unchanged after the denied matrix.
4. Idempotency replay cannot bypass assigned-store scope. Create fingerprints
   bind the active store, while target mutations validate authoritative store
   scope before reading a stored receipt.
5. Team reads require live assigned-store overlap within the organization.
   Disjoint-store members are not disclosed and overlapping scopes do not
   duplicate a membership.
6. The Android matrix drives the ordinary app repository and real local Seller
   HTTP routes. Debug mutation controls remain compile-time fail-closed and
   unreachable in release runtime.

Seller application/onboarding references 012–054 remain explicitly disabled by
the binding Wave 4 launch contract. This handoff does not invent application,
verification, bank, document, invitation, or membership-mutation endpoints and
does not turn a disabled capability into an enabled action.

The binding 055 customer-question task remains a disabled canonical fixture;
the live dashboard does not relabel Seller support conversations as a customer
reputation inbox and does not require `support.read` to satisfy `dashboard.read`.

## Executable evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Real PostgreSQL fresh/second apply | PASS | `tests/sellerWave3MigrationDisposableDbIntegrationSmoke.js` |
| Foreign-store mutation matrix | PASS | Store, offer, inventory, order and support denials plus unchanged side-effect snapshot |
| Team store isolation | PASS | Disjoint, overlapping and no-duplicate membership reads |
| Audit session attribution | PASS | No Seller mutation audit row has a null session identity |
| F1 migration integration | PASS | Four Seller migrations, fresh apply, second no-op, constraints, rollback and cleanup |
| Real Android navigation E2E | PASS | Seller login, context, launch routes and normal logout UI |
| Real Android mutation E2E | PASS | Own-store success/conflict paths plus complete foreign-store denial matrix |
| Android foreign target unchanged | PASS | Post-instrumentation database snapshot |
| HTTP trace | PASS | 72 local loopback Seller requests, no unexpected 5xx |
| Android unit/lint/debug/release build | PASS | Offline Gradle gates |
| Existing Admin/startup compatibility | PASS | Admin session/HTTP/auth, socket and startup safety smokes |
| Tenant/session/inventory/order/finance/support regression | PASS | Seller F0/F1/Wave 3/Wave 4 macro regression |

Only synthetic data, an official locally available PostgreSQL image, a
task-owned loopback container, and the `novastore-seller-wave4-uat` AVD were
used. The disposable database/container was removed. No remote database,
provider, push, PR, merge, or deployment was used.

## Current visual truth

`RUNTIME_VISUAL_UAT: PASS`

The binding owner decision for R2 makes the current owner-approved NovaStore
Seller system authoritative over conflicting obsolete visual details in the old
001 and 055 rasters. Those rasters continue to bind screen purpose, major
regions, hierarchy, basic layout, component classes and overall character.
Reference 282 retains its unchanged SVG/PNG, 5% full-frame and geometry gates.

Fresh exact-state captures were produced from one installed debug APK SHA-256
`5efdba9e3e26530539fb80bb8890924a6fc6d3887638a91f4fd00c1ada8b2a44`.
All three were route-correct, marker-complete, UI-idle, frame-stable and in the
expected context.

| Seller target | Current acceptance authority | Result |
| --- | --- | --- |
| 001 login | Owner-current Seller system plus binding structural intent | PASS |
| 055 dashboard | Owner-current Seller system plus binding structural intent | PASS |
| 282 team | Unchanged SVG/PNG comparator: 4.8425%, geometry PASS | PASS |

Golden target pass count is `3/3`. No missing portrait, icon or font was
fabricated, and the disabled customer-question tile remains fail-closed.
The unchanged 282 binding comparator is retained at
`docs/seller/wave4/evidence/representative/r2-owner-authority/282-diff.json`,
SHA-256
`accbcf36b4cfb20b804a50800d21defa3dba355f6ca628a69ecb66afda26836a`.
The sibling R2 evidence manifest binds 001, 055 and 282 receipts and runtime
captures to the same APK and verifies the 001 invalid-form and 055 touch-target
regressions through instrumentation.

## PC1 integration seam

`PC1_MERGE_READINESS: SELLER_LANE_READY_FOR_COMBINED_INTEGRATION`

The exact Seller mutation/tenant handoff and the Seller-owned visual closure are
closed. The combined PC1 tree is not assembled in this Seller worktree.
Integration must preserve the accepted
PC1 `applyLocalMain6sOperationMigrations()` startup hook and its four Main-6S
migrations, then add the accepted Seller migrations and guarded route mounts
without replacing either registry. The resulting combined tree must rerun PC1
migration/startup/runtime identity gates together with the complete Seller
macro regression.

No Seller-owned launch-critical visual, tenant, session, inventory, order,
finance, support, Android or security blocker remains. Combined PC1+Seller
migration, `server.js`, startup and runtime compatibility still has to be built
and tested by the separately authorized combined-tree integration lane.

`SELLER_LAUNCH_CRITICAL_OPEN_COUNT: 0`

## Return contract

PC1 may consume this branch after the Seller commit boundary reported with this
file. The receiver must preserve fail-closed Seller feature defaults, disabled
onboarding/application states and the R2 owner-authority visual decision. The
next authorized work is separate combined-tree PC1 integration verification.
No push, PR, merge or deploy is part of this handoff.

`RETURN_THE_EXACT_PC1_HANDOFF_AND_WAIT`
