# NovaStore Admin Commerce Pro — Design QA

Tarih: 2026-07-14

Hedef: `reference/admin-hybrid-target.png` (1487 × 1058)

Preview çıktısı: `../frontend/admin-commerce-pro.html`

Tek-satıcı entegre çıktı: `../frontend/admin-commerce-pro-live.html`

## Bu turda uygulanan ve statik incelenen kontroller

- Yüzeysel demo durumu kaldırıldı; 28 deterministik sipariş gerçek sayfalama, 12 kayıttan Bugün görünümü, mağaza kapsamı, arama, durum filtresi, toplu seçim, sahip atama, durum ilerletme ve oturum içi notlarla bağlandı. Tarih dönemi yalnız KPI ve grafikleri değiştirir; sipariş satırlarına tarih filtresi uygulanmaz.
- Mevcut backend'in tek satıcılı olduğu ile gelecekteki pazaryeri simülasyonu görünür biçimde ayrıldı. `Ürün Onayları / Onay Bekleyen / Bekleyen Satıcı Onayı` dili Commerce Pro yüzeyinden kaldırıldı; kabul edilen eski admindeki `pending_approval` enum'u bozulmadan `Yayın İncelemesinde · NovaStore iç durumu, satıcı izni değildir` olarak açıklığa kavuşturuldu. `demo-catalog-policy-v0.1` aktif satıcı, kategori/alan, marka yetkisi, kanonik eşleşme, yasak içerik ve fiyat anomali sinyallerini değerlendiriyor. Kontrolleri geçen teklifler otomatik yayınlanıyor, düzeltilebilir eksikler satıcı aksiyonuna, yalnız tanımlı istisnalar insan incelemesine düşüyor; eksik kural girdisi fail-closed kalıyor.
- Kanonik ürün, satıcı teklifi, yayın durumu ve stok sağlığı arayüzde ayrı gösterildi. Admin hızlı oluşturma yalnız NovaStore birinci taraf kaydı açıyor; `offerId` UI kimliği, değişmez `sellerId + ownershipType` sahiplik sınırı ve seller-scope SKU kullanılıyor. Haricî satıcı SKU/fiyat/stok alanları salt okunur ve model katmanında da korunuyor; kanonik içerik aynı ürüne bağlı bütün teklif görünümlerine fiyat/stok taşımadan yayılıyor.
- Hardcode satıcı risk etiketi kaldırıldı. Sürümlü `demo-onboarding-v0.1` kuralı her başvuru için puan katkılarını, veri tamlığını, onay engellerini ve kritik doğrulama duraklarını açıklıyor; bunun otomatik karar veya fraud modeli olmadığı görünür metinle belirtiliyor. Zorunlu belge anahtarları eksikse veya review verisi yoksa şirket onayı fail-closed kalıyor; eksik kaynak verisi detay görünümünü çökertmeden açıklanıyor.
- Satıcı siparişleri, iadeler, stok riskleri, kategori/filtre şablonları, müşteri segmentleri, şirket onboarding karar akışı, hakediş simülasyonu, ölçeklenen raporlar, modül/rol yüzeyleri, denetim, ayarlar, bildirimler ve hızlı-oluştur taslakları yerel örnek veriye bağlandı.
- Etkin görünen ama işlem yapmayan kontroller ya işlevsel hale getirildi ya da `Entegrasyonda` etiketiyle devre dışı bırakıldı. Canlı servis, auth, ödeme veya veritabanı davranışı taklit edilmedi.
- Compact sipariş ayrıntısı native modal/backdrop/focus containment kullanıyor. Mobil bağlamsal menü arka planı inert yapıyor, odağı yeni başlığa taşıyor ve panel başlangıcından ileri/geri Tab döngüsünü koruyor.
- Mobil üst çubuk taşması, satıcı modalinin dört satırlı scroll anatomisi, yatay tablo ipuçları, dokunma hedefleri, safe-area sınırları ve durum çubuğundaki sıfırlama erişimi düzeltildi.
- Komut paleti sipariş, ürün, müşteri ve satıcı hedeflerini doğru kapsama açıyor; CSV formül enjeksiyonu `=`, `+`, `-`, `@`, tab ve carriage-return başlangıçları için etkisizleştiriliyor.
- Tek-satıcı entegre yüzeyine bounded/PII-azaltılmış iade ve admin bildirimi özetleri eklendi. Her kaynak kendi capability, loading/error/empty ve yenileme durumuna sahip; 401/403 veya capability kaybında hassas stale veri temizleniyor.
- Sipariş tablosundaki fulfillment bilgisi `Yerel` olarak etiketlendi ve taşıyıcı doğrulaması olmadığı açıkça gösterildi. İade ekranı `Talep tutarı` dilini kullanıyor; gerçek refund, iade onayı, kargo oluşturma ve bildirim okundu mutation'ları artifact'a eklenmedi.
- Tur 2B yaşam döngüsü çekirdeğinde sipariş hard-delete ve generic durum mutation'ı kapatıldı. İptal yalnız kilitli payment geçmişi ve doğrulanmış stok rezervasyonu ile çalışıyor; kargoya çıkmış siparişte Android iptal CTA'sı görünmüyor. Sahte takip üreten shipment create ile güvenli refund/stok zinciri olmayan iade yazmaları açık hata kodlarıyla kapalı tutuluyor.
- PayTR/iyzico callback yarışları kilitli payment durumuna bağlandı. Geç/karşıt callback commerce yan etkisini tekrarlamıyor; gerekli hallerde aynı transaction içinde payment satırına `OPEN` mutabakat görevi, order event ve kalıcı admin bildirimi yazılıyor. Status API provider sonucu ile commerce tamamlanmasını ayırıyor; tahsil edilmiş mutabakatta tekrar ödeme engelleniyor, başarısız-belirsiz mutabakatta sepet korunurken retry gizleniyor.
- Tur 2C entegre Siparişler ekranında `orderCancelWrite` ve `manualShipmentWrite` capability'leri tam boolean `true` olmadıkça yazma kontrolleri oluşturulmuyor. Açık olduğunda erişilebilir native dialog; beklenen durum, sabit iptal nedeni, sınırlandırılmış not, fiziksel handoff onayı ve dialog ömrü boyunca sabit idempotency anahtarıyla çalışıyor. Çift gönderim kilidi, 409 sonrası liste yenileme ve 403/503 sonrası capability'yi kapatıp session yenileme davranışı eklendi.
- Admin iptali iç operasyon notunu müşteriye görünen `cancel_reason` alanından ayırıyor; provider refund'unun çalışmadığını response ve audit'te açıkça kaydediyor. Manuel shipment yalnız doğrulanmış payment/stok/reconciliation koşullarında atomik yerel kayıt oluşturuyor; taşıyıcı API'si, etiket veya tracking URL üretmiyor. Profilde iptal/takip metni escape ediliyor; provider ve takip numarası sunucuda dar karakter sözleşmesiyle doğrulanıyor.
- Tur 3A entegre Ürünler ekranı yalnız `firstPartyCatalogRead` capability'si tam `true` olduğunda bounded/current-admin `GET /api/admin/catalog/products/summary?limit=100` yolunu okuyor. Sorgu active/non-deleted `novastore-platform` mağazasına fail-closed bağlanıyor; null/farklı/pasif/silinmiş store kayıtları kapsama girmiyor.
- Ürün DTO'su açık projection ile kimlik, fiyat, stok, yayın/görünürlük, kategori ve medya-var/yok özetini taşıyor; açıklama, medya URL'si, `store_id`, satıcı, teklif, risk veya manuel onay alanı taşımıyor. Arayüzde `pending_approval`, satıcı izni olmadığı açıklanan `İç yayın incelemesi` etiketiyle gösteriliyor; ürün ve medya yazmaları/Cloudinary kapalı kalıyor.
- Katalog ekranı strict mapper ile bozuk/eksik DTO'yu fail-closed reddediyor; loading/error/empty/retry/hasMore, arama, yayın/stok/etkin görünürlük filtreleri ve arşivlenmiş kayıt görünürlüğü ayrı durumlar olarak uygulanıyor.

## Deterministik doğrulama

- `npm run verify`: Tur 2A son kaynaklarıyla geçti; ayrı preview/entegre Vite buildleri, iki artifact, model smoke ve iki moda ait sözleşme testleri birlikte doğrulandı. Tur 2A session/summary, HTTP/mapper ve no-write live artifact kontrolleri de bu koşunun içindedir.
- Standalone ve entegre HTML byte-byte aynı üretildi; standalone artifact üzerinde ikinci preview smoke geçti.
- Eski `dist` ile doğrudan standalone üretme negatif testi beklenen biçimde reddedildi. Vite artık build-time kaynak parmak izi yazıyor; üretici bu parmak izi güncel değilse çıktı üretmiyor.
- `adminCommerceProModelSmoke`: geçti; 28 sipariş/12 Bugün kaydı, sayfalama, Türkçe arama, mağaza kapsamı, sipariş durum/sahip geçişleri, müşteri segmenti, modül/bildirim geçişleri, ürün doğrulama, CSV güvenliği, fixture benzersizliği ve ana kayıt ilişkilerine ek olarak politika kuralları ve eksik girdide fail-closed davranış, otomatik yayın/istisna/satıcı aksiyonu, stok-yayın ayrımı, `offerId` kimliği, seller-scope SKU, kanonik içerik yayılımı, haricî teklif sahipliği, onboarding puan eşikleri/neden toplamı/eksik zorunlu belge/review yokluğu/onay engeli doğrulandı.
- Sekiz mevcut admin UI/auth/XSS smoke testi ile `startupSafetySmoke` ve `serverStartupSafetySmoke`: geçti. Server startup testi remote DB'ye bağlanmadı; yalnız `127.0.0.1` test hedeflerini kullandı ve `55432` dalını yerel veritabanı bulunmadığı için atladı.
- Root ve Commerce Pro `npm ls --depth=0`: geçti. Root ve Commerce Pro production audit: `0 vulnerabilities`.
- Script sözdizimi kontrolleri ve `git diff --check`: geçti.
- Tur 2B final root suite: 74 test dosyası çalıştırıldı; 61 tam geçti, `serverStartupSafetySmoke` ana kontrolü geçti ve yalnız yerel DB alt dalını atladı, 12 test `127.0.0.1:55432` üzerinde disposable PostgreSQL bulunmadığı için açıkça `SKIP` oldu. Gerçek hata ve timeout yok. Değişen/yeni 23 JavaScript dosyasının `node --check` sonucu 23/23 geçti.
- Tur 2B ödeme odaklı 14 smoke testi; yaşam döngüsü policy/mutation/client, iade yazma kilidi, current-admin ve legacy UI sözleşme testleri geçti. İki bağımsız final incelemede kapsam içi açık P0/P1 kalmadı.
- `npm run verify`: Tur 2B kaynaklarıyla yeniden geçti; preview/live Vite buildleri, iki entegre artifact ve model/HTTP/session/live sözleşme testleri yeşil. Üretilen Commerce Pro artifact'larında içerik farkı oluşmadı.
- `npm run verify`: Tur 2C final kaynaklarıyla geçti; preview/live build ve artifact üretimi, model, preview, controlled-mutation, HTTP/mapper, session, login ve live artifact sözleşmeleri yeşil. Mutation kontratı capability kapalıyken adapter yüzeyinin oluşmadığını; açıkken yalnız cancel/manual shipment endpoint'lerinin expected-status ve idempotency ile çağrıldığını doğruluyor.
- Tur 2C focused backend testlerinde admin iptali, manuel shipment policy/controller/route, müşteri render XSS sınırı, kill-switch'in DB öncesi fail-fast davranışı, lock/yazma/commit sırası, aynı istek replay'i, farklı key/payload/aktör 409'u ve post-commit bildirim hatası geçti. Bildirim yardımcısının sessiz `null` sonucu da mutation'ı geri çevirmeden hata olarak kaydettiği doğrulandı. Bağımsız cancel, shipment ve UI incelemelerinde kapsam içi açık P0/P1 kalmadı; bulunan stored-XSS, işlevsiz takip bağlantısı, 409 ayrımı ve client/server karakter doğrulama farkları kapatıldı.
- Açık non-blocking P2: admin iptal notları yalnız iç audit event'inde tutuluyor ancak bu alan için retention/redaksiyon ve operatörün PII yazmaması politikası henüz tanımlı değil. Capability production'da açılmadan önce bu yönetişim kapısı kapatılmalıdır.
- Tur 2C final root suite'te 77 test dosyasının 64'ü tam geçti; `serverStartupSafetySmoke` ana kontrolü geçti ve yalnız yerel DB alt dalını atladı. Disposable PostgreSQL isteyen 12 dosya `127.0.0.1:55432/55433` üzerinde servis bulunmadığı için açıkça `SKIP` oldu; kod hatası veya timeout yok. Değişen/yeni JavaScript/MJS kaynaklarının sözdizimi kontrolü ve `git diff --check` geçti. Gerçek PostgreSQL contention kanıtı browser kanıtından bağımsız olarak hâlâ açıktır.
- `npm run verify`: Tur 3A final kaynaklarıyla geçti; preview/live buildleri ve artifact üretimi, model, preview, controlled-mutation, HTTP/mapper, session, login ve live artifact sözleşmeleri yeşil. Katalog mapper/filtre testleri eksik veya tutarsız DTO'yu, bilinmeyen yayın durumunu ve silinmiş kaydın etkin görünürlükten düşmesini doğruladı. Statik kaynak/artifact sözleşmesi capability kapalıyken katalog resource ve navigasyon koşullarını doğruluyor; gerçek mounted render'da sıfır katalog isteği kanıtı non-blocking P2 olarak açıktır.
- `adminCommerceCatalogSummarySmoke` ve güncellenen session sözleşmesi geçti. Limit clamp + bir fazla satırla `hasMore`, exact DTO anahtarları, current-admin/no-store zinciri, salt-okunur SQL, birincil kategori/media existence ve active/non-deleted `novastore-platform` store kapsamı doğrulandı. Bu sorgu gerçek PostgreSQL üzerinde çalıştırılmadı; şema/plan/runtime kanıtı Tur 3F kapısında açık kalır.
- Tur 3A final root suite'te 78 test dosyasının 66'sı tam geçti; `serverStartupSafetySmoke` ana kontrolü geçti ve yalnız gerçek yerel PostgreSQL alt dalını kendi güvenli kontrolüyle atladı. Disposable PostgreSQL isteyen 12 dosya bilinçli olarak çalıştırılmadı; 0 hata oluştu. Production, uzak veritabanı ve ödeme sistemine erişilmedi.
- Kaynak/artifact statik kontrollerinde `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, `/api`, PayTR veya iyzico çağrısı yok. Standalone kaynak artifact'ında CSP `connect-src 'none'`; haricî aktif script, stylesheet, font veya görsel kaynağı yok.
- Dedicated disposable PostgreSQL gerektiren ve şema silen migration smoke çalıştırılmadı; remote/production veritabanına hiçbir bağlantı kurulmadı.
- Android Gradle dağıtımı/cache'i ortamda bulunmadığı ve kullanıcıya ait dirty PNG derleme worktree'sinde bozuk olduğu için Android compile kanıtı üretilemedi. Kotlin istemci değişiklikleri statik kontrat ve web/backend smoke testleriyle doğrulandı; bu sınırlama compile geçmiş gibi sunulmadı.

## Önceki doğrulanmış mock Preview kaydı

- Policy/sahiplik düzeltmesinden önceki mock Vercel Preview kaydı aşağıdaki URL ile sınırlıdır; deployment kimliği dokümana yazılmamıştır.
- URL: `https://novastore-commerce-pro-preview-n8chufjxk-qusay90s-projects.vercel.app`
- Kayıt anında durum `READY`, target `null` (Preview) idi; production alias/promosyon yapılmadı.
- O deployment için authenticated fetch `HTTP 200` döndürdü; deployed kaynak parmak izi `490ca0562e0903ae1bbe17bb591a3201dffb73298092b54773faf283712d47ec` o andaki yerel artifact ile eşleşti. PR #15 baseline’ının (`1954d4b`) preview parmak izi `f977875f80b87f4e755432e6e5ed83ec5f1018d709852660c09ae8258c9cb6eb` idi. Bu stacked entegrasyon dalında build altyapısı ayrıldığı için Tur 3A final preview parmak izi `30fa080f7900361cb4a81c77852826d8d5dc1005ac0c35922c532894c012f4fb`, final entegre artifact parmak izi ise `5f9d25185584da51b39c4a4da56cc1725e0e83419826af600deac15b000e9218` oldu. Eski URL bu iki güncel artifact için QA kanıtı değildir ve yeniden deploy edilmeden güncel diye sunulmamalıdır.
- Dağıtım yalnız tek `index.html` artifact'ını içerir; sır, environment variable, remote DB, auth, API veya ödeme bağlantısı eklenmedi.
- Vercel, dönen Preview HTML'ine kendi `https://vercel.live/_next-live/feedback/feedback.js` Toolbar scriptini enjekte ediyor. Bu script NovaStore kaynak artifact'ında yoktur ancak browser network/console temizliği ayrıca doğrulanmadan Preview response'u tam no-network kanıtı sayılamaz.

## Açık browser kanıtı blokeri

Kullanıcı, Work Mode cloud browser'ın yerel önizlemeyi ve Vercel Preview'ı açıp etkileşimli QA yapmasına açıkça izin verdi. Buna rağmen seçili Work Mode browser güvenlik katmanı `http://127.0.0.1:4173` açma eylemini kullanıcı isteğiyle çeliştiği gerekçesiyle reddetti ve localhost varyantı, raw CDP, başka browser yüzeyi veya dolaylı workaround kullanımını açıkça yasakladı. Yerel Vite sunucusu da ortamda `uv_interface_addresses returned Unknown system error 1` ile başlatılamadı. Önceki Vercel URL'si de aynı browser güvenlik katmanı tarafından reddedilmişti; önceki artifact response'u authenticated HTTP fetch ile doğrulandı ancak güncel commit deploy edilmedi. Yasaklı browser yolunu tekrar denemek veya farklı browser kullanmak yerine güvenlik sınırına uyuldu.

Bu nedenle güncel build için aşağıdaki zorunlu kanıtlar üretilemedi:

1. 1487 × 1058 hedef/uygulama eş-viewport ve eş-state görsel karşılaştırması.
2. 390 × 844 mobil menü, scrim, modal, tablo kaydırma, safe-area ve alt aksiyon görsel kontrolü.
3. Düzeltme sonrası ana navigasyon, filtre/sayfalama, NovaStore katalog CRUD'u, satıcı teklif salt-okunur alanları, politika istisnası, onboarding neden dökümü/onay engeli, modal odağı, komut hedefleme ve sıfırlama etkileşim kaydı.
4. Güncel browser console error/warning ve runtime network request kaydı.

Statik no-network kontrolü, CSP, deployment fetch'i ve production build başarısı browser-rendered console/network kanıtının yerine geçmez. Vercel Toolbar enjeksiyonu da browser network/console kaydında ayrıca değerlendirilmelidir. `noindex` erişim kontrolü değildir; gerçek entegrasyon eklendiğinde route auth ve seller-scope/RBAC ile ayrıca korunmalıdır.

Model testleri temel durum geçişlerini doğrular; modal odağı, responsive yerleşim ve uçtan uca kullanıcı yolculukları güncel browser oturumu olmadan davranışsal olarak geçmiş sayılmaz.

Draft PR #15, güncel desktop/mobile browser kanıtları tamamlanmadan merge-ready kabul edilmemelidir. Bu nedenle design QA `passed` durumuna getirilemez.

final result: blocked
