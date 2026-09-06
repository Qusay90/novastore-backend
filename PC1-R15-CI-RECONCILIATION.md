# R15 inherited CI reconciliation

Base: `d1f34d7c0ae9620985b2a54fc72f0c27b4671304`, tree
`de9f18009ca97393d0254e5d2798e16609a6c17a`. Work continues in the dedicated
`codex/pc1-r15-broad-ci-green-seal` worktree. No Android, Stocky, bridge WIP,
production infrastructure, migration inventory, or dependency lockfile changes.

## Root causes

1. **STALE_TEST_EXPECTATION**: accepted R8-R2 comparison clearing resets selection
   and surface visibility. The visual source assertion now checks both setters and
   clear-button wiring. Chrome at 390 and 1440 pixels confirms selection 2 -> 0,
   tray/launcher absent, route unchanged, and root still mounted.
2. **STALE_TEST_EXPECTATION**: the delivery migration need not remain the final
   migration. Its required ID/path uniqueness and exact mapping, and ordering after
   its seller-package foundation, are now asserted. SQL mutation assertions remain.
3. **STALE_ARTIFACT_PIN**: the Admin review digest referred to historical artifact
   `309b795...`. Canonical `npm run build:live:integrated` reproduces the accepted R14
   artifact SHA256 `cdd22dfda32ab8164d489e8e0e177eea65817cd811cafe597c62f1a913b1f1f8`.
   Its 38-input source fingerprint, sidecar, and embedded fingerprint all equal
   `d3a1432f3adf62376c7d87dc7a338e42fb8a37e813900e6b77bf0c736b262c39`.
4. **REAL_GENERATED_ARTIFACT_DEFECT / outdated origin contract**: Customer artifact
   `8f2b...` had not been regenerated after accepted R6/R8 source changes. Its
   canonical rebuild exposed a parser-only `.invalid` sentinel and an accepted
   external Seller navigation destination. The parser now uses a non-network URL
   scheme while retaining route/query allowlists, normalization and redirect guards.

## Owner production authority

`https://novastore-stage.com` is owner-approved exclusively for the fixed Customer
“Ortağımız Ol” Seller recruitment navigation. It is not an API, authentication,
payment, script, asset, fixture, or general external-origin allowance.

The cutover validator parses the generated JavaScript using the existing locked
Babel build toolchain. It requires one immutable literal binding, exactly two uses
as JSX `href` properties on the two named Seller surfaces, and proves the desktop
component forwards its href only to an anchor. All other occurrences/origins remain
subject to rejection. No emitted bytes are rewritten by this inspection. Existing
16 hygiene rules, runtime-script checks, mutation probes, CSP and API allowlists
remain intact. Negative probes cover direct/reused API destinations, auth/payment
strings, assets/scripts, alternate hosts/schemes/paths, wrong surfaces, and request
functions substituted for JSX calls.

Only `npm run build:cutover` generates the Customer production artifact. Two local
builds reproduced SHA256
`4b6f51df8b93bd9c0b5a04497e57e7679e7422d13bb454e8781750409f93561c`.
The Customer review digest now pins these verified bytes. The final cutover smoke
also checks HEAD blob = clean Windows checkout = build 1 = build 2, with lockfiles
unchanged. Its navigation probes run inside the disposable checkout after the
existing frontend dependency installation, avoiding a new root-CI dependency.

## Validation and seal

The complete repository runner remains 79 checks. New origin misuse probes are a
nested cutover check, not a removed or skipped CI entry. Customer package tests gain
one return-parser regression (85 -> 86). Canonical/integration/fixture builds and
86 package tests passed. Production navigation browser checks passed at 390/1440
pixels with no external request or page error. Previous comparison browser evidence
also recorded zero console/page errors and external requests at both sizes.

The exact candidate tree is tested in an isolated local verification clone because
the existing byte matrix reads HEAD. After four targeted passes, the full 79-check
runner must pass before committing the same tree on the R15 branch. Final results,
patch SHA256 equality, HEAD/tree, clean worktree/index, scoped review and zero
localhost/deneme/fixture counters are recorded in ignored `artifacts/r15/R15-REPORT.md`
and `artifacts/r15/final-attestation.json`. This document describes the validation
procedure; the final attestation supplies actual results, not assumed passes.

No push, PR, merge, deploy, production request, or database migration is authorized
by this local CI seal.
