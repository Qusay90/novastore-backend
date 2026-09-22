# R38 live public API compatibility

PROMPT_NUMBER: NOVASTORE-R38-PAYTR-LEGACY-SCHEMA-COMPATIBLE-PUBLIC-REVIEW-RC

Status: **INVENTORY_RECORDED / OWNER_CATALOG_ACTION_REQUIRED / RELEASE_STOPPED**.
This document describes the current legacy authority and incomplete local work. It is not a release seal or deployment approval.

## Authority and acquisition

- Exact worktree: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\pc1-r38-paytr-legacy-schema-review-rc`.
- Branch: `codex/r38-paytr-legacy-schema-review-rc`.
- Initial HEAD: `9a19471aa5e9c06c0e49b8ff0e0281991c0e2dd4`.
- Initial TREE: `8b801e81932b1149c71613aa734ab2015c5730e0`.
- Initial worktree and index: CLEAN; all routing checks passed before repository inspection.
- Render `novastore-api`, service `srv-d6nm17v5r7bs73dhkt80`: authenticated dashboard showed the exact HEAD as last successfully deployed commit and `dep-d9dbbmvaqgkc7386kb1g` as Live. Configured source is `Qusay90/novastore-backend`, branch `main`.
- Render connector required reauthentication; the already authenticated browser UI supplied the read-only attestation. No credentials were extracted and no settings were saved.
- Public observations: HTTPS GET and image HEAD only, with no account credentials, on 2026-09-22. Exact timestamps and response hashes are in `artifacts/r38/live-public-inventory.json` and `artifacts/r38/catalog-blocker.json`.

## Current contracts

| Surface | Current contract and evidence | R38 compatibility boundary |
|---|---|---|
| Home | `/` serves `frontend/index.html`; legacy static frontend. Products, navigation and collections have separate public endpoints. | Accepted R30 presentation must receive actual legacy responses. Public collection quality currently blocks release. |
| Catalog | `GET /api/products` returned HTTP 200 and a bare array of 8 public products. `controllers/productController.js:688` selects active, customer-visible, non-deleted products; its SELECT has no LIMIT. Stock-positive rows sort first, then creation date descending. | Unbounded legacy retrieval is review-only. It cannot be generalized to a bounded array or an unknown deployment. |
| Pagination | `GET /api/products?pagination=cursor&limit=1` returned the same 8 products as a bare array. Legacy source does not implement cursor or limit handling. | Detect arrays separately from `{items,limit,hasMore,nextCursor}`. Reject an unproven/bounded array or an opaque continuation cursor paired with the legacy shape. Never claim a page cache is the entire marketplace. |
| Search | `GET /api/products?q=Karaca` still returned all 8 products. Legacy source has no server search predicate for `q`. | Local text filtering is permitted only after the sealed legacy unbounded-query classification. Newer cursor responses retain server search and continuation authority. |
| Detail | `GET /api/products/:id` returned HTTP 200 for all 8 current public products. Fields include id, name, description, price, stock, image_url, old_price, category/categories, publication status, visibility, store_id, brand/product_type, media, categoryIds, primaryCategoryId and attributes. Prices are decimal strings. | Normalize prices/media and preserve actual descriptions. `store_id` alone does not establish a public store name, slug or legal seller identity. |
| Variant contract | Observed details contain no canonical `variant_selection_required`/`variants` contract. Descriptive product_type is ordinary merchandise text. | Render a simple-product PDP; no inferred purchase combinations or interactive attribute selector. A future canonical contract needs explicit validation. |
| Variant media | No observed `variant_media` DTO. Normal `media` entries include media_url, main marker and order. Ten unique public product media URLs all returned HTTP 200 and image content types. | Default gallery only. No filename, SKU or color inference. This does not certify collection artwork. |
| Categories | `GET /api/public/categories` returned a tree array with 4 roots; default format is tree and `format=flat` is supported by source. `GET /api/categories` returned a 52-entry legacy array. Public detail/filter routes are `/api/public/categories/:slug` and `/:slug/filters`. | Use the public visibility-filtered tree. Product source supports categorySlug/categoryId/category and includeDescendants, plus attribute filtering. Slug/detail/filter routes were inventoried from source, not all exercised live. |
| Navigation | `GET /api/public/navigation/main` returned `{code:"main",name:"şimdiler",items:[]}`. | Empty public navigation may fall back to the actual category tree. Do not invent links. |
| Collections | `GET /api/public/collections` returned one record, `show_on_home:true`, id 1. Detail `/api/public/collections/dfghjkls?page=1&limit=8` returned HTTP 200, that collection and 5 products. Collection source uses page/limit pagination, not the product cursor contract. | **STOP:** the active public collection contains obvious placeholder text and malformed media fields. See below. |
| Store | No `/api/public/stores/:slug` route exists in the live-base server/router authority. Product responses expose store_id but not a canonical public store DTO. | Truthful unavailable state; no invented seller, store slug, follow operation or reputation. No live store request was used as authority. |
| Cart | Existing frontend uses browser storage and authenticated `/api/shared-state/cart` and `/checkout` reads/writes. The owner accepts only keys cart/checkout, normalized product IDs and quantities. | New review adapter uses separate browser-only storage. It must not silently write an existing account's shared state. This new implementation remains unverified. |
| Checkout | Existing `/checkout.html`, POST `/api/campaigns/quote`, POST `/api/payments/initialize`, and authenticated payment-status reads. Direct POST `/api/orders` is disabled by the current order controller. Existing checkout paths can perform account/business operations. | Review must use a separate non-order, non-provider boundary. No production POST or payment initialization was exercised. Current live payment readiness was not inferred. |
| Existing accounts | Live source defines `/api/users/login`, `/api/users/me`, authenticated orders reads and existing admin gates. It predates the R31 session-table authority. | Do not port the R31 backend/session machinery. Broad current-base regression and final existing-account proof remain pending. |
| Legal/contact | No file-backed public legal router or `/api/business-identity` contract exists in the original live-base source. | Draft R38 file-backed routes and identity projection were ported from R35 review material. They are local only, carry `review_template`, and must remain consent-ineligible. |

## Mandatory catalog stop

Both the public collection listing and detail response expose:

| Field | Observed value |
|---|---|
| id / slug | `1` / `dfghjkls` |
| name | `dfghjklş` |
| description | `sdfghuıop` |
| image_url | `sdfguıopğ` |
| banner_url | `dfghjklş` |
| seo_title | `dfghjklğ` |
| seo_description | `ertyuıopğ` |
| show_on_home | `true` |
| visible_product_count | `5` |

The media values are neither HTTPS URLs nor safe root-relative image paths. The eight product names did not contain the explicit test/fixture/Rxx/localhost name patterns checked, and their product media were reachable. The failure is the **active public home collection**, not an assertion that all products are fixtures.

Owner prompt Phase 6 says: “If current real catalog is unsuitable: STOP and report OWNER_CATALOG_ACTION_REQUIRED.” This condition is met. The task did not hide the collection, synthesize replacement content, seed production, or edit catalog records. The owner must correct or intentionally unpublish the unsuitable collection through an authorized catalog process. Resuming release work still requires renewed inventory and all remaining gates.

## Local implementation and evidence limits

R30 `4927621738c0afa38dab6a7460560fc9503e0b41` supplied the Web subtree and necessary client assets/shared modules. No R31 backend was imported. R35 was read only for selected file/config/legal and review-surface changes. R36 supplied data-free schema metadata and its exact reconstruction SQL; no protected worktree was written.

The local PostgreSQL reconstruction matched structural fingerprint `4bdfb53e2823836fc7560570667d65a1ea332ba2ba18632d4dd163389517d56a`. The actual R38 server connected with schema initialization disabled. Its first public requests succeeded, then the harness stopped at `/api/public/navigation/main` (404) because the disposable fixture did not contain a menu record. This is a **local fixture gap**, not evidence of a production missing-table error. The full legacy-schema public-route gate did not pass. The disposable R38 server/container were removed.

An intermediate Web build completed, but had unresolved embedded font paths. Source/assets then changed; a final rebuild was not run before the mandatory catalog stop. The imported Web suite reported 139/145 pass on an intermediate snapshot. Failures include inherited newer-backend expectations, missing generated preview, changed legal DTO expectations and source-contract expectations. They must be reconciled against the actual R38 boundary, not waived or counted as PASS.

No release artifact is sealed. No commit, push, PR, merge, provider request, production mutation, migration or deployment was performed.
