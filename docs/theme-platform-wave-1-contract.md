# Theme Platform Wave 1 — frozen foundation contract

Status: implementation contract, 2026-09-18. Owner source decision fixes backend/Admin
`b654dada7a67ce8904eed9ccd1ff037e5f16e5ed` (tree
`348747a9d140b112dcbc85db3a103967a29d9292`) and read-only Stocky R23
`2fd1495d1b5c8e3cf496f90db341bd4f4789df5f`. New implementation worktree:
`C:/Users/kusay/source/NovaStore-Codex/android-customer-theme-20260722/theme-platform-foundation-wave-1`,
branch `codex/theme-platform-foundation-wave-1`, initial staged/unstaged/untracked = 0/0/0.
The audit OpenAPI remains a proposal; this narrower contract is the Wave 1 authority.

## Ownership and authentication

NovaStore owns theme catalog/versions/services/assignments/overrides/entitlements and
publication requests. Existing NovaStore commerce owns prices, inventory, orders,
payments and shipments. Stocky owns its tenant/user and operational subscription;
this wave performs no Stocky calls or deliveries. `organization_id` is the existing
NovaStore seller organization (the local tenant); `store_id` is `seller_stores.id`,
NOT the legacy commerce store ID. Existing composite organization/store FKs enforce
that distinction. External seller identity is an optional existing server binding
reference to `stocky_connector_connections(id, organization_id, store_id)`, never a
client-supplied tenant assertion. Its presence is not a working theme-delivery bridge.

Reuse existing Admin bearer/session verification and existing Seller JWT issuer,
audience, live session, membership revision/security stamp and assigned store scope.
No new password system; no HMAC or REP delegated credential becomes theme authority.
The selected R27 does not implement a general Stocky human-session exchange. R23
is a read-only security/transport reference; no implicit bridge is claimed here.
Theme role bindings are persisted separately: `theme_admin_roles(user_id, role)`
and `theme_seller_roles(organization_id, membership_id, role)`. No automatic elevated
role for an existing admin. A live system Seller Owner may default to seller_owner;
other roles require an explicit server binding. Roles and membership are re-read
inside each transaction, including retries. Client identity/role fields are rejected.

## Roles and features

Roles: super_admin, theme_admin, support, seller_owner, seller_admin, seller_editor,
seller_viewer. Super admin has all theme permissions. Theme admin reads/creates/
versions/assigns/previews and reads audit; service and entitlement governance remain
super admin. Support reads catalog/service metadata/audit, not draft contents or writes.
Seller owner reads/edits/previews/publishes/rolls back owned resources; seller admin and
editor read/edit/preview by default; viewer reads only. An explicit per-membership
`publish_allowed` boolean may grant seller admin/editor publish and rollback. It can
never elevate a viewer. Role permission AND active service AND ownership AND feature
grant AND quota are required. Unknown features deny; explicit DENY overrides defaults.
Starts/expiry use database UTC time. Custom CSS/HTML/JS are not supported overrides.

## Persistence contract

All IDs below are UUIDs unless noted. Dates are TIMESTAMPTZ; all tables have created_at
and updated_at. Revisions are positive safe INTEGERs, never parsed opaque strings.
JSON values are typed and bounded by server validators. Scoped child rows carry
service_id, organization_id, store_id and composite foreign keys to their parents.

- themes: id, slug unique, name, status (ACTIVE/ARCHIVED), revision.
- theme_versions: id, theme_id, version unique per theme, status (DRAFT/PUBLISHED),
  document JSONB, digest SHA256, revision. Published rows are DB-immutable (incl delete).
- seller_theme_services: id, organization_id, store_id, external_binding_id nullable,
  plan, status (ACTIVE/SUSPENDED/REVOKED), policy_revision, starts_at, expires_at nullable,
  revision. One service per organization/store. Existing store binding is server-resolved.
- theme_assignments: id, scope, theme_version_id, channel (web/app), status
  (ASSIGNED/ACCEPTED/WITHDRAWN), accepted_at/withdrawn_at nullable, revision.
  Only one non-withdrawn assignment per service/channel; no LIVE implication.
- theme_drafts: id, scope, assignment_id unique, overrides JSONB, revision.
- theme_draft_revisions: id, scope, draft_id, revision, overrides, digest; unique
  draft/revision and DB append-only.
- feature_catalog: code TEXT primary key, kind (boolean/quota), enabled, revision.
- plan_feature_defaults: plan+feature_code primary key, effect (ALLOW/DENY),
  quota nullable nonnegative BIGINT, revision.
- seller_feature_entitlements: scope+feature_code primary key, effect, quota nullable,
  starts_at, expires_at nullable, revision.
- theme_assets: id, scope, detected_mime, byte_size, digest, storage_key unique,
  status (QUARANTINED/READY/REJECTED), revision. Registration validates actual bytes;
  server computes MIME/hash/size/key. READY requires a trusted storage/scanning adapter.
- theme_previews: id, scope, draft_id, draft_revision, artifact JSONB, digest, status
  (READY/REVOKED), expires_at, revision. Authenticated metadata only, no public bearer URL.
- theme_publications: id, scope, draft_id, draft_revision, operation_id, artifact,
  digest, policy_revision, status (PUBLICATION_REQUESTED/BLOCKED), revision.
- theme_deployments: id, scope, publication_id, operation_id, status
  (REQUESTED/BLOCKED), digest, revision. No promotion endpoint or active LIVE pointer yet.
- theme_operations: id, scope nullable for global catalog, actor_id TEXT, type, status
  (COMPLETED/REQUESTED/BLOCKED), idempotency_key, request_hash, attempts, result JSONB,
  failure_reason nullable, correlation_id UUID, revision. Unique scope_key+actor+key;
  scope_key generated by server (global/service UUID), never client authority.
- theme_outbox: id (=logical event ID), scope, operation_id, event_type, payload JSONB,
  payload_hash, status (PENDING/PROCESSING/DELIVERED/DEAD), attempts, next_attempt_at,
  revision. Atomic with source write; no delivery worker/network in Wave 1.
- theme_inbox: id, scope, source TEXT, event_id UUID, payload_hash, received_at,
  processed_at nullable, status (RECEIVED/PROCESSED), receipt JSONB, revision;
  source+event_id unique. Internal DB primitive only; no unauthenticated HTTP receiver.
- theme_audit_events: id, scope nullable, actor_id/effective_actor TEXT, action,
  target_type/target_id TEXT, before_state/after_state JSONB (redacted allowlisted metadata),
  correlation_id, reason TEXT. DB append-only. No raw credentials/draft text/body logging.
- theme_admin_roles: user_id INTEGER FK users, role, active, revision.
- theme_seller_roles: organization_id/membership_id composite FK, role,
  publish_allowed default false, active, revision.

## Documents, assets and publication

Version document v1: `{schemaVersion:1, tokens:{...}, components:[{id,type,props}],
assetIds:[]}`. Token allowlist and component property schemas live in the validator.
Overrides are `{tokens:{...}, components:[{componentId,props,hidden?,order?}],
assetIds:[]}`; no cloned base document, inline code, remote URL or commerce values.
Stable component IDs and typed props must exist in the base. Asset references must
be READY and belong to this service. Global base assets use packaged asset keys,
not seller-owned UUIDs. Wave 1 validates key syntax only; an importer must verify the
actual asset manifest before rendering. Artifact is resolved base+overrides with canonical SHA256.
Product/category IDs and internal product/category targets are typed references only:
this service does not yet resolve their existence, visibility or commerce store ownership.
No product data is read or returned by these references. A later server-side renderer
must resolve them through the canonical commerce authority and the service's server-owned
`seller_stores.legacy_store_id`, rejecting foreign/unavailable references before preview
rendering or publication promotion. An artifact digest is not proof of those bindings.
Legal references/domain binding are reserved external contracts, not editable legal
text or fake domain provisioning. Publication stays PUBLICATION_REQUESTED; actual
legal approval, deployment, pointer promotion, DNS and Stocky delivery belong to later waves.

## HTTP and transaction semantics

Admin prefix `/api/admin/theme-platform`; Seller prefix `/api/seller/v1/theme-platform`.
Catalog/theme/version read/create, service list/create/update, assignment/create/withdraw,
entitlement read/update, operation and audit read are Admin foundations. Seller exposes
assigned themes/capabilities, draft read/save, preview create/read, asset register/read,
publication request/read and rollback request (blocked until a verified deployment exists).
All mutations require Idempotency-Key (8..128 bounded safe characters), strict body
allowlists and a bounded reason. Updates require expectedRevision integer; If-Match,
when supplied, must match it exactly. Stale save returns409. Same key/same canonical
request returns the stored operation/result; same key/different request returns409.
Authorization runs BEFORE replay lookup. Service lock serializes quota and policy changes;
ledger insert, domain write, revision, audit and outbox commit atomically. Queries always
apply server scope; cross-tenant IDs return404 without existence disclosure.

## Verification and activation

Default runtime flag NOVASTORE_THEME_PLATFORM_ENABLED=false; enabling only mounts
routes and never applies migrations. Existing seller activation/transport gates remain.
Fresh loopback-only disposable PostgreSQL16, full existing migrations + additive migration,
real signed sessions and HTTP API calls, two independent seller organizations/stores.
No production DB, no external provider, no real seller, no Stocky mutation. Commit/push
only after applicable gates pass; no PR/merge/deploy authorization.
