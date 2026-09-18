# Customer Android R26 / R27 acceptance

Prompt: `CUSTOMER-ANDROID-R26-R1-C01-C02-C04-IMPLEMENT-R27-MARKETPLACE-DISCOVERY-CATEGORY-AND-PUBLIC-REPUTATION`.

C01, C02 and C04 are closed for local Customer Android acceptance. Device evidence is **EMULATOR_ONLY**. This is not a production deployment, provider acceptance or physical-device release result.

The existing `codex/customer-android-r26-marketplace-catalog` worktree was resumed from clean HEAD `12281f86f2d76a0db423d3979cf1b1cf725047a3`, TREE `5d31b5f7f4495aabd751aa350544b355c05c1c04`. No replacement checkout was created. Its root is `C:\Users\kusay\source\NovaStore-Codex\customer-android-r26-marketplace-catalog`.

Read-only backend authority remained HEAD `b654dada7a67ce8904eed9ccd1ff037e5f16e5ed`, TREE `348747a9d140b112dcbc85db3a103967a29d9292` in `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\pc1-r27-public-marketplace-read-contracts`. The committed `PC1-R27-R26-PUBLIC-DISCOVERY-REPUTATION-HANDOFF.md` and actual backend routes/services supplied the contracts. Each real R27 fixture run verifies this HEAD, TREE and clean status before starting and after cleanup.

## Resulting behavior

Native Home, search and category product lists now use `/api/products?pagination=cursor&limit=20`. The fixed production store constant and both consumers were removed. Server query filters own discovery; the shared product display cache never decides whether the marketplace is complete. Cursor values remain opaque, continuation deduplicates canonical product IDs, and refresh starts without an old cursor. Resource identity and request generations prevent obsolete results from publishing into another search/category/store/product surface. Append failures retain existing items and retry the same cursor.

Categories read `/api/public/categories?format=tree` and use the returned hierarchy, identifiers, names and slugs. Selecting a category requests `categoryId` and `includeDescendants=true`; nested descendants and a runtime rename were verified. No separate menu taxonomy or private category endpoint was introduced.

Public store pages consume bounded products and pagination independently of the server's complete `product_count`. Store B returned 54 products across three pages. The existing local store search explicitly says it searches loaded store products. Public store identity, follow authority and canonical PDP navigation remain intact. Favorites load each persisted product through the accepted R25 detail reader, so a favorite outside the first discovery page remains available after reopening.

Public PDP questions and reviews have separate repositories keyed by product ID. Questions display answered DTOs and indented seller answers. Reviews display masked public names, dates, ratings and validated public media; the global average and count come from the server's complete published-review aggregate. Own question/review history remains on its authenticated account routes. HTML-shaped fixture text is rendered as text. DTO allowlists reject private fields. Media uses approved origins; native `connect-src 'none'` and `frame-src 'none'` remain enforced, and the bundle verifier checks the exact media policy per build profile. Image loading was exercised; video playback was not separately tested.

The R25 detail, canonical variant, device-cart and checkout contracts remain authoritative. A product was discovered in the real marketplace, opened, given a canonical variant, added to cart and sent to the real R27 agreement-preview endpoint with only `product_id`, `variant_id` and quantity. No payment initialize request was made in that flow. The accepted return/account/NovaBot surfaces and V4.13 card, navigation and media geometry were retained.

## Runtime evidence

Local evidence lives under `v413-ui/artifacts/r26-verification/` and is intentionally ignored by Git. The fixture requires `--execute-disposable-db`, the exact backend checkout, a local named Docker context, a uniquely owned PostgreSQL container/database and loopback HTTP. Production/provider environment is removed or replaced by synthetic local fixture configuration. Initialization/provider routes are denied in the R27 fixture. It logs request methods/paths/query fields without authorization headers, passwords or request bodies. Owned containers are removed and backend identity re-attested at shutdown.

The dataset contains 105 matching discovery products across two eligible stores plus three accepted R25 fixture products: 108 total marketplace items, six bounded pages, positions 21 and 101 reached. Category tests compare actual server-filtered identities. Reputation has 27 answered questions and 27 published reviews, plus unanswered and non-published negatives. A store was closed using its real Seller status/closed timestamp in the disposable database; fresh marketplace pages excluded all its products and its store/questions/reviews routes returned 404. Reopening was confined to that disposable fixture.

| Check | Observed result | Evidence |
|---|---|---|
| R26 repository/query/privacy unit contracts + real R27 DTO contracts | 9/9 PASS | `contracts-final.log` |
| Real R27 native-bundle browser flows | 8/8 PASS | `real-ui-final.log` |
| Android JUnit | 13/13 PASS | `android/app/build/test-results/testUatUnitTest/` |
| R26 + existing native shell/session/example instrumentation | 24/24 PASS | `native-final-r27.log` |
| Extended R26 native flows including marketplace-to-checkout | 5/5 PASS | `native-r26-final.log` |
| R25 native variant/cart/checkout/order/return regression | 6/6 PASS | `native-r25-final.log` |
| R25 exact client + immutable real R21 backend | 27/27 PASS; disposable DB cleanup proven | `../r25-real-r21/result.json`, `r25-real-backend.log` |
| R11/R12/R25 browser regression | 62/62 PASS | `legacy-browser.log` |
| R8 store/media regression after final UI changes | 9/9 PASS | `r8-final.log` |
| Complete applicable default browser run | 217/221 PASS; three reproduced baseline failures and one timing failure that passed an isolated recheck | `all-browser.log`, baseline/recheck logs below |
| Node tests | 43/45 PASS; the same two baseline failures | `node-final.log`, `baseline-node-after-build.log` |
| TypeScript / web / release web bundle / UAT native bundle | PASS | `build.log`, `release-web-bundle.log`, `native-sync.log` |
| Gradle unit/lint/UAT app/test build | PASS; lint 0 errors, 17 warnings | `gradle.log`, `instrument-build-final.log`, `android/app/build/reports/lint-results-uat.txt` |
| Protected mobile runtime | 28/28 unchanged | `runtime-final.log` |
| APK installed bytes versus delivered APK | SHA-256 MATCH | `installed-apk-identity.json` |
| Emulator / launcher reopen / crash buffer | API 36, 1080x2400, device+app tr-TR, font 1.0; COLD reopen shows both stores; empty crash buffer | `device-profile.json`, `force-stop-reopen.log`, `emulator/r26-launcher-final.png`, `android-crash.log` |

The native UAT web tree SHA-256 is `3c6821c8aac69c3622b6f1b5f9ad79440e12e7908a1657c90fd41164c81962b5` (47 synced files). The APK is signed with the existing local Android debug key for UAT. Its SHA-256 is `c7cf6a3e49db7d432233b07fd9d6e872b9573bd92d6b4fab431529ccc0006b17`. Release-profile web compilation does not imply production signing or release authorization.

Browser and emulator captures cover Home, search, categories, store, public questions/reviews, favorite, cold Store B PDP, variant selection and checkout. The native screenshot helper waits for WebView to paint after programmatic scrolling; the public Q&A and review captures are distinct. The local browser proxy changes CSP only in the response used for browser testing; APK assets retain the native CSP.

## Baseline failures

The exact initial HEAD was archived before edits and extracted under ignored evidence for comparison, without another Git worktree. The following failures were reproduced against it:

- `product-card-geometry.test.mjs`: the old broad `scroll-snap` prohibition in the three-photo carousel source assertion, and the old synchronous favorite-animation source regex. Both initial and final Node runs are 43/45.
- `calibration-v3.spec.ts:353`: old local review-count expectation; `calibration-v3.spec.ts:550`: old Support Hub return-heading expectation. Evidence: `baseline-browser-known.log`.
- `calibration-v4.spec.ts:838`: old favorite-removal animation locator. Evidence: `baseline-browser-known-v4.log`.

`calibration-v4.spec.ts:800` also timed out in the complete browser run. Its isolated run passed on both the exact initial source and the final source (`baseline-browser-known-v4.log`, `timing-recheck.log`). It is recorded as an intermittent timing failure, not as a reproduced failing baseline or a clean full-suite PASS. No acceptance check was silently waived and no production behavior was changed to satisfy those stale assertions.

## Required acceptance fields

| Field | Result |
|---|---|
| RESULT | LOCAL_IMPLEMENTATION_COMPLETE; EMULATOR_ONLY |
| INITIAL_HEAD_TREE | `12281f86f2d76a0db423d3979cf1b1cf725047a3` / `5d31b5f7f4495aabd751aa350544b355c05c1c04` |
| FINAL_HEAD_TREE | Recorded after the single commit in `artifacts/r26-verification/final-identity.json` and the final task response |
| R27_BACKEND_AUTHORITY | `b654dada7a67ce8904eed9ccd1ff037e5f16e5ed` / `348747a9d140b112dcbc85db3a103967a29d9292`; unchanged |
| HARDCODED_PRODUCTION_STORE_ID_COUNT | 0 |
| FIXED_DEFAULT_STORE_SLUG_DEPENDENCY | 0 |
| MARKETPLACE_CURSOR_CONSUMER | PASS |
| PRODUCT_21_REACHABLE | PASS |
| PRODUCT_101_REACHABLE | PASS |
| CLIENT_WHOLE_DATASET_SEARCH | 0 |
| SEARCH_SERVER_SIDE | PASS |
| SEARCH_PAGE_CONTINUATION | PASS |
| STALE_SEARCH_RESULT_OVERWRITE_COUNT | 0 |
| SECOND_STORE_PRODUCT_DISCOVERABLE | PASS |
| SECOND_STORE_PRODUCT_OPENABLE | PASS |
| CROSS_STORE_PRODUCT_IDENTITY_LEAK | 0 |
| PUBLIC_CATEGORY_TREE_CONSUMER | PASS |
| CATEGORY_RUNTIME_REFRESH | PASS |
| CATEGORY_CROSS_ASSIGNMENT_ERROR_COUNT | 0 |
| PRODUCT_DETAIL_CANONICAL_REUSE | PASS |
| STORE_PRODUCT_CONTINUATION | PASS |
| PUBLIC_QA_CONSUMER | PASS |
| PUBLIC_QA_PAGE_2_REACHABLE | PASS |
| PUBLIC_UNANSWERED_QUESTION_VISIBLE | 0 |
| PUBLIC_REVIEW_CONSUMER | PASS |
| PUBLIC_REVIEW_PAGE_2_REACHABLE | PASS |
| SERVER_REVIEW_SUMMARY_AUTHORITY | PASS |
| CLIENT_PARTIAL_PAGE_RATING_AUTHORITY | 0 |
| NON_PUBLISHED_REVIEW_VISIBLE | 0 |
| PAGE_APPEND_ERROR_ERASES_EXISTING_CONTENT | 0 |
| REFRESH_STALE_CURSOR_REUSE | 0 |
| STALE_RESPONSE_WRONG_SURFACE_COUNT | 0 |
| PUBLIC_QA_PRIVATE_CUSTOMER_DATA_COUNT | 0 |
| PUBLIC_REVIEW_PRIVATE_CUSTOMER_DATA_COUNT | 0 |
| PUBLIC_CONTENT_INTERNAL_SELLER_ID_COUNT | 0 |
| RAW_HTML_PUBLIC_CONTENT_EXECUTION | 0 |
| SECOND_STORE_DEEP_LINK | PASS |
| ENDLESS_LOADING_COUNT | 0 in exercised success/error/offline/empty cases |
| FIXED_STORE_CATALOG_AFTER_REOPEN | 0 |
| R25_VARIANT_REGRESSION | PASS; C03/C15/C18 retained |
| RETURN_TRACKING_REGRESSION | PASS |
| V413_VISUAL_CONSISTENCY | PASS |
| DEVICE_EVIDENCE | EMULATOR_ONLY |
| REAL_R27_BACKEND_E2E | PASS |
| UNIT_TESTS | R26 contracts 9/9; Android 13/13; Node 43/45 with two exact baseline failures |
| INSTRUMENTATION_TESTS | 30 distinct tests PASS (24 R26/shell/session/example + 6 R25); extended R26 five rerun PASS |
| BROWSER_WEBVIEW_TESTS | R26 8/8; regression and full-run limitations above |
| LINT | PASS; 0 errors, 17 warnings |
| BUILD | PASS; web, release web bundle, UAT native app/test APK |
| REGRESSION | Targeted accepted flows PASS; complete-suite exceptions documented above |
| C01 | CLOSED |
| C02 | CLOSED |
| C04 | CLOSED |
| PRODUCTION_WRITE_COUNT | 0 |
| PROVIDER_CALL_COUNT | 0 external calls |
| HIGH_FINDING_COUNT | 0 unresolved findings in this scoped change |
| MEDIUM_FINDING_COUNT | 0 unresolved findings in this scoped change |
| SECRET_EXPOSURE_COUNT | 0 |
| NEW_COMMIT_COUNT | One authorized local commit; post-commit receipt records actual count |
| NEW_COMMIT_SHAS | Post-commit `final-identity.json` |
| PATCH_IDENTITY | Staged patch ID, committed patch ID and source SHA-256 comparison recorded in the post-commit receipt |
| FINAL_WORKTREE | Required CLEAN; verified in the post-commit receipt |
| FINAL_INDEX | Required CLEAN; verified in the post-commit receipt |
| CUSTOMER_ANDROID_REAL_MARKETPLACE_DISCOVERY | READY (local acceptance, EMULATOR_ONLY) |
| PUSH | NOT_DONE |
| PR | NOT_CREATED_OR_UPDATED |
| MERGE | NOT_DONE |
| DEPLOY | NOT_DONE |

## Reproduction

From `v413-ui`, run `npm ci`, `npm run check:runtime`, `npm run build`, `npm run android:sync:uat`, then the Gradle `testUatUnitTest lintUat assembleUat assembleUatAndroidTest` tasks with Android SDK and JBR configured. `node scripts/r26-real-r27-server.mjs --execute-disposable-db` starts the guarded real R27 fixture; `node scripts/r26-browser-preview.mjs` serves the native bundle on loopback port 4177. Run `npx playwright test tests/r26-public-discovery-contract.spec.ts tests/r26-real-r27-contract.spec.ts` and, separately, `npx playwright test --config playwright.r26.config.ts`. The closed-store test changes only its disposable store and restores it in `finally`; run its suite separately from other consumers of that fixture.

Install the locally signed UAT app/test APKs, apply the documented emulator profile, reverse TCP port 5000 and run `R26MarketplaceInstrumentedTest`. Use the unchanged `tests/r25-native-instrumentation-fixture-server.mjs` on port 5000 only after stopping the R27 fixture to run `R25CanonicalVariantInstrumentedTest`. `node scripts/r25-verify-real-r21-backend.mjs --execute-disposable-db` independently checks the immutable accepted R21 authority and exact R25 clients. Stop the owned R27 fixture through its loopback `POST /__r26/shutdown` and verify its cleanup receipt. No remote publication action is part of this reproduction.
