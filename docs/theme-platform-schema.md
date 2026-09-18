# Theme Platform Wave 1 persistence

The additive migration is `migrations/20260918_01_theme_platform_foundation.sql`.
The staging migration registry records its canonical LF SHA-256 and strips its
outer transaction wrapper when applying the migration in a registry transaction.
The migration creates 19 tables and seeds only nine feature definitions and 18
plan defaults. It grants no account a role, service, assignment or production theme.

## Ownership

The service's `(organization_id, store_id)` references the existing
`seller_stores(organization_id, id)`. `store_id` is the Seller store ID, not its
optional legacy commerce store ID. A service is unique per organization/store.

There is no `seller_store_bindings` table in the accepted R27 source. The optional
`external_binding_id` instead references the existing, immutable
`stocky_connector_connections(id, organization_id, store_id)` with a composite
foreign key. This is an existing server binding reference; this migration neither
creates a Stocky connection nor contacts Stocky.

Every tenant-scoped table carries `service_id`, `organization_id` and `store_id`.
Composite foreign keys bind child ownership to service ownership and, where
applicable, to the exact parent assignment, draft, publication or operation.
These foreign keys use `ON DELETE RESTRICT`. Ownership and parent identity cannot
be moved by an update: the shared identity trigger rejects such changes.

Global catalog operations and audit events may have all three scope fields null.
Partial-null scopes are rejected. Operation `scope_key` must equal `global` for
global work or the service UUID's canonical text for scoped work. Its persisted
uniqueness key is `(scope_key, actor_id, idempotency_key)`.

## Tables and evidence preservation

| Table | Key relationship or invariant |
| --- | --- |
| `themes` | Unique bounded slug; ACTIVE/ARCHIVED |
| `theme_versions` | Unique theme/version; published rows cannot update, delete or truncate |
| `seller_theme_services` | Existing organization/store plus optional scoped Stocky connection |
| `theme_assignments` | Published version only; one non-withdrawn assignment per service/channel |
| `theme_drafts` | One draft per assignment; integer revision for compare-and-swap |
| `theme_draft_revisions` | Unique draft/revision; append-only, including truncate protection |
| `feature_catalog` | Namespaced `theme.*` code; boolean/quota kind and enabled flag |
| `plan_feature_defaults` | Unique plan/feature; explicit ALLOW/DENY and nullable nonnegative quota |
| `seller_feature_entitlements` | Scoped feature override with UTC start/expiry |
| `theme_assets` | Scoped actual MIME/size/hash/storage key; QUARANTINED/READY/REJECTED |
| `theme_operations` | Durable scoped idempotency key and request hash |
| `theme_previews` | Exact immutable draft revision; authenticated metadata, bounded expiry |
| `theme_publications` | Exact immutable draft revision and scoped operation; no LIVE status |
| `theme_deployments` | Scoped publication and operation; REQUESTED/BLOCKED only |
| `theme_outbox` | Scoped operation; one logical event/type per operation; retry fields |
| `theme_inbox` | Unique source/event; receipt and payload hash; processed-time consistency |
| `theme_audit_events` | Redacted metadata; append-only, including truncate protection |
| `theme_admin_roles` | Existing `users.id`; one explicitly assigned theme role per user |
| `theme_seller_roles` | Existing organization/membership pair; viewers cannot gain publish flag |

All tables record non-null `created_at` and `updated_at` timestamps. Revisions are
positive PostgreSQL INTEGER values; the audit event is immutable evidence and has
no mutable revision. Historical draft revisions retain their snapshot revision.
All UUIDs are supplied by the application; the migration needs no new extension.

Preview/publication artifacts and digests remain immutable after insertion;
publication policy revision is also fixed. Outbox payload/hash/event type and inbox
payload hash cannot change under the same event identity. Operation request
hash/key/scope/actor/type cannot change. Processing status, retry counters, receipts
and operation results can evolve through their intended server workflows.

## Seeded capabilities

The catalog includes `theme.editor`, `theme.publish`, `theme.asset_bytes`,
`theme.mobile_customization`, `theme.advanced_blocks`, `theme.custom_header`,
`theme.collaboration`, `theme.custom_css` and `theme.ai_builder`.

The basic plan allows the editor and a 5 MiB asset quota, with the remaining
features denied. Pro allows the first seven features and a 50 MiB asset quota.
Custom CSS and AI builder are catalog-disabled and denied in both plans. Runtime
authorization must still check service time/status, live membership, role,
ownership, the catalog enabled flag, explicit denies and quota.

## Constraints do not imply activation

The database preserves ownership and immutable evidence. Typed document
validation, request authorization, MIME inspection, asset quarantine, CAS,
idempotency hashing and redaction are server responsibilities covered separately
by the application and integration tests. There is no public preview bearer token,
delivery worker, production migration invocation, active theme pointer, LIVE
deployment state or provider call in this migration.

The disposable PostgreSQL test harness is responsible for executing the complete
registry and proving these constraints with real SQL and HTTP transactions. A
successful registry load alone is only a checksum/structure check, not a database
migration PASS.
