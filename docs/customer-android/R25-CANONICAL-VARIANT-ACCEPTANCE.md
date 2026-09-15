# R25 — Customer Android canonical variants

Prompt: `CUSTOMER-ANDROID-R25-A14-CANONICAL-VARIANT-SELECTION-CART-CHECKOUT-CLOSURE`.

## Authority and scope

The new `codex/customer-android-r25-a14-canonical-variants` worktree starts at the accepted R12 Android commit `3a00c4b6c5cf1e35fa837c67b8567ebd1a5b28f3`, tree `8624c358783700ec7c152c9ffcee886532333a53`. HEAD, tree, clean worktree and clean index were attested before implementation. Other worktrees and their WIP were preserved.

The variant contract is R19's `docs/seller/PC1-A14-CUSTOMER-ANDROID-VARIANT-CONSUMER-HANDOFF.md`. Disposable compatibility uses exact R21 `6492cc1d7b3033c63cdd1454f62f00975fd51e79`, tree `0f74570e9a7c60ad63e11e2b49ae799c0fa198fc`; R19 ancestry and clean backend state are checked before and after execution. No backend source changes, production database writes, provider requests or publication are authorized by this local acceptance work.

## Consumer behavior

- Every native PDP resolves its product ID with the public detail endpoint, including uncached deep links and guests. A failed detail request cannot become a simple product. An empty required-variant list is a separate, unpurchasable state.
- The selector displays complete server-provided combinations with their actual group/value labels. Each row has a radio role, explicit selected state and check icon, at least a 48 px target, server price and exact available quantity. No combinations or price deltas are generated locally.
- Add and Buy Now refetch the canonical detail. A removed or unavailable exact variant fails without substitution; a stock reduction does not silently add fewer units than requested.
- Simple cart identity is product ID; variant cart identity is product ID plus variant ID. Sibling variants remain separate. Same-variant additions aggregate within exact visible stock and established cart limits.
- Device-local cart storage contains only public display snapshots, selected labels and exact identity/quantity. Restored snapshots are display caches; the server revalidates checkout. Corrupt, duplicate or unbounded cached identities fail closed. No auth secrets or cross-device cart contract are added.
- Quote and payment bodies contain only `product_id`, optional `variant_id` and `quantity` for each line. The preview response must match the requested identities and quantities exactly. Server totals and legal versions remain authoritative.
- Cart, address and coupon changes invalidate consent. Stale price, stock and unavailable-variant errors clear consent and require a fresh server preview. A late payment status cannot clear a different cart or confirm a different payment/session. Address delivery values detect an edit even when the address ID is unchanged. After a matching, fully finalized server status, confirmation and exact cart clearing happen synchronously; account history refresh happens when the customer opens their orders. Confirmation is bound to the current customer.
- Historical order labels, SKU and price come from the order snapshot. Current catalog edits do not change that presentation. Returns remain order-level; the R12 create/history/exact-detail/rejected/deep-link behavior is preserved.
- Canonical description and supported feature values populate the existing PDP description/specification region. The real R21 fixture exercises text, number, boolean, option, multiple-option and range values; the UI renders them as text. No V4.13 top bar, bottom navigation, media shape, typography, card or NovaBot redesign is included.

## Validation layers

1. Pure identity, cache, product/quote/order parsing and request tests.
2. React UI tests against local fixtures, including error and stale-response scenarios.
3. Native Android WebView instrumentation on the existing standard emulator; runtime evidence is separate from desktop browser fixtures.
4. Full Android production client functions against immutable R21 controllers and a uniquely owned, disposable PostgreSQL database. The harness includes migration/no-op checks, outbound guards, exact-source hashes and proven cleanup. A deterministic in-process payment hook produces only `REQUIRES_ACTION`; it does not settle a payment or contact PayTR.

Real backend command, from `v413-ui`:

```powershell
node scripts/r25-verify-real-r21-backend.mjs --execute-disposable-db
```

The final source passed the 91-case existing React regression group and the 27-check real R21 compatibility harness. The emulator passed all 19 existing instrumentation cases plus 6 R25 cases (25/25); the exact initial APK also passed the same 19 existing cases with the loopback fixture available. The 45-case Node group reports 43 passes and the two reproduced baseline exceptions below. Browser fixtures, native instrumentation and disposable controller tests remain separate evidence layers.

The combined browser contract/UI group passed 31/31 (16 existing R11/R12 cases plus 15 new R25 cases); its raw runner JSON records zero skipped, unexpected or flaky tests. Final UAT unit tests passed 12/12, lint reports zero errors and 17 inherited warnings, and native sync/assembly passed. The native bundle hash is `52f9fcb773024198f9d52eceecbc6c19652479016bb8c02646c089308a2d2360`.

The standard API 36 emulator was verified at 1080×2400, tr-TR and font scale 1.0. Activity recreation and actual force-stop/cold relaunch preserve both variant rows and the selected variant. Portrait is locked, so rotation is not applicable. Settled baseline/final Home images and final selector/cart images were visually inspected; the blank early baseline capture is excluded. No crash/ANR was recorded. The installed APK matches the signed local artifact SHA-256 `6f6eaa8f5e8ceb1e4e05a04758b034a6eb68f5486dd6bf41e4b7eaed6320a284`.

Acceptance is local and `EMULATOR_ONLY`. C03 description/features, C15 exact visible stock/quantity and C18 uncached canonical product detail are closed within this consumer scope. Real providers, physical devices and publication are separate gates and were not exercised. The owned fixture listener, adb reverse/temporary forwards and disposable database resources were cleaned up.

## Accepted baseline exceptions and bounded corrections

The exact initial source was archived before implementation, with archive SHA-256 `0d6a9f22a5ba641784650909b896cab11336d145088fe5e876f025160b4e2eae`. Baseline evidence is in the adjacent `customer-android-r25-baseline-evidence` directory; its receipt records the exact APK, emulator and test results.

- Initial runtime integrity failed on three stale hash entries even though the protected files were the accepted R12 files. The unchanged initial mobile/media/native/legal/returns suite passed 39/39. Only those three lock entries were reconciled to the proven accepted bytes; all protected runtime source files remain unchanged. The current integrity check covers 28 files.
- Two existing product-card source-regex tests fail on the exact initial source: the broad scroll-snap expression and obsolete favorite-motion expression. Their runtime behavior is independently exercised; they are not relabeled as passing.
- The initial `uat` target and instrumentation APKs are unsigned. Emulator instrumentation uses separate APK copies signed with the local Android debug key. Production signing and release configuration are not changed.
- One initial build-tool dependency advisory was addressed with the compatible transitive `@xmldom/xmldom` update from 0.9.11 to 0.9.12. No runtime dependency was upgraded; the refreshed npm audit reports zero findings.

Final counts, source/patch/APK hashes, screenshots and the complete requested gate matrix are recorded in `v413-ui/artifacts/r25-verification/R25-FINAL-REPORT.md` and `final-attestation.json` after the final frozen-source verification. Fixture success alone does not establish device or production acceptance.
