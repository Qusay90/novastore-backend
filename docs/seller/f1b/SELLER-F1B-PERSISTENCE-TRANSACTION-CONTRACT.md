# Seller F1B Persistence and Transaction Contract

## Status and binding decision

Status: `LOCAL_PERSISTENCE_IMPLEMENTED`; F1A defines the tables and database invariants, and F1B consumes them only through an injected pool/queryable after guarded disposable execution. No F1B service is registered at startup or reachable from a route. The application service pattern supplies an explicit pool, owns a client transaction, rolls back, and releases in `finally` ([`services/adminCatalogMutationService.js:36-62`](../../../services/adminCatalogMutationService.js), [`services/adminCatalogMutationService.js:90-196`](../../../services/adminCatalogMutationService.js)).

## Architecture decision

Classification: `COMBINED_PERSISTENCE_SERVICE`. There is no repository directory or shared query-helper abstraction. F1B therefore uses narrow services with injected `database`/`queryable` dependencies, like existing services, and does not create a repository layer. Read-only methods receive a queryable. A multi-table mutation service owns the pool client and transaction; nested services receive that client and never begin or commit another transaction.

## Universal rules

1. A caller supplies normalized data and an already-resolved authoritative context; no HTTP body/query/header seller identifier is authority.
2. Every tenant-owned lookup starts `WHERE organization_id = $1`; a store lookup adds `AND store_id = $2`. ID-only seller reads are forbidden.
3. `stores.owner_user_id`, an admin role, a customer record, and catalog ownership never establish seller access. The binding F1 contract says this explicitly ([`docs/seller/f1/SELLER-F1-DATA-MODEL-AND-MIGRATION-CONTRACT.md:5-9`](../f1/SELLER-F1-DATA-MODEL-AND-MIGRATION-CONTRACT.md)).
4. Unknown permission, role, lifecycle state, or unrecognized row is deny. Cross-organization/missing/closed rows map to `RESOURCE_NOT_FOUND` before leaking state.
5. Internal seller IDs are `BIGINT`; a mapper accepts a number or numeric string only when it is a positive safe integer. It never silently truncates. Public UUIDs remain opaque canonical strings. Timestamps map from `Date`/database timestamp to ISO 8601 strings or `null`.
6. F1A has no physical `authz_version` column. Here, `authz_version` names the atomic authorization version represented by `seller_memberships.membership_revision`; role/scope/status changes must increment it and replace `security_stamp` in the same transaction. No new column is proposed.
7. Error/log/audit handoff data must not contain invite tokens, token hashes beyond approved correlation, passwords, bank/payment data, or raw database connection information.

## Component contract

| Proposed exact path | Responsibility and tables | Allowed SQL | Mandatory predicate/locking | Input and output | Transaction/error/test obligations | Forbidden behavior |
|---|---|---|---|---|---|---|
| `services/sellerAuthorizationService.js` | Organization lifecycle and membership lifecycle; `seller_organizations`, `seller_memberships`, `seller_roles`. | Scoped `SELECT`, `INSERT`, `UPDATE`; no hard `DELETE`. | Lock organization then affected membership/role with `FOR UPDATE`; role is queried with `(organization_id = $1 OR organization_id IS NULL)` and its paired organization input. | `organizationId`, `membershipId`, `userId: INTEGER`, `roleId`, expected revision, lifecycle command; immutable mapped DTO. | Owns multi-row transaction; translate unique conflict to `SELLER_MEMBERSHIP_CONFLICT`, trigger `LAST_OWNER_REQUIRED` to 409, stale revision to `SELLER_REVISION_CONFLICT`; rollback/release/race tests required. | Bare role lookup for a custom role, client ownership assertion, auto-admin membership, session/token issuance. |
| `services/sellerRolePermissionService.js` | Fixed system-role, permission, and role-permission reads; `seller_roles`, `seller_permissions`, `seller_role_permissions`. | Read-only `SELECT`. | Role query is system role or organization-matching role; permission list filters active known codes. | Organization scope plus role code/ID; frozen role/permission DTO. | Queryable injection; unknown role/permission maps deny, not fallback; unit matrix required. | Client-created permissions, platform permission grant, owner invitation assignment. |
| `services/sellerStoreBindingService.js` | Seller-store binding and membership scopes; `seller_stores`, `seller_membership_store_scopes`, `seller_memberships`. | Scoped `SELECT`, explicit `INSERT`, lifecycle `UPDATE`. | Organization row, membership, and seller-store are read/locked in that order. Scope writes pass `(organization_id, membership_id)` and `(organization_id, store_id)` pairs. | Explicit legacy `storeId: BIGINT` only in bootstrap/internal command; an `all` command is server-side fanout to current active seller stores, not a wildcard row. | Owns binding/scope write transaction or joins authorization transaction; translate live legacy binding unique conflict; rollback/composite-FK/concurrency tests required. | Deriving scope from `owner_user_id`, persisted wildcard authority, product/store inference. |
| `services/sellerInvitationService.js` | Invitation create/read/revoke/expire; `seller_invitations`, role/membership tables for scope. | Scoped `SELECT`, `INSERT`, lifecycle `UPDATE`. | Lock inviter membership and both inviter/target roles in the same organization; `team.invite` is required; lookup derives a purpose-bound SHA-256 only for pending/unexpired state. | Hash-only email storage and transient token input, organization/membership/role pair, expected revision; redacted invitation DTO. | Owns invitation mutation transaction; pending-email/token unique conflicts map to safe conflict; expiry/replay/revoke tests required. | Raw token persistence/logging, acceptance API, delivery provider, owner invitation. |
| `services/sellerFirstPartyBootstrapService.js` | Explicit operator-approved dry-run/apply orchestration; organization/store/membership/scope tables. | Reads for dry-run; guarded inserts/updates only after separate approval. | Lock exact operator-selected `users.id`, selected `stores.id`, target organization and existing bindings. | Written operator decision includes stable existing user and store IDs; dry-run report or idempotent result. | One transaction for apply; no automatic retry; dry-run/idempotency/partial-state reconciliation tests required. | Display-name selection, default admin selection, external activation, customer promotion, guessed recovery. |

## Transaction ownership and order

For an organization/membership/store-scope write, the top-level service must:

1. Validate scalar types, allowed lifecycle transition, expected revision, and fixed permission input before `connect`.
2. `BEGIN` on one client.
3. Lock the organization, then membership (when present), then role, then seller-store/scope rows in ascending ID order.
4. Perform all reads with tenant predicates before reading resource state that could disclose another organization.
5. Apply the mutation with `revision`/`membership_revision` compare-and-set. A role, scope, or status change atomically advances the mapped `authz_version` and replaces `security_stamp`.
6. Let F1A composite foreign keys, unique indexes, role-scope trigger, and last-owner trigger remain a second line of defense ([`migrations/20260730_seller_f1_organizations_roles_memberships.sql:121-255`](../../../migrations/20260730_seller_f1_organizations_roles_memberships.sql), [`migrations/20260730_seller_f1_store_bindings_invitations.sql:32-59`](../../../migrations/20260730_seller_f1_store_bindings_invitations.sql)).
7. Commit only after all intended rows are returned and mapped. Release the client in `finally`.

F1B does not write runtime audit/outbox rows. Its audit handoff boundary is an immutable, redacted command summary returned to a future F1C service; F1B must not import F1C code.

## Last-owner and suspension rules

The database trigger locks active owners and rejects removal of the last one with `LAST_OWNER_REQUIRED` ([`migrations/20260730_seller_f1_organizations_roles_memberships.sql:151-195`](../../../migrations/20260730_seller_f1_organizations_roles_memberships.sql)). F1B must make its role/status update and this invariant one transaction; it may not pre-count outside the transaction. Organization suspension blocks future active membership grants and seller-store activation; no current session behavior is added in F1B. Closing/revoking/suspending remains lifecycle state, not hard delete.

## Conflict, retry, and result mapping

- `23505` is translated by constraint name to a bounded domain conflict; it never exposes database SQL.
- `23503`/`23514` role/scope/invariant failures translate to safe validation or not-found results as appropriate; cross-organization detail is never disclosed.
- `40001` and `40P01` translate to `SELLER_PERSISTENCE_RETRYABLE`; F1B performs no automatic unbounded retry. A caller may retry only an idempotent command from a fresh authoritative read.
- `LAST_OWNER_REQUIRED` remains a 409-style domain error; no partial response or committed mutation is returned.
- Any unexpected database error is redacted as `SELLER_PERSISTENCE_UNAVAILABLE`; `ROLLBACK` and release are still attempted.

## Invitation and bootstrap boundaries

`seller_invitations` stores hash-only email/token values, requires a pending uniqueness key, and its trigger rejects a cross-organization/non-assignable/owner role ([`migrations/20260730_seller_f1_store_bindings_invitations.sql:61-140`](../../../migrations/20260730_seller_f1_store_bindings_invitations.sql)). Token lookup is purpose-bound to invitation acceptance and is not a general credential lookup. F1B plans storage/lifecycle only; it does not accept an invitation through an API.

Bootstrap is a separate `F1B4` command with explicit operator input. It cannot infer an owner from an admin role, `owner_user_id`, a platform-store slug, a display name, or a product relation. If scope resolution needs a future caller context, that context is injected by test only until F1D; F1B itself creates no middleware.
