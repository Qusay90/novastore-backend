# Seller F1 Uygulama Planı

## 1. Durum ve kapsam

- Durum: `PLAN_ONLY`; bu belge runtime, SQL, migration veya endpoint uygulamaz.
- Faz: `F1 — organization, membership, tenant scope, session ve audit foundation`.
- Başlangıç doğrulaması: F0A/F0B sözleşme girdileri doğrulanmış, beş mevcut uyumluluk testi PASS.
- Amaç: Satıcı kimliğinin customer/admin kimliğinden ayrıldığı, tenant kapsamının sunucu tarafından çözüldüğü ve ileri fazların güvenle bağlanabileceği dar foundation’ı planlamak.
- Bu plan yeni telefon tasarımı, ekran, Android modülü veya satıcı iş akışı üretmez.

## 2. Bağlayıcı F0A/F0B girdileri

Bu plan aşağıdaki committed sözleşmelere tabidir: `ADR-0001-SELLER-BOUNDARY.md`, `SCREEN-BACKEND-MATRIX.tsv`, `SELLER-API-V1.md`, `ADDITIVE-MIGRATION-AND-FORWARD-RECOVERY.md`, `PHASE-GATES.md` ve üç F0B smoke testi. Çelişki halinde F0A/F0B üstün gelir.

Özellikle şu sınırlar değişmez: ayrı seller audience; her korumalı istekte DB’deki canlı session ve membership; token claim’lerinin tek otorite olmaması; sunucu çözümlü organization/store scope; cross-tenant/missing/deleted için aynı güvenli `404 RESOURCE_NOT_FOUND`; append-only redacted audit; audit/outbox update veya delete olmaması; tüm seller feature flag’lerinin başlangıçta `false` olması.

`ORG-01`, `ORG-02`, `TEAM-00` ve `TEAM-01` F1 sözleşme satırları bugün `PROPOSED_NOT_IMPLEMENTED` durumundadır. `TEAM-02`–`TEAM-04` sözleşmesi bulunur; fakat F1 foundation, owner kararı gerektiren çoklu context seçimi (`DG-001`) veya owner transferini (`DG-002`) kendiliğinden çözmez.

## 3. Mevcut repo mimarisi

- Node/Express uygulaması `server.js` ile route’ları bağlar; merkezi hata katmanı `statusCode/status` veya 500’den `{ error }` üretir.
- `middlewares/authMiddleware.js` ortak JWT’den yalnız `{ id, role }` oluşturur. Audience, session, membership revision veya revoke kontrolü yoktur.
- `routes/adminRoutes.js` admin yollarında `privateNoStore → authenticate → requireAdmin → requireCurrentAdmin` zincirini kullanır. `currentAdminGuard` DB’den güncel rolü tekrar okur; bu örüntü seller tenant resolver için fikir verir, fakat admin katmanı satıcıya açılmaz.
- `stores` tablosu ve `products.store_id` vardır; `stores.owner_user_id` nullable legacy alandır. Bunlar organization, membership veya seller ownership değildir.
- Admin Commerce Pro kasıtlı olarak `single_vendor`/`novastore-platform` first-party kapsamındadır. Bu yüzey ve `/api/admin/**` seller istemcisinin authz dayanağı olmayacaktır.
- Yeni admin-katalog katmanında policy/service/transaction/append-only audit örüntüsü vardır. Legacy controller’lar ise doğrudan pool kullanır. Seller kodu yeni service/policy doğrultusunda kurulmalıdır.
- Startup yalnız local güvenlik kuralları altında runtime schema initializer çalıştırır. `createCoreSchema` seller migration taşıyıcısı değildir; migration dosyaları ayrı ve forward-only kalır.

### Kaynak kanıt indeksi

- **EXISTING:** ortak JWT `{id,role}` üretir/doğrular: `controllers/userController.js:140-180`, `middlewares/authMiddleware.js:3-55`. Audience, session, membership ve security stamp yoktur.
- **EXISTING:** admin canlı DB rolünü yeniden okur: `services/currentAdminGuard.js:1-24`; protected admin chain: `routes/adminRoutes.js:25-46`; bu yalnız comparison pattern’idir.
- **PARTIAL:** password reset hash/expiry ve atomik tek-kullanım taşır: `controllers/authController.js:17-40`, `100-115`, `260-300`; seller session/refresh değildir.
- **PARTIAL:** Socket.IO ortak JWT ile handshake yapar: `server.js:51-70`, `services/socketAuthService.js:28-73`; live seller session revoke/membership recheck yoktur.
- **EXISTING:** legacy `stores` ve `products.store_id`: `migrations/20260701_category_v2_additive_foundation.sql:3-16`, `84-129`; bunlar seller tenant authority değildir.
- **EXISTING:** admin first-party catalog scope `novastore-platform` predicate’ine bağlıdır: `services/adminCatalogProductService.js:90-120`, `145-179`; Commerce Pro `single_vendor` döndürür: `services/adminCommerceReadService.js:24-34`.
- **PARTIAL:** append-only audit trigger ve transaction precedent’i vardır: `migrations/20260714_admin_catalog_mutation_foundation.sql:36-90`; seller audit/outbox değildir.
- **EXISTING:** runtime schema init yalnız güvenli local startup koşullarında çalışır: `config/startupSafety.js:166-196`, `server.js:278-302`, `models/createCoreDb.js:168-174`.
- **MISSING:** source discovery’de seller namespace, seller audience/session/membership/role/tenant repository, seller audit/outbox veya refresh-family implementation bulunmamıştır.
- **PROPOSED:** F1A–F1F pathları yalnız `SELLER-F1-FILE-ALLOWLIST.tsv` ve bu planın §8.1’inde gelecekteki ayrı yetkilendirme için tanımlıdır.
- **OUT_OF_SCOPE:** customer/admin endpoint genişletme, Android, provider, migration apply, backfill, F2 credentials and F3+ commerce/finance domains.

## 4. Yeniden kullanılabilir mevcut temeller

| Temel | Kanıt | F1’de kullanım sınırı |
|---|---|---|
| JWT doğrulama ve 401/403 ayrımı | `middlewares/authMiddleware.js` | Seller tokenları için doğrudan kullanılamaz; seller audience ve canlı DB kontrolleri eklenir. |
| Güncel DB rolü kontrolü | `services/currentAdminGuard.js` | Seller membership/session resolver için tasarım örneği; admin guard yeniden kullanılmaz. |
| `private, no-store` | `middlewares/privateNoStore.js` | Korumalı seller context/team okumalarında zorunlu cache politikası örneği. |
| Atomic tek-kullanımlı password reset | `controllers/authController.js` | Hash, expiry ve compare-and-set örneği; seller refresh F2’ye aittir ve ayrı tablolarda tasarlanır. |
| Transaction + append-only audit | admin catalog mutation service ve migration | Tenant authorization tamamlandıktan sonra seller audit/outbox transaction sınırı için örnek. |
| Fake DB ve auth negatif smoke’ları | mevcut admin/socket testleri | Yeni F1 testleri gerçek DB olmadan policy zincirini; ayrı onayda disposable DB ile migration’ı kanıtlar. |

## 5. Tespit edilen boşluklar

1. `/api/seller/v1/**` mount, seller route/controller/service namespace’i yoktur.
2. Seller audience, session, session revoke, refresh family, security stamp veya step-up state yoktur.
3. `seller_organizations`, `seller_stores`, membership, role/permission, invitation, seller audit ve transactional outbox yoktur.
4. Tenant koşulunu zorunlu kılan repository/policy katmanı ve safe-not-found standardı yoktur.
5. Socket katmanı ortak JWT ile handshake yapar ve sonradan session revoke/membership değişikliği yeniden değerlendirmez.
6. Platform store/legacy product ve `owner_user_id` için seller organization backfill kararı yoktur. F1 bunu uydurmaz.

## 6. F1 hedefleri

- Additive organization/store binding, role, permission, membership, invite, session, audit ve outbox sözleşmelerini çalıştırılabilir bir migration tasarımına dönüştürmek.
- Seller request’inde zorunlu zinciri tanımlamak: no-store → seller audience doğrulama → canlı session → aktif membership → server-resolved organization/store → permission → kaynak tenant predicate → service.
- Unknown-deny, last-owner, IDOR/cross-tenant safe 404, session revision ve redacted audit kurallarını kod/test düzeyinde kurmak.
- `SELLER_API_V1_ENABLED=false` iken hiçbir customer/admin/public surface’ı genişletmeden, yalnız sözleşmedeki context/organization/team read foundation’ını kapalı varsayılanla hazırlamak.
- F2 ve sonraki fazların kullanacağı session/audit/outbox temelini, login veya refresh endpoint’i yayınlamadan hazırlamak.

## 7. F1 dışı hedefler

F1 şunları yapmaz: seller public login, access/refresh token issuance veya rotation endpoint’i, password reset/OTP/TOTP/MFA, onboarding/application, invitation delivery provider’ı, store edit UI, offer/variant/inventory, order/return/shipment, ledger/settlement/payout, first-party backfill, Android veya tablet, canonical ekran uygulaması, feature flag activation, staging/production migration veya external servis çağrısı.

## 8. Önerilen F1 alt-fazları

Her alt-faz ayrı owner authorization ister; aşağıdaki dosya listeleri ilerideki izinli değişiklikler için öneridir, bu planın izinli yazı alanı değildir.

| Alt-faz | Amaç ve yetkili yüzey | Yasak yüzey | Giriş / çıkış / recovery |
|---|---|---|---|
| F1A | Migration contract ve disposable-DB test manifesti: source schema type inventory → external FK parity gate → migration generation → static migration contract test → disposable DB test sırasıyla three additive migration dosyası, migration test helper ve migration contract testleri. | Runtime route, `server.js`, customer/admin davranışı, DB apply. | Giriş: F0B PASS, source type parity ve migration authorization. Çıkış: idempotent disposable-DB proof. Recovery: applied dosya değiştirilmez, yeni correction migration. |
| F1B | Organization, seller-store binding, roles/permissions, memberships ve last-owner policy/service katmanı. | `stores.owner_user_id` reinterpretasyonu, offers/orders, invite delivery. | Giriş: F1A migration proof. Çıkış: DB authority + tenant predicate tests. Recovery: suspend/revoke/forward correction; hard-delete yok. |
| F1C | Seller session record, membership revision/security stamp, revoke ve seller audit/outbox services. | Login/refresh/password UI, raw token saklama, Socket.IO activation. | Giriş: F1B authority proof. Çıkış: revoke/re-evaluation, redaction ve atomic-outbox tests. Recovery: terminal revoke/correction event. |
| F1D | Seller authz middleware, tenant resolver, standard error envelope ve protected-service policy seam. | `/api/admin/**` reuse, client tenant authority, public mount. | Giriş: F1B/F1C tests. Çıkış: unknown-deny, same-404, no-store and middleware-order tests. Recovery: flag off; no legacy behavior change. |
| F1E | F0A `ORG-01`, `ORG-02`, `TEAM-00`, `TEAM-01` read-boundary integration behind false flag, with no live seller bootstrap. | `POST /context`, TEAM mutations, invite provider, public seller login. | Giriş: DG-001 remains explicit and any bootstrap strategy separately approved. Çıkış: disabled-by-default proof and regression tests. Recovery: unmount/deny by flag, forward-only schema retained. |
| F1F | Independent focused test/security/reviewer closure and one authorized foundation commit preparation. | Commit/push/PR without separate authorization; migration apply. | Giriş: all prior gates PASS. Çıkış: exact allowlist and clean state. Recovery: do not amend; new authorization/correction only. |

### 8.1 Alt-faz başına kesin dosya duvarı

Bu tablo gelecekteki ayrı authorization için normatif file map’tir; bu plan hiçbir satırı uygulama izni yapmaz. Her alt-fazda **yalnız** `Yetkili dosyalar` hücresindeki tam yollar yazılabilir. O hücre dışında kalan tüm repo yolları o alt-faz için yasaktır. Aşağıdaki `Yasak dosyalar` hücresi özellikle korunacak yüksek-risk yolları açıkça tekrarlar; `admin-commerce-pro/node_modules/**` yalnız generated ignored output olarak `FORBIDDEN_FROM_GIT`tir. `SELLER-F1-FILE-ALLOWLIST.tsv` satırlarının kanonik subphase sırası `BASELINE → F1-PLANNING → F1A → F1B → F1C → F1D → F1E → F1F → FORBIDDEN`; her grupta `artifact_type`, sonra `path` sıralamasıdır.

| Alt-faz | Yetkili dosyalar (tam liste) | Yasak dosyalar (tam yüksek-risk liste) | Ayrı authorization / exit |
|---|---|---|---|
| F1A | `migrations/20260730_seller_f1_organizations_roles_memberships.sql`; `migrations/20260730_seller_f1_store_bindings_invitations.sql`; `migrations/20260730_seller_f1_sessions_audit_outbox.sql`; `tests/helpers/sellerF1DisposableDb.js`; `tests/sellerF1MigrationContractSmoke.js`; `tests/sellerF1MigrationDisposableDbSmoke.js` | `server.js`; `models/createCoreDb.js`; `controllers/authController.js`; `controllers/userController.js`; `middlewares/authMiddleware.js`; `routes/adminRoutes.js`; `app/build.gradle.kts`; `app/src/main/AndroidManifest.xml`; `app/src/main/java/com/novastore/app/navigation/NavGraph.kt`; `admin-commerce-pro/package.json`; `admin-commerce-pro/package-lock.json`; `admin-commerce-pro/node_modules/**` | Migration/disposable-DB authorization; exit is fresh+second-apply and verification queries PASS. |
| F1B | `services/sellerAuthorizationService.js`; `services/sellerRolePermissionService.js`; `services/sellerStoreBindingService.js`; `tests/sellerF1OrganizationMembershipPolicySmoke.js`; `tests/sellerF1RolePermissionMatrixSmoke.js`; `tests/sellerF1MembershipStoreScopeSmoke.js` | F1A migration files after apply; `server.js`; `middlewares/sellerAuthMiddleware.js`; `middlewares/sellerTenantContext.js`; `services/sellerSessionService.js`; `services/sellerAuditOutboxService.js`; all listed admin/customer/Android/package paths | Foundation-service authorization; exit is DB-authority, composite-FK, unknown-deny and last-owner proof. |
| F1C | `services/sellerSessionService.js`; `services/sellerAuditOutboxService.js`; `tests/sellerF1AudienceIsolationSmoke.js`; `tests/sellerF1SessionRevisionSmoke.js`; `tests/sellerF1RefreshFamilyContractSmoke.js`; `tests/sellerF1StepUpBindingSmoke.js`; `tests/sellerF1AuditOutboxSmoke.js`; `tests/sellerF1OutboxDeliverySmoke.js` | `server.js`; all route/controller paths; `middlewares/authMiddleware.js`; `services/socketAuthService.js`; customer/admin/Android/package paths | Session/audit authorization; exit is old-generation replay, revoke, step-up, redaction and append-only event/attempt proof. |
| F1D | `middlewares/sellerAuthMiddleware.js`; `middlewares/sellerTenantContext.js`; `services/sellerTenantContextService.js`; `tests/sellerF1TenantResolverSmoke.js`; `tests/sellerF1TenantIsolationSmoke.js`; `tests/sellerF1ClientTenantInputSmoke.js` | `server.js`; all F1E route/controller paths; `/api/admin/**` source paths (`routes/adminRoutes.js`, `services/adminCommerceReadService.js`); `middlewares/authMiddleware.js`; Android/package paths | Authz middleware authorization; exit is audience/live-session/tenant-first/same-404 proof. |
| F1E | `routes/sellerContextRoutes.js`; `controllers/sellerContextController.js`; `server.js`; `tests/sellerF1ContextRouteSmoke.js`; `tests/sellerF1TeamMutationContractSmoke.js` | `POST /context` implementation; `routes/adminRoutes.js`; `controllers/authController.js`; `controllers/userController.js`; `services/socketAuthService.js`; Android/package paths; all team mutation/provider paths | Read-boundary authorization; exit is false-flag default, no usable login/bootstrap and F0A read-only route proof. |
| F1F | `tests/sellerF1NoRegressionSmoke.js` | Every migration/source/config/package/lock/Android path; all commit/push/PR/ref operations; `admin-commerce-pro/node_modules/**` | Review/rerun authorization only. A commit is excluded until all gates PASS **and** a distinct written commit authorization names its exact staged paths/message. |

## 9. Bağımlılık grafiği

```text
F0A/F0B contracts
        ↓
F1A migration contract ──────→ F1B org/role/membership
                                     ↓
                             F1C session/audit/outbox
                                     ↓
                             F1D seller tenant resolver
                                     ↓
              F1E disabled context/team read boundary
                                     ↓
                        F1F independent closure
```

F2 seller login/refresh ve F14 team mutations F1’in tüketicisidir; F1 bunları başlatmaz.

## 10. Migration sırası

Önerilen üç forward-only unit, mevcut `YYYYMMDD_description.sql` adlandırmasına uyar ve bugün repo içinde çakışmaz:

1. `migrations/20260730_seller_f1_organizations_roles_memberships.sql`
2. `migrations/20260730_seller_f1_store_bindings_invitations.sql`
3. `migrations/20260730_seller_f1_sessions_audit_outbox.sql`

Önce nullable/additive yapılar ve invariantları destekleyen index/constraint’ler, sonra backfill kararı olmadan boş/explicit seller bindingler, sonra session/audit/outbox gelir. `novastore-platform` için organization mapping ancak ayrı owner kararı, snapshot/quarantine ve backfill authorization ile gerçekleşir. Mevcut `stores.owner_user_id` hiçbir aşamada seller owner olarak kabul edilmez. Applied migration silinmez/değiştirilmez; hata ileri migration ile düzeltilir.

F1A SQL üretim sırası zorunlu olarak `source schema type inventory → external FK parity gate → migration generation → static migration contract test → disposable DB test`tir. Mevcut `users.id` gibi external keyler source-controlled effective PostgreSQL türüyle birebir eşleşir; yeni seller-domain `BIGSERIAL` keyler yalnız seller-domain internal `BIGINT` FK’lerle eşleşir. Parity gate geçmeden SQL dosyası oluşturulmaz; API JSON/string gösterimi database-column türünü değiştirmez.

## 11. Runtime entegrasyon sırası

1. Migration SQL’i runtime initializer’a taşımadan migration reader/contract testini kur.
2. Role/permission registry ve membership policy’yi saf dependency-injected service olarak kur.
3. Canlı seller session ve membership revision yüklemesini, seller audience doğrulamasından sonra ekle.
4. Organization/store context’i session+membership’ten türet; header/query/body `organization_id`, `store_id`, role veya ownership hiçbir zaman otorite değildir.
5. Tenant predicate’i service/repository çağrısının zorunlu parametresi yap; karşılaştırmalı kaynak erişiminde `404 RESOURCE_NOT_FOUND` dön.
6. Audit/outbox insertini kritik mutation ile aynı transaction’a bağla; F1 read calls yalnız sözleşmenin gerektirdiği sampled/full audit politikasını izler.
7. En son, kapalı flag arkasında yalnız `GET /api/seller/v1/context`, `GET /api/seller/v1/organizations/current`, `GET /api/seller/v1/team/roles`, `GET /api/seller/v1/team/members` için read boundary değerlendirilir.

## 12. Feature flag sırası

1. F1 başlangıcında F0A kataloğundaki tüm flag’ler `false`: `SELLER_API_V1_ENABLED`, `SELLER_ONBOARDING_ENABLED`, `SELLER_OFFER_WRITE_ENABLED`, `SELLER_ORDER_WRITE_ENABLED`, `SELLER_FINANCE_READ_ENABLED`, `SELLER_PAYOUT_PREP_ENABLED`, `EXTERNAL_SELLER_VISIBILITY_ENABLED`.
2. Schema/migration varlığı flag açılması değildir.
3. F1D/F1E’de `SELLER_API_V1_ENABLED` false iken endpoint mount veya yetenek görünürlüğü yoktur; testler bunu kanıtlar.
4. Gelecekte flag ancak audience, live session, membership, permission, scope, state, revision, audit ve no-regression kapıları PASS olduğunda; external visibility en son ayrı owner ile açılabilir.

## 13. Test sırası

1. F0A/F0B document/matrix/security ve admin compatibility baseline.
2. Migration static contract, filename/order, no-runtime-carrier ve disposable DB idempotency tests.
3. Role/permission/membership/last-owner unit matrix.
4. Tenant resolver middleware-order, unknown-deny, audience isolation ve safe 404 tests.
5. Session revision/revoke and future-refresh-boundary tests.
6. Audit redaction/append-only and outbox atomicity/retry-isolation tests.
7. F1 read-boundary disabled-flag and no-regression admin/customer/socket tests.
8. Independent Tester, Security and Reviewer read-only rerun.

## 14. Security-review sırası

1. Threat boundary: customer/admin/seller audience separation and no shared storage/session substitution.
2. Authentication: seller JWT issuer/audience/key/expiry plan, live session status and replay-safe future refresh boundary.
3. Authorization: DB-authoritative active membership, permission unknown-deny, last-owner and stale revision semantics.
4. Tenant isolation: server-derived organization/store, all resource predicates tenant-first, same 404 oracle resistance.
5. Data protection: invite/refresh/challenge hashes only, audit redaction, no secret/PII in error or logs, no-store cache policy.
6. Integrity: transactionally coupled audit/outbox, append-only triggers, duplicate/retry behavior and forward correction.
7. Regression: admin/candidate customer routes, first-party scope and Socket.IO room model remain isolated.

## 15. Uyumluluk kuralları

- Existing customer login, profile, order, checkout, legacy endpoint status/shape ve customer Android unchanged.
- Existing `/api/admin/**`, `novastore-platform`, `single_vendor`, Commerce Pro and admin capability defaults unchanged.
- Existing platform store remains a first-party boundary; seller F1 does not make it seller-owned or customer-visible differently.
- Seller routes use only `/api/seller/v1/**`; admin/customer JWT/session primitives cannot establish seller authority.
- Socket.IO is not seller-enabled in F1. Any later seller socket integration must independently enforce live session/membership and tenant room authorization.

## 16. Forward recovery

No destructive rollback, table/column drop, migration edit, hard deletion of membership/audit/outbox, or mutation of immutable event rows. Recover with: feature flag remaining off, session revoke/suspension, invitation expiration/revocation, append-only audit correction/reversal event, and a new additive correction migration. Backfill failures remain quarantined with no silent seller ownership inference.

## 17. Commit boundaries

F1A–F1E must be independently authorized with exact path allowlists and their own test gates. A single foundation commit is only a future recommended boundary after all F1 subphases, independent reviews, clean exact allowlist and a separate commit authorization. No commit, push or PR is part of this plan.

## 18. Owner gates

Separate owner authorization is required for every source/migration/test change, disposable DB execution, migration apply, seller bootstrap/login, F2 auth/OTP/MFA, DG-001 context-selection decision, DG-002 owner-transfer decision, invitation delivery, first-party/history backfill, flag activation, Android, staging/production and external provider work.

## 19. Nihai kesin sıra

1. Exact branch/HEAD/status and F0A/F0B hashes verify.
2. F1A authorization; create/test additive migration units only in disposable local DB.
3. F1B authorization; establish organization/store binding, roles, permissions, memberships and last-owner invariant.
4. F1C authorization; establish seller session revision/revoke, redacted append-only audit and transactional outbox.
5. F1D authorization; enforce seller audience and server-resolved tenant policy in a dedicated middleware/service chain.
6. F1E authorization; consider only F0A F1 read contracts behind `SELLER_API_V1_ENABLED=false`, while DG-001/DG-002 remain explicit blockers.
7. Re-run baseline and F1 tests; obtain independent Tester, Security and Reviewer reports.
8. Obtain separate owner authorization before any commit; obtain a different authorization before any migration apply, flag activation, push or PR.
