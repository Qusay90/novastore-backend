# Seller F1B Test, Security and Recovery Plan

## Status and test order

Status: `LOCAL_PERSISTENCE_VERIFIED`. F1B validation uses the registered four-file chain (the three F1A migrations plus the F1B bootstrap-authorization carrier) and a guarded disposable local target. Existing guard-only behavior remains mandatory: exact loopback hosts, F1 prefix, explicit operation/apply/cleanup gates, and no client import on helper load ([`tests/helpers/sellerF1DisposableDb.js:5-125`](../../../tests/helpers/sellerF1DisposableDb.js)). No production, staging, route, or feature activation is implied.

## Future verification matrix

| Future test path | Type | Dependencies / fixture | Assertions and negative cases | Concurrency, cleanup, PASS output | Subphase / severity |
|---|---|---|---|---|---|
| `tests/sellerF1MigrationRegistrySmoke.js` | STATIC_CONTRACT_TEST | New explicit registry and current F1A file hashes. | Exact ordered names, no startup import, no duplicate registration, checksum/receipt policy is explicit. | No DB; `sellerF1MigrationRegistrySmoke: PASS`; missing/duplicate/order mismatch BLOCKED. | F1A-PREREQ / BLOCKING |
| `tests/sellerF1MigrationDisposableDbIntegrationSmoke.js` | DISPOSABLE_DB_TEST | Existing helper, fresh prefixed local DB, separate apply authorization. | Fresh apply, second apply, transaction failure rollback, required tables/FKs/indexes/triggers, no remote target, owned cleanup. | Sequential fresh/second apply; cleanup only prefix; `sellerF1MigrationDisposableDbIntegrationSmoke: PASS`; any target/cleanup issue BLOCKED. | F1A-PREREQ / BLOCKING |
| `tests/sellerF1OrganizationMembershipPolicySmoke.js` | UNIT_TEST | Injected queryable and deterministic organization/role/membership rows. | Create/read/suspend/close; source ID types; unknown role/permission deny; client seller IDs do not authorize. | Fake lock order; no DB; `sellerF1OrganizationMembershipPolicySmoke: PASS`; tenant leak FAIL. | F1B1 / BLOCKING |
| `tests/sellerF1RolePermissionMatrixSmoke.js` | UNIT_TEST | Frozen system-role and permission fixture. | Known active permission allow; unknown/inactive/platform permission deny; owner is never invitation-assignable. | No DB; `sellerF1RolePermissionMatrixSmoke: PASS`; broad fallback FAIL. | F1B1 / BLOCKING |
| `tests/sellerF1MembershipStoreScopeSmoke.js` | DISPOSABLE_DB_TEST | Two organizations, two stores, two memberships on guarded DB. | Composite organization/membership/store predicates; no wildcard; revoked scope not live; wrong organization fails. | Concurrent cross-scope attempts; owned cleanup; `sellerF1MembershipStoreScopeSmoke: PASS`; cross-tenant row FAIL. | F1B2 / BLOCKING |
| `tests/sellerF1PersistenceTransactionSmoke.js` | CONCURRENCY_TEST | Fake transaction client plus disposable DB focused scenarios. | Commit contains all intended changes; injected failure rolls back; release once; `23505`, `40001`, `40P01` translate redacted. | Last-owner race, stale revision, simultaneous scope change; `sellerF1PersistenceTransactionSmoke: PASS`; connection leak FAIL. | F1B2 / BLOCKING |
| `tests/sellerF1InvitationPersistenceSmoke.js` | DISPOSABLE_DB_TEST | Same-org and cross-org role/membership fixture. | Hash-only values, token uniqueness, pending email uniqueness, same-org assignable role, revoke/expire, purpose-bound replay denial. | Competing same-token/same-email writes; cleanup; `sellerF1InvitationPersistenceSmoke: PASS`; plaintext/replay/cross-org acceptance FAIL. | F1B3 / BLOCKING |
| `tests/sellerF1FirstPartyBootstrapSmoke.js` | OPERATOR_DRY_RUN | Explicit fixture user/store IDs and partial-state fixtures. | Dry-run has zero writes; no owner inference; explicit apply is idempotent; zero/multiple candidate and partial mismatch block. | Repeat apply and reconciliation race; cleanup; `sellerF1FirstPartyBootstrapSmoke: PASS`; automatic admin membership FAIL. | F1B4 / BLOCKING |
| `tests/sellerF1PersistenceCompatibilitySmoke.js` | COMPATIBILITY_TEST | Existing customer/admin startup and catalog fakes. | Customer/admin behavior unchanged; catalog slug logic not reused as seller authority; all seller flags remain false. | No DB target outside guarded fixture; `sellerF1PersistenceCompatibilitySmoke: PASS`; startup/flag drift FAIL. | F1B5 / BLOCKING |

## Required test obligations by risk

### Transaction and connection safety

Every write test must assert one `BEGIN`, one terminal `COMMIT` or `ROLLBACK`, and exactly one `release`. The existing catalog mutation test already demonstrates this observable contract with `BEGIN`, `FOR UPDATE`, revision update, audit insert, `COMMIT`, and `RELEASE` ([`tests/adminCatalogMutationFoundationSmoke.js:219-240`](../../../tests/adminCatalogMutationFoundationSmoke.js)). Seller tests must not borrow admin authorization or audit semantics.

### Tenant and authorization safety

- All tenant-owned query fixtures require organization first, then store where applicable.
- Cross-organization, missing, suspended, and closed target cases return the same safe not-found shape before revision details.
- Custom role assignment uses an organization-matching `(organization_id, role_id)` input pair; system roles are allowed only through the fixed system-role rule. The database trigger is a required independent proof ([`migrations/20260730_seller_f1_organizations_roles_memberships.sql:121-145`](../../../migrations/20260730_seller_f1_organizations_roles_memberships.sql)).
- A role/scope/status change atomically advances F1A `membership_revision` (the planned `authz_version` semantic) and changes `security_stamp`; no seller session is issued or mutated in F1B.

### Last-owner and lifecycle safety

Tests must execute the real F1A `LAST_OWNER_REQUIRED` trigger on the guarded disposable DB and race two mutations that each attempt to remove/demote the final owner. Exactly zero ownerless committed organizations are allowed. Suspension, revoke, expiry, and closed entities must remain retained; hard delete is rejected by the F1A trigger ([`migrations/20260730_seller_f1_organizations_roles_memberships.sql:151-246`](../../../migrations/20260730_seller_f1_organizations_roles_memberships.sql)).

### Bootstrap safety

Dry-run tests must use explicit fixture IDs and prove no automatic admin membership, no `owner_user_id` inference, no display-name/slug selection, no external seller activation, and no customer promotion. Apply tests must prove idempotency and partial-state conflict behavior under a single transaction.

### Disposable database safety

All DB tests must use only the F1A helper's exact host set and `novastore_seller_f1_test_` prefix. They must not read `.env`, derive a URL, target a remote/staging/production DB, or clean a non-owned name. Error snapshots redact credentials. A skipped local prerequisite is `BLOCKED`, never `PASS`.

### Compatibility and recovery

Before and after every authorized F1B unit, rerun:

```text
node tests/sellerF0bDocumentContractSmoke.js
node tests/sellerF0bScreenMatrixContractSmoke.js
node tests/sellerF0bSecurityInvariantContractSmoke.js
node tests/sellerF1MigrationContractSmoke.js
node tests/sellerF1MigrationDisposableDbSmoke.js --guard-only
node tests/adminCommerceProSessionContractSmoke.js
node tests/adminCommerceProHttpSmoke.mjs
node tests/startupSafetySmoke.js
```

Rollback test failure means no retry against another target. A source correction requires a new owner authorization; migration corrections are forward-only. No test may enable a seller route, session, audit/outbox runtime, or Android behavior.
