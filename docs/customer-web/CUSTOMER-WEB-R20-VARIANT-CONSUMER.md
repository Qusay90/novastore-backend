# Customer Web R20 — canonical variant consumer

Customer Web authority is `ce76b3ed45576d721fc250cad989f00c27d31690`,
tree `6af785c48e3fb961e6bef127c6cbfe35029f1ab2`. R15 parser and production
navigation protections were replayed as scoped hunks while retaining R13 returns.
See `CUSTOMER-WEB-R20-AUTHORITY.md` for ancestry and replay evidence.
R19 `d3e5fdadf961429c6860f18bd1706fac23add9e7` is contract authority only.

## Implemented behavior

- Simple products retain their existing shared cart and checkout flow.
- Product detail offers only complete canonical server variant rows. Selection is
  explicit; unavailable rows are disabled. Descriptive attributes never generate
  purchase combinations. Selected price includes TRY minor units; selected stock
  comes from detail. No selection is reported as a sold-out product.
- Cart identity, removal, quantity updates and payment reconciliation use product
  ID plus variant ID. Same variants aggregate; different variants remain separate.
- The accepted shared-state v1 bridge discards variant IDs. Variant lines therefore
  use `novastore_variant_cart_<customer-id|guest>` local storage, containing IDs
  and quantity only. Legacy synchronization receives only simple lines. Guest
  merge, authentication, subscription, reload and navigation preserve variants.
  Cross-device variant cart synchronization is not implemented in this lane.
- Quote, agreement preview and initialize serialize cart lines as
  `{product_id, variant_id, quantity}`; simple lines omit `variant_id`.
  Cached price, stock, SKU, store and labels never authorize a purchase.
- Cart detail refresh renders current server data or a truthful unavailable state.
  Pending/deleted selections never contribute a displayed zero/partial total.
  Review uses server quote rows. Historical order labels and SKU use order snapshots.
- Stale/disabled/deleted/foreign/out-of-stock variants cannot enter an accepted
  purchase. Initialize conflicts invalidate legal acceptance and refresh quote/
  preview without changing variant identity. Server raw error codes have truthful
  Turkish messages. Superseded quote responses and principal changes are rejected.

## Validation

| Required gate | Result |
| --- | --- |
| CUSTOMER_WEB_VARIANT_SELECTION | PASS |
| CUSTOMER_WEB_VARIANT_PRICE | PASS |
| CUSTOMER_WEB_VARIANT_STOCK | PASS |
| CUSTOMER_WEB_VARIANT_CART_IDENTITY | PASS |
| CUSTOMER_WEB_VARIANT_CHECKOUT_BODY | PASS |
| SIMPLE_PRODUCT_REGRESSION | PASS |
| VARIANT_REQUIRED_NEGATIVE_MATRIX | PASS — six counters zero |
| RESPONSIVE | PASS — 1440, 1024, 768, 390, 360; detail/cart/review |
| RETURN_REGRESSION | PASS — 34 R13 browser checks and variant order return |
| CHECKOUT_LEGAL_REGRESSION | PASS — no-consent gate, fresh acceptance after conflict |
| PRODUCTION_ORIGIN_HYGIENE | PASS — generated closure and misuse probes |

Package tests: 104 passed, 0 failed. Strict browser consumer proof: 72 checks,
24 screenshots, zero uncaught errors, zero external requests, zero provider calls.
Favorites, comparison clearing, mobile navigation, NovaBot modes and seller
recruitment navigation are included in browser preservation checks.
All browser source hashes match between bundle construction and test completion.
Canonical, integration, fixture and cutover builds pass. Canonical source hash
locks are unchanged; generated runtime hash is deliberately updated and still
verified against the exact source transformation.

Evidence is local and ignored by Git:

- `artifacts/r20-variant-consumer/runtime-result.json`
- `artifacts/r20-variant-consumer/variant-*.png`
- `artifacts/r13-return-tracking/runtime-result.json`
- `artifacts/r20-variant-consumer/final-attestation.json` records final commit,
  tree, tested/committed patch digest, worktree/index and post-commit raw-byte matrix.

The optional legacy `tests/webProductFavoriteAndCartUiSmoke.js` fails at line 83
on both the exact accepted base and R20: it expects
`NovaStoreSharedState.formatPrice` in old HTML routes. Its inputs are unchanged,
and it is absent from the CI runner. This inherited legacy test is not proof of
the served Commerce Pro consumer; the current consumer checks above pass.

## Evidence boundary

Browser proof uses the real production-mode Customer Web bundle, real adapters,
transport and unchanged shared-state/favorites scripts against a disposable
loopback HTTP contract fixture. The fixture follows R19 detail-only variant rows,
quote `id`/`line_total`, raw variant errors and historical order snapshots.
Its legal hashes/documents and successful initialize boundary are synthetic.

Final converged PC1 E2E is NOT_RUN. Backend legal generation, actual ownership
resolution, inventory reservation and final initialize transaction still require
that separate integration gate. No backend/Admin/Android change, production
write, PayTR/provider operation, push, PR, merge or deployment is authorized or
performed by this patch.

Reproduce package checks after `npm --prefix storefront-commerce-pro ci` and
`npm --prefix storefront-commerce-pro run build`; run
`node storefront-commerce-pro/scripts/verify-variant-consumer.mjs` and
`node storefront-commerce-pro/scripts/verify-return-tracking.mjs` with local
Chrome. Production origin and committed build identity are checked by
`node tests/commerceProNavigationOriginSmoke.js` and
`node tests/commerceProCutoverArtifactSmoke.js`.
