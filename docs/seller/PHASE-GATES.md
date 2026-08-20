# Seller Faz Kapıları — F0A–F15

## Sözlük ve genel kurallar

Bu dosya tek bağlayıcı faz sözlüğüdür. `BLOCKED` ve `FAIL`, `PASS` değildir. Bir fazın PASS olması sonraki fazı yetkilendirmez. Her faz yeni owner promptu, exact allowlist, branch/HEAD doğrulaması ve değişiklik sınırı gerektirir.

Ortak değişmezler:

- Seller API yalnız `/api/seller/v1/**`.
- Customer/admin/seller audience ayrıdır.
- Server-side membership, permission ve tenant scope zorunludur.
- Unknown permission/state/capability deny olur.
- Cross-tenant kaynak güvenli not-found verir.
- Seller write flag’leri varsayılan kapalıdır.
- Audit ve ledger append-only’dir.
- Tablet kapsam dışıdır.
- Kanonik 001–296 bağlayıcıdır.
- Commit, push, PR, migration/DB apply, staging/production ve provider işlemi ayrıca yetkilendirilir.

## Handoff Faz 0–9 eşlemesi

| Tarihsel handoff adı | Bağlayıcı yeni kapı |
| --- | --- |
| Faz 0 — Baseline/mimari | F0A + F0B |
| Faz 1 — Ortak uygulama kabuğu | F7 |
| Faz 2 — 001–054 | F2 + F8 |
| Faz 3 — 055–141 | F3 + F5 + F9 |
| Faz 4 — 142–184 | F4 + F10 |
| Faz 5 — 185–222 | F5 + F6 + F11 |
| Faz 6 — 223–256 | F12 |
| Faz 7 — 257–281 | F13 |
| Faz 8 — 282–296 | F1 + F2 + F14 |
| Faz 9 — Tam doğrulama | F15 |

Bu eşleme tarihsel planı açıklar; eski adlar yeni authorization kimliği değildir.

## F0A — Documentation contract freeze

- Purpose: Seller boundary, API, migration/recovery, 296-screen matrix ve faz kapılarını dondurmak.
- Authorized surface: Yalnız `docs/seller/ADR-0001-SELLER-BOUNDARY.md`, `SCREEN-BACKEND-MATRIX.tsv`, `SELLER-API-V1.md`, `ADDITIVE-MIGRATION-AND-FORWARD-RECOVERY.md`, `PHASE-GATES.md`.
- Explicitly forbidden surface: Source, test, config, migration, build, Android, DB, endpoint, network/provider ve Git history.
- Entry conditions: **Yazma öncesinde** hedef seller worktree/index temiz; branch `codex/seller-theme-integration`; HEAD `50fa5f538680c728762cb205528a19484480981d`; `docs/seller/**` altında pre-existing non-ignored dosya yok; handoff bütünlüğü ve kaynaklar doğrulanmış.
- Expected branch/HEAD verification: Başta ve sonda branch/HEAD exact; HEAD unchanged.
- Data/migration impact: None.
- API impact: Yalnız proposed contract; runtime yok.
- Android impact: None.
- Security gates: Tenant/RBAC/IDOR/session/audit/step-up/finance invariants belgede tutarlı.
- Test gates: In-memory 296-row/column/route validation, exact five-file allowlist ve `git diff --check`.
- Visual/canonical gates: 001–296 tam ve tekil; DG-005 motion timing uydurulmaz.
- Exit criteria: Beş belge tutarlı; Reviewer ve Security read-only sonuçları kabul edilebilir; final status yalnız exact beş izinli untracked dosyayı gösterebilir; index temiz, HEAD unchanged ve allowlist dışı değişiklik yok.
- Expected evidence: Git status/diff, matrix validator, source manifest, reviewer/security raporu.
- Commit boundary: Commit yasak; ayrı onay gerekir.
- Separate owner authorizations still required: F0B, commit, push, PR ve tüm uygulama fazları.
- Forward-recovery or rollback boundary: Belge içi düzeltme yalnız beş allowlist dosyasında; başka dosya gerekirse BLOCKED.

## F0B — Contract-test foundation

- Purpose: Seller contract enum/schema/route/error/permission/matrix lint test temelini kodda kurmak; runtime capability açmamak.
- Authorized surface: Ayrı owner promptunda exact test ve contract-only support allowlist’i.
- Explicitly forbidden surface: Migration, DB, production endpoint mounting, Android, feature flag açma, admin/customer behavior değişikliği.
- Entry conditions: F0A PASS ve owner F0B authorization.
- Expected branch/HEAD verification: Owner promptunda verilen seller branch ve exact starting HEAD; clean index/worktree.
- Data/migration impact: None.
- API impact: Runtime route yok; proposed contract’ın executable schema/test karşılığı.
- Android impact: None.
- Security gates: Namespace, audience, unknown-deny, safe-not-found, permission ve tenant lint testleri.
- Test gates: Contract schema, 296 coverage, route prefix, stable errors, permission registry ve negative fixtures.
- Visual/canonical gates: Screen IDs ve handoff source paths değişmeden test edilir; görüntü üretimi yok.
- Exit criteria: Tests fail-closed; sahte implemented endpoint yok; existing tests PASS.
- Expected evidence: Test komutları/çıktıları, exact diff, no-runtime route proof.
- Commit boundary: Tek contract-test commit ancak ayrı commit onayıyla.
- Separate owner authorizations still required: F1 ve commit/push/PR.
- Forward-recovery or rollback boundary: Test-only değişiklik geri alınabilir; schema/DB etkisi yok.

## F1 — Organization, membership, tenant scope, session and audit

- Purpose: Server-side seller identity/context, organization/store membership, permission ve audit temeli.
- Authorized surface: Onaylı additive migration, seller domain policy/service/middleware ve test allowlist’i.
- Explicitly forbidden surface: Seller offer/order/finance writes, Android, admin audience reuse, production flag açma.
- Entry conditions: F0B PASS; disposable DB ve migration ayrı onayı.
- Expected branch/HEAD verification: F1 promptundaki exact branch/HEAD; clean status.
- Data/migration impact: Additive organization/store/membership/role/session/audit/outbox tabloları.
- API impact: Proposed context/organization/team read temeli; `SELLER_API_V1_ENABLED=false`.
- Android impact: None.
- Security gates: DB membership authority, last-owner, unknown-deny, IDOR, session revocation, audit redaction.
- Test gates: Migration smoke, RBAC matrix, tenant isolation, cross-tenant negative, session revision ve audit tests.
- Visual/canonical gates: DG-001 ve DG-002 açık kalır; UI uygulanmaz.
- Exit criteria: Tenant resolver her protected service’te zorunlu; no-regression PASS; flags off.
- Expected evidence: Disposable DB outputs, policy tests, query plans/index checks, diff.
- Commit boundary: Tek foundation commit; migration apply ayrı.
- Separate owner authorizations still required: Staging/production migration, F2–F15.
- Forward-recovery or rollback boundary: Additive forward migration; membership/audit hard-delete yok.

## F2 — Seller auth, onboarding, verification and security

- Purpose: Seller audience, application/onboarding, OTP/2FA, re-auth ve security lifecycle.
- Authorized surface: Seller auth/application/security domain, additive schema ve tests.
- Explicitly forbidden surface: Customer/admin token reuse, gerçek payout, Android ekranları, remote provider aktivasyonu.
- Entry conditions: F1 PASS; OTP/email provider ve migration için ayrı onay/fixture stratejisi.
- Expected branch/HEAD verification: F2 promptundaki exact branch/HEAD.
- Data/migration impact: Application steps, verification challenge metadata, document metadata, security stamp/recovery.
- API impact: Auth/onboarding/security proposed routes; `SELLER_ONBOARDING_ENABLED=false` başlangıç.
- Android impact: None; F8 bekler.
- Security gates: Rate limit, hashed challenges, audience, session revoke, step-up binding, upload security, PII redaction.
- Test gates: Success/expiry/replay/brute-force, suspended/disabled, re-auth, mass-assignment, IDOR ve provider fake tests.
- Visual/canonical gates: 001–054 state sözleşmesi; görsel uygulama yok.
- Exit criteria: 001–054 backend states deterministic ve fail-closed; provider yoksa güvenli unavailable.
- Expected evidence: Contract/integration/security tests, no-secret proof, migration verification.
- Commit boundary: Auth/onboarding foundation commit’i; provider/flag ayrı.
- Separate owner authorizations still required: Provider credentials, staging/production, F8.
- Forward-recovery or rollback boundary: Challenge/session revoke; application state append-only history; destructive rollback yok.

## F3 — Offer, variant and inventory ownership

- Purpose: Global product ile seller offer/variant/inventory sahipliğini ayırmak.
- Authorized surface: Additive offer/inventory schema, seller service/API ve tests.
- Explicitly forbidden surface: Legacy global product’ı seller-owned saymak, admin endpoint reuse, external visibility, unsafely enabled media.
- Entry conditions: F1 PASS, F0B contract PASS, migration approval.
- Expected branch/HEAD verification: F3 exact branch/HEAD.
- Data/migration impact: Seller offer/variant/inventory/movement ve mapping tabloları.
- API impact: Offer/inventory reads; writes flag kapalı; media BLOCKED ayrı contract’a kadar.
- Android impact: None; F9 bekler.
- Security gates: Store scope before revision, strict allowlist, SKU uniqueness by tenant, audit, IDOR.
- Test gates: CRUD state machine, CAS/If-Match, idempotent adjustments, batch atomicity, cross-tenant, media denial.
- Visual/canonical gates: 074–141 backend state mapping; normal publish moderation varsaymaz.
- Exit criteria: Reconciled shadow model, writes disabled, no legacy regression.
- Expected evidence: Migration/query/tests, status/error contracts, reconciliation report.
- Commit boundary: Domain foundation commit; write flag ve visibility ayrı.
- Separate owner authorizations still required: F9, media, flags, backfill.
- Forward-recovery or rollback boundary: Soft archive; inventory compensation; additive correction migration.

## F4 — Seller order allocation and fulfillment

- Purpose: Platform order’ı seller item/package kapsamına güvenli tahsis etmek.
- Authorized surface: Allocation/package schema, seller order/fulfillment service/API ve tests.
- Explicitly forbidden surface: Global order ownership değişikliği, provider shipment, refund amount authority, offline financial/order mutation queue.
- Entry conditions: F1/F3 PASS; order allocation ve migration onayı.
- Expected branch/HEAD verification: F4 exact branch/HEAD.
- Data/migration impact: Seller order/item/package allocation ve transition history.
- API impact: Scoped order reads/commands; `SELLER_ORDER_WRITE_ENABLED=false`.
- Android impact: None; F10 bekler.
- Security gates: Item/package IDOR, masked PII, state machine, step-up, idempotency, audit.
- Test gates: Multi-seller order, partial shipment/cancel/return, concurrency, replay, safe-not-found, compensation.
- Visual/canonical gates: 142–184 akış/state sözleşmesi; DG-004 açık.
- Exit criteria: Seller yalnız tahsisli kalemi görür; writes flag off; return/refund zinciri reconcile.
- Expected evidence: Allocation fixtures, transition tests, negative PII/tenant tests.
- Commit boundary: Order foundation commit; provider/write activation ayrı.
- Separate owner authorizations still required: F10, shipment/refund provider, flag.
- Forward-recovery or rollback boundary: Allocation supersede/compensation; platform order silinmez.

## F5 — Ledger and read-only finance

- Purpose: Append-only ledger, dashboard/analytics ve read-only finance projection.
- Authorized surface: Ledger schema/posting, reconciled read projections/API ve tests.
- Explicitly forbidden surface: Payout request/release, provider transfer, client amount authority, offline financial queue.
- Entry conditions: F4 posting sources hazır; migration ve finance security approval.
- Expected branch/HEAD verification: F5 exact branch/HEAD.
- Data/migration impact: Ledger entries, source mapping, balance/read projections.
- API impact: Dashboard/finance/analytics reads; `SELLER_FINANCE_READ_ENABLED=false`.
- Android impact: None; F9/F11 bekler.
- Security gates: Minor unit/decimal, tenant scope, immutable ledger, redaction, reconciliation lock.
- Test gates: Duplicate posting, refund/chargeback, negative balance, currency, reconciliation, IDOR, cached stale read.
- Visual/canonical gates: 055–073 ve 185–222 backend read state’leri.
- Exit criteria: Ledger-derived totals reconcile; stale cache timestamped; no payout mutation.
- Expected evidence: Invariant tests, amount reconciliation, redacted audit/log proof.
- Commit boundary: Ledger/read foundation commit; finance flag ayrı.
- Separate owner authorizations still required: F6/F9/F11, data backfill, finance flag.
- Forward-recovery or rollback boundary: Reversal/compensating entries; ledger delete/update yok.

## F6 — Settlement and payout preparation

- Purpose: Settlement preparation ve maskeli payout-account yönetimi; para hareketi olmadan.
- Authorized surface: Settlement/payout-account metadata schema, preparation API, tests.
- Explicitly forbidden surface: Manual payout release, provider money movement, production bank write, automatic flag opening.
- Entry conditions: F5 PASS; DG-003 kaydı ve financial security approval.
- Expected branch/HEAD verification: F6 exact branch/HEAD.
- Data/migration impact: Settlement snapshot/lifecycle ve payout-account token metadata.
- API impact: Settlement/account preparation; `SELLER_PAYOUT_PREP_ENABLED=false`.
- Android impact: None; F11 bekler.
- Security gates: Step-up, four-eyes where decided, bank masking, no sensitive logs, duplicate settlement guard.
- Test gates: Account ownership, default switch concurrency, settlement overlap, mismatch block, replay/IDOR.
- Visual/canonical gates: 193–200; manuel payout UI eklenmez.
- Exit criteria: Preparation works under fakes; provider call impossible; flag off.
- Expected evidence: Security tests, redaction snapshots, settlement reconciliation.
- Commit boundary: Preparation-only commit.
- Separate owner authorizations still required: F11, provider integration, production payout, flag.
- Forward-recovery or rollback boundary: Settlement supersede; account lifecycle revoke; provider rollback yok çünkü çağrı yok.

## F7 — Separate seller Android foundation

- Purpose: Ayrı `:seller-app` telefon-only application kabuğu ve güvenli runtime altyapısı.
- Authorized surface: Ayrı owner allowlist’inde Gradle module, seller app shell, navigation, design tokens, network/session/cache/test foundation.
- Explicitly forbidden surface: `:app` customer dönüşümü, tablet, poster/WebView, production seller writes, kanonik dalga ekranları dışında genişleme.
- Entry conditions: F0B PASS; module/application ID ve signing için owner kararı.
- Expected branch/HEAD verification: F7 exact branch/HEAD.
- Data/migration impact: None.
- API impact: Contract adapter; endpoint yoksa fail-closed, fixture yalnız preview/test.
- Android impact: Yeni `:seller-app`; customer `:app` no-regression.
- Security gates: Separate token storage/audience, no mock fallback, redacted cache, deep-link auth.
- Test gates: Gradle config, unit/navigation, process restart, offline/cache, customer app build.
- Visual/canonical gates: Shared tokens/components ve beşli nav geometrisi; DG-005 timing BLOCKED.
- Exit criteria: Shell builds/runs; no screen completion claim; no customer regression.
- Expected evidence: Build/test outputs, emulator shell, module/application ID diff.
- Commit boundary: Android foundation commit; signing/deploy ayrı.
- Separate owner authorizations still required: F8–F15, signing, distribution.
- Forward-recovery or rollback boundary: Module additive; customer app config korunur.

## F8 — Screens 001–054

- Purpose: Auth, security, application ve onboarding kanonik dalgası.
- Authorized surface: F7 seller app içinde yalnız 001–054 UI/navigation/repository/tests/assets.
- Explicitly forbidden surface: 055+, tablet, fake production auth, provider/DB değişikliği.
- Entry conditions: F2 ve F7 PASS; exact screen/file allowlist.
- Expected branch/HEAD verification: F8 exact branch/HEAD.
- Data/migration impact: None in Android phase.
- API impact: F2 seller contracts only; unavailable capability fail-closed.
- Android impact: 001–054 real state/modal/sheet/navigation.
- Security gates: OTP/replay/rate state, secure storage, step-up, document/PII masking, suspended state.
- Test gates: Form validation, success/error/loading/offline/expiry/resume, navigation/back, contract tests.
- Visual/canonical gates: 001, 027 full-resolution critical plus 001–054 deterministic screenshots; phone-only.
- Exit criteria: 54/54 mapped and tested; backend gaps remain BLOCKED.
- Expected evidence: Coverage ledger, emulator screenshots, test/build output.
- Commit boundary: Tek dalga commit; ayrı izin.
- Separate owner authorizations still required: Commit/push/PR, F9.
- Forward-recovery or rollback boundary: Local draft only; no queued sensitive mutation.

## F9 — Screens 055–141

- Purpose: Dashboard, offer/catalog ve inventory dalgası.
- Authorized surface: Seller app 055–141 ve gerekli F3/F5 adapters/tests.
- Explicitly forbidden surface: 142+, tablet, admin endpoint, unsafely enabled media/write.
- Entry conditions: F3/F5/F7 PASS; required flags remain owner-controlled.
- Expected branch/HEAD verification: F9 exact branch/HEAD.
- Data/migration impact: None in Android phase.
- API impact: Scoped seller read/write contracts only.
- Android impact: 055–141.
- Security gates: Tenant offer scope, revision, batch atomicity, inventory reason, no mock fallback.
- Test gates: Empty/no-result/loading/error/offline, filter/search, publish/archive/batch, concurrency.
- Visual/canonical gates: 055, 074, 124 critical; all 87 IDs; DG-005 unresolved timing is not invented.
- Exit criteria: 87/87 mapped; unsupported media/write blocked visibly.
- Expected evidence: Runtime screenshots, contract/UI tests, capability matrix.
- Commit boundary: Tek dalga commit.
- Separate owner authorizations still required: Flags/media, F10.
- Forward-recovery or rollback boundary: Draft recovery; inventory compensation; no destructive delete.

## F10 — Screens 142–184

- Purpose: Order, package, shipment, cancellation, return ve refund dalgası.
- Authorized surface: Seller app 142–184 ve F4 adapters/tests.
- Explicitly forbidden surface: 185+, provider shipment/refund, open PII, offline mutation queue.
- Entry conditions: F2/F4/F7 PASS; step-up endpointi ekran 182 için F2’den hazır; DG-004 kararı veya screen 159 fail-closed.
- Expected branch/HEAD verification: F10 exact branch/HEAD.
- Data/migration impact: None in Android phase.
- API impact: Seller allocation/order commands only.
- Android impact: 142–184.
- Security gates: Package/item IDOR, masked address, step-up, valid state transition, message PII filtering.
- Test gates: Multi-package, partial return, duplicate command, conflict, error/offline no-write.
- Visual/canonical gates: 142 ve 156 critical; 43/43 deterministic screenshots.
- Exit criteria: 43/43 mapped; platform-only decisions not impersonated.
- Expected evidence: Emulator flows, transition/audit test outputs, PII review.
- Commit boundary: Tek dalga commit.
- Separate owner authorizations still required: Provider/refund activation, F11.
- Forward-recovery or rollback boundary: Command compensation; drafts preserved; no financial queue.

## F11 — Screens 185–222

- Purpose: Finance, payout-account preparation ve analytics dalgası.
- Authorized surface: Seller app 185–222 ve F5/F6 adapters/tests.
- Explicitly forbidden surface: 223+, manual payout/release, provider transfer, unmasked bank/PII.
- Entry conditions: F5 PASS; F6 gereken ekranlarda PASS; DG-003 açıkça korunur.
- Expected branch/HEAD verification: F11 exact branch/HEAD.
- Data/migration impact: None in Android phase.
- API impact: Reconciled reads ve approved preparation only.
- Android impact: 185–222.
- Security gates: Finance permission, step-up bank mutations, redaction, stale cache, no offline queue.
- Test gates: Amount formatting, ledger/settlement consistency, filters/reports, empty/loading/error/offline.
- Visual/canonical gates: 185 ve 205 critical; 38/38 deterministic screenshots.
- Exit criteria: 38/38 mapped; payout release yok; totals source-backed.
- Expected evidence: Emulator, financial invariant/contract/UI tests, redaction review.
- Commit boundary: Tek dalga commit.
- Separate owner authorizations still required: Provider/finance flags, F12.
- Forward-recovery or rollback boundary: Ledger reversal; prepared settlement supersede.

## F12 — Screens 223–256

- Purpose: Campaign/coupon ve store/reputation dalgası ile gerekli seller backend capability.
- Authorized surface: Seller campaign/store/review/question API domaini ve Android 223–256, exact migration varsa ayrı allowlist.
- Explicitly forbidden surface: 257+, global campaign/admin settings, platform-funded amount authority, other-store data.
- Entry conditions: F1/F3/F5/F7 PASS; campaign financing ve store policy contracts onaylı.
- Expected branch/HEAD verification: F12 exact branch/HEAD.
- Data/migration impact: Gerekirse additive seller campaign/store projection; ayrı migration onayı.
- API impact: Scoped campaign/coupon/store/review/question routes.
- Android impact: 223–256.
- Security gates: Store/offer scope, financing source separation, publish revision, PII-free public replies.
- Test gates: Draft/publish/stop, budget/limit, role denial, review/question moderation boundary, error/loading.
- Visual/canonical gates: 223 ve 243 critical; 34/34 screenshots; DG-005 timing invented değil.
- Exit criteria: 34/34 mapped; global admin capability açılmaz.
- Expected evidence: API/security/UI tests, screenshots, funding audit proof.
- Commit boundary: Domain ve Android değişikliği gerekirse owner’ın belirlediği ayrı commit sınırları.
- Separate owner authorizations still required: Migration/flags, F13.
- Forward-recovery or rollback boundary: Draft soft-delete, campaign stop future use only; historical order/ledger değişmez.

## F13 — Screens 257–281

- Purpose: Notification, customer message, NovaBot ve live-support dalgası ve gerekli seller backend capability.
- Authorized surface: Scoped notification/communication/support API ve Android 257–281.
- Explicitly forbidden surface: 282+, customer/support channel mixing, external links/PII, offline send queue.
- Entry conditions: F1/F4/F7 PASS; moderation/redaction/support transfer contract onaylı.
- Expected branch/HEAD verification: F13 exact branch/HEAD.
- Data/migration impact: Gerekirse additive projection/conversation mapping; ayrı onay.
- API impact: Seller notification, order conversation ve support routes.
- Android impact: 257–281.
- Security gates: Order-context ownership, critical notification exceptions, PII/link filtering, support isolation.
- Test gates: Read-state isolation, preferences, quiet hours, message moderation, retry no-duplicate, offline read-only.
- Visual/canonical gates: 257 ve 271 critical; 25/25 screenshots.
- Exit criteria: 25/25 mapped; notification read state business record’ı değiştirmez.
- Expected evidence: Contract/security/UI tests, screenshots, redaction fixtures.
- Commit boundary: Owner-defined bounded commits.
- Separate owner authorizations still required: Provider/live support, F14.
- Forward-recovery or rollback boundary: Message idempotency; preference revision; no offline outbound replay.

## F14 — Screens 282–296

- Purpose: Team/RBAC ve account/security dalgası.
- Authorized surface: F1/F2 team/security API ve Android 282–296.
- Explicitly forbidden surface: Owner transfer uydurmak, bank/finance permission escalation, customer/admin session reuse.
- Entry conditions: F1/F2/F7 PASS; DG-002 kararı veya owner-transfer yüzeyi BLOCKED.
- Expected branch/HEAD verification: F14 exact branch/HEAD.
- Data/migration impact: None in Android phase; yeni custom-role schema ayrı onay.
- API impact: Scoped memberships/invitations/security routes.
- Android impact: 282–296.
- Security gates: Last-owner, invitation lifecycle, role change session invalidation, step-up, recovery-code secrecy.
- Test gates: RBAC matrix, invite replay/expiry, permission denial, remove-member 2FA, device revoke.
- Visual/canonical gates: 282 ve 292 critical; 15/15 screenshots.
- Exit criteria: 15/15 mapped; unknown permission deny; DG-002 sessizce çözülmez.
- Expected evidence: Security/contract/UI tests, emulator screenshots, session revoke proof.
- Commit boundary: Tek dalga veya owner-defined bounded commits.
- Separate owner authorizations still required: Owner transfer, F15.
- Forward-recovery or rollback boundary: Membership revoke/reinvite; permission revision; audit immutable.

## F15 — Full runtime, visual, security and release-candidate QA

- Purpose: 296/296 runtime, visual, functional, security ve no-regression release-candidate doğrulaması.
- Authorized surface: Test/evidence ve owner’ın exact allowlist’i; düzeltme gerekiyorsa ayrı authorization.
- Explicitly forbidden surface: Yeni özellik/tasarım, tablet, gizli bypass, production deploy/payout, kapsam dışı refactor.
- Entry conditions: F1–F14 ilgili kapıları PASS; tüm BLOCKED açık ve owner kararlı.
- Expected branch/HEAD verification: Release-candidate exact branch/HEAD/tag adayı; clean index başlangıcı.
- Data/migration impact: Salt-okunur/disposable test; staging/production ayrı.
- API impact: Contract/runtime doğrulaması; yeni endpoint yok.
- Android impact: Telefon emulator/device tam akış; APK/signing/distribution ayrı.
- Security gates: Tenant/IDOR/RBAC/session/re-auth/audit/PII/finance tam bağımsız review.
- Test gates: Build, unit, integration, migration smoke, contract, instrumentation, offline/cache, concurrency/idempotency.
- Visual/canonical gates: 296/296; kritik 001,027,055,074,124,142,156,185,205,223,243,257,271,282,292 tam çözünürlük; kalanlar deterministic.
- Exit criteria: Gerekli checklist maddelerinin tamamı PASS; BLOCKED kalmaz; no-regression ve exact scope PASS.
- Expected evidence: Coverage ledger, screenshots/diffs, emulator recordings, test logs, security/reviewer sonuçları.
- Commit boundary: RC commit/tag/push/PR yalnız ayrı owner onayıyla.
- Separate owner authorizations still required: Commit, push, PR, signing, staging/production migration/deploy, external visibility, payout provider.
- Forward-recovery or rollback boundary: Release flag’leri default off; veri düzeltmeleri forward-only; ledger/audit compensation.

## Authorization sonucu

Bu F0A promptu yalnız F0A’yı yetkilendirir. `F0B` dahil hiçbir sonraki faz başlamaz.
