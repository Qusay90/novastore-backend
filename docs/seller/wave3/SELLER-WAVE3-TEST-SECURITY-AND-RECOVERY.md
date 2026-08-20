# Seller Wave 3 — Test, Security and Recovery Matrix

## Required deterministic checks

1. Contract/allowlist test verifies a unique canonical path set, no Android/package/admin mutation path, required migration/service/test coverage, no F2 credential route and no media/payout-release route.
2. Migration test verifies the Wave 3 descriptor checksum and its exact predecessor is F1B4; SQL is additive, transactional and uses no drop/truncate/alter of an accepted table.
3. Disposable PostgreSQL proof first creates only synthetic canonical anchors (`users`, `stores`, `products`, `orders`, `returns`) with the accepted external types, applies F1 then Wave 3 migration, reruns it, proves constraints/triggers, deliberately fails a transaction, drops only its prefixed test DB and removes the exact temporary container/volume.
4. Service tests cover strict unknown-field rejection, server-context scope, safe foreign not-found, owner_user_id non-authority, revision conflict, same-key replay, different-payload key conflict, rollback, audit/outbox redaction and no raw secret/provider data.
5. Inventory proof runs competing adjustments against one inventory row and accepts at most one compare-and-set result; it proves no negative balance, exactly one movement/effect per idempotency key and no silent lost update.
6. Order proof uses mixed-seller allocations for one canonical order. It proves each seller only sees its own item/package, foreign seller gets safe not-found, package state matrix rejects invalid/stale commands, duplicate command is idempotent and no canonical order/payment/refund row changes.
7. Finance proof uses only ledger fixture rows. It proves money remains integer minor units, duplicate source event is rejected, refund is one compensating entry, reconciliation is currency-specific, cross-currency aggregate is denied and settlement/payout initiation is absent.
8. Support proof excludes internal notes, derives sender from seller context, rejects forbidden attachment/path/link data, keeps foreign conversations invisible, deduplicates message replay and rejects message creation for closed conversations.
9. HTTP boundary proof verifies the business router and all mutating finance/order/offer paths are disabled by default, no admin/customer audience path is mounted, validators reject unknown fields and no response leaks error internals.

## Security release gate

PASS requires zero open HIGH/MEDIUM findings for tenant/store IDOR, permission enforcement, state transitions, stock race/loss, replay, finance leakage, exact arithmetic, append-only events, secret/internal note redaction, disabled flags and admin boundary. Any unknown permission, client tenant identifier, stale revision, remote database/provider attempt or unapproved policy command fails closed.

## Recovery rules

- Applied SQL is immutable. A defect requires a new additive correction migration.
- Failed mutation rolls back its business row, audit and outbox together; retry uses the original idempotency key only with the same fingerprint.
- Stock correction is a new append-only movement. Financial correction is a new compensating ledger entry. Allocation/settlement correction supersedes rather than edits historical evidence.
- Disabling a flag stops traffic only. It does not erase schema or evidence.
- Automated cleanup may remove only the dynamically named local Wave 3 container, its named volume and its prefixed disposable database after the test completes.
