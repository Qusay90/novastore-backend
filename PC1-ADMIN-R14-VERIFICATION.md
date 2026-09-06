# PC1 Admin R14 verification

Prompt: `PC1-ADMIN-R14-RETURN-DETAIL-DECISION-REVISION-AND-CUSTOMER-PROPAGATION-CLOSURE`

The Admin return flow now loads bounded pages, opens exact authoritative detail, shows the Customer note as text, and submits only supported revision-bound decisions. Approval, order refund state, and payment state remain separate. The canonical mutation workflow, Customer sources, Seller Android, Stocky, and the interrupted R11 bridge were not changed.

## Source authority and policy

- New worktree: `pc1-admin-r14-return-processing`; branch `codex/pc1-admin-r14-return-processing`.
- Initial HEAD `63e604627bca919d2f38143e7d2a65eb82364695`; tree `0ea2a645f7fd3216a5369bd37e858a45ad1024e1`; initial worktree/index clean.
- Customer Web accepted HEAD `ce76b3ed45576d721fc250cad989f00c27d31690`, tree `6af785c48e3fb961e6bef127c6cbfe35029f1ab2`.
- Customer Android accepted HEAD `3a00c4b6c5cf1e35fa837c67b8567ebd1a5b28f3`, tree `8624c358783700ec7c152c9ffcee886532333a53`; tested contract is active `v413-ui`, not legacy Kotlin.
- Owner explicitly confirmed: “Platform Admin yetkisini kabul et”. Seller-owned return decisions preserve the existing Platform Admin authority. Seller bearer tokens remain denied.

## Verified behavior

| Gate | Result |
| --- | --- |
| Bounded summary/record 101 | PASS; at most 100 DTOs / 101 SQL rows per request; browser loaded 106 records with continuation |
| Exact detail and Customer note | PASS; canonical ID GET, every required field, literal hostile note, raw HTML rendering 0 |
| Transitions | PASS; REQUESTED to IN_REVIEW or REJECTED; IN_REVIEW to APPROVED or REJECTED |
| COMPLETED action | ABSENT; no canonical command supports it |
| Revision | PASS; authoritative positive integer required; stale 409, exact refetch, no silent overwrite |
| Failed conflict refetch | PASS; truthful unavailable state and disabled decisions until successful exact retry |
| Decision note | PASS; existing terminal-note requirement, trim, 1000 max, 1001/control rejection |
| Capability | PASS; global returnWrite default off; UI PATCH 0 and server DML 0 when disabled |
| Authorization/IDOR | PASS; owner/customer reads; foreign Customer 404; Seller/Customer/expired/revoked/live-demoted Admin mutations denied |
| Lower/read-only Admin | PASS for supported model: live-demoted Admin and capability-disabled Admin; no invented per-Admin tier |
| Customer propagation | PASS; real HTTP plus exact accepted Web adapter and Android v413 normalizer; no Customer source mutation |
| Refund truth | PASS; APPROVED / PENDING / PAID; provider executed false; provider calls 0 |
| History | PASS; rejected ID preserved after distinct reapplication; order-level refund state labelled as current order state |
| Notification | PASS; one existing RETURN_STATUS_CHANGED event/outbox entry per real transition, no-op duplicate count 0 |
| Responsive/accessibility | PASS at 1440x1000, 1280x720, 768x1024; detail horizontal overflow 0; actions reachable; autofocus, Tab, Enter, Escape; text status labels |
| Local runtime cleanup | PASS; owned HTTP listener closed, stop signal absent, PostgreSQL processes/clusters 0 |

## Validation evidence

- `node tests/adminReturnProcessingPostgresSmoke.js --execute-disposable-db --postgres-bin="<absolute-path-to-pgsql-bin>"`: **46 real HTTP checks PASS** against an isolated loopback PostgreSQL 16.15 cluster. Complete canonical migration registry applied twice; second application no-op. See `tests/adminReturnProcessingPostgresSmoke.evidence.md`.
- `node admin-commerce-pro/scripts/return-processing-smoke.mjs`: PASS.
- Admin `npm run test:live`: PASS after final source/build changes. Model, reconciliation, order mutations, first-sale, capability, catalog/store/product, question, notification, and canonical checkout/return contract checks passed in targeted/broad runs.
- Real browser: review then approve, direct reject, competing Admin rejection followed by stale 409, exact readback, reload persistence, injected 503 during conflict refetch, disabled-capability zero PATCH. Evidence under ignored `artifacts/r14-browser-visual.log`, `r14-browser-decisions.log`, `r14-browser-gates.log`, and `artifacts/output/playwright/`.
- Final browser page-error count during decision run: 0. The intentionally narrow fixture returns 404 for seven unrelated navigation resource URLs; expected 409/503 negative tests also appear in network console. An intermediate missing footer variable was corrected before final successful runs. No claim of a globally empty historical console is made.
- Standalone HTML rebuilt from fingerprint-checked Admin source. Full Admin `npm test` must run after the local commit because its preview/live matrix requires Git HEAD blob = checkout bytes = two rebuilt artifacts; its post-commit result belongs to the final attestation.
- Graphify updated AST-only; no API use. The large graph skips HTML rendering and remains an ignored local navigation artifact.

## Broad regression limits

All 79 declared CI checks were attempted: **75 passed, 4 failed**. Each failure reproduced on the exact accepted R10 base in its clean worktree. No Customer or unrelated baseline test was weakened to make CI appear green.

| Inherited failure | Evidence/reason |
| --- | --- |
| officialRuntimeVisualContractSmoke.mjs | Customer onClear regex at line 33 expects obsolete source shape; exact base fails identically |
| manualDeliveryMutationSmoke.js | Final registry assertion at line 467 expects an older last migration; newer accepted Seller Questions migration already exists |
| storefrontR5ReviewContractSmoke.mjs | serveOfficialRuntimeReview.mjs has a stale Admin artifact SHA-256 pin; already fails against base artifact |
| commerceProCutoverArtifactSmoke.js | Disposable Customer build hygiene detects pre-existing novastore-stage.com / customer.novastore.invalid origins |

Logs: `artifacts/r14-ci.log`, `r14-remaining-ci-results.json`, `r14-baseline-visual-contract.log`, `r14-baseline-manualDelivery.log`, `r14-baseline-remaining2-results.json` and the corresponding baseline logs. Global CI is not green. R14 readiness is scoped to the verified Admin-return closure.

## Security review and semantic limits

Completed scoped Codex Security scan `af8b9870-351e-4597-81f9-dd18fc660fc9`: 8/8 selected surfaces reviewed, no reportable HIGH or MEDIUM finding. Canonical auth/session, ownership, capability, revision/CAS, parameterized cursor, text rendering, and outbox controls were traced and locally exercised. This is not an exhaustive repository security audit.

The immutable scan digest is `codex-security-snapshot/v1:sha256:7f2035384ff5735d57cca70751bfe5a0753f366a6793a063a9602faa7d32c0fc`. Later historical-copy/footer/label-spacing and regenerated HTML edits received supplemental source and browser review. The completed scan explicitly warns that its digest identifies the original snapshot; the final patch is attested separately. Security account terms status was unavailable (`USER_NOT_LOGGED_IN`).

The legacy `/api/returns/admin/all` remains an unchanged unbounded route; this Admin flow never calls it. Keyset pages are deterministic per request but are not a frozen snapshot during concurrent status movement; refresh resets pages. Historical return status belongs to the exact return ID, while refund/payment fields belong to the order's current projection. These existing semantics are explicitly labelled in detail.

## Final identity procedure

Only the explicit R14 source/test/doc/generated paths are staged. Save the staged binary full-index diff and tree before the single authorized local commit `feat(admin): complete return request processing`. Compare that saved patch SHA-256 and tree to the committed parent-to-HEAD patch and HEAD tree, run the full Admin suite, then record actual final HEAD/tree, clean status/index, protected source identity, and counters in `artifacts/R14-FINAL-REPORT.md` and `artifacts/R14-FINAL-ATTESTATION.json`.

Provider refund calls, production writes, and secret exposure observed in this task: **0**. Push, PR, merge, and deploy: **not performed**. Physical Android, production, payment-provider execution, and real notification delivery are outside this local UAT evidence.
