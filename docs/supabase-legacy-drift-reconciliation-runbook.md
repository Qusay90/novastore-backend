# Supabase Legacy Drift Reconciliation Runbook

## Status and authority boundary

This artifact is a production-migration **preparation**, not an apply authorization.

- Repository: `Qusay90/novastore-backend`
- Prepared from `main`: `f25385bdc9abe8ec77717f8e7cb505ef5cd50d1f`
- Supabase project identity checked read-only: `ytiqiljtopsinlbkweop`
- Production mutation performed while preparing this artifact: **NO**
- Production apply authorized by this runbook: **NO**
- PR26 apply authorized by this runbook: **NO**
- Production migration-history records created or inferred: **NO**

The production preflight used an explicit repeatable-read, read-only transaction with certificate verification. It exported aggregate counts and ephemeral salted identifiers only; no order/customer contents or credentials were written to evidence.

## Required execution order

The repository has no automatic migration runner and no NovaStore-owned production migration-history table. The new file was authored on 2026-08-20 and intentionally does not rewrite or backdate history, so lexical filename order alone would place PR26 first.

If a later release is separately authorized, its explicit order must be:

1. `migrations/20260820_supabase_legacy_drift_reconciliation.sql`
2. Reverify logical postconditions for migrations #1-#13.
3. Only under a separate PR26 approval, run `migrations/20260806_supabase_rls_quarantine_fail_closed.sql`.

Any runner that can only execute lexical filename order is **not safe for this release**. Do not rename PR26, backdate the reconciliation file, fabricate history rows, or treat PR26 as already applied.

## Verified production drift snapshot

All values below were re-read without mutation on 2026-08-20.

| Column | Total | NULL | Non-NULL | Existing default | Repair decision |
|---|---:|---:|---:|---|---|
| `visitor_sessions.started_at` | 1,242 | 0 | 1,242 | `CURRENT_TIMESTAMP` | No data repair; guarded `SET NOT NULL` |
| `visitor_sessions.last_seen_at` | 1,242 | 0 | 1,242 | `CURRENT_TIMESTAMP` | No data repair; guarded `SET NOT NULL` |
| `page_visits.entered_at` | 2,477 | 0 | 2,477 | `CURRENT_TIMESTAMP` | No data repair; guarded `SET NOT NULL` |
| `page_visits.last_seen_at` | 2,477 | 0 | 2,477 | `CURRENT_TIMESTAMP` | No data repair; guarded `SET NOT NULL` |
| `page_visits.duration_seconds` | 2,477 | 0 | 2,477 | `0` | No data repair; guarded `SET NOT NULL` |
| `page_visits.heartbeat_count` | 2,477 | 0 | 2,477 | `0` | No data repair; guarded `SET NOT NULL` |
| `product_actions.quantity` | 60 | 0 | 60 | `1` | No data repair; guarded `SET NOT NULL` |
| `product_actions.created_at` | 60 | 0 | 60 | `CURRENT_TIMESTAMP` | No data repair; guarded `SET NOT NULL` |
| `notifications.is_read` | 119 | 0 | 119 | `false` | No data repair; guarded `SET NOT NULL` |
| `notifications.created_at` | 119 | 0 | 119 | `CURRENT_TIMESTAMP` | No data repair; guarded `SET NOT NULL` |
| `returns.status` | 0 | 0 | 0 | `'REQUESTED'::character varying` | No data repair; guarded `SET NOT NULL` |
| `returns.created_at` | 0 | 0 | 0 | `CURRENT_TIMESTAMP` | No data repair; guarded `SET NOT NULL` |
| `returns.updated_at` | 0 | 0 | 0 | `CURRENT_TIMESTAMP` | No data repair; guarded `SET NOT NULL` |

The five required indexes are absent and no equivalent btree index exists under a different name:

- `idx_product_actions_user_id` on `product_actions (user_id ASC)`
- `idx_product_actions_created_at` on `product_actions (created_at DESC)`
- `idx_notifications_created_at` on `notifications (created_at DESC)`
- `idx_returns_status` on `returns (status ASC)`
- `idx_returns_created_at` on `returns (created_at DESC)`

The migration accepts one valid semantic equivalent under a different name and does not create a duplicate. A wrong definition under an expected name or multiple equivalents aborts before mutation.

## Migration #4 data explanation

The exact original `20260702_menu_collection_foundation.sql` algorithm currently finds:

- 7 qualifying legacy source items.
- 0 matching deterministic `(order_id, source_item_index)` targets.
- 7 truly absent targets.
- 0 conflicting deterministic keys.
- 0 equivalent business rows under a different key.
- 7/7 requested product references still resolve.
- 7/7 source orders have a stable historical `created_at`.
- No inbound foreign key references `order_items` or `order_item_backfill_issues`.
- `order_item_backfill_issues` contains 0 total rows in the verified production snapshot.

The earlier “2 missing issue rows” finding is a pre-step observation, not the sequential final postcondition:

1. Before the seven order items exist, the original issue predicate identifies two orders as `items_partially_unreadable` because their current item counts are below their JSON array lengths.
2. Migration #4 inserts readable order items first.
3. With those exact seven targets simulated as present, the same original issue predicate identifies zero rows.

The reconciliation therefore inserts seven order items and inserts **zero** issue rows. Writing two issue rows would fabricate a final condition that the original sequential migration does not produce. The migration asserts both the initial `7 + transient 2` shape and the final `7 + 0` shape.

## Fail-closed behavior

Before the first mutation, the migration:

- obtains a transaction-scoped advisory lock;
- verifies all nine required tables and owner-role inheritance;
- obtains `ACCESS EXCLUSIVE` locks on the data and DDL targets;
- verifies the exact type/default for all 13 columns and requires zero NULLs;
- classifies all five indexes by structure, not name alone;
- reconstructs the exact migration #4 parser and target values;
- requires either the exact initial state (0 matching, 7 missing) or exact replay state (7 matching, 0 missing);
- rejects partial application, key conflict, different-key business equivalence, unresolved product references, missing source timestamps, source-count drift, stale issue rows, and concurrent release/app writes.

Only after every check passes does it insert rows, advance the owned sequence transactionally, set NOT NULL, and create missing indexes. Exact affected-row and postcondition assertions run before commit.

The migration assigns the seven `order_items.id` values from the locked maximum of the table and owned sequence, then uses transactional `ALTER SEQUENCE ... RESTART`. It deliberately avoids `nextval()` so a later transaction failure cannot leave non-transactional sequence residue.

## Lock and operational impact

The migration uses one transaction and locks these small drift targets plus the source/backfill tables in `ACCESS EXCLUSIVE` mode. The read-only production snapshot measured:

- `visitor_sessions`: about 1,242 rows / 688 KiB
- `page_visits`: about 2,477 rows / 1.09 MiB
- `product_actions`: 60 exact rows / 128 KiB
- `notifications`: 119 rows / 112 KiB
- `returns`: 0 rows / 64 KiB

`orders`, `products`, `order_items`, and `order_item_backfill_issues` are also locked to keep source parsing and duplicate checks stable. A 5-second lock timeout makes the migration abort instead of waiting through active application traffic. An authorized release would still require a maintenance window or confirmed write quiescence.

Indexes are intentionally non-concurrent because the release requires one atomic transaction and exact rollback on any postcondition failure. The verified table sizes make this reasonable, but production must be re-read immediately before any separately authorized apply.

## Rollback classification

Artifact: `migrations/rollback/20260820_supabase_legacy_drift_reconciliation.rollback.sql`

| Forward action | Classification | Rollback behavior |
|---|---|---|
| Five btree indexes | `EXACTLY_REVERSIBLE` for verified pre-state | Exact definitions required, then exact names dropped |
| Thirteen NOT NULL flags | `EXACTLY_REVERSIBLE` for verified pre-state | Exact type/default/NOT NULL required, then NOT NULL dropped |
| Sequence restart in a failed forward transaction | `EXACTLY_REVERSIBLE` | PostgreSQL transaction rollback restores it |
| Seven historical `order_items` after commit | `NOT_SAFELY_REVERSIBLE` | Deliberately retained; no blind DELETE |
| Issue rows | `EXACTLY_REVERSIBLE` / no-op | Forward migration inserts none |

Overall rollback exactness is **CONDITIONAL**. It restores the verified structural drift but retains the seven historical rows once committed because later application activity could have consumed or updated them. It refuses changed row fingerprints, new issue state, missing/drifted indexes, changed column signatures, or new inbound foreign keys. A rollback that claims to restore the exact pre-data state is not provided because that claim would be unsafe.

## Disposable verification matrix

The same integration suite passed on PostgreSQL 16 and PostgreSQL 17 with synthetic data only, including 24 fail-closed negative cases per server version:

- production-drift happy path;
- exact schema equivalence to the intended logical postconditions of migrations #1-#13;
- 13 independent NULL guard failures before mutation;
- wrong type and wrong default;
- wrong expected-name index;
- different-name semantic index without duplication;
- partial prior backfill;
- exact-key value conflict and a business-equivalent row under a different key;
- unresolved historical product reference;
- changed source count;
- advisory-lock contention;
- concurrent application write lock contention;
- forced failure after row insertion, including unchanged sequence state;
- idempotent second execution;
- conditional structural rollback and safe re-forward;
- reconciliation followed by PR26 on disposable PostgreSQL only;
- no reconciliation change to RLS, ACLs, policies, routines, schema ACLs, or column ACLs;
- PR26 post-state of all 42 canonical tables plus the production-present optional `assistant_events` target (43 total) RLS-enabled, no policies, and no direct `anon`/`authenticated` relation, column, or targeted-sequence ACLs (including PostgreSQL 17 privilege types); the backend owner/BYPASSRLS contract remains usable.

## Release-time abort checklist

An independently authorized operator must stop before apply if any item differs from the verified snapshot:

- repository/base/migration hashes;
- project reference or TLS authorization;
- any of the 13 NULL counts or defaults;
- any required index classification;
- qualifying source count other than 7;
- matching/missing split other than `0/7` or replay `7/0`;
- any key conflict, business-equivalent duplicate, unresolved product, or missing source timestamp;
- pre-item issue shape other than two transient rows in initial state or zero in replay state;
- any RLS, ACL, policy, routine, role, table, constraint, trigger, sequence, or target-relation drift;
- inability to acquire the advisory/table locks inside five seconds;
- inability to take and validate a fresh rollback checkpoint;
- lack of a separate approval for the production apply.

After a separately authorized reconciliation apply, reverify migrations #1-#13 as `APPLIED_EQUIVALENT`. PR26 must remain a distinct pending migration until its own authorization and preflight are complete.
