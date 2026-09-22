# R38 PayTR public review release seal

PROMPT_NUMBER: NOVASTORE-R38-R1-RESUME-SEAL-PAYTR-LEGACY-SCHEMA-REVIEW-RC-AND-CONDITIONAL-PUBLIC-DEPLOY

Sealed at 2026-09-22T16:24:12.699Z. All mandatory local release gates PASS. This document is added in a metadata-only child commit of the final tested source commit below. The final release commit/tree and deployment receipt are recorded outside their own Git tree in artifacts/r38-r1; self-referential commit hashes are intentionally avoided.

| Authority | Exact value |
|---|---|
| Final source HEAD | 017aed82ba90fe0f17dc54e1350d48227cdbd897 |
| Final source TREE | 8207e4a086c572d3c7dd07f12f1e0f2343b2c784 |
| Branch | codex/r38-paytr-legacy-schema-review-rc |
| Live-base / rollback commit | 9a19471aa5e9c06c0e49b8ff0e0281991c0e2dd4 |
| Initial tree | 8b801e81932b1149c71613aa734ab2015c5730e0 |
| R30 visual source reference | 4927621738c0afa38dab6a7460560fc9503e0b41 |
| Canonical HTML SHA256 | 8b6301362b6c01b649db1d7cfa4dc00d5b4392309e4ece2c7c14870cab0f2b0d |
| Canonical App SHA256 | d31e7642f6bccb75094361be3dc2dd3b85cc38a4d968bbfd57ee3ee7ffd80fb6 |
| Canonical CSS SHA256 | 5b8e0d4a4eb1fb954e089f5c0e9dbabcad8217032ef12e3a67a03d89072e0896 |
| Exact R36 schema fingerprint | 4bdfb53e2823836fc7560570667d65a1ea332ba2ba18632d4dd163389517d56a |
| Web artifact | frontend/public-review/index.html |
| Web bytes / SHA256 | 5271557 / 2900017ad5f00c6e5e0f0b01c6b3a4d63458fb713a19479ef7e0274f28b52cad |
| Two independent clean builds | PASS / byte-identical to browser-tested artifact |
| Review config SHA256 | 89245f5fe57978c353eef251d967e223c0497a412f284a255d080eb41c6e1b8f |
| Contact JSON SHA256 | ed46695d76d5d111fd0d9c5cb5f9d48e67b946cd569eb292165652c8a575f3b2 |
| Legal version | review-2026-09-22.3 |
| Test-to-commit identity | PASS; 74 exact paths; 122 Git LF-normalized text paths only |
| Initial WIP identity | 184 paths, d364ceb4686f4151e203bae922c62d3949e53fcab2a47fdddf7218d6e44591c4, PASS |
| Source inventory SHA256 | a392462c1212eb21faaac8b8845a356718419aa5f78c50147b3f3b6d2469d61e |
| Rollback deployment | dep-d9dbbmvaqgkc7386kb1g |
| Render service | srv-d6nm17v5r7bs73dhkt80 / novastore-api |
| Render current configuration | main; Auto-Deploy Off; yarn install; node server.js |
| Permitted delivery | Push only exact R38 branch; Deploy a specific commit from any branch |

## Intended delta and restrictions

Modern R30 Customer Web and its packaged assets are added beside the exact legacy backend. Early review routers supply public legal/contact/identity, exact built Web bytes, existing-customer login presentation, explicit denial of new registration, orders, payment initialization and nonessential analytics/assistant writes. Legacy application boot refuses schema initialization. HTTP adapters distinguish attested unbounded Product[] from complete cursor metadata, reject ambiguous input, preserve category fallback and descriptive/default media, and expose no invented public Store or variant authority. Cart/favorites are isolated browser review state; no account credential is used for review browsing. Shared old customer footer phone is corrected. There is no legacy Admin redesign or feature; Commerce Pro Admin remains permanent direction.

No production schema, migration, catalog mutation, provider credential, Supabase ACL/RLS, persistent Render branch/config, auto-deploy, main merge or PR is part of this release. The stopped R38 report remains historical only; R38-R1 reconciliation supersedes it. R35/R36/R37, Stocky S10 and Android worktrees remain outside this change.

## Gate evidence

- Web: 153/153 PASS, zero skipped; previous six failures reconciled in R38-R1-TEST-RECONCILIATION.md.
- Canonical, integration, fixture and review builds PASS. Exact canonical source hashes unchanged.
- Actual final server / exact legacy schema: 57 HTTP checks PASS; no missing table; initialization disabled; database-enforced read-only application role. All table counts and schema fingerprint unchanged after browser flow.
- Root startup safety, admin-session and payment-provider config smokes PASS. Public review/legal HTTP test PASS: 12 legal documents + Contact, no-JS text, links, contact, role distinction, escaping, false consent eligibility, registration/order/payment denial before downstream work.
- Browser: 21 routes × 6 widths (1440×1000, 1280×720, 1024×768, 768×1024, 390×844, 360×800) plus existing login and unavailable Store: 128 measurements. Zero horizontal overflow, critical clipping candidates, broken images, PAN/CVV fields or mismatched contact. Search, simple-product gallery/lightbox, cart and three review checkout stages exercised.
- 740 recorded application requests: GET/HEAD only; zero failed requests, order creation, payment initialization or provider calls.
- axe-core: 31 final captured-DOM/CSS desktop/mobile WCAG A/AA runs, zero violations / zero critical. Gradient/image contrast and unopened-popup aria-controls remain manually reviewed categories; live modal/focus behavior and visible text were checked separately. This is not a general WCAG certification.
- Source dependency and exact artifact origin scan PASS: 62 runtime source files, no localhost/deneme/fixture/dev-server/disk-path dependency. All 24 CSS assets embedded; no external font URL.
- Candidate source and exact artifact secret scan PASS; no discovered PayTR/database/service-account/private-key secret or secret value printed.
- Fresh unauthenticated catalog GET/HEAD at 2026-09-22T16:19:10.929Z: 8 products, 10 media URLs HTTP200, 4 public root categories, empty valid main menu, no public collections. id1/dfghjkls absent; direct detail 404 COLLECTION_NOT_PUBLIC. Production catalog writes: 0.

## Public contact and legal state

NovaStore

Baruthane Mah. Bafra Cad. No: 101A

İç Kapı No: 3

İlkadım / Samsun

Türkiye

0555 177 24 30 — tel:+905551772430 — destek@novastore.tr

Trade title, VKN, MERSİS, KEP, tax office, registry/chamber and ETBİS remain pending. No invented identity. Every document remains review_template, consentEligible=false, requiredForCheckout=false, lawyerApproved=false.

| Legal document | Public path | SHA256 |
|---|---|---|
| about | /hakkimizda | e6bf4d98ded2cbfff634fa7b450cf779a1db4e193b8655884caad3abb5aa1d98 |
| privacy | /gizlilik-politikasi | 752527cfc07f2e27871cfec788ca1413d347e516a59ef6d9b3b9bf364d058798 |
| kvkk | /kvkk-aydinlatma-metni | 412d14bdc15a132c7f93cf75cad4a72476c61b4994a6243f1f58e05e77313578 |
| cookies | /cerez-politikasi | 527cdebfbe429be8312d7bd861e313001de9124d31f883bed429944ba13a3d36 |
| membership-terms | /kullanim-ve-uyelik-kosullari | f357520ab0ec05d481a6e0666715367cee847646c527be6c05a944fc1901fc58 |
| delivery-shipping | /teslimat-ve-kargo-kosullari | f02d0d4599f9f379437f70474bd9cc3fde08154f6cc9dd956f2cf00aa4ced196 |
| cancellation-return | /iptal-iade-cayma-politikasi | 58401bdfaafcce3f82a70131da97a2b21bb77a5c1d3b28710d93c67f536e8441 |
| distance-sale | /mesafeli-satis-sozlesmesi | 832614f99b25490f2f8fa619b106f04f14b49036aa80da5c517241cf4870b04a |
| pre-information | /on-bilgilendirme-formu | f6f5c966d0c7b91b2b850fd67c4b8bac7fc460d3d5b77b8d0d1d295d627e2021 |
| transaction-guide | /islem-rehberi | b3bb4c6d581151375ffff6029427cf011b6230f53f4e6b9e8eb780dc3d75dee5 |
| marketplace-disclosure | /pazaryeri-bilgilendirmesi | 5c78cfd45d7a63540d9807d38e84c202adee7ae3258763dad819973bb1caf9f8 |
| seller-agreement | /satici-sozlesmesi | 45669ffafd53318096bffa36a05ca64a3f8d042f01bbe3835cbf8b395bbdaa49 |

## Rollback and completion boundary

Before remote delivery re-attest that Live is still dep-d9dbbmvaqgkc7386kb1g at the base commit. The rollback uses that existing deployment/code, with no DB rollback because this release performs zero production DDL/migration/data mutation. If exact-commit delivery requires main merge or persistent configuration mutation, stop with OWNER_RELEASE_ACTION_REQUIRED=YES. Do not substitute another release.

REAL_PAYMENT_READY=NO; REAL_PAYMENT=DISABLED; LEGAL_IDENTITY_COMPLETE=NO; PRODUCTION_FIRST_SALE=NOT_READY. A successful public review deployment does not close provider approval, company/legal work, R36/R37 migration, R34/C05 or remaining acceptance gates.
