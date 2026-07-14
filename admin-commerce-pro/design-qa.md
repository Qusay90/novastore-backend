# NovaStore Admin Commerce Pro — Design QA

Tarih: 2026-07-14

Hedef: `reference/admin-hybrid-target.png` (1487 × 1058)

Entegrasyon çıktısı: `../frontend/admin-commerce-pro.html`

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

## Deterministik doğrulama

- `npm run verify`: geçti; Vite build, entegre artifact, model smoke ve preview smoke birlikte doğrulandı.
- Standalone ve entegre HTML byte-byte aynı üretildi; standalone artifact üzerinde ikinci preview smoke geçti.
- Eski `dist` ile doğrudan standalone üretme negatif testi beklenen biçimde reddedildi. Vite artık build-time kaynak parmak izi yazıyor; üretici bu parmak izi güncel değilse çıktı üretmiyor.
- `adminCommerceProModelSmoke`: geçti; 28 sipariş/12 Bugün kaydı, sayfalama, Türkçe arama, mağaza kapsamı, sipariş durum/sahip geçişleri, müşteri segmenti, modül/bildirim geçişleri, ürün doğrulama, CSV güvenliği, fixture benzersizliği ve ana kayıt ilişkilerine ek olarak politika kuralları ve eksik girdide fail-closed davranış, otomatik yayın/istisna/satıcı aksiyonu, stok-yayın ayrımı, `offerId` kimliği, seller-scope SKU, kanonik içerik yayılımı, haricî teklif sahipliği, onboarding puan eşikleri/neden toplamı/eksik zorunlu belge/review yokluğu/onay engeli doğrulandı.
- Sekiz mevcut admin UI/auth/XSS smoke testi ile `startupSafetySmoke` ve `serverStartupSafetySmoke`: geçti. Server startup testi remote DB'ye bağlanmadı; yalnız `127.0.0.1` test hedeflerini kullandı ve `55432` dalını yerel veritabanı bulunmadığı için atladı.
- Root ve Commerce Pro `npm ls --depth=0`: geçti. Root ve Commerce Pro production audit: `0 vulnerabilities`.
- Script sözdizimi kontrolleri ve `git diff --check`: geçti.
- Kaynak/artifact statik kontrollerinde `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, `/api`, PayTR veya iyzico çağrısı yok. Standalone kaynak artifact'ında CSP `connect-src 'none'`; haricî aktif script, stylesheet, font veya görsel kaynağı yok.
- Dedicated disposable PostgreSQL gerektiren ve şema silen migration smoke çalıştırılmadı; remote/production veritabanına hiçbir bağlantı kurulmadı.

## Önceki doğrulanmış mock Preview kaydı

- Policy/sahiplik düzeltmesinden önceki Vercel deployment: `dpl_FBRrohKcP239P63m7CYUfAi1eoMk`
- URL: `https://novastore-commerce-pro-preview-n8chufjxk-qusay90s-projects.vercel.app`
- Proje: `prj_MSmpmTD45qy8GUQ7ljDpXGQBuFON`; durum `READY`; target `null` (Preview); production alias/promosyon yapılmadı.
- O deployment için authenticated fetch `HTTP 200` döndürdü; deployed kaynak parmak izi `490ca0562e0903ae1bbe17bb591a3201dffb73298092b54773faf283712d47ec` o andaki yerel artifact ile eşleşti. Bu commit'in güncel ve açıkça anonimleştirilmiş kaynak parmak izi `f977875f80b87f4e755432e6e5ed83ec5f1018d709852660c09ae8258c9cb6eb` olduğundan URL güncel düzeltmelerin QA kanıtı değildir ve yeniden deploy edilmeden güncel diye sunulmamalıdır.
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
