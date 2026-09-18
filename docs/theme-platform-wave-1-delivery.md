# NovaStore Theme Platform Wave 1 — teslim ve devir kaydı

Tarih: 19 Eylül 2026. Kapsam: `SOURCE-AUTHORITY-LOCK-AND-THEME-SERVICE-FOUNDATION`.

Bu teslim, merkezi tema servisinin sunucu ve veri temellerini kapsar. Yerel, geçici PostgreSQL üzerinde gerçek oturum ve HTTP testleriyle doğrulanan altyapı; üretimde çalışan bir tema hizmeti, tamamlanmış Admin/Studio arayüzü veya Stocky teslim zinciri olarak sunulmaz. Üretilen artifact henüz müşteriye sunulmaya hazır değildir. Yerel genel CI koşusu **86/86 smoke betiği PASS** ile tamamlandı. Wave 1 sunucu temeli doğrulandı; bu sonuç üretim READY veya yayın onayı değildir. Son Git/push kimlikleri final raporundadır.

## Kaynak yetkisi ve değişiklik sınırı

`SOURCE_AUTHORITY: APPROVED`. Kaynak seçimi en yeni veya temiz görünen checkout varsayımına değil, [Owner kaynak kararı](<C:/Users/kusay/.codex/attachments/0d09a7f9-6558-440a-82cc-4a6cea770b1e/Yapıştırılan metin.txt>) ve [Wave 1 faz talimatına](<C:/Users/kusay/.codex/attachments/702ca74c-2d9f-4d71-a5e9-a0cc24e3af11/Yapıştırılan metin.txt>) dayanır. Bu iki yerel ek, bu çalışmanın kullanıcı talimatı kanıtıdır.

| Kimlik | Kabul edilen değer |
|---|---|
| Backend + Admin tabanı | R27, `b654dada7a67ce8904eed9ccd1ff037e5f16e5ed` |
| Backend taban ağacı | `348747a9d140b112dcbc85db3a103967a29d9292` |
| Stocky salt okunur referansı | R23, `2fd1495d1b5c8e3cf496f90db341bd4f4789df5f` |
| Uygulama dalı | `codex/theme-platform-foundation-wave-1` |
| Uygulama worktree'si | `C:/Users/kusay/source/NovaStore-Codex/android-customer-theme-20260722/theme-platform-foundation-wave-1` |
| Başlangıç staged/unstaged/untracked | `0/0/0`; [dondurulmuş sözleşmedeki](theme-platform-wave-1-contract.md) başlangıç kaydı |

R27 referansının yerine ayrı uygulama worktree'si kullanıldı. Kullanıcı WIP'si bulunan ana backend/Stocky checkout'ları uygulama hedefi değildir. Stocky R23, güvenlik ve taşıma davranışı için referanstır; bu fazda Stocky kaynak değişikliği veya canlı mutasyonu yapılmaz. R27'de genel Stocky insan oturumu değişim köprüsü olduğu varsayılmaz. Studio paketi referanstır, backend Git yetkisinin yerine geçmez.

Bu dosyaya kendi teslim commit'inin hash'i yazılmaz. Son HEAD/tree, dirty durumu, commit/push kanıtı ve nihai faz sonucu ayrı final raporunda kaydedilir. Owner'ın koşullu commit/push izni; PR, merge, deploy, üretim migration, gerçek satıcı ataması veya sağlayıcı işlemi izni değildir.

## Uygulanan temel

NovaStore; tema kataloğu, değişmez sürüm, satıcı tema hizmeti, atama, taslak/override, özellik hakkı, işlem kaydı ve yayın talebini yönetir. Fiyat, stok, sipariş, ödeme ve sevkiyat mevcut commerce servislerinin yetkisinde kalır. `organization_id` mevcut Seller organizasyonudur; `store_id` **`seller_stores.id`** değeridir, eski commerce `stores.id` değildir. İsteğin gövdesindeki rol, üyelik, organizasyon veya dış satıcı kimliği yetki oluşturmaz.

Bir additive migration eklendi: [`20260918_01_theme_platform_foundation.sql`](../migrations/20260918_01_theme_platform_foundation.sql). [Migration registry](../scripts/staging-migrations/manifest.json) girdisi kontrollü transaction ve kanonik LF checksum sözleşmesini kullanır. Geçici PostgreSQL koşusunda 41 migration uygulanmış ve ikinci çalıştırmanın değişiklik yapmadığı doğrulanmıştır. Üretim veritabanına migration uygulanmamıştır.

Migration'ın **19 yeni tablosu**:

| Grup | Tablolar |
|---|---|
| Katalog ve satıcı hizmeti — 6 | `themes`, `theme_versions`, `seller_theme_services`, `theme_assignments`, `theme_drafts`, `theme_draft_revisions` |
| Özellikler — 3 | `feature_catalog`, `plan_feature_defaults`, `seller_feature_entitlements` |
| Varlık ve yayın kayıtları — 4 | `theme_assets`, `theme_previews`, `theme_publications`, `theme_deployments` |
| İşlem ve kanıt — 4 | `theme_operations`, `theme_outbox`, `theme_inbox`, `theme_audit_events` |
| Açık rol bağları — 2 | `theme_admin_roles`, `theme_seller_roles` |

Başlangıç verisi yalnızca 9 özellik tanımı ve 18 plan varsayılanıdır; gerçek hesaba rol, hizmet veya atama verilmez. Tenant kapsamı birleşik foreign key'lerle korunur. Published sürümler ve tarihçe değiştirilemez; ilgili UPDATE/DELETE/TRUNCATE denemeleri veritabanı sınırında reddedilir. Sahiplik ve üst kayıt kimlikleri sonradan başka tenant'a taşınamaz. Ayrıntılar [şema belgesindedir](theme-platform-schema.md).

**31 method/path girdisi** vardır: 16 Admin ve 15 Seller. Kökler `/api/admin/theme-platform` ve `/api/seller/v1/theme-platform` şeklindedir. Seller entitlement GET dahildir. Tam rota, izin, gövde ve örnek JSON listesi [API belgesindedir](theme-platform-api.md). Bu yüzey; katalog, hizmet, atama, yetki, taslak, önizleme, asset metadata, yayın/rollback talebi, işlem ve audit temellerini sağlar. Gerçek yayına yükseltme endpoint'i yoktur.

## Gate 0–16 kanıt eşlemesi

Aşağıdaki Gate numaraları kullanıcı faz talimatının numaralarıdır. Test dosyasındaki `G00–G38` etiketleri farklı bir test numaralandırmasıdır. “Yerel PASS”, yalnızca belirtilen kanıt ve sunucu temeli kapsamı içindir.

| Faz Gate'i | Durum ve teslim | Kaynak / çalıştırılmış kanıt |
|---|---|---|
| **0 — Source Authority / Workspace Safety** | **APPROVED.** Owner R27/R23 seçiminden sonra ayrı, başlangıçta temiz worktree. Üretim authority veya deploy izni genişletilmedi. | Yukarıdaki Owner eki; [dondurulmuş sözleşme](theme-platform-wave-1-contract.md). Son Git kimliği ayrı final raporunda. |
| **1 — Contract Freeze** | **DONDURULDU.** Önceki OpenAPI önerisi doğrudan uygulama yetkisi sayılmadı. Kimlikler, durumlar, sahiplik ve ertelenen live pointer/legal/domain işleri açık. | [Sözleşme](theme-platform-wave-1-contract.md), [API](theme-platform-api.md). |
| **2 — Database Foundation** | **Yerel PASS.** 19 additive tablo, kapsam FK'leri, uniqueness, timestamp/revision, yalnız katalog seed'i. | Migration; gerçek PG `G00`, `G33`; registry 41 migration, tekrar uygulama no-op. |
| **3 — Immutable Version Model** | **Yerel PASS.** Published base değişmez; satıcı taslağı typed override tutar; revision ve artifact digest saklanır. | [Validation](../services/themePlatformValidation.js), [şema](theme-platform-schema.md); PG `G05–G06`, `G12–G13`, `G33`. |
| **4 — Seller Service + Assignment** | **Yerel PASS.** Hizmet sahipliği sunucudan çözülür; ilk hizmet oluşturma da hizmet kapsamlı audit/outbox üretir. Web/app ataması, kabul/geri çekme ve ayrı taslaklar kalıcıdır. Stocky teslimi yoktur. | [Servis](../services/themePlatformService.js); PG `G07–G08`, `G37`; ilk oluşturma düzeltmesi son 39/39 koşusunda doğrulandı. |
| **5 — Feature Entitlements** | **Yerel PASS.** Canlı oturum/üyelik, rol, sahiplik, aktif süreli hizmet, özellik ve kota birlikte denetlenir. DENY baskındır; bilinmeyen özellik reddedilir. | Servis `effective/requireFeature` ve okuma/replay kontrolleri; PG `G20–G22`, `G31`, `G35–G36`. |
| **6 — RBAC** | **Yerel PASS.** Yedi sunucu rolü, açık Admin bağı, sınırlı Seller owner fallback. Viewer edit/publish/accept yapamaz. | [Auth](../services/themePlatformAuthService.js), [auth açıklaması](theme-platform-auth.md); 36 mock auth testi; PG `G03–G04`, `G19`, `G26–G28`, `G38`. |
| **7 — Multi-Tenant Isolation** | **Yerel PASS.** Ayrı organizasyon/satıcı/store/service/assignment/draft/asset ile tenant A→B okuma/yazma reddi; yabancı ve olmayan kayıt aynı 404 kodunu kullanır. | Gerçek imzalı HTTP `G17–G18`, asset `G15`, SQL `G33`; iki tenant fixture'ı. |
| **8 — Draft + CAS** | **Yerel PASS.** Sayısal expectedRevision ve uyumlu If-Match; eşzamanlı aynı revision'da tek kazanan, stale save 409. | PG `G10–G11`, `G24`; immutable revision geçmişi. |
| **9 — Idempotency / Operation Ledger** | **Yerel PASS, yerel işlemler.** Actor+scope+key, kanonik request hash, aynı gövde dedupe/farklı gövde 409; replay öncesi güncel yetki. Stocky teslim replay'i bu fazda yoktur. | PG `G09`, `G20`, `G22–G24`, `G34`, `G37`; `theme_operations`. |
| **10 — Audit** | **Yerel PASS.** İlk hizmet oluşturma dahil işlemle aynı transaction'da sunucu actor/scope/target/correlation/reason ve izinli metadata; credential redaksiyon kontrolleri, append-only kayıt. | PG `G07`, `G25`, `G30`, `G33–G34`; `theme_audit_events`. İstemci yerel geçmişi audit sayılmaz. |
| **11 — Outbox / Inbox Foundation** | **Yerel PASS, temel kayıtlar.** İlk hizmet oluşturma dahil outbox atomiktir; idempotent tekrar yeni olay üretmez. Inbox kaynak/event kimliği ve payload hash ile dedupe yapar. İşçi, taşıma veya gerçek Stocky receipt zinciri yoktur. | PG `G07`, `G25`, `G32–G34`; dahili `receiveInbox`, dışa açılmış inbox HTTP endpoint'i yok. |
| **12 — API Foundation** | **Yerel PASS.** 31 rota, mevcut auth/transport, strict body/revision/idempotency kontrolleri. Yayın `PUBLICATION_REQUESTED`; rollback `BLOCKED`. | [Rotalar](../routes/themePlatformRoutes.js); PG `G01–G04`, `G16`, `G23`, `G28–G29`; API belge envanteri. |
| **13 — Asset Security Foundation** | **Yerel PASS, metadata sınırı.** Gerçek byte üzerinden signature/MIME/size/hash; sunucu storage key; quarantine; yabancı/READY olmayan referans reddi. Byte depolama veya malware scan tamamlanmış değildir. | PG `G14–G15`, `G31`; validator upload sınırı; `theme_assets`. |
| **14 — Test Matrix** | **Odaklı testler PASS.** 57 birim testi ve 39 gerçek PG/HTTP kapısı; 33 SQL negatif kontrolü ile 4 auth kilit yarışı bu kapıların altındadır. Genel CI 86/86 PASS; migration entegrasyonu 27 senaryo PASS. | Aşağıdaki test günlüğü ve komutlar; model/fixture sonuçları gerçek DB sonucu olarak sayılmadı. |
| **15 — Existing System Compatibility** | **Yerel foundation uyumluluğu PASS.** Canonical 30, variant 30, Stocky sistem commerce 139 kontrolü geçti. S01 ürün→sipariş uçtan uca zinciri kapatılmadı. | Compatibility günlükleri; genel CI **86/86 PASS**. Mevcut commerce authority korunur. |
| **16 — Variant Cart Blocker** | **VARIANT_CART_DEFERRED_WITH_PLAN.** B03 tekrar üretildi; geniş consumer uyumluluğu nedeniyle yarım cart düzeltmesi yapılmadı. Bu bir “cart düzeldi” PASS'i değildir. | [Kesin migration/compatibility planı](theme-platform-variant-cart.md); aşağıdaki açık sınırlama. |

## Testlerin sonucu ve sayım sınırı

Yerel kanıt dizini: `C:/Users/kusay/Documents/Codex/2026-09-04/gp/outputs/theme-platform-wave-1-20260919`.

| Çalıştırma | Sonuç | Kanıt ve sınır |
|---|---|---|
| `npm run test:theme-platform:unit` | **57/57 PASS**, 0 fail/skip | [unit-tests.log](C:/Users/kusay/Documents/Codex/2026-09-04/gp/outputs/theme-platform-wave-1-20260919/unit-tests.log). 36 auth testi mock DB istemcisi kullanır; kalan 21 validator/model testi gerçek HTTP/DB kanıtı değildir. |
| `npm run test:theme-platform:integration` | **39/39 PASS**, 0 fail/skip | [theme-postgres.log](C:/Users/kusay/Documents/Codex/2026-09-04/gp/outputs/theme-platform-wave-1-20260919/theme-postgres.log). PostgreSQL 16, gerçek imzalı Admin/Seller oturumları, HTTP ve iki ayrı tenant. 41 migration; fixture container kaldırıldı, outbound girişimi 0. |
| G33 alt kontrolleri | **33 SQL negatif kontrolü PASS** | [Schema extra](../tests/themePlatformSchemaExtraSmoke.js). Üstteki 39 kapının içindeki G33'ün altıdır; ayrıca toplama eklenmez. |
| G38 alt kontrolleri | **4 auth yarış kontrolü PASS** | [Auth integration extra](../tests/themePlatformAuthIntegrationExtra.js). PostgreSQL `pg_blocking_pids` ile gözlenen gerçek kilit beklemesi; owner fallback/explicit rol ekleme iki sıra, rol iptali ve session iptali. Üstteki G38'e dahildir. |
| `npm run test:canonical-commerce:integration` | **30 HTTP kontrolü PASS** | [canonical-commerce.log](C:/Users/kusay/Documents/Codex/2026-09-04/gp/outputs/theme-platform-wave-1-20260919/canonical-commerce.log). Bu simple-product suite variant seçimlerini `REJECTED_UNSUPPORTED` olarak reddeder; provider/production write 0. |
| Canonical variant regression | **30 HTTP kontrolü PASS** | [stocky-commerce-final.log](C:/Users/kusay/Documents/Codex/2026-09-04/gp/outputs/theme-platform-wave-1-20260919/stocky-commerce-final.log) içindeki `purchasableVariantUat`. Aynı logda tekrar koşulan canonical 30 ikinci kez benzersiz test diye sayılmaz. Variant quote/order kanıtı B03 shared-cart uyumluluğunu kapatmaz. |
| `npm run test:stocky-system:integration` | **139 Stocky sistem commerce kontrolü PASS** | Aynı final Stocky günlüğü: gerçek PHP/SQLite receiver + canonical PC1 PostgreSQL outbox, iki-store izolasyonu ve kayıp yanıt/ack tekrarları. `S01=BLOCKED_BY_S10`, `productOrderE2E=PARTIAL_S01_NOT_IMPLEMENTED`; provider/production write 0. Theme delivery kanıtı değildir. |
| Tüm seçilmiş CI smoke betikleri | **86/86 PASS, 0 başarısız/atlanmış betik** | Yazmaları dondurulmuş kaynaklarla son koşu tamamlandı. [ci-smokes-final.log](C:/Users/kusay/Documents/Codex/2026-09-04/gp/outputs/theme-platform-wave-1-20260919/ci-smokes-final.log) sonuç kanıtıdır. Önceki yarım/başarısız koşular final başarı olarak gösterilmez. |

Farklı ölçü birimlerini tek bir “toplam test” sayısında birleştirmeyin: birim testleri, entegrasyon kapıları, SQL alt kontrolleri ve HTTP kontrol sayıları ayrı tutulur. Aynı regression suite'inin tekrar çalıştırılması yeni benzersiz kapsam değildir.

Sayılar başarılı günlük koşularını belirtir. Son incelemede ilk hizmet oluşturma işlemine hizmet kapsamlı audit/outbox olayı eklenmesi düzeltildi ve sonraki 39/39 gerçek PostgreSQL koşusu geçti. İlk oluşturma aynı hizmet için durable audit ve outbox üretir; idempotent tekrar ikinci mantıksal olay oluşturmaz. Nihai kaynak kimliği ve genel CI sonucu ayrı final raporuyla eşleştirilir.

Genel CI için yeni worktree'de mevcut Admin'in `dist-integrated` build çıktısı önkoşuldur. Backend CI işine mevcut `admin-commerce-pro` bağımlılık kurulumu ve `build:live` adımı eklendi; bu, yeni Admin ürün arayüzü teslimi değildir. Migration sayısı beklentileri additive migration'a göre güncellendi. Bu hazırlıkların kendisi CI PASS kanıtı değildir.

## Yetki başlangıcı ve çalışma sınırları

`NOVASTORE_THEME_PLATFORM_ENABLED` varsayılan olarak kapalıdır. Flag açılması yalnız rota kurar; migration, rol atama, tema yayını veya Stocky teslimi yapmaz. Seller tarafında mevcut activation, canlı session/membership ve güvenli taşıma kontrolleri ayrıca geçerli kalır.

İlk yetki verme işlemi, ayrı Owner onaylı veritabanı yönetim sürecidir. Mevcut enabled Admin kullanıcısına açık ve aktif `theme_admin_roles` bağı gerekir. HTTP üzerinden rol bootstrap endpoint'i veya otomatik super admin ataması yoktur. Seller için açık membership bağı kullanılır; yalnız doğrulanmış aktif sistem owner'ı, bağ yoksa seller_owner fallback alabilir. İnaktif açık bağ fallback'i kapatır. Viewer hiçbir durumda edit, accept veya publish yetkisi alamaz; seller_admin/editor yayın yetkisi ancak açık `publish_allowed=true` ile verilir.

Yetki, servis kilidi sonrasında aynı READ COMMITTED transaction'ında yeniden okunur. Session/üyelik/rol/store scope değişiklikleri kilitlenir; idempotency replay eski yetkiyi yeniden kullanmaz. Önizleme süresi, assignment withdrawal, aktif hizmet penceresi, özellik iptali ve artifact snapshot kontrolleri doğrudan okuma ve kayıtlı sonuç okumasında uygulanır. API örnekleri ve gövde sözleşmeleri [API belgesindedir](theme-platform-api.md); bu belgede gerçek token veya canlı uygulama komutu bulunmaz.

## Açık bağımlılıklar ve ertelenen işler

- **Gerçek asset depolama:** Kayıt en fazla 512 KiB PNG/JPEG/WebP signature kontrolü yapar; byte'lar storage sürücüsüne yazılmaz. `QUARANTINED` ve `storageReady:false`, başarılı upload/READY/malware taraması anlamına gelmez. Güvenilir depolama, tarama ve READY geçişi sonraki iştir. İstemci dosya adı veya yolu sahiplik yetkisi değildir.
- **Gerçek yayın:** `PUBLICATION_REQUESTED` yalnız kalıcı talep ve artifact'tir. Doğrulanmış deployment, aktif tema pointer'ı, renderer, legal onayı ve domain/DNS iş akışı yoktur. Rollback kaydı `BLOCKED/THEME_VERIFIED_DEPLOYMENT_REQUIRED` döner; live pointer değişmez.
- **Artifact referans çözümleme kapısı:** Packaged `imageKey` için şu an yalnız izinli yol biçimi denetlenir; dosyanın güvenilir bir manifestte bulunduğu veya içeriğinin doğrulandığı kanıtlanmaz. `productIds`/`categoryIds` yalnız tip, sayı ve boyut kurallarıyla doğrulanır; mevcut, görünür ve doğru store kapsamına ait commerce kayıtlarına çözülmez. Herhangi bir preview renderer veya canlı müşteri tüketicisinden önce sunucu tarafında manifest doğrulaması ve store/tenant kapsamlı commerce resolver gerekir. Bu referanslar doğrulanmadan “vetted asset” veya customer-ready artifact denemez.
- **Stocky teslimi:** Assignment → delivery → inbox → receipt → seller hesap görünürlüğü zinciri kurulmadı. Outbox/inbox tabloları bu zincirin güvenilir temelidir; worker veya canlı taşıma yoktur. Compatibility suite'inde mevcut commerce receiver'ın çalışması, Theme Platform tesliminin çalıştığını göstermez.
- **UI ve istemciler:** Admin/Studio API adapter'ı, Seller limited editor, storefront artifact tüketimi ve native Android entegrasyonu bu teslimde yoktur. Tarayıcı/native cihaz, staging veya üretim UAT yapılmış sayılmaz. Mobil `app` kanalı yalnız sunucu atama/özellik sözleşmesidir.
- **S01 ürün zinciri:** Mevcut Stocky compatibility sonucu ürün oluşturma/yayınlama zincirini tamamlamaz; `BLOCKED_BY_S10` ve `PARTIAL_S01_NOT_IMPLEMENTED` aynen korunur. [S01 handoff](seller/PC1-STOCKY-S01-PRODUCT-PRICE-STOCK-PUBLICATION-HANDOFF.md) ayrı bağımlılıktır.
- **Variant shared cart — B03:** Aynı product'ın variant 901/902 satırları mevcut shared-state normalizer'da tek product satırına birleşir ve variant kimliği kaybolur. Web/Android/checkout tüketicileri birlikte ele alınmadan sadece backend'i değiştirmek güvenli değildir. [Ertelenmiş planda](theme-platform-variant-cart.md) v2 capability negotiation, product+variant kimliği, CAS, legacy yazma koruması, geri uyum ve ayrı runtime kabul adımları tanımlıdır. Commerce variant regression'ın geçmesi bu sorunu çözmez.

## Sonraki güvenli faz

Geçen final CI sonucunu tam Git kimlik kanıtıyla ayrı final raporunda eşleştirin. Ardından ayrı kapsam/onayla gerçek storage adapter'ı ve yayın/teslim sözleşmesini belirleyin; Admin/Studio ve Seller arayüzleri bu doğrulanmış API'ye bağlansın. Stocky insan kimliği ve signed delivery/receipt sınırları ayrı doğrulansın. Üretim migration/activation, gerçek satıcı ataması, sağlayıcı, DNS, native release, merge ve deploy ayrı Owner kapılarıdır.

Devir sırasında [sözleşme](theme-platform-wave-1-contract.md), [şema](theme-platform-schema.md), [auth](theme-platform-auth.md), [API](theme-platform-api.md) ve [variant planı](theme-platform-variant-cart.md) salt okunur olarak karşılaştırıldı. Hepsi foundation/metadata/request sınırını korur; API belgesi taze publication isteğinde `theme.editor` kontrolünü de içerir. Kanıtlanan yerel altyapı ile kalan canlı bağımlılıklar birbirinin yerine kullanılmamalıdır.
