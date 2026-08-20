# Seller F1B Persistence Implementation Plan

## 1. Status and scope

Status: `LOCAL_PERSISTENCE_IMPLEMENTED`. The described persistence sequence is implemented and verified only against a guarded disposable local database. It does not authorize a runtime route, startup registration, production database connection, feature flag, or deployment. F1B excludes seller login, seller sessions, refresh rotation, audit/outbox runtime, middleware, routes, offers, orders, finance, Android, and feature activation.

## 2. Binding F0A/F0B/F1/F1A contracts

- F0A requires server-side membership and tenant scope, unknown-deny, safe not-found, append-only security records, and separately authorized database application ([`docs/seller/PHASE-GATES.md:7-18`](../PHASE-GATES.md)).
- The F1 boundary expressly keeps `createCoreSchema` out of the seller migration carrier role and treats `stores.owner_user_id` as legacy data, never as seller authority ([`docs/seller/f1/SELLER-F1-DATA-MODEL-AND-MIGRATION-CONTRACT.md:3-9`](../f1/SELLER-F1-DATA-MODEL-AND-MIGRATION-CONTRACT.md)).
- F1B starts only after an F1A migration proof; its intended service boundary is organization, store binding, role, permission, membership, and last-owner policy ([`docs/seller/f1/SELLER-F1-IMPLEMENTATION-PLAN.md:81-86`](../f1/SELLER-F1-IMPLEMENTATION-PLAN.md)).
- F1A fixes external-key parity: `users.id` references are `INTEGER`, legacy `stores.id` references are `BIGINT`, and seller-domain internal keys remain `BIGINT` ([`docs/seller/f1/SELLER-F1-DATA-MODEL-AND-MIGRATION-CONTRACT.md:21-44`](../f1/SELLER-F1-DATA-MODEL-AND-MIGRATION-CONTRACT.md)).

## 3. Current repository architecture

| Capability | Classification | Evidence | F1B consequence |
|---|---|---|---|
| PostgreSQL pool | EXISTING | `config/db.js:160-169` creates and exports one `pg` pool. | Future persistence services receive the pool as an explicit dependency. |
| Multi-write transaction service | EXISTING | `services/adminCatalogMutationService.js:90-196` owns `BEGIN`/`COMMIT`, rolls back on error, and releases in `finally`. | Reuse this service shape, not its admin policy or tables. |
| Optimistic revision shape | EXISTING | `services/adminCatalogMutationService.js:150-167` performs `WHERE id = $1 AND revision = $2` and checks `RETURNING`. | Seller writes require the same compare-and-set discipline, scoped by organization. |
| Result mapping | PARTIAL | `services/adminCatalogProductService.js:49-88` maps database values explicitly. | Seller mappings must validate numeric safety instead of treating a raw database value as authority. |
| Repository layer | MISSING | There is no `repositories/` directory; current persistence is service/queryable based. | Do not introduce a repository layer. Use narrow dependency-injected services. |
| Generic migration registry | MISSING | `models/createCoreDb.js:1-8,168-173` hard-codes existing schema adapters; no F1 adapter is imported. | A dedicated, non-startup F1 registry is a prerequisite proposal. |
| Startup schema carrier | EXISTING but BLOCKED for seller | `server.js:278-302` calls only core, notification, commerce, and analytics initialization; F1 contract excludes `createCoreSchema` as seller carrier. | Do not register F1 through `server.js` or `models/createCoreDb.js`. |
| Startup remote/local guard | EXISTING | `config/startupSafety.js:106-200` rejects unsafe schema targets and controls initialization. | The prerequisite must retain stricter F1A loopback/prefix checks. |

## 4. F1A readiness assessment

F1A SQL is ready for **static** verification, not for an assertion that it has run. The contract test requires the exact three ordered files, transaction boundaries, idempotency, source-type parity, tenant constraints, and append-only guards ([`tests/sellerF1MigrationContractSmoke.js:10-155`](../../../tests/sellerF1MigrationContractSmoke.js)). The files declare organizations/roles/memberships, stores/scopes/invitations, and sessions/security tables in that order ([`migrations/20260730_seller_f1_organizations_roles_memberships.sql:1-119`](../../../migrations/20260730_seller_f1_organizations_roles_memberships.sql), [`migrations/20260730_seller_f1_store_bindings_invitations.sql:1-94`](../../../migrations/20260730_seller_f1_store_bindings_invitations.sql), [`migrations/20260730_seller_f1_sessions_audit_outbox.sql:1-262`](../../../migrations/20260730_seller_f1_sessions_audit_outbox.sql)).

The static result does not prove PostgreSQL accepts every object, that a second apply succeeds, or that the trigger/constraint behavior is live. Those claims remain BLOCKED.

## 5. Migration registration assessment

`DECISION_B` applies. A separate migration-registration and disposable-DB phase is mandatory before F1B persistence implementation.

Evidence is direct:

1. F1 says every unit requires a bounded transaction, idempotent second-apply proof, verification query, empty mapping state, and a separate disposable-DB authorization ([`docs/seller/f1/SELLER-F1-DATA-MODEL-AND-MIGRATION-CONTRACT.md:11-19`](../f1/SELLER-F1-DATA-MODEL-AND-MIGRATION-CONTRACT.md)).
2. The current core initializer imports only pre-existing schema adapters ([`models/createCoreDb.js:1-8`](../../../models/createCoreDb.js)) and applies only those adapters ([`models/createCoreDb.js:168-174`](../../../models/createCoreDb.js)); no F1A migration is registered.
3. Startup is not a valid substitute: it conditionally connects and invokes the non-seller initializers ([`server.js:284-302`](../../../server.js)), while the binding F1 contract prohibits making it a seller carrier.

The prerequisite may add an explicit, non-startup `models/sellerF1MigrationRegistry.js` and bounded disposable integration tests. It must not modify `server.js` or `models/createCoreDb.js`, and it must not target a non-disposable database.

## 6. Disposable-DB verification assessment

`DISPOSABLE_DB_EXECUTION_REQUIRED_BEFORE_F1B: YES`.

The present helper is intentionally a pure guard: it accepts only exact loopback hosts, the `novastore_seller_f1_test_` prefix, the exact three paths, and separate operation/apply/cleanup opt-ins ([`tests/helpers/sellerF1DisposableDb.js:5-125`](../../../tests/helpers/sellerF1DisposableDb.js)). The current smoke refuses any invocation without `--guard-only`, patches networking functions, and proves zero socket use ([`tests/sellerF1MigrationDisposableDbSmoke.js:9-45`](../../../tests/sellerF1MigrationDisposableDbSmoke.js)). It does not import a database client or apply SQL.

Therefore the prerequisite must prove: fresh empty disposable database, exact ordered apply, second apply, rollback on injected failure, constraint/trigger/index verification, owned cleanup, and zero remote target attempts. The existing guard remains an unchanged dependency.

## 7. Confirmed reusable foundations

- `pg` queryable/pool shape and `client.release()` discipline: `config/db.js:160-169`; `services/adminCatalogMutationService.js:90-196`.
- Pre-validation before opening a transaction and external side effects only after commit: `services/adminCatalogMutationService.js:60-72`.
- Lock then revision compare-and-set pattern: `services/adminCatalogMutationService.js:90-167`.
- First-party catalog uses a constrained store lookup, but its slug-based convention is catalog-only and cannot establish seller ownership: `services/adminCatalogProductService.js:145-178`.
- F1A already provides database-level last-owner and cross-organization role guards: `migrations/20260730_seller_f1_organizations_roles_memberships.sql:121-255`.

## 8. Confirmed persistence gaps

- No registered F1A migration registry or migration checksum/receipt exists.
- No live disposable F1A apply/double-apply test exists.
- No seller organization, role/permission, membership, store-binding, or invitation service exists.
- No seller-specific transaction/error/result mapper exists.
- No authorized bootstrap identity or legacy-store mapping decision exists.
- No seller route, middleware, session, audit/outbox service, or feature flag activation is planned in F1B.

## 9. F1B goals

After the prerequisite passes, F1B may build narrow dependency-injected services that:

1. read/create/update/suspend organizations under explicit transaction ownership;
2. resolve fixed system roles and known permissions with unknown-deny;
3. create/read/change/revoke memberships with live-scope predicates and same-transaction last-owner protection;
4. bind a seller store only through explicit `legacy_store_id` and organization predicates;
5. add/revoke explicit membership store scopes;
6. persist hashed invitations without raw-token storage; and
7. perform an explicit, dry-run-first first-party bootstrap only after a separate operator decision.

## 10. F1B non-goals

No seller authentication, token/session operation, refresh rotation, audit/outbox runtime write, tenant middleware, HTTP API, invitation delivery, OTP/MFA, onboarding, offer/inventory/order/finance, Android, production migration, backfill, or flag activation belongs to F1B.

## 11. Recommended implementation sequence

| Phase | Purpose | Exact future paths | Entry and exit | Recovery and authorization |
|---|---|---|---|---|
| `F1A-PREREQ` | Register F1A SQL outside startup and prove fresh/second apply on the guarded disposable target. | `models/sellerF1MigrationRegistry.js`; `tests/sellerF1MigrationRegistrySmoke.js`; `tests/sellerF1MigrationDisposableDbIntegrationSmoke.js` | Entry: current F1A hashes and guard-only PASS. Exit: registration order, fresh apply, second apply, schema verification, rollback, cleanup PASS. | A separate migration/DB authorization; failure is BLOCKED and repaired only forward. |
| `F1B1` | Organization, system role, permission and role-permission read/write policy. | `services/sellerAuthorizationService.js`; `services/sellerRolePermissionService.js`; `tests/sellerF1OrganizationMembershipPolicySmoke.js`; `tests/sellerF1RolePermissionMatrixSmoke.js` | Entry: F1A-PREREQ PASS. Exit: tenant-scoped organization reads, unknown-deny, owner protection, revision conflict tests PASS. | One local commit after test closure; separate owner authorization. |
| `F1B2` | Membership lifecycle and explicit store scopes/bindings. | `services/sellerStoreBindingService.js`; `tests/sellerF1MembershipStoreScopeSmoke.js`; `tests/sellerF1PersistenceTransactionSmoke.js` | Entry: F1B1 PASS. Exit: composite predicate, rollback, cross-organization, last-owner race tests PASS. | Forward lifecycle correction only; separate owner authorization. |
| `F1B3` | Invitation persistence/lifecycle with purpose-bound hash lookup. | `services/sellerInvitationService.js`; `tests/sellerF1InvitationPersistenceSmoke.js` | Entry: F1B2 PASS. Exit: pending uniqueness, expiry/revoke/replay and no-plaintext tests PASS. | No delivery or acceptance API; separate owner authorization. |
| `F1B4` | Explicit first-party bootstrap/pilot persistence. | `services/sellerFirstPartyBootstrapService.js`; `tests/sellerF1FirstPartyBootstrapSmoke.js` | Entry: F1B3 PASS plus written operator identity/store decision. Exit: dry-run/idempotency/partial-state reconciliation PASS. | No automatic user/store selection; separate operator authorization. |
| `F1B5` | Persistence compatibility and no-regression closure. | `tests/sellerF1PersistenceCompatibilitySmoke.js` | Entry: F1B1–F1B4 PASS. Exit: customer/admin/startup safety and default-off evidence PASS. | Commit-only authorization remains separate. |

## 12. Dependency graph

```text
F0A/F0B contracts + F1 plan
            |
            v
F1A static/guard-only foundation
            |
            v
F1A-PREREQ: registry + disposable fresh/second apply
            |
            v
F1B1 org/role/permission -----> F1B2 membership/store scope
            |                                  |
            +----------------------------------+
                                               v
                              F1B3 invitations -> F1B4 explicit bootstrap
                                               |
                                               v
                                   F1B5 compatibility closure
```

## 13. Transaction order

For every F1B write: validate normalized input and resolved authoritative context before `connect`; acquire one client; `BEGIN`; lock organization/membership/role rows in deterministic organization-first order; apply tenant-scoped mutation with revision compare-and-set; rely on F1A trigger/unique constraints as a second guard; write no audit/outbox row in F1B; `COMMIT`; map the result; release in `finally`. Any error causes one guarded `ROLLBACK`, redacted error translation, and release.

`authz_version` is **not** an F1A column. In this plan the term means the authorization version carried by F1A `seller_memberships.membership_revision`; it must increment atomically with role, scope, or status changes and pair with a new `security_stamp`. No new `authz_version` column is proposed.

## 14. Test order

1. Existing F0B, F1A static/guard-only, admin compatibility baselines.
2. F1A registration and disposable fresh/second-apply proof.
3. F1B1 unit and SQL-shape tests.
4. F1B2 transaction, rollback, race, and cross-organization tests.
5. F1B3 invitation hash/lifecycle tests.
6. F1B4 dry-run/idempotency/partial-state tests.
7. F1B5 customer/admin/startup compatibility rerun.

## 15. Compatibility strategy

Customer and admin code remains read-only in F1B. The existing first-party catalog may continue resolving its catalog store through its own slug predicate, but this is not seller authority ([`services/adminCatalogProductService.js:145-178`](../../../services/adminCatalogProductService.js)). `stores.owner_user_id`, admin role, product ownership, and a client-provided seller ID never grant a seller membership.

## 16. Feature-flag boundary

F1B creates no feature-flag source and changes none. Binding F1 flags remain false; schema or service existence never mounts a seller endpoint ([`docs/seller/f1/SELLER-F1-IMPLEMENTATION-PLAN.md:141-146`](../f1/SELLER-F1-IMPLEMENTATION-PLAN.md)).

## 17. Recovery strategy

Migration failure is a prerequisite-phase BLOCKED result: no remote retry, no applied-file edit, and only a separately authorized forward correction. Persistence failures roll back their transaction. Lifecycle corrections suspend/revoke or append a new authorized record; they do not hard-delete membership, audit, or outbox data. Bootstrap ambiguity remains dry-run BLOCKED rather than guessed.

## 18. Commit boundaries

Each `F1A-PREREQ` and `F1B1`–`F1B5` unit requires a distinct exact-file authorization, test rerun, staged allowlist, and local commit authorization. This planning phase creates no commit.

## 19. Owner authorization gates

Required gates are: F1A registration/disposable DB, each F1B subphase, explicit first-party operator identity/store selection, every commit, and any later API/flag/remote/staging/production work. A PASS plan is not authorization for any one of them.

## 20. Exact next phase recommendation

`SELLER-F1A-MIGRATION-REGISTRATION-AND-DISPOSABLE-DB-VERIFICATION`.

Decision: `DECISION_B`. F1B implementation is blocked until that prerequisite proves registered order and fresh/second disposable application while preserving F1A's loopback, prefix, explicit-opt-in, credential-redaction, and cleanup rules.
