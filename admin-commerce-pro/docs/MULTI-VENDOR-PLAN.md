# NovaStore Çok Satıcılı Pazaryeri Planı

Durum: Tasarım ve teknik yol haritası
Hedef: NovaStore'un mevcut tek satıcılı yapısını kesintisiz biçimde, denetlenebilir ve aşamalı bir çok satıcılı pazaryerine dönüştürmek
Önerilen mimari: Transactional outbox kullanan modüler monolit
Yayın sınırı: Bu plan production veritabanına bağlanmayı, gerçek PayTR isteği göndermeyi, push veya deploy yapmayı yetkilendirmez.

> Karar durumu: Aşağıdaki model ve aşamalar uygulanmış sistem davranışı değil, repo/şema incelemesi ve ayrı ADR onayı gerektiren önerilerdir. Her ödeme entegrasyonu turunda güncel resmî sağlayıcı dokümanı yeniden doğrulanmalıdır. Commerce Pro preview; API, WebSocket, veritabanı, KYC, ledger, event/outbox veya ödeme altyapısı içermez.

## 1. Ana karar

İlk sürüm mikroservis olarak bölünmemelidir. Sipariş, stok, ödeme ve finansal defter aynı işlem sınırında tutarlı kalırken kod; kimlik, satıcı, katalog, teklif, stok, sipariş, ödeme, iade ve hakediş modüllerine ayrılmalıdır. Modüller birbirinin tablolarını doğrudan değiştirmemeli; uygulama servisi veya sürümlü domain olayı kullanmalıdır.

Transactional outbox, olayların veritabanı işlemiyle birlikte yazılmasını sağlar. Bildirim, analitik ve ileride ayrıştırılacak iş yükleri outbox tüketicisi olarak çalışır. Bu yapı başlangıç riskini düşük tutar ve yüksek yük alan bir modülün daha sonra servis olarak ayrılmasını mümkün kılar.

NovaStore'un mevcut ürünleri, satıcısı ve siparişleri NOVASTORE_FIRST_PARTY adlı sistem satıcısına bağlanır. Mağaza bu geçiş sırasında müşteriye tek satıcılı görünmeye devam edebilir.

## 2. Değişmez NovaStore kuralları

- origin/main kanonik entegrasyon tabanıdır; gerçek repository çalışmasında branch, HEAD, origin/main ilişkisi ve kirli çalışma ağacı kaydedilir.
- Aynı kategori adı farklı üst kategoriler altında bulunabilir; tekrar yalnız kardeş kategoriler arasında engellenir.
- Kategori yolları ve slug değerleri kanonik ve benzersiz kalır.
- Admin, storefront, PLP/breadcrumb ve gelecekte Android derin kategori ağacını aynı sözleşmeyle destekler.
- Public kategori budama stokla değil görünür ürünle yapılır.
- Stoksuz ürün Tükendi görünür, satın alınamaz ve satılabilir ürünlerden sonra sıralanır.
- PayTR initialize siparişi kesinleştirmez; stok, kupon, bildirim, final sipariş veya hakediş etkisi üretmez.
- Development ve otomatik testlerde production/remote DB kullanılmaz, gerçek PayTR isteği gönderilmez.
- Onaylı ödeme UAT'si yalnız aynı-origin https://staging.novastore.tr üzerinde ve staging'e özel sırlarla yapılır.
- Admin metinlerinde anlaşılır Türkçe terimler kullanılır.

## 3. Domain modeli

### 3.1 Satıcı ve onboarding

| Varlık | Sorumluluk |
| --- | --- |
| seller_organizations | Satıcı şirketi, durum, risk seviyesi, satış kısıtları |
| seller_members | Kullanıcı ile satıcı organizasyonu ilişkisi |
| seller_roles / seller_permissions | Satıcı içi rol ve izinler |
| seller_applications | Başvuru durumu ve inceleme yaşam döngüsü |
| seller_kyc_documents | Belge türü, sürümü, doğrulama ve son kullanma bilgisi |
| seller_agreements | Sözleşme sürümü, kabul zamanı ve kabul eden kişi |
| seller_bank_accounts | Maskeli IBAN, hesap sahibi ve doğrulama durumu |
| seller_status_history | Her durum geçişinin sebebi ve yapanı |

Başvuru durum makinesi:

Taslak → Gönderildi → Ön inceleme → Eksik belge → Yeniden inceleme → Onaylandı → Aktif

Yan yollar:

- Reddedildi: gerekçe zorunludur, yeniden başvuru politikası ayrıca kaydedilir.
- Askıya alındı: yeni satış durur; mevcut sipariş, iade ve destek erişimi sürer.
- Kapatıldı: veri saklama ve finansal yükümlülükler bitmeden fiziksel silme yapılmaz.

KYC belgeleri şifreli özel depolamada tutulur. Erişim kısa ömürlü imzalı bağlantıyla ve belge alanı yetkisiyle verilir. Kimlik, IBAN, token veya sır audit içeriğine düz metin yazılmaz. Gerçek mevzuat, saklama süresi ve belge listesi hukuk/KVKK onayı olmadan sabitlenmez.

### 3.2 Kanonik katalog ve satıcı teklifleri

| Varlık | Sorumluluk |
| --- | --- |
| catalog_products | NovaStore tarafından yönetilen kanonik ürün içeriği |
| product_variants | Renk, beden, kapasite gibi varyantlar |
| product_revisions | Onaylanmış içeriği bozmayan sürümlü değişiklik |
| product_submissions | Yeni ürün veya mevcut ürüne eşleşme talebi |
| seller_offers | Satıcı + varyant + satıcı SKU + fiyat + satış durumu |
| offer_moderation | Onay, red, düzeltme ve karar gerekçesi |
| brand_permissions | Marka bazlı satış yetkisi |
| category_restrictions | Kategori bazlı belge ve satış kısıtları |

Katalog ürünü ortak gerçekliği; teklif ise satıcının fiyat, stok, teslimat ve garanti koşullarını temsil eder. Aynı fiziksel ürün için tekrar eden ürün kartları yerine bir kanonik ürün altında teklifler tutulur. İlk pilot tek teklif gösterebilir; model çoklu teklif ve Buy Box seçimine hazır kalır.

Ürün yayını:

1. Satıcı yeni ürün veya mevcut ürüne eşleşme talebi gönderir.
2. Sistem GTIN/barkod, marka, model ve varyantlarla olası eşleşmeleri önerir.
3. Otomatik kurallar riskli kategori, yasak kelime, eksik zorunlu özellik ve görsel şartlarını kontrol eder.
4. Moderatör içeriği onaylar, düzeltme ister veya gerekçeli reddeder.
5. Onaylanan kanonik ürün değişmeden satıcı teklifi yayına alınır.
6. Fiyat/stok güncellemeleri politika ihlali yoksa ayrı hızlı akıştan geçebilir.

### 3.3 Stok ve depo

| Varlık | Sorumluluk |
| --- | --- |
| seller_warehouses | Satıcı depo ve sevk çıkış bilgisi |
| inventory_items | Satıcı + varyant + depo için mevcut ve ayrılmış miktar |
| inventory_movements | Giriş, satış, iptal, iade, düzeltme ve sebep |
| stock_reservations | Checkout için süreli ve idempotent rezervasyon |
| inventory_import_jobs | CSV/API toplu iş durumu ve satır hataları |

available = on_hand - reserved kuralı tek yerde uygulanır. Doğrudan stok overwrite yerine hareket kaydı tutulur. Negatif stok engellenir. Aynı son ürüne gelen eşzamanlı checkout istekleri DB kilidi veya atomik koşullu update ile yalnız bir rezervasyon üretebilir.

PayTR initialize'dan önce checkout.prepare ayrı bir işlem olarak kısa süreli rezervasyon oluşturabilir. Initialize yalnız ödeme token/intent hazırlığı yapar. Başarılı ve hash'i doğrulanmış callback rezervasyonu satış hareketine çevirir; başarısız veya süresi dolan deneme rezervasyonu serbest bırakır.

### 3.4 Ana sipariş ve satıcı siparişi

| Varlık | Sorumluluk |
| --- | --- |
| orders | Müşterinin gördüğü ana sipariş ve ödeme toplamı |
| seller_orders | Satıcı bazlı hazırlama, kargo, iade ve hakediş birimi |
| order_lines | Satıcı, teklif, fiyat ve finansal snapshot |
| shipments | Satıcı/depo bazlı kargo paketi |
| order_status_history | Geçiş, sebep, aktör ve correlation ID |
| seller_order_documents | Fatura ve kargo belgesi metadatası |

Müşteri tek sepet ve tek ödeme görür. Ödeme başarı callback'i aynı transaction içinde idempotent biçimde ana siparişi doğrular, rezervasyonları tüketir ve satıcı siparişlerini oluşturur. Her satıcı kendi alt siparişini görür; başka satıcının müşteri veya finans verisine erişemez.

Ana durum akışı:

Ödeme bekleniyor → Ödeme doğrulandı → Satıcı siparişleri oluşturuldu → Hazırlanıyor → Kısmi/tam kargoda → Kısmi/tam teslim → Tamamlandı

Satıcı siparişi:

Yeni → Kabul edildi → Hazırlanıyor → Kargoda → Teslim edildi → İade bekleme süresi → Hakedişe uygun

İptal, iade ve anlaşmazlık satır bazında çalışır. Bir satıcının problemi diğer satıcıların teslimat ve hakedişini gereksiz yere kilitlemez.

## 4. Komisyon, ledger ve hakediş

### 4.1 Finansal veri modeli

- commission_rules: satıcı, kategori, marka veya kampanya için öncelikli kural
- commission_rule_versions: başlangıç/bitiş zamanı ve onaylayan
- order_line_financial_snapshots: sipariş anındaki değişmez hesap
- ledger_accounts: platform, satıcı, vergi, komisyon, iade ve bekletme hesapları
- ledger_entries: append-only çift taraflı kayıt
- settlement_holds: teslimat, iade, risk veya anlaşmazlık blokajı
- settlement_batches / settlement_lines: mutabık transfer grubu
- transfer_attempts: sağlayıcı isteği, idempotency ve sonuç
- reconciliation_runs: yerel ledger ile ödeme sağlayıcısı karşılaştırması

Tüm parasal değerler kuruş cinsinden integer tutulur. Her sipariş satırında brüt ürün tutarı, vergi, indirim payı, kargo katkısı, platform komisyonu, ödeme kuruluşu kesintisi, stopaj politikası, satıcı neti ve kullanılan kural sürümü snapshot olur.

Ledger kaydı güncellenmez veya silinmez. Düzeltme ve iade ters kayıt üretir. Bu sayede komisyon kuralı değiştiğinde eski siparişlerin hesabı değişmez.

Temel denklem:

Müşteri tahsilatı = satıcı borçları + NovaStore gelirleri + vergisel yükümlülükler + ödeme kesintileri + yuvarlama farkı

Yuvarlama farkı ayrı ledger hesabında görünür olmalıdır; sessizce herhangi bir satıcıya yazılmaz.

### 4.2 Hakediş uygunluğu

Hakediş yalnız şu koşullar birlikte sağlandığında uygun olur:

- Ödeme doğrulanmıştır.
- Sipariş teslim edilmiştir.
- Tanımlı iade/risk bekleme süresi bitmiştir.
- Açık iade veya anlaşmazlık yoktur.
- Satıcı aktif ve banka hesabı doğrulanmıştır.
- Günlük mutabakat farkı tolerans içindedir.
- Dört göz onayı gereken tutar eşiği aşılmamıştır veya onay tamamlanmıştır.

İade transferden önceyse uygun tutarı azaltır. Transferden sonraysa satıcı için negatif bakiye/mahsup kaydı açar. Gerçekleşmiş haricî transfer DB rollback ile silinmez.

## 5. PayTR pazaryeri entegrasyon sınırları

PayTR Platform Transfer talebinde merchant_oid, benzersiz trans_id, submerchant_amount, total_amount, transfer_name ve transfer_iban kullanılır. Resmî dokümana göre merchant_oid en fazla 64, trans_id en fazla 60 alfanümerik karakterdir ve tutarlar kuruş cinsinden iletilir. Aynı müşteri siparişi için birden fazla alt satıcı transferi verilebilir.

Resmî doküman, transfer talebinin ödeme ile aynı gün verilemeyeceğini ve hedef günde işleme alınması için saat 10:00'dan önce gönderilmesi gerektiğini belirtir. Dokümandaki stopaj açıklaması finans/hukuk tarafından doğrulanmalı; oran ve matrah uygulama kodunda sürümsüz sabit olarak tutulmamalıdır.

Kaynak: https://dev.paytr.com/platform-transfer-talebi/transfer-talimatinin-verilmesi

PayTR transfer sonucu hash doğrulanan server-side callback ile alınır. Handler oturum kullanmaz, idempotent çalışır ve başarılı işlemeden sonra yalnız OK döner. Aynı bildirim tekrar gelebilir.

Kaynak: https://dev.paytr.com/platform-transfer-talebi/transfer-talimatinin-sonucunun-alinmasi

Hatalı alıcı hesabı nedeniyle geri dönen transferler ayrı iş kuyruğunda ele alınır. IBAN düzeltme, tekrar onay ve yeniden gönderme geçmişi korunur.

Kaynak: https://dev.paytr.com/platform-transfer-talebi/geri-donen-odemeleri-listele

Pazaryeri durum sorgusundaki submerchant_payments ve returns verileri günlük reconciliation ile yerel ledger'a karşılaştırılır. Tam ve kısmi iadelerde NovaStore'un benzersiz reference_no değeri kullanılır.

Kaynaklar:

- https://dev.paytr.com/durum-sorgu
- https://dev.paytr.com/iade-api

Ortam kapıları:

1. Unit/integration test: deterministik PayTR mock adapter; dış ağ yok.
2. Local smoke: sahte hash, tekrar callback ve hata senaryoları; gerçek sır yok.
3. Onaylı staging UAT: yalnız https://staging.novastore.tr, staging'e özel sırlar ve test modu.
4. Production: ayrı migration, deploy ve ödeme yetkisi; runbook, mutabakat ve rollback kapısı.

Otomatik transfer ilk yayınlarda settlement_auto_transfer feature flag'i arkasında kapalı kalır.

## 6. İade ve anlaşmazlık

Varlıklar:

- return_requests / return_items
- return_shipments
- return_inspections
- refunds
- disputes / dispute_evidence
- resolution_actions

İade yaşam döngüsü:

Talep edildi → Uygunluk kontrolü → Kargo bekleniyor → İncelemede → Onaylandı/Reddedildi → İade gönderildi → Mutabakat tamamlandı

Anlaşmazlık açıldığında ilgili satırın settlement hold kaydı oluşturulur. Kanıt dosyaları özel depolamada, erişim kaydıyla tutulur. SLA aşımı ve müşteri iletişimi admin iş kuyruğuna düşer.

İade onayında:

1. Müşteri iade tutarı deterministik hesaplanır.
2. Komisyon ve satıcı alacağı ters ledger kayıtları oluşturulur.
3. PayTR iade isteği idempotency anahtarı ve reference_no ile hazırlanır.
4. Sağlayıcı sonucu callback/sorgu ile doğrulanır.
5. Reconciliation farkı yoksa vaka kapatılır.

## 7. RBAC, satıcı kapsamı ve audit

Platform rolleri:

- Süper yönetici
- Operasyon yöneticisi
- Satıcı operasyonu
- Katalog moderatörü
- Finans
- İade/anlaşmazlık uzmanı
- Destek
- Denetçi (salt okunur)

Satıcı rolleri:

- Satıcı sahibi
- Mağaza yöneticisi
- Katalog
- Sipariş operasyonu
- Finans
- Destek

RBAC tek başına yeterli değildir. Her seller API sorgusu ve mutation, doğrulanmış seller scope içermelidir. Satıcı kullanıcısının istemciden gönderdiği seller_id güven kaynağı olamaz; kapsam sunucu tarafında üyelikten çözülür.

Audit olayı:

- audit_id, actor_user_id, actor_type
- effective_seller_id veya platform kapsamı
- action, resource_type, resource_id
- güvenli önce/sonra farkı
- reason_code ve insan tarafından yazılan gerekçe
- IP, user agent, correlation_id, request_id
- sonuç, hata kodu, occurred_at

Kritik işlemler yeniden kimlik doğrulama ve dört göz onayı isteyebilir: IBAN değişikliği, yüksek tutarlı iade, manuel ledger düzeltmesi, komisyon değişikliği ve transfer serbest bırakma.

## 8. Modül sınırları ve manifest

Çekirdek modüller:

1. identity-access
2. seller-kyc
3. catalog-moderation
4. offers-pricing
5. inventory
6. checkout-orders
7. payments-paytr
8. fulfillment
9. returns-disputes
10. commission-ledger-settlement
11. notifications
12. analytics-read-models
13. audit-risk
14. admin-module-registry

Her modül; kimlik, sürüm, sahip, durum, navigation katkısı, gereken izinler, feature flag, route namespace, API namespace, yayınladığı/tükettiği olaylar, health check ve migration listesini bildirir. Modül kapatma yalnız yeni girişi durdurmalı; geçmiş sipariş ve finans verisini erişilemez hâle getirmemelidir.

## 9. API ve olay sözleşmeleri

API alanları:

- /api/admin/v1
- /api/seller/v1
- /api/storefront/v1
- /api/integrations/paytr/v1

Mutation isteklerinde Idempotency-Key; eşzamanlı admin düzenlemesinde If-Match/ETag veya row_version kullanılır. Sayfalama cursor tabanlıdır. Para alanlarında float kullanılmaz.

Olay zarfı alanları:

- event_id
- event_type
- event_version
- aggregate_type / aggregate_id
- seller_id veya null
- occurred_at
- correlation_id / causation_id
- payload

Başlıca olaylar:

- SellerApplicationSubmitted
- SellerApproved
- SellerSuspended
- ProductSubmissionApproved
- SellerOfferPublished
- InventoryAdjusted
- CheckoutPrepared
- PaymentSucceeded
- OrderSplitCompleted
- SellerOrderAccepted
- ShipmentDispatched
- DeliveryConfirmed
- ReturnRequested
- RefundSucceeded
- CommissionAccrued
- SettlementBecameEligible
- SettlementInstructionSubmitted
- SettlementSucceeded
- SettlementFailed
- DisputeOpened
- DisputeResolved

Consumer, event_id için işlem kaydı tutarak tekrar teslimata dayanıklı olur. Olaylar geriye uyumlu genişletilir; kırıcı değişiklik event_version artırır ve contract test gerektirir.

## 10. Güvenli DB migration

Expand → Backfill → Switch → Contract modeli uygulanır:

1. Expand: yeni tablolar, nullable foreign key'ler ve geriye uyumlu kolonlar eklenir.
2. First-party seed: NOVASTORE_FIRST_PARTY satıcısı güvenli migration ile oluşturulur.
3. Backfill: ürünler kanonik ürün + NovaStore teklifi; siparişler ana sipariş + tek satıcı siparişi olarak checkpoint'li partilerle bağlanır.
4. Reconcile: satır sayıları, stok toplamları, sipariş tutarları ve ledger denklemi karşılaştırılır.
5. Dual write: eski ve yeni model birlikte yazılır; farklar alarm üretir.
6. Shadow read: yeni model okunur fakat kullanıcı yanıtı eski modelden verilir; karşılaştırma kaydedilir.
7. Switch: feature flag ile okuma yeni modele alınır.
8. Validate: constraint ve indeksler gerçek veri doğrulandıktan sonra sıkılaştırılır.
9. Contract: eski alanlar en az bir güvenli sürüm sonra ve ayrı yetkiyle kaldırılır.

Backfill yeniden başlatılabilir, bounded batch ve checkpoint kullanır. Production migration ayrı deploy kapısıdır. Kayıplı down migration tercih edilmez; rollback geriye uyumlu şemada eski code path'e dönmekle yapılır.

## 11. Turlara bölünmüş teslim

### Tur 0 — Kanıt ve sözleşmeler

Scope: Mevcut repo/şema, auth, kategori, sipariş ve PayTR akışının gerçek koddan çıkarılması; ADR, durum makineleri ve para tablosu.
Exclusions: Kod, DB ve ödeme değişikliği yok.
Acceptance: Ürün, operasyon, finans ve güvenlik sözleşme onayı.
Commit: Yalnız dokümantasyon istenirse. Push/deploy yok.

### Tur 1 — Satıcı temeli

Scope: seller organization/member, RBAC + seller scope, audit, feature flag, admin Satıcılar alanı.
Acceptance: Çapraz satıcı erişim testleri ve audit kanıtı.
Risk: Yetki sızıntısı.
Deploy: Önce local/staging; production ayrı yetki.

### Tur 2 — Onboarding ve KYC

Scope: Başvuru sihirbazı, belge inceleme, eksik belge, sözleşme ve banka hesabı durumları.
Acceptance: Manuel onay/red/askı ve belge erişim izinleri.
Exclusions: Otomatik canlı kimlik doğrulama ve gerçek belge testi.

### Tur 3 — Katalog, teklif ve stok

Scope: Kanonik ürün, seller offer, moderasyon, fiyat/stok, CSV önizleme.
Acceptance: Derin kategori, kardeş tekrar, visible-product pruning, Tükendi ve concurrency regresyonları.

### Tur 4 — Sipariş bölme

Scope: Checkout reservation, ana sipariş, seller order, kargo ve durum makinesi.
Acceptance: Tek ödeme, çok satıcı; bir satıcı hatasının diğerini etkilememesi; tekrar callback güvenliği.
Exclusions: Gerçek PayTR.

### Tur 5 — İade ve anlaşmazlık

Scope: Satır bazlı iade, inceleme, evidence, SLA, settlement hold.
Acceptance: Tam/kısmi iade ve transfer öncesi/sonrası muhasebe senaryoları.

### Tur 6 — Komisyon ve ledger

Scope: Sürümlü kurallar, immutable snapshot, çift taraflı ledger ve hakediş uygunluğu.
Acceptance: Her fixture için finansal denklem sıfır fark; shadow settlement.
Exclusions: Para transferi.

### Tur 7 — PayTR platform transferi

Scope: Mock adapter, idempotent transfer, hash callback, geri dönen ödeme ve reconciliation.
Acceptance: Mock testlerinin tamamı; yetki verilirse aynı-origin staging UAT.
Exclusions: Otomatik production transferi.

### Tur 8 — Satıcı portalı ve analitik

Scope: Sipariş, stok, ürün, iade, hakediş ekranları; bildirim tercihleri ve read model.
Acceptance: Seller-scope E2E, erişilebilirlik ve büyük veri sayfalama testi.

### Tur 9 — Kontrollü pilot

Scope: Önce first-party satıcı, sonra davetli az sayıda satıcı ve sınırlı kategori.
Acceptance: Günlük mutabakat sıfır açıklanamayan fark; operasyon runbook; destek SLA.
Deploy: Her genişleme ayrı feature flag ve açık yetki.

## 12. Test matrisi

- Unit: komisyon, vergi politikası, indirim/kargo dağıtımı, yuvarlama, iade ters kayıtları.
- Property-based: tüm satıcı netleri + kesintiler + platform payı = müşteri tahsilatı.
- State machine: geçersiz onboarding, sipariş, iade ve settlement geçişleri.
- Concurrency: son stok, çift callback, çift iade, çift transfer.
- Contract: admin/seller/storefront API ve event sürümleri.
- Integration: DB transaction + outbox + consumer idempotency.
- Migration: temiz DB, mevcut snapshot, kesilen backfill ve tekrar çalışma.
- Security: IDOR, seller scope, belge erişimi, rol yükseltme, hassas veri loglama.
- Browser: admin kuyrukları ve satıcı portalı; klavye, odak, modal, 1024/1280/1440 taşma.
- Performance: stok importu, sipariş bölme, liste sayfalama ve read model gecikmesi.
- PayTR: deterministik hash, callback tekrarları, kısmi iade, başarısız IBAN ve reconciliation.

PASS, FAIL ve SKIPPED/BLOCKED ayrı raporlanır. Çalıştırılmayan test geçmiş sayılmaz.

## 13. Pilot, gözlem ve rollback

Feature flag'ler:

- marketplace_onboarding
- seller_offer_publish
- external_seller_checkout
- seller_returns
- settlement_shadow
- settlement_auto_transfer

Pilot sırası:

1. Yalnız NOVASTORE_FIRST_PARTY ile yeni veri modelini shadow mode çalıştır.
2. Staging'de davetli 1–3 test satıcısı ve tüm hata senaryoları.
3. Açık production yetkisi sonrası sınırlı kategori, satıcı ve günlük sipariş/GMV tavanı.
4. Manuel hakediş onayı ve günlük finance reconciliation.
5. Açıklanamayan fark sıfır ve SLA hedefleri yeşil olduğunda kontrollü genişleme.

Acil kapatma:

1. Yeni satıcı başvurusunu durdur.
2. Yeni teklif yayınını durdur.
3. Haricî satıcı tekliflerini checkout'tan çıkar.
4. Transfer kuyruğunu duraklat.
5. Mevcut sipariş, iade, finans geçmişi ve destek erişimini açık tut.

Rollback sırasında ürünler ve finansal kayıtlar silinmez. Haricî gerçekleşmiş transfer bir DB rollback ile ters çevrilmez; düzeltme, yeni ledger/operasyon kaydıyla yapılır.

Yayın kapıları:

- Ürün ve operasyon UAT onayı
- Finans/muhasebe mutabakat onayı
- Hukuk/KVKK/KYC saklama politikası onayı
- Güvenlik ve seller-scope testi
- Destek SLA ve runbook
- İzleme/uyarı panoları
- Rollback tatbikatı
- Açık migration, push ve deploy yetkisi

## 14. Açık kararlar

Uygulamadan önce netleşmesi gerekenler:

- İlk sürümde aynı kanonik üründe birden fazla aktif satıcı teklifi gösterilecek mi?
- Buy Box kuralı fiyat, teslimat, puan ve iade oranını nasıl ağırlıklandıracak?
- Satıcı teslimat ve iade SLA değerleri kategoriye göre değişecek mi?
- Hakediş bekleme süresi, rezerv oranı ve yüksek risk tavanı nedir?
- Fatura sorumluluğu ve belge saklama süreci nasıl işletilecek?
- Stopaj, KDV ve mahsup politikalarının muhasebe tarafından onaylı sürümleri nelerdir?
- Hangi KYC belgeleri hangi satıcı tipi ve kategori için zorunlu?
- İlk pilot kategorileri ve günlük risk limitleri nelerdir?

Bu kararlar ayrı ADR ve sürümlü politika kayıtlarına dönüşmeden para hareketi otomatikleştirilmemelidir.
