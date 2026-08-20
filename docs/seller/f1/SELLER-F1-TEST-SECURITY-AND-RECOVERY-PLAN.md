# Seller F1 Test, Security ve Recovery Planı

## 1. Durum ve test disiplini

Durum `PLAN_ONLY`. Bu dosya test, dependency, database, network, Android veya runtime çalıştırmaz. F1 implementation her test dosyasını ayrı exact allowlist ile ekler; fixture’lar deterministic ve disposable olur, gerçek `.env`, remote DB, provider, cihaz veya customer/admin data kullanmaz.

Test sırası fail-closed’dur: baseline → migration contract → disposable DB migration → policy/authz → tenant/IDOR → session/security → audit/outbox → disabled API integration → no-regression → independent review. Her failde test/source “onarımı” yalnız yeni exact owner authorizationla yapılır; test gevşetme, `--no-verify`, remote fallback veya flag açma yoktur.

## 2. Gelecek test dosyaları, fixture ve kanıt

| Test dosyası | Tip / fixture | Kanıt |
|---|---|---|
| `tests/sellerF1MigrationContractSmoke.js` | Static SQL/name/order/parser fixture; no DB | Üç migration adı/sırası, source-controlled external-FK type parity, additive-only DDL, no runtime carrier, constraint/index/trigger manifesti ve forbidden destructive tokenları doğrular. |
| `tests/helpers/sellerF1DisposableDb.js` | Local disposable PostgreSQL helper; explicit opt-in | Sadece ayrı izinli local named DB’ye bağlanır; target guard, cleanup ownership ve no-remote proof sağlar. |
| `tests/sellerF1MigrationDisposableDbSmoke.js` | Fresh empty schema + second-apply fixture | Migration apply, idempotent second apply, FK/unique/check/index/append-only trigger ve verification queries PASS. |
| `tests/sellerF1OrganizationMembershipPolicySmoke.js` | In-memory/fake transaction queryable | Organization/store binding, role registry, active membership, last-owner, status/revision/stamp transition ve no `owner_user_id` inference. |
| `tests/sellerF1RolePermissionMatrixSmoke.js` | Frozen system-role/permission matrix | Known permission allow, unknown deny, owner non-assignable, inactive role denial, same-org role rules. |
| `tests/sellerF1MembershipStoreScopeSmoke.js` | Two org/two store graph fixture | Composite org/store membership scope, store mismatch rejection, no wildcard client scope and tenant-leading query predicate. |
| `tests/sellerF1TenantResolverSmoke.js` | Express-like chain + fake DB | Exact middleware order, no-store headers, audience/session/membership/context/permission propagation; controller is unreachable on denial. |
| `tests/sellerF1TenantIsolationSmoke.js` | Org A/B, missing and soft-deleted resource fixtures | Same `404 RESOURCE_NOT_FOUND` for all three; no resource/tenant oracle; ID-only lookup cannot bypass org/store predicate. |
| `tests/sellerF1ClientTenantInputSmoke.js` | Forged body/query/header hint fixture | `organization_id`, `store_id`, role and owner inputs cannot broaden authority; preferred store is a non-authoritative hint. |
| `tests/sellerF1SessionRevisionSmoke.js` | Active/stale/revoked/expired/compromised session rows | DB live session and membership revision/security stamp are authoritative; status/scope/role change invalidates or re-evaluates session. |
| `tests/sellerF1AudienceIsolationSmoke.js` | Signed customer/admin/seller-shaped tokens and unknown issuer/key fixtures | Customer/admin token denial, seller audience exactness, issuer/key/algorithm failure, no claim-only acceptance. |
| `tests/sellerF1RefreshFamilyContractSmoke.js` | Hash-only immutable credential-history, race and replay fixtures | No raw storage, one-time CAS rotation, at most one concurrent success, immediate and older consumed-generation replay family+session revoke, redacted audit. Route remains unmounted/F2. |
| `tests/sellerF1StepUpBindingSmoke.js` | Session/action/target/expiry fixtures | Challenge cannot cross session/action/target/revision; expiry/lock/revoke deny. F1 does not issue a challenge. |
| `tests/sellerF1AuditOutboxSmoke.js` | In-transaction mutation success/failure fixtures | Critical mutation+audit+outbox atomicity, append-only rejection, redaction, correlation/tenant fields and no raw credential/PII. |
| `tests/sellerF1OutboxDeliverySmoke.js` | Immutable event plus append-only leased/delivered/failed/dead-letter attempt fixture | Retry appends an attempt state, respects idempotency/aggregate revision and cannot replay source business mutation. No broker/provider call. |
| `tests/sellerF1ContextRouteSmoke.js` | Disabled flag, injected authenticated seller context fixture | Only F0A `ORG-01`, `ORG-02`, `TEAM-00`, `TEAM-01` candidate reads; false flag denies/unmounts; responses mask PII and never choose multi-context authority. |
| `tests/sellerF1TeamMutationContractSmoke.js` | Static route/service-policy manifest | TEAM-02/03/04 stay absent until separate F1 mutation authorization; no offline queue, owner invitation forbidden, step-up/idempotency/revision requirements preserved. |
| `tests/sellerF1NoRegressionSmoke.js` | Source/route manifest plus existing contracts | No seller adapter uses `/api/admin/**`/customer auth; no Android/admin commerce source changed; seller mount default-off. |

When a migration test is authorized, each migration file also has a corresponding contract test, a disposable-DB scenario and a documented read-only verification query set. Tests may inspect source text only to assert an explicit contract; security truth also requires behavioral fake-DB/transaction fixtures.

Every future F1 test prints `sellerF1<Subject>: PASS` only after all assertions; a skipped disposable-DB prerequisite is `BLOCKED`, not PASS. Runtime dependencies, DB need, negative fixture, concurrency need and cleanup are fixed as follows: static/policy tests use injected fake queryables and no DB; disposable tests require the guarded local helper, fresh named database and owned cleanup; route tests use injected middleware/router fakes and no usable seller bootstrap; all concurrency fixtures are deterministic promises/locks, not network timing.

### Zorunlu kategori kapsam eşlemesi

| Kategori | Gelecek test ve alt-faz | Negatif/cleanup/expected proof |
|---|---|---|
| Schema contract, manifest, double-apply, disposable PostgreSQL | `sellerF1MigrationContractSmoke.js`, `sellerF1MigrationDisposableDbSmoke.js` / F1A | Missing constraint/name order/destructive DDL fails; deterministic database-free external-FK type parity fails before SQL generation or DB connection; owned test DB fresh/second apply then cleanup; `sellerF1Migration*: PASS`. |
| First-party backfill dry-run and no automatic mapping | `sellerF1MigrationDisposableDbSmoke.js`, `sellerF1OrganizationMembershipPolicySmoke.js` / F1A-F1B | `novastore-platform`/`owner_user_id` stay unmapped without owner decision; quarantine/count plan only; no production data. |
| Cross-tenant FK, membership lifecycle, last-owner, RBAC and unknown deny | `sellerF1MembershipStoreScopeSmoke.js`, `sellerF1OrganizationMembershipPolicySmoke.js`, `sellerF1RolePermissionMatrixSmoke.js` / F1B | Mismatched org/store FK, revoke/demote sole owner, unknown role/permission deny; fake transaction rolls back. |
| Tenant repository, A→B IDOR, safe not-found and revision disclosure order | `sellerF1TenantResolverSmoke.js`, `sellerF1TenantIsolationSmoke.js`, `sellerF1ClientTenantInputSmoke.js` / F1D | Cross-tenant/missing/deleted response snapshots match before revision/state lookup; request fixture cleanup only. |
| Active/revoked/expired session, authz-version invalidation and organization suspension | `sellerF1SessionRevisionSmoke.js` / F1C | Stale revision/stamp, suspended organization/membership and revoked session deny; no auth cache survives fixture. |
| Refresh rotation, concurrent-use and replay-family revoke | `sellerF1RefreshFamilyContractSmoke.js` / F1C | Immediate and older generation replay revoke family/session; two same-token promises yield at most one success. |
| Audit append-only/redaction, outbox atomicity and mutation rollback | `sellerF1AuditOutboxSmoke.js`, `sellerF1OutboxDeliverySmoke.js` / F1C | Update/delete rejection, sensitive metadata exclusion, insert failure rolls back mutation, retry appends attempt only. |
| Socket tenant isolation | existing `socketAuthSmoke.js` plus `sellerF1NoRegressionSmoke.js` / F1F | F1 introduces no seller socket/room; any change or admin/customer regression fails. |
| Customer/admin/storefront/startup/no-remote compatibility | F0B + admin baseline commands, `sellerF1NoRegressionSmoke.js`, existing startup safety smoke / F1F | Existing contracts rerun; default route flag and safe local target remain closed; no external DB/service. |
| Feature-flag default-off | `sellerF1ContextRouteSmoke.js` / F1E | Direct route/controller attempt when false is unavailable/closed and cannot be bypassed by an injected tenant. |

### Exact disposable database policy

- Host must be an exact loopback value accepted by `config/startupSafety.js`; remote, pooler, staging and production hosts fail closed before any connection.
- The only future disposable database name prefix is `novastore_seller_f1_test_`; each test appends a generated run id and proves the final name is neither `postgres` nor an existing user database.
- `NOVASTORE_ALLOW_REMOTE_DB` is false, schema initialization is separately authorized, and any target outside the owned prefix is `BLOCKED`.
- Cleanup is allowed only for the created named disposable database after assertions; failed cleanup is reported, never broadened to a directory/cluster cleanup.

## 3. Required fixtures in detail

### 3.1 Organization, store, membership and role fixtures

- `orgA` and `orgB`, each with unique seller store; only `orgA` has an explicit `legacy_store_id` binding.
- Platform `novastore-platform` store present but unmapped; nullable legacy `owner_user_id` supplied as adversarial input and asserted unused.
- Active owner and operator membership in A; active owner in B; suspended/revoked/expired rows; one membership with stale revision/stamp.
- System roles `{owner, manager, operator, viewer}` only if separately owner-approved; unknown role/permission is absent and must deny. Owner is not invitation-assignable.
- Membership-store scopes cover A-only, B-only, revoked scope and mismatched `(membership A, organization B, store B)` rejection.

### 3.2 Session, refresh and step-up fixtures

- Seller session states: active, revoked, expired, compromised; matching/mismatching user, org, membership revision and security stamp.
- Customer/admin token-shaped payloads; wrong audience, wrong issuer/key-id, unsigned/algorithm-confused, expired and tampered credentials.
- Refresh family with current hash plus immutable generation 1/2/3 consumed/replaced history, revoked/expired state and two concurrent identical presentation attempts; replay tests present an older generation as well as the immediate predecessor. Fixtures contain opaque fake hashes only, never usable token text.
- Step-up with correct/incorrect action, target, session, membership revision, expiry and lock count.

### 3.3 Audit/outbox and error fixtures

- Authorized membership scope mutation; denied cross-tenant and last-owner mutation; transaction failure after mutation but before audit/outbox; immutable outbox event and append-only lease/retry/delivered/dead-letter attempt sequence.
- Metadata containing redaction probes: authorization header, raw token, hash, OTP, email, phone, address, tax/bank marker, stack text. Assertions require exclusion/masking.
- Same response snapshots for missing, cross-tenant and soft-deleted resource: status `404`, code `RESOURCE_NOT_FOUND`, no target/org identifier.

## 4. Migration and schema gates

The future three migration files are tested in filename order:

1. `20260730_seller_f1_organizations_roles_memberships.sql`: organization/role/permission/membership checks, partial uniqueness and last-owner support.
2. `20260730_seller_f1_store_bindings_invitations.sql`: 1:1 explicit legacy store binding, composite tenant/store scope relation and hash-only invitation metadata.
3. `20260730_seller_f1_sessions_audit_outbox.sql`: live session/revision fields, immutable hash-only refresh credential history, challenge state, append-only event/attempt triggers and outbox duplicate guards.

Before any F1A SQL generation, `sellerF1MigrationContractSmoke.js` must deterministically read source-controlled schema evidence and compare every external FK. `users.id SERIAL` requires `INTEGER` referencing columns; the effective existing `stores.id` type must be read from repository evidence and matched exactly; new seller-domain `BIGSERIAL` keys keep `BIGINT` only for internal references. A source-type mismatch, a changed source type, or an assumption that all IDs are globally `BIGINT` fails clearly before migration apply or any DB connection. Public UUID identifiers do not replace internal FK integrity.

Mandatory disposable-DB cases: fresh apply; second apply; transaction failure leaves no partial schema/mutation fixture; duplicate active membership; duplicate live store binding; cross-org scope; zero active owner attempt; stale session; raw-token-column/metadata scan; older consumed refresh hash replay; audit/outbox/outbox-attempt update/delete rejection; duplicate aggregate/idempotency event; all required composite FK and tenant-leading indexes. Migration test must prove no connection target outside the explicitly authorized local disposable DB; production/staging are never test targets.

## 5. Authorization and IDOR test matrix

| Actor/session | Target | Expected outcome |
|---|---|---|
| No credential | Any seller read | `401 AUTH_REQUIRED`, no service query beyond auth boundary. |
| Customer/admin token | Any seller read | `401 SELLER_AUDIENCE_REQUIRED`; shared JWT signature alone is insufficient. |
| Seller credential, no DB session | Any seller read | `401 SELLER_SESSION_REVOKED`/safe auth error. |
| Active session, revoked/suspended membership | Own former org | `403 NO_ACTIVE_MEMBERSHIP`/`ACCOUNT_SUSPENDED`; session revoked/reevaluated. |
| Active A membership, A resource | Own allowed store | Service called with A tenant predicate. |
| Active A membership, B resource | Existing B id | `404 RESOURCE_NOT_FOUND`, identical to missing/deleted. |
| Active A membership, A unscoped store | Existing A but outside scope | `404 RESOURCE_NOT_FOUND` or permission deny before lookup; no existence oracle. |
| Unknown role/permission | Any protected action | `403 PERMISSION_DENIED`. |
| Sole active owner | Revoke/demote/suspend | `409 LAST_OWNER_REQUIRED` and no partial mutation. |
| Client-injected tenant/role | Any request | Ignored/rejected; cannot change resolved context. |

## 6. Security gates

1. **Audience separation:** seller verifier rejects customer/admin audience regardless of role claim; no shared browser/mobile storage contract is added.
2. **Live authority:** every protected request loads current session/membership; token claims cannot grant organization/store/permission/resource ownership.
3. **Unknown-deny:** no default role, broad store scope or capability is inferred for unrecognized values.
4. **Last owner:** DB/service transaction sees concurrent active owner set and cannot leave an organization ownerless.
5. **Tenant/IDOR:** all tenant resource queries begin organization then store; cross-tenant/missing/deleted share response shape.
6. **Session/revoke:** role/status/scope/security changes invalidate or re-evaluate affected sessions; socket is not considered seller-authorized in F1.
7. **Refresh/replay:** raw credential absent; immutable per-generation credential history makes any prior consumed/replaced hash detectable; one use/one rotation; replay revokes family/session and emits redacted security event.
8. **Step-up:** action/target/session/expiry/revision binding; no OTP/secret in audit/error/log.
9. **Audit/outbox:** same transaction, immutable event plus immutable delivery-attempt history, redaction and retry isolation; failed audit/outbox insert aborts critical business mutation.
10. **Feature flag:** false is default and has no bypass via direct route/controller/service; flag never substitutes for authz.

## 7. Baseline and compatibility rerun

Before and after F1 implementation, all must pass unchanged:

```text
node tests/sellerF0bDocumentContractSmoke.js
node tests/sellerF0bScreenMatrixContractSmoke.js
node tests/sellerF0bSecurityInvariantContractSmoke.js
node tests/adminCommerceProSessionContractSmoke.js
node tests/adminCommerceProHttpSmoke.mjs
```

Additional regression targets after an authorized F1 code change: `tests/socketAuthSmoke.js`, relevant `tests/adminSessionAuthSmoke.js`, admin catalog/session smokes and any changed-route tests. Failure in customer/admin baseline means F1 stops; it is not repaired by changing the compatibility contract or disabling a test.

## 8. Recovery test plan

- **DDL/migration failure:** no retry against remote DB; verify disposable target and transaction state, retain exact failure, add a forward correction migration only after authorization.
- **Backfill ambiguity:** do not map legacy store/owner/product; emit no seller ownership. Future authorized process quarantines and reports counts.
- **Membership/security incident:** suspend/revoke membership/session/family, append a redacted security/audit event, require fresh F2 authentication; do not restore old credentials.
- **Audit/outbox failure:** transaction aborts before business commit. After commit, delivery failure appends lease/retry/dead-letter attempt records without replaying the original mutation or updating/deleting prior events.
- **Bad immutable record:** never update/delete it; append correction/reversal event with safe reference.
- **Flag/runtime issue:** preserve schema, keep seller flag false/disable new mount through authorized configuration; no destructive rollback.

## 9. Independent final review requirements

After F1 changes, Tester reruns the full named baseline plus F1 tests; Security checks audience/tenant/session/redaction/replay/IDOR/last-owner paths; Reviewer checks exact allowlist, architecture compatibility, migration order and no scope creep. Each is read-only, creates no evidence file and does not alter Git/DB/network state. Main agent independently repeats critical tests and verifies their claims against source and git diff.

No PASS permits migration apply, feature activation, external delivery/provider, F2 authentication, Android, commit, push or PR without a separate owner authorization.
