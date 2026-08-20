# Seller F1B Bootstrap and Lifecycle Contract

## Status and boundary

Status: `LOCAL_PERSISTENCE_IMPLEMENTED`. Bootstrap is not part of F1A migration application and is not automatically enabled by F1B persistence; it has no route, feature flag, startup registration, or external visibility. The existing platform store is legacy/catalog data; neither `owner_user_id` nor `novastore-platform` establishes seller organization ownership ([`docs/seller/f1/SELLER-F1-DATA-MODEL-AND-MIGRATION-CONTRACT.md:5-9`](../f1/SELLER-F1-DATA-MODEL-AND-MIGRATION-CONTRACT.md)).

## Preconditions

1. `SELLER-F1A-MIGRATION-REGISTRATION-AND-DISPOSABLE-DB-VERIFICATION` must PASS first.
2. A separate owner authorization must persist an opaque operator reference, exact stable existing `users.id`, exact stable active/non-deleted `stores.id`, intended organization external UUID, and the two non-key display labels used only to create/reconcile the seller rows. Its SHA-256 payload binds every one of those values. This document supplies no values.
3. The operator decision must confirm a single active user and a single eligible legacy store from a source snapshot. The command rejects zero or multiple candidates.
4. No external seller, customer, or all-admin population is created during bootstrap.

## Approved future bootstrap shape

The future `services/sellerFirstPartyBootstrapService.js` may support two modes only:

| Mode | Reads/writes | Result |
|---|---|---|
| `dry_run` | Reads the explicitly selected user/store and current seller rows only. | Returns expected/existing/conflict/quarantine counts and no mutation. |
| `apply` | One transaction after a separately authorized dry-run result. | Creates or reconciles exactly one explicit first-party organization, seller-store binding, owner membership, and explicit scope only when every key matches. |

The system-role and permission seed is owned by F1A migration 1, not by bootstrap: it is deterministic/idempotent SQL ([`migrations/20260730_seller_f1_organizations_roles_memberships.sql:260-320`](../../../migrations/20260730_seller_f1_organizations_roles_memberships.sql)). Bootstrap never edits the catalog or grants platform-only permission.

## Required answers to bootstrap questions

1. **First owner user:** none is preselected. A future authorized operator must supply one existing `users.id` that passes an explicit source snapshot and active-user validation. Admin role alone is insufficient.
2. **Automatic owner creation:** forbidden. The apply mode needs explicit operator input and an approved dry-run identity match.
3. **First-party store resolution:** use one explicitly approved stable `stores.id`; display name is never a key. A catalog slug is insufficient authority even though catalog code uses it for its own scoped read ([`services/adminCatalogProductService.js:145-178`](../../../services/adminCatalogProductService.js)).
4. **Multiple candidate stores:** dry-run returns `BOOTSTRAP_STORE_AMBIGUOUS`; apply is BLOCKED with no write.
5. **No candidate store:** dry-run returns `BOOTSTRAP_STORE_NOT_FOUND`; apply is BLOCKED with no write.
6. **Partial state:** reconcile only exact matching external key, legacy-store ID, selected user ID, owner role, and live scope. A mismatch becomes a conflict/quarantine record in the dry-run report; it is not silently rewritten.
7. **Separate operator authorization:** any apply, any reconciliation that writes, any desired user/store decision, and any future external visibility each require it.
8. **F2/out of scope:** seller login, invitation delivery/acceptance API, session issuance, token handling, onboarding, OTP/MFA, external seller activation, and production deployment.

## Lifecycle contract

| Entity | States and transitions | Required guards | Retention/recovery |
|---|---|---|---|
| Organization | `active -> suspended -> closed`; closed does not reopen without later policy. | Positive revision; organization-scoped writes; suspension blocks new active grants/bindings. | Preserve identity; correction is forward-only. |
| Seller store | `active -> suspended -> closed`; legacy mapping is explicit. | `(organization_id, id)` scope, live unique legacy binding, no `owner_user_id` inference. | Closed mapping is retained; conflicting remap is blocked. |
| Membership | `active`, `suspended`, `revoked`, `expired`. | Live uniqueness; organization-matching role pair; membership revision/stamp atomically updated; last active owner cannot be removed. | Never hard-delete; suspend/revoke and future recovery command only. |
| Store scope | `assigned` with `revoked_at` for terminal scope. | Both composite FKs use the same organization; no wildcard is stored. A logical `all` command expands server-side into the current active seller stores as individual `assigned` rows in one transaction. | Revocation retained; a later explicit new scope is separate history. |
| Invitation | `pending`, `accepted`, `revoked`, `expired`. | Hash-only token, pending uniqueness, assignable non-owner same-organization role. | Retain safe metadata; no plaintext token. |

The F1A schema already enforces organization/store scope pairs and invitation role protection ([`migrations/20260730_seller_f1_store_bindings_invitations.sql:32-59`](../../../migrations/20260730_seller_f1_store_bindings_invitations.sql), [`migrations/20260730_seller_f1_store_bindings_invitations.sql:61-140`](../../../migrations/20260730_seller_f1_store_bindings_invitations.sql)). Lifecycle code supplements, never bypasses, those invariants.

## Idempotency and reconciliation

Bootstrap requires a persisted, one-time operator authorization with a public UUID, immutable opaque operator reference, expected identity payload hash, lifecycle status, revision, and expiry. The authorization row binds the organization external UUID, display labels, explicit legacy-store ID, and explicit selected user ID. An exact existing seller state reached through a new pending authorization returns `NO_CHANGE` only after that authorization is atomically consumed; a state that differs in any bound field returns `BOOTSTRAP_PARTIAL_STATE_CONFLICT`. Pending expired authorizations have an explicit forward-only `expired` transition. A dry-run includes no mutation queries, and apply is one transaction with rollback on every conflict.

## Prohibited automatic behavior

- No automatic seller membership for all admins or any admin.
- No customer-to-seller promotion.
- No conversion of `stores.owner_user_id` to seller owner.
- No search by display name, slug, product, order, or email to select the owner/store.
- No backfill of external sellers, products, offers, inventory, or orders.
- No feature flag, route, UI, Android, provider, or production action.

## Forward recovery

If bootstrap cannot prove exact identity/state, it remains `BLOCKED` and writes nothing. If a completed bootstrap later needs correction, suspend/revoke the relevant membership or binding according to a separately approved command and add a forward correction; do not delete schema/history or rewrite an applied migration.
