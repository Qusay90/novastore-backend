# PC1 R27 shared public discovery and reputation handoff

Prompt: `PC1-R27-PUBLIC-MARKETPLACE-SEARCH-PAGINATION-STORE-ELIGIBILITY-AND-REPUTATION-PAGES-CLOSURE`.
Lane: `PC1_SHARED_PUBLIC_COMMERCE_READS`.
Base HEAD: `6492cc1d7b3033c63cdd1454f62f00975fd51e79`.
Base tree: `0f74570e9a7c60ad63e11e2b49ae799c0fa198fc`.

This contract is shared by Web, Android and other clients. It adds no Android-specific route, category/navigation API, provider integration or schema migration. Product detail, variants, cart, checkout, legal, returns and the Stocky command chain retain their existing contracts.

## Compatibility decision and consumer inventory

The accepted APIs have incompatible legacy shapes: products and public questions are arrays; reviews are an object. Replacing every default with an object would break existing parsers. R27 preserves those shapes, bounds even legacy public requests, and offers `pagination=cursor` for a body containing page metadata. Array responses also expose continuation in HTTP headers. **Shape compatibility does not mean that old consumers already support complete discovery beyond page one.** They must adopt continuation and server-side filtering in a separate client wave; no Web or Android source is modified here.

| Consumer inspected | Current dependency | R27 result / follow-up |
| --- | --- | --- |
| `storefront-commerce-pro/src/adapters/catalogAdapter.js` (PC1 and accepted Web R24 checkout `c83ff7170e640ba8443e9a6e48f6d123bc6e1352`) | `/api/products` is an array; list items drive local category/search selection; R24 reads `variant_selection_required` | Array, commerce fields, brand, category identifiers and variant-required flag remain. Adapt discovery to query `q`/category/attributes and append pages; do not present the first page as the whole marketplace. Detail still loads `/api/products/:id` with canonical variants. |
| `storefront-commerce-pro/src/adapters/productCommunityAdapter.js` | Q&A array; `{reviews, average, totalReviews, reviewPermission}` | Existing fields/array remain. Add Q&A/review continuation; keep the server global review summary. |
| `storefront-commerce-pro/src/adapters/publicStoreAdapter.js` / `PublicStorePage.jsx` | `{store, products}` from `/api/public/stores/:slug` | Existing objects remain, plus `pagination`; `store.product_count` is now explicitly the complete eligible count, independent of page size. Append store pages. |
| Android `NovaStoreApi.kt`, `ProductRepository.kt`, `Product.kt` | `List<Product>`, `List<ProductQuestion>`; PC1 legacy Android also declares `ProductReviewsResponse` | Existing shapes/types remain. R26 should use the opt-in products/Q&A page DTO and review pagination. |
| Accepted Android R25/R26 worktree at `12281f86f2d76a0db423d3979cf1b1cf725047a3`, `v413-ui/src/adapters/customerProductClient.ts` | Canonical `/api/products/:id`; native customer bridge path allowlist | Detail is unchanged. Add shared list/reputation paths and query support in the authorized R26 client wave; do not assume detail normalization itself is a list-page parser. |
| `frontend/app.js`, `frontend/index.html`, `frontend/catalog-plp.js`, `frontend/profile.html` | Legacy product arrays; some local filtering/favorites lookup | Still parse. Complete search, category lists and favorites lookup beyond the first page need an explicit consumer adaptation. |
| `frontend/product.html` | Public question array, review object | Still parse. Add continuation to load additional reputation records. |
| `frontend/admin.html`, `frontend/admin-collections.js` | Authenticated legacy `/api/products` inventory, including drafts/private operations fields | Ordinary authenticated Admin inventory behavior is preserved. Explicit `pagination=cursor` always selects the safe public contract, including for an Admin principal. Canonical `/api/admin/...` reads/writes are unchanged. |
| `scripts/captureMain6yOwnerEvidence.mjs`, `captureMain6yR1OwnerEvidence.mjs`, `captureMain6xCustomerEvidence.mjs`, `stagingVerificationHarness.js` | Public catalog/evidence reads | Legacy array preserved; evidence needing the whole catalog must walk pages. |
| `scripts/serveOfficialRuntimeReview.mjs`, `tools/android-customer-fixture/server.mjs` and their tests | Synthetic producers/fixtures for these paths | No production authority; fixtures will need pagination in the consumer wave. Existing fixtures are unchanged. |
| Product category/attribute, storefront boundary, review publication, public store, Q&A, R19/R21 and legacy-write-retirement tests | Route shapes, visibility, privacy and mutation boundaries | Existing tests retained; SQL assertions adjusted for shared eligibility and real query bounds. New unit + disposable PostgreSQL HTTP tests exercise the actual APIs. |
| `frontend/commerce-pro/index.html` and cutover/preview scripts | Sealed build of the Web adapters and API allowlists | No artifact rebuild or client change in this backend wave. |

Inventory covered executable source, tracked fixtures/tests, generated Web consumers, and the separately accepted R24/R25 sources. Other backend services such as assistant catalog search call their own SQL services, not these HTTP routes; this change does not rework them.

## One public store policy

`services/publicCommerceEligibilityService.js` is used by marketplace discovery, public store projection, Q&A eligibility and review reads. Customer question submission also reuses it.

- `stores.is_active = TRUE`, `deleted_at IS NULL`, valid nonempty public slug and display name.
- Exactly one eligible Seller binding: `seller_stores.status = 'active'`, `closed_at IS NULL`; owning `seller_organizations.status = 'active'`, `closed_at IS NULL`; `COALESCE(seller_store_profiles.operational_status, 'open') = 'open'` under the accepted optional-profile policy.
- Preserve R10's explicit first-party exception: an active/non-deleted `novastore-platform` store with **zero** Seller bindings remains eligible, with its server-owned store name. An ineligible binding cannot fall back to this exception. Arbitrary unbound stores are excluded.
- Public product visibility remains `publication_status = 'active'`, `is_customer_visible = TRUE`, `deleted_at IS NULL`. Out-of-stock public products remain discoverable with truthful availability.

The organization check closes inactive-Seller exposure consistently across these reads. No owner/customer account identifier is returned. Store slug/name comes from the eligible server join, never from request identity. Ineligible products are excluded entirely, rather than returned with `store: null`.

## Shared pagination

All affected public pages use **default 20 / maximum 100**. Only decimal integer limits `1..100` are accepted; zero, negatives, fractions, empty, oversized and duplicate values fail with HTTP 400. Fetching uses SQL `LIMIT limit + 1`; the extra row determines completeness and is not returned. Child media/category reads only load selected page IDs, with per-product media limit 20 and category-link limit 100; published review media limit is 4 per review.

Cursor model follows the existing keyset/camelCase repository conventions. Metadata is:

```json
{"limit":20,"hasMore":true,"nextCursor":"opaque-base64url"}
```

The last page has `hasMore: false`, `nextCursor: null`, including an empty later page. `page` and `offset` are unsupported and rejected. `pagination`, if supplied, must equal `cursor`.

Repeat the same route and filters, adding `cursor=<nextCursor>`. The limit can change. Cursors are strictly validated and bound to resource/filter scope. They contain public ordering keys, not credentials or authorization; every page independently rechecks eligibility. Do not decode or fabricate them. Changing filters starts a new traversal without a cursor. An invalid cursor or one from another product/filter/resource returns 400.

Ordering is stable for a stable dataset:

| Resource | Ordering |
| --- | --- |
| Marketplace and store products | In-stock first, `created_at DESC NULLS LAST`, `id DESC` |
| Q&A | `answered_at DESC NULLS LAST`, `id DESC` |
| Reviews | `created_at DESC NULLS LAST`, `id DESC` |

Cursors preserve PostgreSQL microseconds as strings, avoiding JS Date precision loss. Product identity breaks timestamp ties. Marketplace requests use a read-only repeatable-read transaction and a 3-second server statement timeout. Separate page requests are live reads, not a frozen multi-request snapshot: concurrent catalog edits can move items; reset traversal on changed filters/refresh.

Legacy arrays expose the same metadata as `X-Pagination-Limit`, `X-Pagination-Has-More` (`true`/`false`) and `X-Pagination-Next-Cursor` (empty on completion). These headers are included in `Access-Control-Expose-Headers`. Prefer the body envelope for new consumers.

## Marketplace products

`GET /api/products?pagination=cursor&limit=20&q=kulaklık`

Response: `{items: PublicProduct[], limit, hasMore, nextCursor}`. Without `pagination=cursor`, the public body remains `PublicProduct[]`, still bounded.

Supported filters:

- `q`: literal substring search over **public product `name` and `description` only**; raw input at most 120 UTF-16 code units, trimmed, no minimum. Missing/empty/whitespace means no search filter. PostgreSQL `ILIKE` uses the database's collation/case behavior; no accent folding, stemming, ranking or private Seller metadata search is implied. `%`, `_` and `!` are escaped as literal characters with `ESCAPE '!'`; all values are parameters. NUL and duplicate/non-scalar query values fail with 400.
- Existing `categoryId`, `categorySlug`, `includeDescendants` are retained, including snake-case aliases. ID/slug defaults to descendants; the legacy `category` ID/path/slug/name reference defaults to direct-category matching. Existing category redirects, public visibility, 404 and ambiguous-name 409 behavior remain. Existing precedence remains slug, then ID, then legacy `category`. Duplicate aliases are rejected.
- `attributes` is a JSON object (aliases `attributeFilters`, `attribute_filters`) and preserves existing active/filterable-template rules, scalar/options/arrays, boolean, numeric/range behavior. Maximum encoded value length 4096, 20 filter keys, 50 values per array, 80 characters per attribute code. It composes with category, `q` and cursor pagination; no valid filter is removed in paged mode.
- `limit`, `cursor`, `pagination` as above. Unknown marketplace query parameters fail with 400, including a client-supplied `store_id`.

Example composition:

```text
/api/products?pagination=cursor&q=kulaklık&categorySlug=elektronik&includeDescendants=true&attributes=%7B%22color%22%3A%22blue%22%7D&limit=20
```

Explicit `PublicProduct` allowlist:

| Fields | Type / meaning |
| --- | --- |
| `id`, `name`, `description` | Positive integer; public text; nullable description. Text remains data. |
| `brand`, `product_type` | Nullable public labels, preserved for existing catalog consumers. |
| `price`, `old_price` | Current numeric price; nullable numeric comparison price. |
| `stock`, `is_purchasable`, `variant_selection_required` | Server aggregate availability and required variant selection; fetch the unchanged detail contract before choosing/purchasing a variant. The list does not invent variant IDs. |
| `image_url`, `media` | Safe public URL or null; media allowlist `{id,media_url,media_type,is_main,sort_order,card_framing}`. Existing local-product/configured-Cloudinary image policy. |
| `category`, `categories`, `categoryIds`, `primaryCategoryId` | Public category labels, ID array and nullable primary category ID. |
| `average_rating`, `review_count` | Published-only product summary; average remains a decimal string for legacy Android compatibility, count an integer. |
| `store` | Non-null `{slug,name}` for an eligible store. No internal Seller/store/org/account ID. |

No database-row spread defines this DTO. No cost, SKU, private moderation fields, revision, normalized SKU, internal IDs, token, tax/weight bookkeeping or future unlisted DB column can enter it.

`GET /api/public/stores/:storeSlug?limit=20&cursor=...` retains `{store, products}` and adds `pagination`. Its existing explicit card projection now also includes `variant_selection_required`. It is SQL-bounded and uses the same ordering/cursor rules. `store.product_count`, rating/review totals and store metrics remain complete-set aggregates. The page products are resolved using the server store identity. No store directory API is introduced. Seller public preview uses this same bounded projection, with existing Seller scope checks.

## Public Q&A

`GET /api/questions/product/:productId?pagination=cursor&limit=20&cursor=...`

Response: `{items: PublicQuestion[], limit, hasMore, nextCursor}`. Without opt-in the body remains an array plus continuation headers.

Only questions with a nonblank answer appear, regardless of authentication. Item allowlist:

```text
id, question, answer, user_name, created_at, answered_at, status, is_answered
```

`user_name` uses the existing `maskFullName`; `status` is `answered`, `is_answered` is true. Timestamps retain existing JSON representation and can be null for historical data. Unanswered/blank-answer questions, account IDs, email/phone, `answered_by`, Seller principals and moderation/internal notes are excluded. `/api/questions/user` remains a separate authenticated own-history route; pagination here does not change its scope.

## Public reviews

`GET /api/reviews/product/:productId?limit=20&cursor=...`

The legacy object remains:

```text
{ reviews, average, totalReviews, reviewPermission, pagination: { limit, hasMore, nextCursor } }
```

`pagination=cursor` is accepted but does not change this established object shape. Reviews are strictly `PUBLISHED` and pass the same product/store policy as Q&A. The item allowlist is `{id,rating,comment,created_at,full_name,media}`. `full_name` is masked; media uses `{id,media_url,media_type,sort_order}` and the accepted configured Cloudinary image/video media (plus existing safe local-product image URLs). Hidden/pending reviews and private identifiers do not appear.

`average` and `totalReviews` aggregate the **complete published set**, independently of cursor/limit, including on an empty later page. Existing average representation is preserved: one-decimal string when nonempty, numeric 0 when empty. `reviewPermission` remains the existing authenticated/anonymous permission result, without enabling Seller review writes. The route retains `privateNoStore`. No star distribution is fabricated or returned.

Questions, answers, comments and product labels remain plain text data; clients must use safe text rendering. R27 adds no executable HTML or substitute HTML sanitizer. The existing store-card label normalization remains as before.

## Error semantics

| Status | Meaning |
| --- | --- |
| 400 | `PUBLIC_QUERY_INVALID`, `PUBLIC_LIMIT_INVALID`, `PUBLIC_CURSOR_INVALID`, `PUBLIC_PAGINATION_INVALID`; existing attribute-validation codes and invalid product-ID behavior. Invalid query types/duplicate parameters never enable an unlimited read. |
| 404 | Existing public category-not-found error; `PRODUCT_NOT_FOUND` for missing/nonpublic/ineligible Q&A/review product; `STORE_NOT_FOUND` for unavailable store identity. An eligible product with no reputation returns an empty successful page. |
| 409 | Existing `AMBIGUOUS_CATEGORY`, with canonical candidate category IDs. |
| 401/503 | Existing optional-auth failure semantics remain. |
| 500 | Generic product/Q&A/review read failure, including a product SQL timeout. Product list code is `PUBLIC_PRODUCTS_UNAVAILABLE`; no driver text/SQL/credential is returned or logged by these public read handlers. |
| 503 | Generic public store read failure `PUBLIC_STORE_UNAVAILABLE`. |

## Client resume requirements

Android R26 can implement shared discovery/reputation using these routes and schemas. Keep category/navigation authority in the accepted public APIs. Pass filters to the server, reset cursor on filter changes, append by canonical product/question/review ID, and stop only when `hasMore` is false. Do not filter a presumed complete marketplace locally, invent star distribution, or derive global rating/count from loaded reviews. Preserve R25 detail/variant selection and canonical commerce writes.

Customer Web adaptation **is required** for complete discovery/reputation/store paging beyond the first page. Update catalog/community/public-store adapters and UI loading behavior in a separately authorized wave. Preserve stale-response protection, filter identity, current detail/variant behavior, server totals and existing customer HTTP scope. Do not label the unchanged R24 client as having complete paginated marketplace support.

## Validation and release boundary

Run targeted checks first:

```text
npm run test:public-marketplace
npm run test:public-marketplace:integration
node tests/publicStoreProjectionSmoke.js
node tests/storeFollowSmoke.js
node tests/reviewQuestionOperationsSmoke.js
node tests/reviewPublicationVisibilitySmoke.js
node tests/productQuestionsXssRenderSmoke.js
node tests/purchasableVariantPostgresSmoke.js --execute-disposable-db
node tests/sellerReputationQuestionsPostgresSmoke.js --execute-disposable-db
```

R21 cross-stack regression additionally uses `NOVASTORE_R21_STOCKY_ROOT` pointing to the accepted Stocky source and runs `node tests/stockySystemCommercePostgresSmoke.js --execute-disposable-db`. Its fixture mounts that source read-only and owns disposable copies/databases. Full current PC1 broad CI is `npm run test:ci` (includes the new public contract smoke). In a fresh worktree, install the existing Admin package dependencies and run `npm --prefix admin-commerce-pro run build:live` first: the existing Admin live-artifact smoke needs the ignored `dist-integrated` output. This does not regenerate a committed frontend artifact.

Store-follow identity resolution also calls the shared public store lookup. Its regression retains private response allowlists and now verifies the organization eligibility predicate instead of forbidding any organization SQL join.

The R27 real HTTP fixture includes 105 matching products across two eligible stores, ineligible/unbound/draft/hidden products, first-party compatibility, 27 answered questions plus private unanswered/blank answers, 27 published reviews plus hidden/pending reviews, nested categories, a real filterable attribute, variant-required/simple products, duplicate timestamps/microsecond differences/null timestamps, safe and unsafe media, record 101, limit/search/cursor abuse, live eligibility changes, Admin compatibility, own-question isolation and generic-error privacy. Its report is generated at `artifacts/r27/public-http-proof.json`. Aggregate queries intentionally inspect the complete eligible/published set while returning one summary row; no public item query materializes all rows before slicing.

No new index is required for correctness. Existing primary/foreign-key and category/attribute/reputation indexes support identities/filter joins. Literal contains search may still scan candidates; SQL result bounds and the 3-second statement timeout do **not** claim constant-cost search at arbitrary catalog scale. This wave does not add or apply a migration, and applies the existing 40-migration registry only in disposable PostgreSQL tests.

Local backend readiness is separate from client implementation, physical-device acceptance and deployment. No production DB write, provider call, push, PR, merge or deployment is authorized/performed by this wave.
