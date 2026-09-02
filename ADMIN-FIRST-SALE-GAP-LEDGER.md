# NovaStore Admin first-sale gap ledger

Prompt: `NOVASTORE-FIRST-SALE-R4-ADMIN-COMMERCE-OPERATIONS-FINAL-LAUNCH-GATE`

Every row has exactly one classification:

- `FIRST_SALE_BLOCKER`: Admin/PC1-owned defect that materially endangered the
  first real sale and had to close in R4.
- `EXTERNAL_PAYTR_GATE`: requires PayTR authority, credential/config delivery or
  authorized provider evidence; local code must not fake it.
- `EXTERNAL_COMPANY_GATE`: requires owner/legal/finance/operations/release proof.
- `POST_LAUNCH_ALLOWED`: useful work that does not prevent the first safe sale.

## R4-owned blockers

| ID | Finding | Classification | R4 disposition | Durable evidence |
|---|---|---|---|---|
| R4-B01 | Default Admin login and legacy navigation did not lead to the live operational Commerce Pro surface | FIRST_SALE_BLOCKER | FIXED | login allowlist, live-link and browser navigation tests |
| R4-B02 | Product summary was platform-only and could not show Seller/store ownership; orphan ownership could break the page | FIRST_SALE_BLOCKER | FIXED | marketplace product DTO, nullable fail-closed store tuple, strict mapper/UI tests |
| R4-B03 | Store status came from legacy owner/store state rather than authoritative Seller Store + organization binding | FIRST_SALE_BLOCKER | FIXED | bounded store summary/detail binding tests |
| R4-B04 | Admin order rows omitted canonical items, quantities, store and Seller allocations, tracking and safe payment references | FIRST_SALE_BLOCKER | FIXED | order projection/mapper/UI and PostgreSQL E2E |
| R4-B05 | Admin could not distinguish provider-not-configured, credential, client-IP, activation, test-mode and ready states | FIRST_SALE_BLOCKER | FIXED | safe session capability and six-state fail-closed banner tests |
| R4-B06 | Canonical cancellation could leave Seller order projection in a divergent active state | FIRST_SALE_BLOCKER | FIXED | atomic Seller cancellation convergence, transition audit and replay/rollback tests |
| R4-B07 | Admin manual shipment could act as a second fulfillment authority for a Seller-owned order | FIRST_SALE_BLOCKER | FIXED | service rejection plus Seller-aware UI eligibility test |
| R4-B08 | No authorized route completed `Kargoya Verildi/IN_TRANSIT` to delivered across canonical and Seller projections | FIRST_SALE_BLOCKER | FIXED | exact-state/idempotent delivery command, additive constraint, transition audit, PG E2E |
| R4-B09 | Legacy `/api/products` Admin/media writes could bypass canonical revision/audit mutation contracts outside staging | FIRST_SALE_BLOCKER | FIXED | current-admin-authenticated `410` retirement; Customer GET unchanged |
| R4-B10 | Return and canonical `/api/admin/{categories,attributes,collections,menus}` write capability middleware was staging-only, permitting production bypass | FIRST_SALE_BLOCKER | FIXED | all-environment default-off route contract smoke |
| R4-B11 | Admin build dependency audit reported a high-severity vulnerable Browserslist range | FIRST_SALE_BLOCKER | FIXED | pinned override and zero-vulnerability npm audit |
| R4-B12 | A mixed platform + Seller cart could let one fulfillment side mark the whole canonical order delivered | FIRST_SALE_BLOCKER | FIXED | shared launch guard rejects mixed carts with `CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED` before provider or persistent writes |
| R4-B13 | Multi-Seller checkout was accepted although no single canonical delivery transition could safely converge every Seller allocation | FIRST_SALE_BLOCKER | FIXED | agreement preview, read-only payment preflight and final transaction require exactly one fulfillment sales party; provider-call and no-write regressions |
| R4-B14 | Direct canonical Admin product/media APIs trusted the platform slug and could mutate a store after it acquired an active Seller binding | FIRST_SALE_BLOCKER | FIXED | locked current binding guard returns `ADMIN_CATALOG_SELLER_BOUND_STORE_READ_ONLY` for create/update/archive and every media mutation before catalog DML |
| R4-B15 | Legacy `/api/categories` mutations had current-Admin auth but bypassed the all-environment catalog write capability | FIRST_SALE_BLOCKER | FIXED | public GET unchanged; POST/DELETE require default-off `catalogStructureWrite`, with role/stale-session negatives |

R4 blocker count: **15 at start, 15 fixed, 0 remaining**.

## External PayTR gates

| ID | Finding | Classification | Owner / closing proof |
|---|---|---|---|
| R4-PAYTR-01 | Merchant approval, production credential delivery, canonical HTTPS URLs, proxy/client-IP policy and explicit activation | EXTERNAL_PAYTR_GATE | PayTR + secret/deployment owner; no values belong in Git |
| R4-PAYTR-02 | Authorized success/failure/duplicate/late/mismatch/timeout callback UAT | EXTERNAL_PAYTR_GATE | PayTR-authorized environment and redacted provider evidence |
| R4-PAYTR-03 | Refund/partial-refund/refunded/chargeback execution and reconciliation proof | EXTERNAL_PAYTR_GATE | Provider contract/API or approved panel runbook plus finance reconciliation |
| R4-PAYTR-04 | Marketplace Seller transfer/split/commission/settlement product contract | EXTERNAL_PAYTR_GATE | PayTR + finance + legal written authority and UAT |

External PayTR gate count: **4**. None is locally simulated or marked complete.

## External company gates

| ID | Finding | Classification | Owner / closing proof |
|---|---|---|---|
| R4-COMPANY-01 | Verified company identity and owner/legal-approved public agreements/disclosures | EXTERNAL_COMPANY_GATE | company owner + legal sign-off |
| R4-COMPANY-02 | Production domain/config, DB migration plan, backup/rollback and monitoring | EXTERNAL_COMPANY_GATE | deployment/SRE change record |
| R4-COMPANY-03 | Named Admin/support/refund duty owners, least-privilege accounts and incident/reconciliation runbook | EXTERNAL_COMPANY_GATE | operations/security/finance acceptance |
| R4-COMPANY-04 | Separate production first-sale go/no-go | EXTERNAL_COMPANY_GATE | authorized release and business owner decision |

## Post-launch allowed

| ID | Finding | Classification | Why it is not a first-sale blocker |
|---|---|---|---|
| R4-POST-01 | Dedicated Customer CRM/segment directory | POST_LAUNCH_ALLOWED | Order, return and support contexts provide the minimum investigation path |
| R4-POST-02 | Expanded Seller onboarding/status mutation suite | POST_LAUNCH_ALLOWED | Current launch Seller/store identities can be inspected; onboarding expansion is separate |
| R4-POST-03 | Settlement and payout Admin modules | POST_LAUNCH_ALLOWED | Must wait for the external marketplace payment contract and must not fake transfer |
| R4-POST-04 | Bulk order assignment, generic status editing and custom workflow builder | POST_LAUNCH_ALLOWED | Narrow explicit cancel/shipment/delivery/return commands cover the first-sale path more safely |
| R4-POST-05 | Carrier API, label generation, webhook delivery proof and tracking links | POST_LAUNCH_ALLOWED | Current manual records are visibly unverified and exact-state controlled |
| R4-POST-06 | Advanced dashboard charts, exports and cosmetic Admin polish | POST_LAUNCH_ALLOWED | No first-sale authority or operation depends on them |
| R4-POST-07 | Admin Web Push/notification worker expansion | POST_LAUNCH_ALLOWED | Typed in-app operation remains available; provider activation is a separate wave |
| R4-POST-08 | Native mixed/multi-Seller checkout splitting, package-level payment allocation and multi-tracking convergence | POST_LAUNCH_ALLOWED | Launch checkout is fail-closed to one fulfillment sales party; safe expansion requires a separately designed package/payment lifecycle |

Post-launch allowed count: **8**.

## Closure rule

R4 can report Admin readiness `GO` only when the 15 R4 blockers remain closed,
targeted and full regression pass, independent security review has zero High or
Medium findings, the final worktree/index are clean, and the four PayTR plus
four company gates remain explicitly external. Admin readiness does not itself
authorize a production payment, migration, deploy or first real sale.
