# NovaStore Admin Bilgi Mimarisi ve Modül Sözleşmesi

Bu belge Commerce Pro görsel diliyle tasarlanan NovaStore admin panelinin bilgi mimarisini, çok satıcılı genişleme noktalarını ve modül çalışma sözleşmesini tanımlar.

> Uygulama sınırı: Bu belge mevcut çalışan altyapıyı değil, hedef bilgi mimarisini ve gelecekte değerlendirilecek sözleşmeleri tarif eder. Bugünkü backend/storefront tek satıcılıdır; seller organization, seller offer, seller scope ve pazaryeri yayın politikası henüz çalışan sistem davranışı değildir. Bu PR yalnız kalıcılıksız örnek verilerle çalışan statik bir önizleme ekler; dinamik modül yükleme, API, migration, RBAC, veritabanı veya ödeme entegrasyonu uygulamaz. Çok satıcılı örnekler, ilgili güvenli geçiş ve pilot kapıları tamamlanmadan canlı satıcı yetkisi veya ürün sahipliği olarak yorumlanmamalıdır.

## 1. Ürün ilkeleri

- Yöneticiye ilk ekranda işletmenin sağlığını, risklerini ve yapılacak işlerini göster.
- Liste ekranlarını arama, hızlı filtre, kaydedilmiş görünüm, kolon seçimi, toplu işlem ve satır inceleyici etrafında standartlaştır.
- Kullanıcıyı bağlamdan koparmamak için hızlı incelemeyi sağ panelde; uzun ve riskli işi tam sayfada aç.
- Her kritik işlemde etkiyi, sebebi, izin gereksinimini ve audit kaydını görünür yap.
- Teknik terim yerine açık Türkçe kullan; gerekli teknik kimliği ikincil metinde göster.
- Rol ve satıcı kapsamına göre navigasyon ile veriyi birlikte filtrele. Gizlenmiş menü tek başına yetkilendirme değildir.
- Masaüstü öncelikli yoğunluk korunurken 1024 px ve üstünde yatay sayfa taşması oluşmamalı.
- NovaStore laciverti yön bulma ve yapı; turuncu yalnız vurgu/aksiyon için kullanılmalı.
- Inter ve sistem sans-serif fallback kullanılmalı; ürün arayüzünde emoji veya dekoratif gradient kullanılmamalı.

## 2. Ana navigasyon

Önerilen sıra:

1. Pano
2. Siparişler
3. Ürünler
4. Kategoriler
5. Müşteriler
6. Pazarlama
7. İçerik
8. Satıcılar
9. Finans
10. Raporlar
11. Modüller
12. Ayarlar

Alt sabit alan:

- Bildirim merkezi
- Yardım ve operasyon runbook
- Denetim kayıtları
- Kullanıcı/rol değiştirici

Navigasyon grupları modül manifestlerinden katkı alabilir; ancak sıra ve isimler platform tasarım sistemi tarafından yönetilir. Bir modül kendi başına üst seviye menü çoğaltamaz.

## 3. Pano

Üst alan:

- Tarih aralığı
- Kanal/satıcı/kategori kapsamı
- Son yenilenme zamanı
- Dışa aktar

Özet kartları:

- Net satış
- Sipariş
- Ortalama sepet
- İade oranı
- Açık operasyon işi
- Mutabakat farkı

İş kuyrukları:

- Geciken siparişler
- Kritik stok
- Politika istisnası incelemeleri
- Satıcı aksiyonu bekleyen katalog kayıtları
- İncelenecek satıcı başvuruları
- İade/anlaşmazlık SLA ihlali
- Başarısız/geri dönen transfer
- Modül veya entegrasyon sağlık uyarısı

Her kart, uygulanan kapsam ve hesap tanımını açıklayan yardımcı metin taşır. Finansal metrikler veri zamanı ve para birimini gösterir.

## 4. Ortak liste anatomisi

Her yoğun liste ekranı şu yapıyı kullanır:

1. Başlık, kısa açıklama ve birincil aksiyon
2. Arama
3. Hızlı filtre chip'leri
4. Ayrıntılı filtre açılır alanı
5. Kaydedilmiş görünümler
6. Kolon seçimi ve yoğunluk
7. Toplu işlem çubuğu
8. Sıralanabilir tablo
9. Cursor sayfalama
10. Satır inceleyici

Satır seçimi checkbox ile yapılır. Satır tıklaması inceleyiciyi açar; metin linkleri tam sayfaya gider. Toplu işlem seçilen kayıt sayısını, kapsamını ve geri alınabilirliği açıkça gösterir.

Tablo durumları:

- Yükleniyor: kolon geometrisini koruyan skeleton
- Boş: neden + yapılabilecek bir sonraki adım
- Sonuç yok: filtre temizleme
- Hata: request ID + yeniden dene
- Kısmi veri: hangi kaynağın geciktiğini açıklayan uyarı
- Yetkisiz: erişim isteği veya doğru role yönlendirme

## 5. Satır inceleyici

Sağ panel genişliği içeriğe göre 420–560 px olabilir ve ana tablonun seçimini korur.

Standart bölümler:

- Başlık, durum, kimlik ve hızlı aksiyonlar
- Özet
- İlişkili kayıtlar
- Zaman çizgisi
- Notlar
- Denetim izi

Davranış:

- role=dialog ve aria-modal=true
- Görünür ve programatik erişilebilir başlık
- Açılışta anlamlı ilk öğeye odak
- Tab/Shift+Tab odak kapanı
- Escape ile kapanma
- Kapanınca odağın tetikleyiciye dönüşü
- URL'de kayıt kimliği veya geri/ileri davranışını koruyan eşdeğer state

Silme, yüksek tutarlı iade, satıcı askıya alma, IBAN değiştirme ve hakediş serbest bırakma panel içi tek tıkla sonuçlanmaz; etki özeti ve gerekçe isteyen onay adımı açar.

## 6. Siparişler

Sekmeler:

- Tümü
- Yeni
- Hazırlanıyor
- Kargoda
- Geciken
- İade/iptal
- Sorunlu

Filtreler:

- Sipariş no, müşteri, ürün
- Tarih
- Ana sipariş/satıcı siparişi
- Satıcı
- Ödeme
- Kargo
- SLA
- Tutar

İnceleyici:

- Müşteri ve teslimat
- Ana sipariş toplamı
- Satıcı alt siparişleri
- Satır fiyat/indirim/komisyon snapshot'ı
- Ödeme ve callback durumu
- Stok hareketi
- Kargo hareketi
- İade/anlaşmazlık
- Audit zaman çizgisi

Çok satıcılı düzende müşteri ana siparişi ile seller order açıkça ayrılır. Satıcı rolündeki kullanıcı yalnız kendi alt siparişini görür.

## 7. Ürünler ve kategoriler

Mevcut tek satıcılı backend'de ürün, fiyat ve stok NovaStore'un birinci taraf kaydıdır. Hedef pazaryeri modelinde bu kayıt güvenli backfill ile kanonik ürün + `NOVASTORE_FIRST_PARTY` teklifi olarak ayrılır. Bu geçiş yapılmadan admin arayüzü birinci taraf ürünü dış satıcı teklifi gibi göstermemeli; statik Commerce Pro örnekleri de gelecekteki modeli açıkça `önizleme` olarak etiketlemelidir.

Ürünler alt alanları:

- Kanonik katalog
- Satıcı teklifleri
- Politika istisnaları
- Satıcı aksiyonu bekleyenler
- Marka izinleri
- Toplu içe aktarma

Sahiplik sınırı:

| Alan | Sahibi | Yönetici davranışı |
| --- | --- | --- |
| Başlık, marka, kategori, ortak açıklama, varyant yapısı ve ortak medya | Kanonik katalog/platform | Yetkili katalog rolü sürümlü olarak düzenler; satıcı düzeltme önerebilir. |
| Satıcı SKU, fiyat, stok kaynağı, teslimat ve garanti koşulu | Seller offer/satıcı | Satıcı kendi kapsamında günceller; platform yöneticisi sessizce değiştirmez. |
| Kategori/marka izni ve yayın politikası | Platform | Sürümlü kural olarak uygular; sonuç ve neden kodlarını görünür kılar. |

Yayın, stok ve içerik aynı `durum` alanında birleştirilmez:

| Eksen | Görünür durumlar |
| --- | --- |
| Kanonik içerik | Taslak, Doğrulanıyor, Etkin, Veri gerekli, Kısıtlı, Arşivli |
| Teklif yayını | Taslak, Doğrulanıyor, Otomatik yayında, Satıcı aksiyonu, İstisna incelemesi, Yayından kaldırıldı, Arşivli |
| Stok sağlığı | Stokta, Düşük stok, Stokta yok |

`Stokta yok` bir yayın veya moderasyon kararı değildir. Teklif politikasını geçmeye devam eder, storefront'ta satın alınamaz gösterilir ve stok geri geldiğinde başka ihlal yoksa manuel onay beklemeden tekrar satılabilir.

Varsayılan yayın akışı otomatik olmalıdır. Yeni kanonik aday zorunlu içerik ve eşleşme kontrollerini geçtiğinde otomatik olarak `Etkin` olur. Aktif ve yetkili satıcının teklifi; kanonik eşleşme, zorunlu alan/medya, yasak içerik, kategori/marka izni ve açıklanabilir fiyat kurallarını geçerse insan onayı olmadan `Otomatik yayında` olur. Düzeltilebilir eksik `Satıcı aksiyonu`na gider. Yalnız düşük eşleşme güveni, kısıtlı kategori/marka, sahte ürün sinyali veya sürümlü politikada açıkça tanımlanmış başka istisna `Politika istisnaları` kuyruğuna girer. Aktif olmayan satıcı, kesin yasak veya eksik zorunlu politika girdisi `Yayından kaldırıldı` ile fail-closed kalır; bütün ürünleri sırayla onaylayan bir kuyruk oluşturulmaz.

Kanonik ürün inceleyici:

- İçerik, varyantlar, medya
- Kategori yolu
- Bağlı teklifler
- İçerik sürümleri
- Politika değerlendirme ve içerik değişikliği geçmişi

Teklif inceleyici:

- Satıcı ve satıcı SKU
- Fiyat, stok, depo
- Teslimat/garanti koşulu
- Politika sürümü, açıklanabilir neden kodları ve son kontrol zamanı
- Ayrı yayın durumu ve stok sağlığı

Teklif listesi ve komut hedefleri global `offer_id` kullanır. Satıcı SKU yalnız `(seller_id, seller_sku)` kapsamında benzersizdir; aynı SKU farklı satıcılarda geçerli olabilir. Birinci taraf/haricî teklif yetkisi görünen mağaza adına göre değil değişmez `seller_id + ownership_type` alanlarına göre belirlenir. Kanonik içerik değişikliği aynı `canonical_product_id` altındaki bütün teklif görünümlerine yayılır; satıcıya ait fiyat, stok ve SKU alanlarına taşınmaz.

Politika istisnası inceleyici:

- İstisnayı oluşturan kural, kanıt ve çözüm sahibi
- Satıcıdan düzeltme isteme
- Politika gereği askıya alma veya yeniden değerlendirme
- Yetkiye bağlı, süreli ve gerekçeli override
- Önce/sonra farkı ve tam audit izi

Admin override tek tıkla ve gerekçesiz tamamlanmaz. Politika sürümü, neden kodu, serbest metin gerekçesi, aktör, zaman, correlation ID, sona erme zamanı ve sonraki otomatik değerlendirme kaydedilir. Override satıcı fiyatı/stoku üzerinde düzenleme yetkisi oluşturmaz.

Kategori ağacı sınırsız derinliği destekler. Aynı isim farklı parent altında serbest, kardeş duplicate yasaktır. Admin yolu, storefront canonical route ve breadcrumb aynı kaynaktan üretilir.

## 8. Satıcılar

Alt alanlar:

- Başvurular
- Aktif satıcılar
- Eksik belgeler
- Askı ve açıklanabilir operasyon sinyalleri
- Marka ve kategori izinleri
- Satıcı kullanıcıları
- Performans/SLA

Başvuru inceleyici:

- Şirket ve iletişim özeti
- KYC kontrol listesi
- Sözleşme sürümü
- Maskeli banka hesabı
- Açıklanabilir onboarding doğrulama sinyalleri ve inceleme önceliği
- İnceleme notları
- Onay, eksik belge, red

Onay işlemi:

1. Eksik zorunlu alan kontrolü
2. İzin kapsamı ve kategori kısıtları
3. Etki özeti
4. Gerekçe/not
5. Yetki ve gerekiyorsa dört göz kontrolü

Onboarding inceleme önceliği otomatik karar veya fraud skoru değildir. Liste ve ayrıntı; kural seti sürümü, 0–100 içindeki toplam, her boyutun azami ağırlığı ve gerçek katkısı, 0–19 / 20–49 / 50–100 bantları, veri tamlığı, reason code ve zorunlu onay engellerini birlikte gösterir. İsim, yetkili, ürün sayısı ve komisyon puana girmez. Olası yinelenen başvuru dahi kontrol kapanana kadar onayı fail-closed tutar. Gelecekteki SLA/iptal/iade gibi operasyon sinyalleri ve ledger temelli finansal blokajlar bu onboarding önceliğinden ayrı modül, veri kaynağı ve sürümlü politika kullanır; açıklamasız `Düşük/Orta/Yüksek` etiketi gösterilmez.
6. Audit + SellerApproved olayı

Askıya alma yeni satış ve yeni teklif yayınını durdurur; mevcut sipariş, iade ve finans geçmişi açık kalır.

## 9. Finans

Alt alanlar:

- Genel bakış
- Komisyon kuralları
- Hakedişler
- Transfer kuyrukları
- Mutabakat
- İadeler
- Ledger
- Geri dönen ödemeler

Finans panosu:

- Tahsil edildi
- Hakedişe uygun
- Bekletilen
- Transfer talimatı verildi
- Transfer edildi
- İade edildi
- Açıklanamayan mutabakat farkı

Hakediş inceleyici:

- Satıcı
- Kaynak seller order/satırlar
- Komisyon kuralı sürümü
- Vergi/stopaj politikası sürümü
- Bekletme nedenleri
- Ledger hareketleri
- PayTR transfer denemeleri
- Reconciliation sonucu

Ledger ekranı kullanıcıya borç/alacak mantığını Türkçe açıklarken değişmez kayıt kimliklerini, correlation ID ve ters kayıt bağını gösterir. Manuel düzeltme mevcut kaydı değiştirmez; yeni ters/düzeltme fişi üretir.

PayTR anahtarı, kart bilgisi veya tam IBAN hiçbir admin ekranında gösterilmez. Gerçek transfer butonu yalnız production ortamında, ayrı izin, yeniden kimlik doğrulama ve dört göz onayıyla etkinleşebilir. Prototip ve development ortamında işlem her zaman simülasyondur.

## 10. Modüller

Modül kartı:

- Ad, kimlik ve sürüm
- Sahip ekip
- Durum: etkin, devre dışı, bakım, hata
- Ortam
- Son health check
- Gereken izinler
- Bağımlılıklar
- Migration durumu
- Yayınlanan/tüketilen olaylar
- Yapılandır
- Etkinleştir/devre dışı bırak
- Denetim geçmişi

Modül durum değişikliği onay modalı açar. Modal etkilenecek navigasyon, API, background job ve mevcut veri erişimini gösterir. Kritik modül devre dışı bırakma bağımlılık kontrolü olmadan yapılamaz.

Örnek manifest:

~~~json
{
  "id": "commission-ledger-settlement",
  "name": "Komisyon ve Hakediş",
  "version": "1.0.0",
  "owner": "finance-platform",
  "status": "enabled",
  "featureFlag": "marketplace_finance",
  "navigation": [
    {
      "parent": "finance",
      "label": "Hakedişler",
      "route": "/admin/finance/settlements",
      "permission": "settlement.read"
    }
  ],
  "apiNamespace": "/api/admin/v1/settlements",
  "permissions": [
    "settlement.read",
    "settlement.review",
    "settlement.release"
  ],
  "publishes": [
    "SettlementBecameEligible.v1",
    "SettlementInstructionSubmitted.v1"
  ],
  "consumes": [
    "DeliveryConfirmed.v1",
    "RefundSucceeded.v1",
    "DisputeOpened.v1"
  ],
  "dependencies": [
    "identity-access",
    "checkout-orders",
    "payments-paytr"
  ],
  "healthCheck": "/internal/modules/commission-ledger-settlement/health",
  "migrations": [
    "20260713_expand_ledger"
  ]
}
~~~

Manifest kuralları:

- id kalıcı ve kebab-case olur.
- version semantic versioning kullanır.
- navigation yalnız kayıtlı slotlara katkı yapar.
- Her route ve mutation permission bildirir.
- Dependency döngüsü build-time kontrolde engellenir.
- Modül migration'ı çekirdek release planında sıralanır.
- Feature flag, migration'ın yerine geçmez.
- Health check hassas veri döndürmez.
- Modül kapalıyken geçmiş kayıtlar salt okunur erişilebilir kalır.

## 11. Roller ve görünürlük

| Alan | Süper admin | Operasyon | Katalog | Finans | Destek | Denetçi | Satıcı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pano | Tam | Operasyon | Katalog | Finans | Destek | Salt okunur | Kendi özeti |
| Sipariş | Tam | Düzenle | Salt okunur | Finans alanı | Destek alanı | Salt okunur | Kendi seller order |
| Katalog | Tam | Salt okunur | Kanonik içerik/politika istisnası | Salt okunur | Salt okunur | Salt okunur | Kendi teklifi/içerik önerisi |
| Satıcı KYC | Tam | İncele | Sınırlı | Banka durumu | Yok | Maskeli | Kendi başvuru |
| Finans/ledger | Tam | Özet | Yok | Tam | İade özeti | Salt okunur | Kendi hakediş |
| Modüller | Tam | Sağlık | Yok | Sağlık | Yok | Salt okunur | Yok |
| Audit | Tam | Kapsamlı | Kendi işlem | Finans kapsamı | Kendi işlem | Tam salt okunur | Kendi kapsamı |

Bu tablo UX görünürlüğünü anlatır; gerçek izin backend policy ve seller scope ile uygulanır.

## 12. Arama ve komut alanı

Global arama şu varlıkları bulur:

- Sipariş no
- Ürün/GTIN/SKU
- Müşteri
- Satıcı
- Transfer/reconciliation kimliği
- İade/anlaşmazlık

Sonuçlar role ve seller scope'a göre sunucuda filtrelenir. Arama sonucu hassas alanı snippet olarak sızdırmaz.

Komut alanı yalnız güvenli navigasyon ve taslak başlatma aksiyonlarını açar. Satıcı onayı, katalog politika override'ı, iade veya transfer gibi riskli işlem komut alanından tek adımda tamamlanmaz.

## 13. Bildirim merkezi

Öncelik:

- Kritik: ödeme/transfer uyumsuzluğu, veri erişim riski, yüksek hacimli sipariş hatası
- Yüksek: SLA ihlali, başarısız transfer, kritik stok
- Normal: katalog politika istisnası, satıcı aksiyonu, içe aktarma tamamlandı
- Bilgi: rapor hazır, modül health iyileşti

Bildirim; neden, kapsam, oluşma zamanı, sahip, SLA ve doğrudan aksiyon bağlantısı içerir. Aynı correlation ID'ye ait tekrarlar gruplanır.

## 14. Analitik

Operasyon:

- Sipariş kabul ve sevk süresi
- Gecikme oranı
- İptal/iade oranı
- Politika istisnası kuyruk yaşı ve otomatik yayın oranı

Satıcı:

- GMV/net satış
- Stok bulunurluğu
- SLA ve müşteri sorunu
- İade/anlaşmazlık
- Hakediş bekleme nedeni

Finans:

- Komisyon geliri
- Hakedişe uygun/bekletilen
- Transfer başarı oranı
- Geri dönen ödeme
- Reconciliation farkı ve yaşı

Analitik ekran read model kullanır; finansal operasyonun kaynak gerçeği ledger'dır. Dashboard gecikmesi açıkça gösterilir.

## 15. Erişilebilirlik ve klavye

- Ana içeriğe geç bağlantısı
- Semantik nav/main/heading yapısı
- Her icon-only butonda aria-label
- Tablo başlıklarında scope ve sıralama durumu
- Form hatasında alan ilişkili açıklama
- Renk tek durum taşıyıcısı değildir
- Modal odak kapanı ve tetikleyiciye dönüş
- 200% zoom ve 1024 px genişlikte işlev kaybı yok
- Hareket azaltma tercihi desteklenir

## 16. QA için görünür sözleşmeler

Prototipin otomatik testle bulunabilmesi için önerilen data-testid değerleri:

- admin-shell
- admin-sidebar
- global-search
- nav-dashboard
- nav-orders
- nav-products
- nav-sellers
- nav-finance
- nav-modules
- page-title
- filter-search
- filter-status
- table-row
- row-select
- bulk-actions
- row-inspector
- inspector-close
- seller-approve
- confirmation-dialog
- confirmation-submit
- finance-ledger
- settlement-table
- module-card
- module-toggle
- toast

Test kimlikleri stil veya erişilebilir isim yerine kullanılmaz; yalnız otomasyon için kararlı kancadır.

## 17. Admin entegrasyon sırası

1. Shell, navigasyon, token ve ortak liste bileşenleri
2. Pano ve mevcut NovaStore yönetim alanları
3. Satır inceleyici, filtre, toplu işlem ve audit primitive'leri
4. Satıcı başvuru/KYC modülü
5. Kanonik katalog, otomatik teklif yayın politikası ve istisna yönetimi
6. Seller order görünümü
7. Komisyon, ledger ve settlement shadow ekranları
8. Modül kayıt sistemi
9. Satıcı portalı
10. Yetkilendirilmiş staging UAT ve kontrollü pilot

Her adım ayrı tur, acceptance, commit, push ve deploy kapısıyla yürütülür. Modül altyapısı başlangıçta manifest ve feature flag düzeyinde kurulabilir; dinamik üçüncü taraf kod yükleme sonraki ve ayrı güvenlik çalışması olmalıdır.
