# Seller F1 Yetkilendirme, Oturum ve API Sözleşmesi

## 1. Durum ve normatif sınır

Durum `PLAN_ONLY`. F1 planı seller login, access-token issuance, refresh, logout endpoint’i veya production-usable seller session üretmez. F0A `SELLER-API-V1.md` içindeki seller yolları aksi açıkça uygulanmadıkça `PROPOSED_NOT_IMPLEMENTED` kalır. Customer/admin tokenı, `/api/admin/**`, legacy route veya client storage satıcı kimliği/izin/tenant kanıtı değildir.

## 2. Zorunlu middleware sözleşmesi ve sırası

Korumalı bir gelecek seller request’i aşağıdaki sırayı değiştiremez:

1. **`privateNoStore`**: `Cache-Control: private, no-store, max-age=0` ve `Pragma: no-cache`; hassas context/team response cache’e girmez.
2. **`sellerAudienceAuthenticate`**: Bearer credential yapısını, imza/issuer/expiry ve yalnız `aud=seller` semantiğini doğrular. Customer/admin audience, eksik/bozuk/expired credential → `401 AUTH_REQUIRED` veya `401 SELLER_AUDIENCE_REQUIRED`.
3. **`requireLiveSellerSession`**: session id üzerinden `seller_sessions` kaydını DB’den yükler; `active`, expiry, revoke/compromise ve seller audience koşulunu kontrol eder. `401 SELLER_SESSION_REVOKED` / `401 SESSION_EXPIRED` fail-closed döner.
4. **`resolveActiveSellerMembership`**: session user/membership/organization ilişkisinin güncel `active` membership, `membership_revision` ve `security_stamp` ile eşleştiğini DB’de kontrol eder. Uyumsuzlukta session revoke/reevaluation politikasını uygular; `403 NO_ACTIVE_MEMBERSHIP` veya `403 ACCOUNT_SUSPENDED` döner.
5. **`resolveServerTenantContext`**: active organization ve izinli stores’u yalnız canlı membership/scopes’tan türetir. Header, query veya body’deki `organization_id`, `store_id`, role, owner, `preferred_store_id` yalnız non-authoritative hint olabilir; authz için yok sayılır/reddedilir.
6. **`requireSellerPermission(permission)`**: role-permission registry’den current permission setini çözer. Bilinmeyen permission, role, scope veya policy sonucu deny olur: `403 PERMISSION_DENIED`.
7. **`loadTenantScopedResource`**: resource query’sini önce `organization_id`, gerektiğinde `store_id`, active/non-deleted state ile sınırlar. Aynı org dışı, eksik veya soft-deleted hedef → tek `404 RESOURCE_NOT_FOUND`.
8. **Controller/service**: strict input allowlist, state/revision/idempotency, mutation transactionı, redacted audit ve atomic outbox ile çalışır. Bu şartlar sağlanmadan service çağrılmaz.

`requireSellerPermission` context çözümünden önce çalışamaz; aksi halde client-controlled tenant/role oracle’ı doğar. `requireLiveSellerSession` ve membership check route-local kopya olarak yazılamaz; seller namespace’in tek zorunlu zinciridir.

### Bileşen başına I/O, trust ve test sözleşmesi

| Bileşen | Girdi → çıktı | DB/cache | Fail/error | Audit/security invariant | Zorunlu test |
|---|---|---|---|---|---|
| `sellerAudienceAuthenticate` | Bearer credential → non-authoritative seller principal | DB yok; private cache yok | `401 AUTH_REQUIRED`/`SELLER_AUDIENCE_REQUIRED` | Issuer/key/audience exact; customer/admin deny | `sellerF1AudienceIsolationSmoke.js` |
| `requireLiveSellerSession` | principal session id → live session | `seller_sessions` read; no authz cache | `401 SELLER_SESSION_REVOKED`/`SESSION_EXPIRED` | Status/revoke/expiry fail-closed; redacted security event when required | `sellerF1SessionRevisionSmoke.js` |
| `resolveActiveSellerMembership` | live session → active membership/revision/stamp | membership/role reads; request-local only | `403 NO_ACTIVE_MEMBERSHIP`/`ACCOUNT_SUSPENDED` | DB state wins over token; stale state re-evaluates/revokes | `sellerF1SessionRevisionSmoke.js` |
| `resolveSellerOrganization` | membership → organization | tenant root read; no client cache authority | `404 RESOURCE_NOT_FOUND` where target disclosure applies | organization is server-owned | `sellerF1ClientTenantInputSmoke.js` |
| `resolveSellerStoreScope` | membership/context → permitted store ids | scope composite-FK read; request-local only | `404 RESOURCE_NOT_FOUND` for hidden target | no client wildcard or store escalation | `sellerF1MembershipStoreScopeSmoke.js` |
| `requireSellerPermission` | resolved role/scopes + permission code → allow/deny | role/permission registry read | `403 PERMISSION_DENIED` | unknown deny; owner assignment constraints | `sellerF1RolePermissionMatrixSmoke.js` |
| `loadTenantScopedResource` | tenant context + resource id → scoped row | tenant-leading query; no shared cache | same `404 RESOURCE_NOT_FOUND` | IDOR check precedes state/revision disclosure | `sellerF1TenantIsolationSmoke.js` |
| `requireSellerStepUp` | session/action/target challenge → grant/deny | challenge/session read; no secret cache | `403 STEP_UP_REQUIRED`/`STEP_UP_EXPIRED` | action-target-session-revision binding | `sellerF1StepUpBindingSmoke.js` |

All audit records from this chain carry only actor/session/tenant/target class, correlation and redacted result information. Every protected response uses `privateNoStore`; no component may persist a browser cache authority.

## 3. Audience, issuer, key, JWT ve DB authority

- **Audience:** seller access tokenın `aud` değeri tam `seller` olmalıdır. Customer/admin tokenları issuer/secret teknik olarak doğrulanabilse bile seller katmanında reddedilir. Ayrı issuer/key seçimi F2 security authorizationında belirlenir; F1 shared-JWT davranışını seller için devralmaz.
- **Issuer/key:** token doğrulayıcı, allowlisted seller issuer ve key-id/key resolver kullanır; key confusion, `alg=none`, unknown issuer/key id ve missing claim deny olur. Anahtar malzemesi log/audit/test outputunda görünmez.
- **JWT claimleri:** minimum opaque session id, subject/user correlation, `aud`, issuer, issued/expiry ve token id içerir. Organization, store, role, permission, ownership veya authoritative revision claim’i değildir. Claim, DB row ile tutarsızsa DB kazanır.
- **DB authority:** request kabulü canlı `seller_sessions` + `seller_memberships` + role/permission + scope satırlarına bağlıdır. Sessionın snapshot revision/stamp’i canlı membership ile eşleşmelidir. Role/scope/status değişikliği mevcut sessionları yeniden değerlendirir veya revoke eder.
- **Disabled default:** `SELLER_API_V1_ENABLED=false` iken seller public route mount edilmez veya capability closed davranışı verir; token/service varlığı erişim/visibility açmaz.

## 4. Session, revoke ve future refresh family sözleşmesi

Seller session F1’de veri/policy temeli, F2’de auth lifecycle’tır. Her session `audience=seller`, user, membership, organization, membership revision/security stamp, status, issue/expiry/revoke zamanını taşır. `active` dışındaki her status deny olur. Membership revoke/suspend, permission/store-scope change, account security incident veya detected refresh replay ilgili sessionların terminal revoke/re-evaluation sebebidir.

Future refresh family yalnız hash saklar; family yanında immutable `seller_refresh_tokens` credential history her generation için hash/status/expiry tutar. Atomik boundary şu adımları tek transaction’da yapar: live session/membership check → family ve presented credential row lock → presented hash/generation compare-and-set → old credential consumed/replaced → new credential-hash row/generation → audit/outbox. Aynı refresh credentialın eşzamanlı kullanımında en çok bir dönüş başarı üretir. Önceki herhangi bir generation’daki consumed/replaced/revoked/expired hash eşleşmesi replay olarak bulunur; token çifti üretmez, family+session terminal deny olur, `REFRESH_TOKEN_REPLAY_DETECTED` verir ve full F2 authentication gerektirir. Raw token veya hash log/audit/response diagnostics içine girmez.

F1 Socket.IO seller erişimi kurmaz. F2/F13 gibi bir faz ileride seller socket kullanmak isterse handshake ve her tenant room action için aynı live session/membership/scope authority’yi kurmak ve revoke sonrası disconnect/revalidation davranışını ayrı test etmek zorundadır.

## 5. Safe errors, IDOR ve redaction

| Durum | Dış hata | İç davranış / audit |
|---|---|---|
| Missing/invalid/expired seller credential | `401 AUTH_REQUIRED` veya `401 SELLER_AUDIENCE_REQUIRED` | Credential materyali kaydedilmez. |
| Revoked/expired/compromised seller session | `401 SELLER_SESSION_REVOKED` veya `401 SESSION_EXPIRED` | Safe session reason, correlation id; raw credential yok. |
| No active membership/suspended account | `403 NO_ACTIVE_MEMBERSHIP` veya `403 ACCOUNT_SUSPENDED` | Membership state redacted audit. |
| Unknown/missing permission | `403 PERMISSION_DENIED` | Permission check outcome only; resource existence sızmaz. |
| Cross-tenant, missing, soft-deleted resource | `404 RESOURCE_NOT_FOUND` | Same external shape/status; target details only safe internal audit metadata. |
| Revision/idempotency conflict | `409 REVISION_CONFLICT` / `409 IDEMPOTENCY_KEY_REUSED` | No stale source value or other tenant metadata. |
| Disabled capability | `503 CAPABILITY_DISABLED` | Flag true olsa dahi authz bypass olmaz. |
| Sensitive mutation without challenge | `403 STEP_UP_REQUIRED` / `403 STEP_UP_EXPIRED` | Action/target/session-bound challenge evidence only. |

Error envelope later seller controller’larında `{ code, error, request_id? }` olacaktır; `details` yalnız allowlisted, tenant-safe and non-secret validation data taşıyabilir. Audit/outbox payloadı deny reason, actor/session/tenant/target class, correlation id, result code ve redacted metadata ile sınırlıdır. Full email, phone, address, legal/tax/bank values, raw token, token hash, OTP/secret, authorization header ve stack trace yasaktır.

## 6. Step-up ve şifre reset ayrımı

`seller_step_up_challenges` session-bound, action-bound, target-bound, expiry/attempt-limited bir future F2 primitive’idir. Bir challenge başka session, action, target veya membership revision için kullanılamaz. F1 challenge transportu, OTP/TOTP, email/SMS provider veya UI kurmaz.

Customer password reset tokenı seller session değildir. F0A’nın `RESET_TOKEN_BOUND` pre-auth contractı korunur: reset token yalnız account/device/expiry bağlamında, tek kullanımlı hash state ile iş görür; membership/organization/permission kurmaz. Seller password reset/lifecycle F2 authorizationına aittir. Reset veya security change gerçekleştiğinde gelecekte ilgili seller session/family revoke ve redacted audit zorunluluğu vardır.

## 7. API surface karar tablosu

`IMPLEMENT_IN_F1` aşağıdaki anlamdadır: sadece ayrı F1 implementation authorizationı ile, `SELLER_API_V1_ENABLED=false` defaultunu koruyarak ve production-usable seller bootstrap/login issuance eklemeden geliştirilir. Bu plan hiçbir route’u şu anda mount etmez.

| Yüzey | Karar | Gerekçe ve şart |
|---|---|---|
| `GET /api/seller/v1/context` (ORG-01) | `IMPLEMENT_IN_F1` | F0A F1 contractıdır. Seller session sonrası only; `preferred_store_id` hint, DG-001 çözülmeden selection yok; no-store, server-resolved context, no public bootstrap. |
| `GET /api/seller/v1/organizations/current` (ORG-02) | `IMPLEMENT_IN_F1` | F0A F1 contractıdır. `organization.read`, response legal/tax field içermez, scope DB’den türetilir. |
| `GET /api/seller/v1/team/roles` (TEAM-00) | `IMPLEMENT_IN_F1` | F0A F1 read foundation. `team.read`, owner non-assignable, registry unknown-deny. |
| `GET /api/seller/v1/team/members` (TEAM-01) | `IMPLEMENT_IN_F1` | F0A F1 read foundation. Masked minimum PII, cursor/limit contract, same tenant predicate. |
| `GET /api/seller/v1/capabilities` | `BLOCKED` | F0A’da canonical endpoint değildir. Var olan admin capability surface veya invented response seller sözleşmesi yerine geçmez. Gerekirse yeni F0A contract correction gerekir. |
| `GET /api/seller/v1/organizations` | `BLOCKED` | Canonical F1 route `organizations/current` ve contexttir; broad list/selection DG-001 çözmeden eklenmez. |
| `POST /api/seller/v1/context` | `BLOCKED` | F0A context route’u `GET`tir; client context değiştirerek authority oluşturamaz. DG-001 owner kararı ve F0A correction olmadan yoktur. |
| `POST /api/seller/v1/auth/logout` | `DEFER_TO_F2` | Session revoke command F0A auth lifecycle kapsamındadır; F1’de usable seller login/session issuance yoktur. |
| `POST /api/seller/v1/auth/refresh` | `DEFER_TO_F2` | Binding rotation/replay contract F2 olarak dondurulmuştur. |
| `POST /api/seller/v1/team/invitations` (TEAM-02) | `DEFER_TO_SEPARATE_F1_AUTHORIZATION` | F0A F1 contractıdır fakat create command, idempotency, scope and provider/delivery boundary için read foundationdan ayrı exact allowlist/test gate gerekir. Owner invitation forbidden, offline queue forbidden. |
| `PATCH /api/seller/v1/team/members/{membershipId}` (TEAM-03) | `DEFER_TO_SEPARATE_F1_AUTHORIZATION` | Step-up, revision, last-owner, scope/session invalidation ve DG-002 require a separate mutation authorization. |
| `DELETE /api/seller/v1/team/members/{membershipId}` (TEAM-04) | `DEFER_TO_SEPARATE_F1_AUTHORIZATION` | Last-owner + revoke transaction, step-up, audit/outbox and offline prohibition require separate authorization. |
| `/api/admin/**`, `/api/users/**`, `/api/auth/**` as seller adapter | `FORBIDDEN` | Different audience/tenant model; no compatibility shim may broaden them. |

## 8. Future seller route/controller/service allowlist

Future F1 source paths must be exact-authorized; anticipated paths are `routes/sellerContextRoutes.js`, `controllers/sellerContextController.js`, `middlewares/sellerAuthMiddleware.js`, `middlewares/sellerTenantContext.js`, `services/sellerSessionService.js`, `services/sellerTenantContextService.js`, `services/sellerAuthorizationService.js`, `services/sellerAuditOutboxService.js` and their paired tests. A route may not query the pool directly around the resolver; it delegates to policy/service with an injected queryable/transaction boundary. `server.js` is touched only if a separately authorized, default-off mount is actually needed.

Every runtime path must have a test path in `SELLER-F1-FILE-ALLOWLIST.tsv`. Admin runtime remains read-only. Main customer Android paths are forbidden. New seller source never lives under `admin-commerce-pro` or modifies its token/storage contract.

## 9. Test and security exit conditions

- Customer/admin token presented to seller chain is rejected despite a valid shared signature.
- Live DB membership change/revoke and stale revision/stamp deny a previously issued seller session.
- Unknown role/permission/scope denies; final owner cannot be removed/demoted/suspended.
- Client-supplied organization/store/role cannot access or select a tenant; cross-tenant, missing and deleted probes are indistinguishable 404s.
- Refresh race yields at most one success; replay revokes family/session; no raw secret/hash is observable.
- All critical mutation audit/outbox events are atomic, append-only and redacted; immutable outbox event and immutable delivery-attempt history never update/delete prior records, and retry cannot duplicate business mutation.
- Seller flag false prevents reachable seller capability; customer/admin/session, first-party catalog and Socket.IO regression suites remain green.

Passing these tests does not authorize F2 login/refresh, invitation delivery, team mutations, Android, migration apply, feature activation, commit, push or PR.
