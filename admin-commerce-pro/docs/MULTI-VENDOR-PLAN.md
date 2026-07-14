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

Bugünkü backend ve storefront tek satıcılıdır; dış satıcı organizasyonu, seller scope, satıcı teklifi ve pazaryeri yayın politikası henüz çalışan sistem davranışı değildir. Bu belgede geçen çok satıcılı kayıtlar hedef modeli anlatır. İlgili migration, yetkilendirme, seller portalı ve kontrollü pilot kapıları tamamlanana kadar mevcut NovaStore ürünü bir dış satıcı ürünü gibi yönetilmemeli, Commerce Pro örnekleri de canlı pazaryeri yetkisi varmış izlenimi vermemelidir.

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
| seller_organizations | Satıcı şirketi, yaşam döngüsü durumu ve satış kısıtları; açıklamasız risk etiketi tutulmaz |
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

Onboarding inceleme önceliği, operasyon sinyalleri ve finansal blokaj birbirine karıştırılmaz:

- **Onboarding inceleme önceliği** yalnız başvuru kuyruğunu sıralar. Şirket/vergi kimliği, banka sahipliği, zorunlu belge tamlığı, kategori/marka izni ve yinelenen başvuru kontrolü gibi doğrulanabilir girdilerden; sürümlü kural seti, boyut ağırlıkları, eşikler, reason code, veri tamlığı ve kontrol zamanı ile türetilir. İsim, yetkili adı, ürün sayısı veya komisyon gibi alanlar puana girmez. Sonuç otomatik onay/red veya dolandırıcılık hükmü değildir; zorunlu doğrulama kapıları ayrıca fail-closed uygulanır.
- **Operasyon sinyalleri** SLA, iptal/iade, geç gönderim veya politika ihlali gibi olay bazlı göstergelerdir. Kaynak olay, dönem, eşik sürümü ve çözüm sahibi olmadan `Düşük/Orta/Yüksek` etiketi üretilemez ve tek başına satıcıyı askıya alamaz.
- **Finansal blokaj/rezerv** para hareketini etkileyen ayrı, muhasebe onaylı kurallardır. Her blokaj ledger kaydı, reason code, tutar, süre, aktör, itiraz ve kaldırma izi taşır; onboarding öncelik puanından türetilmez.

KYC belgeleri şifreli özel depolamada tutulur. Erişim kısa ömürlü imzalı bağlantıyla ve belge alanı yetkisiyle verilir. Kimlik, IBAN, token veya sır audit içeriğine düz metin yazılmaz. Gerçek mevzuat, saklama süresi ve belge listesi hukuk/KVKK onayı olmadan sabitlenmez.

### 3.2 Kanonik katalog ve satıcı teklifleri

| Varlık | Sorumluluk |
| --- | --- |
| catalog_products | NovaStore tarafından yönetilen kanonik ürün içeriği |
| product_variants | Renk, beden, kapasite gibi varyantlar |
| product_revisions | Yayımlanmış kanonik içeriğin sürümlü değişiklikleri |
| product_submissions | Yeni kanonik ürün adayı veya mevcut ürüne eşleşme önerisi |
| seller_offers | Satıcı + varyant + satıcı SKU + fiyat + teslimat ve yayın durumu |
| catalog_policy_evaluations | Sürümlü otomatik kontrol sonucu, neden kodları ve kontrol zamanı |
| catalog_policy_exceptions | Yalnız insan kararı gerektiren istisna, karar, gerekçe ve override süresi |
| brand_permissions | Marka bazlı satış yetkisi |
| category_restrictions | Kategori bazlı belge ve satış kısıtları |

Katalog ürünü ortak ürün gerçekliğidir ve platform tarafından yönetilir; başlık, marka, kategori, varyant yapısı ve ortak medya bu varlığa aittir. Teklif satıcıya ait ticari kayıttır; satıcı SKU'su, fiyat, stok kaynağı, teslimat ve garanti koşulları seller offer üzerinde tutulur. Platform yöneticisi kanonik içeriği düzenleyebilir fakat satıcının fiyat veya stok değerini sessizce değiştiremez. Satıcı kanonik içerik için sürümlü düzeltme önerebilir; öneri mevcut yayımlanmış içeriği değerlendirme tamamlanmadan bozmaz.

Aynı fiziksel ürün için tekrar eden ürün kartları yerine bir kanonik ürün altında teklifler tutulur. İlk pilot tek teklif gösterebilir; model çoklu teklif ve Buy Box seçimine hazır kalır. Mevcut tek satıcılı kayıtlar geçişte kanonik ürün + NOVASTORE_FIRST_PARTY teklifi olarak ayrılır; bu teknik backfill dış satıcıların etkin olduğu anlamına gelmez.

Durumlar birbirinden bağımsız eksenlerde tutulur:

| Eksen | Örnek durumlar | Kural |
| --- | --- | --- |
| Kanonik içerik | Taslak, Doğrulanıyor, Etkin, Veri gerekli, Kısıtlı, Arşivli | Ortak ürün bilgisini ve sürümünü anlatır. |
| Teklif yayını | Taslak, Doğrulanıyor, Otomatik yayında, Satıcı aksiyonu, İstisna incelemesi, Yayından kaldırıldı, Arşivli | Teklifin storefront'ta satışa açılıp açılmadığını anlatır. Production sözleşmesi bu adları sürümlü enum olarak sabitlemelidir. |
| Stok sağlığı | Stokta, Düşük stok, Stokta yok | Satın alınabilir miktarı anlatır; yayın kararı değildir. |

Stok sıfıra düştüğünde yayın kaydı otomatik olarak insan incelemesine taşınmaz. Teklif yayın politikasını geçmeye devam ederken `Stokta yok` görünür ve satın alınamaz; stok yeniden geldiğinde başka bir politika ihlali yoksa tekrar satılabilir hâle gelir.

Politika temelli ürün yayını:

1. Satıcı mevcut kanonik ürüne teklif bağlar veya yeni kanonik ürün/eşleşme önerisi gönderir.
2. Sistem GTIN/barkod eşleşmesi, zorunlu özellik ve medya, yasak ürün/kelime, kategori kısıtı, marka izni, satıcı uygunluğu ve açıklanabilir fiyat anomalisi kurallarını sürümlü politika ile değerlendirir.
3. Bütün zorunlu kontrolleri geçen yeni kanonik aday otomatik olarak `Etkin`, ona bağlı teklif veya mevcut kanonik ürüne eklenen teklif insan onayı beklemeden `Otomatik yayında` olur.
4. Satıcının tamamlayabileceği eksik veri `Satıcı aksiyonu` sonucunu üretir; neden kodu ve düzeltme yolu satıcıya gösterilir, admin kuyruğu oluşturulmaz.
5. Düşük eşleşme güveni, kısıtlı kategori/marka, sahte ürün sinyali veya açıkça tanımlanmış başka bir istisna `İstisna incelemesi` kuyruğu oluşturur. Kuyruk bütün ürünleri değil yalnız istisnaları içerir.
6. Kesin yasak, aktif olmayan satıcı veya eksik zorunlu politika girdisi gibi deterministik engeller fail-closed biçimde `Yayından kaldırıldı` üretir; itiraz veya yeniden değerlendirme ayrı ve izlenebilir bir akıştır.
7. Fiyat, stok ve teslimat güncellemeleri aynı politika motorunda yeniden değerlendirilir; politika sınırları içindeki değişiklikler insan müdahalesi olmadan yayında kalır.

Politika sonucu yalnız `Düşük/Orta/Yüksek` gibi açıklamasız bir etiket olamaz. Her sonuç, kontroller geçtiğinde dahi, `policy_version`, sürümlü `reason_codes`, kontrol zamanı ve yeniden değerlendirme tetikleyicisini taşır. Teklifin global arayüz kimliği `offer_id`; satıcı SKU benzersizliği `(seller_id, seller_sku)` kapsamındadır. Sahiplik görünen mağaza adına göre değil değişmez satıcı kimliğine göre uygulanır. Eşikler kategoriye göre değişebilir fakat ürün bazında keyfî manuel onay kuralına dönüşemez.

İstisna yöneticisi; satıcıdan düzeltme isteyebilir, yayını politika gereği askıya alabilir veya yetkisi varsa süreli override verebilir. Override; önce/sonra farkı, politika sürümü, neden kodu, serbest metin gerekçesi, aktör, zaman, correlation ID, sona erme zamanı ve sonraki otomatik değerlendirmeyi audit kaydına yazmalıdır. Override, satıcıya ait fiyat/stok alanlarını yönetici adına değiştirme yetkisi vermez.

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

PayTR transfer sonucu hash doğrulanan server-side callback ile alınır. Handler oturum kullanmaz, idempotent çalışır ve başarılı 