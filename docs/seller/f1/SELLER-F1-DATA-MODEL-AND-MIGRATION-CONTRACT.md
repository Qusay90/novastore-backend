# Seller F1 Veri Modeli ve Migration Sözleşmesi

## 1. Durum, sınır ve migration ilkesi

Durum `PLAN_ONLY`. Bu dosya SQL içermez, migration çalıştırmaz, veri okumaz/yazmaz ve mevcut tablonun anlamını değiştirmez. F1, F0A’daki additive-only/forward-recovery sözleşmesine uyar: `createCoreSchema` seller migration carrier değildir; applied migration düzenlenmez; destructive rollback yoktur; runtime activation schema varlığı değildir.

Mevcut `stores(id, name, slug, owner_user_id, is_active, created_at, updated_at, deleted_at)` yalnız platform/legacy store kaydıdır. `owner_user_id`, admin role veya `novastore-platform` seller organization owner/membership anlamına dönüştürülmeyecektir. `products.store_id` de seller offer/ownership değildir.

Authorization brief’teki `seller_membership_stores` ve `seller_refresh_families` adları değerlendirildi. Bu plan bunları daha açık kanonik adlarla önerir: `seller_membership_store_scopes` (bir membership’in store scope satırı) ve `seller_refresh_token_families` (refresh family root). Bu yalnız plan adlandırmasıdır; migration veya runtime implementation değildir.

## 2. Önerilen migration birimleri ve uygulama sırası

Mevcut repodaki `YYYYMMDD_description.sql` biçimiyle çakışmayan gelecek dosya adları:

1. `migrations/20260730_seller_f1_organizations_roles_memberships.sql`
2. `migrations/20260730_seller_f1_store_bindings_invitations.sql`
3. `migrations/20260730_seller_f1_sessions_audit_outbox.sql`

Her birim şu sırayla ileri gider: preflight schema snapshot → transaction-bounded additive DDL → idempotent second-apply proof → verification query → empty/explicit mapping state → feature flag kapalı runtime proof. Migration 1 önce organization, role, permission ve membership otoritesini; migration 2 legacy store ile açık binding ve invitationı; migration 3 session, refresh family, step-up, audit ve outbox’ı kurar. Uygulama yalnız ayrı disposable-DB ve ayrı migration authorization ile yapılabilir.

## 3. Ortak model kuralları

- Yeni seller-domain primary key ve yalnız seller-domain içi foreign key kimlikleri `BIGINT`/`BIGSERIAL`; zamanlar `TIMESTAMPTZ`; iş durumları dar `VARCHAR` + `CHECK`; her mutable domain row’da `revision BIGINT NOT NULL DEFAULT 1`, `created_at`, `updated_at` bulunur. Mevcut source tabloya giden foreign key bunun istisnası değil, source type ile birebir parity kuralıdır: `models/createCoreDb.js:12-31` içindeki `users.id SERIAL` PostgreSQL’de `INTEGER`dir; `migrations/20260701_category_v2_additive_foundation.sql:3-12` içindeki `stores.id BIGSERIAL` ise `BIGINT`dir. Public UUID yalnız opaque/public identifier olabilir; internal foreign-key integrity yerine geçmez.
- Tenant-owned her kayıt değişmez `organization_id` taşır; store-scoped kayıt ayrıca `store_id` taşır. İlgili `seller_store` ile organization ilişkisi yalnız composite FK veya eşdeğer DB + service invariant ile kanıtlanır.
- Client `organization_id`, `store_id`, `role_id`, permission veya owner değerini otorite olarak veremez. Bunlar canlı session+membership’ten çözülür.
- Soft lifecycle alanı olan business entity’lerde `deleted_at`/`revoked_at`/`suspended_at` terminal state için kullanılır. Audit/outbox ve security eventleri hard-delete veya update kabul etmez.
- Her partial unique index soft-deleted/revoked/expired satırların yeniden güvenli oluşturulmasına izin verir, ama aynı canlı kimliği iki kez aktif yapmaz.
- Tenant query indexleri `organization_id` ile başlar; store/resource sorguları `organization_id, store_id` ile başlar. ID tek başına yetki predicate’i değildir.
- User PII ve raw credential/audit payloadı ayrıdır: token/secret yalnız hash olarak saklanır; error/log/audit içinde plaintext yoktur.

### 3.1 Mevcut source foreign-key tip paritesi (F1A blocking gate)

F1A SQL üretiminden önce deterministic, database-free bir source-type inventory çıkarır ve external FK parity geçmeden migration üretmez. `SERIAL` referenced key için referencing column `INTEGER`; `BIGSERIAL` referenced key için referencing column `BIGINT` olur. Source type değişirse static contract test açık bir failure verir; sessiz coercion, mevcut production key widening veya “tüm kimlikler BIGINT” varsayımı yoktur. Composite foreign keydeki her component kendi referenced key type’ıyla eşleşir.

| Proposed table | Proposed column | Referenced existing table/column | Current plan type | Source schema type / evidence | Required corrected type |
|---|---|---|---|---|---|
| `seller_organizations` | `created_by_user_id` | `users.id` | F1 kapsamında kolon yok | `INTEGER`; `models/createCoreDb.js:12-31` | F1’e ancak ayrı yetkiyle eklenirse `INTEGER REFERENCES users(id)` |
| `seller_memberships` | `user_id` | `users.id` | `BIGINT` | `INTEGER`; `models/createCoreDb.js:12-31`, mevcut user FK örnekleri `models/createCoreDb.js:71-121` | `INTEGER REFERENCES users(id)` |
| `seller_invitations` | `accepted_by_user_id` | `users.id` | F1 kapsamında kolon yok | `INTEGER`; `models/createCoreDb.js:12-31` | F1’e ancak ayrı yetkiyle eklenirse `INTEGER REFERENCES users(id)` |
| `seller_sessions` | `user_id` | `users.id` | `BIGINT` | `INTEGER`; `models/createCoreDb.js:12-31` | `INTEGER REFERENCES users(id)` |
| `seller_audit_events` | `actor_user_id` | `users.id` | `BIGINT` | `INTEGER`; `models/createCoreDb.js:12-31` | `INTEGER REFERENCES users(id)` |
| `seller_stores` | `legacy_store_id` | `stores.id` | `BIGINT` | `BIGINT`; `migrations/20260701_category_v2_additive_foundation.sql:3-12` | `BIGINT REFERENCES stores(id)` |

`seller_membership_store_scopes`, `seller_audit_events` ve `seller_outbox_events` içindeki diğer `store_id` alanları mevcut `stores.id`e değil yeni `seller_stores.id`e gider; bunlar seller-domain internal `BIGINT` composite foreign keyleridir. Bu inventory dışındaki user/store FK’sı F1A SQL’e girerse önce source type inventory güncellenir ve parity gate yeniden geçer.

## 4. Tablo sözleşmeleri

### 4.1 `seller_organizations`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `id` | `BIGSERIAL`, PK, not null | Immutable surrogate key. |
| `external_key` | `UUID`, not null | Client-visible olmayan stable key; unique. |
| `display_name` | `VARCHAR(160)`, not null | Trimmed, non-blank check; legal name değildir. |
| `status` | `VARCHAR(24)`, not null | `active|suspended|closed`; default `active`; `closed` terminaldir. |
| `revision`, `created_at`, `updated_at`, `suspended_at`, `closed_at` | `BIGINT` / timestamps | Revision positive; transition/audit timestamps. |

Unique/index: `external_key` unique; `status,id` operational index. Immutable: `id`, `external_key`, `created_at`; mutable: display/status/revision under future authorized policy. Soft/terminal: `closed` never reopens without a new explicit organization/correction policy. Tenant invariant: organization is the root tenant and cannot be inferred from a store owner. Audit: creation, suspension, closure and any later display change are redacted audit targets. Retention: identity row retained; legal/PII policy is deferred. Backfill/recovery: no automatic legacy store import; forward correction or suspended state, never deletion.

### 4.2 `seller_stores`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `id` | `BIGSERIAL`, PK, not null | Seller-store identity; immutable. |
| `organization_id` | `BIGINT`, not null | FK `seller_organizations(id)`; tenant root. |
| `legacy_store_id` | `BIGINT`, nullable | `BIGINT REFERENCES stores(id)` with restrict semantics; source parity evidence `migrations/20260701_category_v2_additive_foundation.sql:3-12`; explicit mapping only. |
| `display_name` | `VARCHAR(160)`, not null | Seller-local display field; no public activation. |
| `status` | `VARCHAR(24)`, not null | `active|suspended|closed`; default `active`. |
| `revision`, timestamps | as above | Positive revision and lifecycle timestamps. |

Unique/index: partial unique `legacy_store_id WHERE legacy_store_id IS NOT NULL AND closed_at IS NULL`; unique `(organization_id,id)` to support composite FK; index `(organization_id,status,id)`. The 1:1 legacy-store rule is explicit: one live `stores` row maps to at most one live seller-store; a seller-store maps to at most one legacy store. `novastore-platform` is not mapped by default. `owner_user_id` remains legacy data and never creates a membership. Closed binding is terminal; no hard delete. Backfill requires owner-approved source snapshot, expected/actual/quarantine report and separate authorization.

### 4.3 `seller_roles`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `id` | `BIGSERIAL`, PK, not null | Role identity. |
| `organization_id` | `BIGINT`, nullable | Null only for immutable system roles; non-null for organization custom roles after separate policy approval. |
| `code` | `VARCHAR(80)`, not null | Normalized; system codes include `owner` but owner is never invitation-assignable. |
| `name` | `VARCHAR(120)`, not null | Display-only. |
| `role_kind` | `VARCHAR(16)`, not null | `system|organization`; check aligns with nullable organization rule. |
| `is_assignable`, `is_active`, `revision`, timestamps | boolean / revision / timestamps | Owner `is_assignable=false`; inactive role cannot be newly granted. |

Unique/index: `(organization_id,lower(code))` for organization roles, separate unique system-code partial index; index `(organization_id,is_active,id)`. Immutable: system owner semantics and creation identity; mutable only future approved custom role metadata. A role may not be hard-deleted while referenced. F1 uses a fixed allowlisted permission registry, not client-created permission strings.

### 4.4 `seller_permissions`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `code` | `VARCHAR(100)`, PK, not null | Immutable registry key, e.g. `organization.read`, `team.read`, `team.invite`, `team.manage`, `team.remove`. |
| `domain`, `description` | `VARCHAR`, not null | Documentation metadata only. |
| `is_active`, `created_at` | boolean / timestamp | Unknown code denies; registry deactivation needs an additive policy. |

This table is global, not tenant-owned. Unique PK is sufficient; index `(is_active,code)` supports catalog read. Permission strings from a request never pass through to authorization. Registry changes are auditable configuration changes and require a separate authorization.

### 4.5 `seller_role_permissions`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `role_id` | `BIGINT`, PK component, not null | FK `seller_roles(id)` restrict. |
| `permission_code` | `VARCHAR(100)`, PK component, not null | FK `seller_permissions(code)` restrict. |
| `created_at` | `TIMESTAMPTZ`, not null | Grant timestamp. |

Composite PK `(role_id,permission_code)` is the duplicate guard; index `(permission_code,role_id)` supports policy catalog queries. Rows are add/remove only through future role-management policy; a role permission alteration triggers membership revision/session re-evaluation and audit. No tenant query uses this table without resolving the role from a same-organization live membership.

### 4.6 `seller_memberships`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `id` | `BIGSERIAL`, PK, not null | Membership identity; never reused. |
| `organization_id`, `role_id` | `BIGINT`, not null | New seller-domain FKs; role must be system or same organization by service/DB invariant. |
| `user_id` | `INTEGER`, not null | `INTEGER REFERENCES users(id)`; exact source parity from `models/createCoreDb.js:12-31`. |
| `status` | `VARCHAR(24)`, not null | `active|suspended|revoked|expired`; only `active` authorizes. |
| `security_stamp` | `UUID`, not null | Replaced on authz-sensitive transition. |
| `membership_revision` | `BIGINT`, not null | Positive; increases on role/scope/status change. |
| `effective_at`, `revoked_at`, `suspended_at`, `created_at`, `updated_at` | timestamps | Lifecycle evidence. |

Unique/index: partial unique active-or-suspended membership `(organization_id,user_id) WHERE status IN ('active','suspended')`; index `(user_id,status,organization_id,id)` for session rebind; unique `(organization_id,id)` for composite child FKs. There may be multiple organizations per user; cross-organization role reuse does not grant access. Last-owner rule: a transaction that removes/suspends/revokes/demotes the final active owner must reject with `LAST_OWNER_REQUIRED`; owner transfer remains `DG-002` blocked. Memberships never hard-delete. Every authz-sensitive transition increments revision, replaces stamp, revokes/reevaluates active sessions, emits redacted audit/outbox in one transaction.

### 4.7 `seller_membership_store_scopes`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `membership_id` | `BIGINT`, PK component, not null | FK to membership. |
| `organization_id`, `store_id` | `BIGINT`, not null | Composite FK to `seller_stores(organization_id,id)`; organization duplicates the tenant guard. |
| `scope_kind` | `VARCHAR(16)`, not null | `assigned`; no client wildcard/implicit all-store value. |
| `created_at`, `revoked_at` | timestamps | Live scope has null revoke. |

Partial unique live `(membership_id,store_id) WHERE revoked_at IS NULL`; indexes `(organization_id,store_id,membership_id)` and `(membership_id,revoked_at)`. The migration MUST define composite FK `(organization_id,membership_id) → seller_memberships(organization_id,id)` and composite FK `(organization_id,store_id) → seller_stores(organization_id,id)`; both parent composite unique keys are mandatory. This is a DB invariant, not a service fallback. Scope change increments the membership revision/security stamp and cannot silently broaden a session.

### 4.8 `seller_invitations`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `id` | `BIGSERIAL`, PK, not null | Invitation identity. |
| `organization_id`, `role_id`, `invited_by_membership_id` | `BIGINT`, not null | Same organization enforced. |
| `invitee_email_hash` | `CHAR(64)`, not null | Normalized email hash only; no raw invitation token. |
| `token_hash` | `CHAR(64)`, not null | Cryptographic hash, never logged/audited plaintext. |
| `status` | `VARCHAR(24)`, not null | `pending|accepted|revoked|expired`; accepted/revoked/expired terminal. |
| `expires_at`, `accepted_at`, `revoked_at`, `revision`, timestamps | timestamps / revision | Expiry required; revision positive. |

`seller_invitation_store_scopes` is deliberately deferred: F1 invitation storage may model only an empty/explicit scope set until invite commands are separately authorized. If the future route accepts `store_scope_ids`, a child table with the same composite organization/store guard as membership scopes is mandatory. Unique/index: live invitation unique `(organization_id,invitee_email_hash) WHERE status='pending'`; token hash unique; index `(organization_id,status,expires_at,id)`. An invitation never creates a membership without an atomic acceptance transaction; owner role forbidden. Delivery provider is out of scope. Retention: hash/metadata only, purge/anonymization policy is separate and audited.

### 4.9 `seller_sessions`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `id` | `UUID`, PK, not null | Opaque seller session ID. |
| `user_id` | `INTEGER`, not null | `INTEGER REFERENCES users(id)`; customer/admin role claim is not authority and source parity is from `models/createCoreDb.js:12-31`. |
| `organization_id`, `membership_id` | `BIGINT`, not null | Composite FK `(organization_id,membership_id) → seller_memberships(organization_id,id)`; live membership is authoritative. |
| `audience` | `VARCHAR(32)`, not null | Exactly `seller`; customer/admin audience rejected. |
| `status` | `VARCHAR(24)`, not null | `active|revoked|expired|compromised`; only active authorizes. |
| `membership_revision`, `security_stamp` | `BIGINT` / `UUID`, not null | Snapshot compared against live membership every protected request. |
| `issued_at`, `expires_at`, `revoked_at`, `last_seen_at`, `created_at`, `updated_at` | timestamps | Expiry required; terminal reason stored safely. |

Unique/index: index `(id,status,expires_at)`; index `(membership_id,status,id)`; index `(organization_id,membership_id,status)`; optional partial unique device binding only after privacy decision. Session is not a raw JWT table and must not contain raw access/refresh token. Membership status/revision/stamp mismatch causes reject and terminal session revoke/reevaluation according to policy. Future login/F2 creates it; F1 may only expose service contracts/tests, never usable seller authentication.

### 4.10 `seller_refresh_token_families`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `id` | `UUID`, PK, not null | Opaque family identity. |
| `session_id` | `UUID`, not null | FK `seller_sessions(id)`; same lifecycle. |
| `current_generation` | `BIGINT`, not null | Positive active credential generation; hash is kept only in immutable credential rows. |
| `status` | `VARCHAR(24)`, not null | `active|revoked|replayed|expired`; replay is terminal. |
| `expires_at`, `revoked_at`, `replay_detected_at`, `created_at`, `updated_at` | `TIMESTAMPTZ`, not null except terminal timestamps | Security evidence; `expires_at` required. |

Index `(session_id,status,expires_at)`. Family has no raw refresh token and no mutable “erase old hash” shortcut. It is F1 foundation only; refresh endpoint is F2 and remains unmounted.

### 4.11 `seller_refresh_tokens`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `id` | `UUID`, PK, not null | Opaque credential-row identity. |
| `family_id` | `UUID`, not null | FK `seller_refresh_token_families(id)`. |
| `generation` | `BIGINT`, not null | Positive, monotonically increasing within family. |
| `token_hash` | `CHAR(64)`, not null | Cryptographic hash only; never raw refresh token. |
| `status` | `VARCHAR(24)`, not null | `active|consumed|replaced|revoked|expired`; consumed/replaced rows are retained through security retention. |
| `issued_at`, `expires_at` | `TIMESTAMPTZ`, not null | Required credential lifetime. |
| `consumed_at`, `replaced_at`, `revoked_at` | `TIMESTAMPTZ`, nullable | Terminal transition evidence. |
| `replaced_by_token_id` | `UUID`, nullable | Self-FK; only the immediate controlled successor. |

Unique `(family_id,generation)` and unique `token_hash`; indexes `(family_id,status,generation)` and `(token_hash,status)`. Rotation locks the family and presented credential row, checks live session/membership, changes the presented row to `consumed/replaced`, inserts the successor row and advances `current_generation` atomically. Any hash matching an older consumed/replaced row is detectable replay—not generic invalidity—and atomically revokes the family and its seller session. Concurrent presentation has at most one successor. Raw token/hash never enters logs, audit payloads or diagnostics; the immutable hash history expires/purges only under an explicitly approved security-retention policy.

### 4.12 `seller_step_up_challenges`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `id` | `UUID`, PK, not null | Challenge identity. |
| `session_id` | `UUID`, not null | FK `seller_sessions(id)`. |
| `membership_id`, `organization_id` | `BIGINT`, not null | Composite FK `(organization_id,membership_id) → seller_memberships(organization_id,id)`. |
| `action`, `target_type` | `VARCHAR(100)`, not null | Allowlisted action and target type. |
| `target_id` | `VARCHAR(160)`, not null | Opaque target identifier, action-bound. |
| `secret_hash` | `CHAR(64)`, nullable | Hash only; F1 does not create OTP/TOTP flow. |
| `status` | `VARCHAR(24)`, not null | `pending|verified|expired|locked|revoked`; terminal after verification. |
| `expires_at` | `TIMESTAMPTZ`, not null | Required bounded lifetime. |
| `verified_at` | `TIMESTAMPTZ`, nullable | Only verified state may set it. |
| `attempt_count` | `INTEGER`, not null | Non-negative, bounded by policy. |
| `created_at`, `updated_at` | `TIMESTAMPTZ`, not null | Lifecycle timestamps. |

Indexes `(session_id,status,expires_at)` and `(organization_id,action,target_type,target_id,status)`. A challenge cannot authorize another action/target/session and cannot survive session/membership revoke. Retention: secrets are purged/irreversibly unavailable after policy TTL; redacted lifecycle audit remains. F1 defines storage boundary only; challenge issuance/verification is F2.

### 4.13 `seller_audit_events`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `id` | `BIGSERIAL`, PK, not null | Immutable ordered event identity. |
| `organization_id` | `BIGINT`, not null | FK `seller_organizations(id)`; tenant root. |
| `store_id` | `BIGINT`, nullable | Composite FK `(organization_id,store_id) → seller_stores(organization_id,id)` when present. |
| `actor_user_id` | `INTEGER`, nullable | `INTEGER REFERENCES users(id)` when a human actor exists; null only for explicit system actor; source parity is from `models/createCoreDb.js:12-31`. |
| `actor_membership_id` | `BIGINT`, nullable | Composite FK `(organization_id,actor_membership_id) → seller_memberships(organization_id,id)` when membership-bound. |
| `session_id` | `UUID`, nullable | FK `seller_sessions(id)` when session-bound. |
| `event_type`, `target_type`, `target_id`, `result_code` | `VARCHAR(120)`, not null | Allowlisted event/outcome vocabulary; target id is opaque. |
| `correlation_id` | `UUID`, nullable | Request/action correlation. |
| `metadata_redacted` | `JSONB`, not null | Object-only check; raw secret/token/full legal/bank/PII forbidden. |
| `created_at` | `TIMESTAMPTZ`, not null | Immutable event time. |

Indexes `(organization_id,created_at DESC,id DESC)`, `(organization_id,store_id,created_at DESC,id DESC)`, `(actor_membership_id,created_at DESC)` and `(correlation_id)`. Trigger rejects `UPDATE` and `DELETE`; correction is a new `seller.audit.corrected`/reversal-style event referencing the original event id in redacted metadata. Retention is policy-driven but append-only within retention; legal hold/pseudonymization never destroys integrity. Rejected critical authz attempts are recorded without tenant-leaking detail.

### 4.14 `seller_outbox_events`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `id` | `UUID`, PK, not null | Immutable delivery event key. |
| `organization_id` | `BIGINT`, not null | FK `seller_organizations(id)`; tenant root. |
| `store_id` | `BIGINT`, nullable | Composite FK `(organization_id,store_id) → seller_stores(organization_id,id)` when present. |
| `aggregate_type`, `aggregate_id`, `event_type` | `VARCHAR(120)`, not null | Allowlisted immutable producer vocabulary. |
| `aggregate_revision` | `BIGINT`, not null | Positive duplicate/order guard. |
| `idempotency_key` | `VARCHAR(160)`, nullable | Producer key; same key/payload cannot mean two business actions. |
| `payload_redacted` | `JSONB`, not null | Object-only; no credential/PII/secret payload. |
| `created_at` | `TIMESTAMPTZ`, not null | Same transaction as business mutation and audit insert. |

Unique `(organization_id,aggregate_type,aggregate_id,aggregate_revision,event_type)` and partial unique non-null `(organization_id,idempotency_key)`; index `(organization_id,created_at DESC,id DESC)`. Trigger rejects `UPDATE` and `DELETE`. This immutable event never stores mutable lease, delivery status, retry count or error fields.

### 4.15 `seller_outbox_delivery_attempts`

| Alan | Tür / nullability | Kural |
|---|---|---|
| `id` | `UUID`, PK, not null | Immutable attempt identity. |
| `outbox_event_id` | `UUID`, not null | FK `seller_outbox_events(id)`. |
| `attempt_number` | `INTEGER`, not null | Positive and unique per outbox event. |
| `outcome` | `VARCHAR(24)`, not null | `leased|delivered|failed|dead_letter`; every state change is a new row. |
| `lease_expires_at`, `retry_after_at` | `TIMESTAMPTZ`, nullable | Required only for `leased`/retryable failure according to check constraints. |
| `error_code` | `VARCHAR(80)`, nullable | Safe classified error only; no provider body/secret. |
| `created_at` | `TIMESTAMPTZ`, not null | Attempt event time. |

Unique `(outbox_event_id,attempt_number,outcome)` plus a transaction/row-lock rule that permits one effective live lease; indexes `(outbox_event_id,created_at DESC,id DESC)` and `(retry_after_at,id)`. Worker selection uses the immutable outbox event plus the latest non-expired attempt, locks the event, then appends `leased`; completion/failure/dead-letter is another append. It never updates/deletes the outbox or a prior attempt and never replays the source business mutation. F1 introduces neither worker nor external dispatch.

## 5. Cross-table invariants and concurrency

1. `seller_memberships.organization_id`, role organization (when non-null), all live scope rows, session organization and audit/outbox organization must agree.
2. Every protected request re-reads live session and membership; JWT claim values are correlation hints only.
3. Role/scope/status change locks the affected membership/session set, increments membership revision/stamp, invalidates incompatible sessions and writes audit/outbox atomically.
4. Last-owner detection runs in the same transaction and lock scope as the requested mutation; an invitation is not an owner replacement.
5. Cross-tenant/missing/deleted target has one external result: `404 RESOURCE_NOT_FOUND`, without disclosing which predicate failed.
6. Refresh-family consumption/replacement/replay detection locks the family plus immutable credential row and uses generation/hash compare-and-set; every consumed/replaced hash remains detectable until approved retention expiry, and a competing call cannot produce a second usable pair.
7. Audit/outbox event insert failure aborts the protected mutation. Delivery state is append-only `seller_outbox_delivery_attempts`; delivery failure never rolls the original mutation back after commit or updates/deletes an event.

## 6. Backfill, platform store and forward recovery

No F1 migration automatically populates seller organizations from `stores`, `owner_user_id`, admin users, products, orders or the platform store. A later separately authorized backfill must: snapshot source identities; receive owner mapping decision; create explicit `seller_stores.legacy_store_id` mapping; calculate expected/actual/quarantine counts; make mapping idempotent; and retain unmapped records in quarantine rather than guessing.

Required post-migration read-only verification queries (to be delivered with the future migration PR, not in this plan) include: table/index/constraint presence; all mandated composite FK constraints; no live membership/role/scope/session/audit/outbox organization mismatch; one live binding per legacy store; no organization with zero active owner; no active session with stale membership revision/stamp; no raw-token columns/values; consumed/replaced refresh hash history; audit/outbox/attempt append-only trigger existence; tenant-leading index coverage; and zero unexpected backfill writes. A failed migration is recovered with a new additive migration or disabled flag; not `DROP`, edit or destructive restore.
