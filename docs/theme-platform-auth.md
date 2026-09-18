# Theme Platform authorization adapter

`services/themePlatformAuthService.js` adds Theme Platform authorization without changing existing Admin or Seller authentication. It grants no role to a real account by default.

## Entry points and trust boundary

- Run the existing Admin bearer middleware before `principalFromAdmin(req)`.
- Run the existing Seller audience/session/tenant middleware before `principalFromSeller(req)`.
- Both factories return only `{ kind, userId, sessionId }`. Request body roles, tenant IDs, permissions, and delegated credentials are not accepted as authority.
- Call `await authorize(client, principal, permission, serviceOrNull)` on the operation's transaction client before idempotency replay or resource access. It returns frozen, freshly loaded server authority.
- The exported `rolePermissions` object is the canonical seven-role action matrix. `assignment.accept` is a mutation: only super_admin, theme_admin, seller_owner, seller_admin, and seller_editor receive it. Seller viewer and support do not.

Admin sessions are rechecked against the live session registry and current enabled Admin user. An explicit active `theme_admin_roles` binding is required; an existing Admin account has no implicit Theme Platform super role.

Seller authorization reloads the organization, membership, system role, enabled user, session, explicit theme role, and assigned active stores. The live session must match the membership revision and security stamp. An absent explicit binding allows only an active global system `owner` to receive `seller_owner`. Any inactive explicit binding denies access, including system owners. An explicit viewer remains read-only. Only seller_admin and seller_editor may gain publication and rollback through boolean `publish_allowed = true`.

Seller `serviceOrNull = null` is accepted only for `assignment.read` and `service.read` list operations. The caller must scope list SQL by returned `organizationId` and `storeIds`. All other Seller actions need a service row loaded and locked by the caller. The adapter checks the exact organization, assigned store, and `ACTIVE` service status. Feature grants, service time windows, quotas, revisions, lifecycle rules, and idempotency are separate service-layer checks; passing this adapter alone does not grant those capabilities.

## Transaction and revocation requirements

Use an explicit `READ COMMITTED` transaction. Lock the Theme Platform service first, authorize second, and access the operation ledger afterward. Keep authorization row locks until the operation commits or rolls back. The adapter does not begin or commit transactions and must not receive a pool with per-query implicit transactions.

Admin authorization takes shared locks on session, user, and explicit role rows. Seller authorization discovers session scope, then locks organization, membership, existing role, user, live session, explicit role, and store-scope/store rows. Membership uses `FOR UPDATE`; the other authoritative rows use `FOR SHARE`. The membership lock also conflicts with the foreign-key key-share lock needed to insert a new explicit theme role, protecting the absent-binding owner fallback. Under `READ COMMITTED`, the role query after a lock wait observes a newly committed binding. Do not silently substitute `REPEATABLE READ` with an earlier snapshot.

Changed authority is reloaded on every invocation and every retry. Database failures propagate; HTTP callers must sanitize them. Deadlocks, timeouts, or serialization failures must roll back the whole transaction before a fresh attempt. A previously returned actor object must never be reused as an input principal.

## Local verification

Run `node --test --test-reporter=tap tests/themePlatformAuthUnitSmoke.js`.

The focused suite has 36 tests covering the seven roles, assignment acceptance, principal trust boundaries, live revocation and membership mismatches, explicit deny, owner fallback, publish override, tenant/store isolation, missing service scope, lock-query shape, fresh authorization on retry, and database failure. It uses mock database clients and does not prove real PostgreSQL lock behavior, HTTP middleware execution, or production authorization. Disposable database integration tests must verify those boundaries separately.
