# NovaStore Admin Commerce Pro

NovaStore'un Commerce Pro görsel yönünü ve gelecekteki çok satıcılı yönetim bilgi mimarisini taşıyan iki ayrı build içerir:

- `admin-commerce-pro.html`: gerçek sistemlerden izole, sıfır ağ istekli etkileşimli tasarım önizlemesi.
- `admin-commerce-pro-live.html`: admin oturumu ile yalnız aynı-origin API'den Dashboard, sipariş, iade, admin bildirimi, NovaStore birinci taraf ürün özeti ve ortak katalog yapısını okuyan; varsayılan kapalı iki kontrollü sipariş operasyonunu capability ile sunan tek-satıcı entegrasyon yüzeyi.

Mevcut backend bugün tek satıcılıdır; preview içindeki pazaryeri kayıtları çalışan servisler değil, açıkça etiketlenmiş hedef model simülasyonudur. Entegre build bu kayıtları hiçbir koşulda göstermez.

## Güvenlik ve entegrasyon sınırı

- Mevcut `frontend/admin.html` çalışan/kabul edilen admin yüzeyi olarak kalır; Commerce Pro entegre build henüz cutover değildir.
- Preview yalnız yerel örnek veri kullanır. Değişiklikler sayfa yenilendiğinde sıfırlanır; API, WebSocket, production/remote veritabanı, ödeme, auth veya sır/env bağlantısı yoktur.
- Entegre build `nova_admin_token` ile `/api/admin/session`, `/api/admin/stats`, limitli `/api/admin/orders/summary`, `/api/admin/catalog/products/summary`, `/api/admin/catalog/structure/summary`, `/api/admin/returns/summary` ve `/api/admin/notifications/summary` yollarını okur. Mutlak URL ve cross-origin API yolu reddedilir; hata halinde mock veriye düşülmez.
- Birinci taraf katalog okuması yalnız aktif ve silinmemiş `novastore-platform` mağazasına bağlı ürünleri açık bir bounded DTO ile döndürür. `store_id`, açıklama, medya URL'si, satıcı/teklif, risk veya manuel ürün onayı alanı taşımaz. `pending_approval`, arayüzde satıcı izni değil `İç yayın incelemesi` olarak gösterilir.
- Ortak katalog yapısı endpoint'i kategori, özellik tanımı, özellik şablonu, koleksiyon, menü ve menü öğelerini ayrı 1–100 bounded sayfalarda döndürür. Ürün bağlantılı sayaçlar yalnız aktif/silinmemiş `novastore-platform` mağazası ve silinmemiş ürünlerle sınırlıdır; açıklama, görsel/SEO/validation metadata ve ham iç menü URL'si DTO'ya alınmaz.
- Ürün hard-delete yolu geçerli kimlikte `410 PRODUCT_HARD_DELETE_DISABLED` döndürür; legacy admin silme aksiyonu kaldırılmıştır. Katalog mutation rotaları güncel DB admin rolünü medya middleware'inden önce doğrular.
- `firstPartyCatalogWrite` ve `catalogStructureWrite` capability'leri varsayılan kapalıdır. Row-level revision ve append-only audit/atomik mutation altyapısı gelecek 3D–3E JSON CRUD'u içindir; Commerce Pro bu turda ürün, yapı veya medya mutation isteği göndermez. Projection sayaçları revision'ın tam snapshot garantisi değildir.
- Sipariş görünümündeki kargo bilgisi yalnız yerel NovaStore kaydıdır ve arayüzde taşıyıcı tarafından doğrulanmadığı açıkça belirtilir. İade görünümü talep edilen tutarı ve yerel refund durumunu gösterir; ödeme sağlayıcısına refund çağrısı yapıldığı anlamına gelmez.
- Entegre Commerce Pro arayüzü yalnız sunucunun `orderCancelWrite` veya `manualShipmentWrite` capability'sini tam `true` döndürdüğü oturumlarda kontrollü iptal ve manuel kargo devri isteği sunar. Her istek beklenen durum, idempotency anahtarı ve erişilebilir etki onayı taşır; `409` sonrasında liste yeniden okunur. Bu capability'ler varsayılan kapalıdır ve UI görünürlüğü sunucu yetkilendirmesinin yerine geçmez.
- İade/bildirim mutation'ı, genel sipariş durumu yazması, gerçek refund, taşıyıcı API/etiket, ürün/kategori/medya CRUD'u, satıcı, müşteri, hakediş, payout, ödeme veya Cloudinary isteği Commerce Pro'dan gönderilmez. Manuel kargo kaydı taşıyıcı doğrulaması veya takip bağlantısı üretmez; admin iptali sağlayıcı refund'unu otomatik çalıştırmaz.
- Mevcut backend yaşam döngüsü artık generic sipariş durum değişimini ve sipariş hard-delete işlemini kabul etmez. İptal yalnız özel endpoint üzerinden, kilitli payment geçmişi ve doğrulanmış stok rezervasyonu ile çalışır; kargoya çıkmış veya ödeme sonucu beklenen sipariş fail-closed kalır.
- Taşıyıcı doğrulaması olmadan sahte takip üreten shipment create `410 SHIPMENT_CREATE_DISABLED`; yeni iade/iade durum yazmaları güvenli geri ödeme ve stok zinciri tamamlanana kadar `503 RETURN_WRITES_DISABLED` döndürür. Mevcut shipment/iade kayıtları owner/admin için salt okunur kalır.
- PayTR/iyzico callback'leri kilitli payment durumunu finansal gerçek kabul eder. İptal/iade/fulfillment sonrasında gelen tahsilat sipariş durumunu ilerletmez; tekrar stok/kupon/sipariş satırı yazmaz, geri ödeme veya operasyon mutabakatı kaydı açar.
- Revision/audit migration artifact'ı eklendi ancak production veya uzak veritabanına uygulanmadı; dinamik modül yükleme, seller scope/RBAC enforcement ve çok satıcılı backend bu değişiklikte uygulanmaz.
- Gerçek backend'de dış satıcının ürün yükleyebildiği bir portal, seller offer servisi veya ürün başvuru/onay akışı yoktur. Mevcut ürün CRUD'u admin tarafından yönetilen birinci taraf NovaStore kataloğudur.
- `frontend/admin.html`, önizlemeyi yeni sekmede açan güvenli bir bağlantı içerir.

## Etkileşim kapsamı

Önizleme yalnız tarayıcı belleğinde çalışan gerçekçi bir yönetim oturumudur. Aşağıdaki akışlar sayfa yenilenene kadar yerel olarak durum değiştirir:

- 28 siparişte mağaza kapsamı, 12 kayıttan Bugün görünümü, arama, durum filtresi, gerçek sayfalama, satır/toplu seçim, sahip atama, durum ilerletme ve sipariş notu; KPI/grafiklerde ayrı tarih dönemi kapsamı.
- Satıcı siparişleri, iadeler ve stok riskleri; kanonik ürün ile satıcı teklifi sahipliğini ayıran katalog görünümü, NovaStore birinci taraf kayıt oluşturma ve haricî satıcı fiyat/stok/SKU alanlarını koruyan içerik inceleme.
- Ürün yayını insan onayı varsaymaz: `demo-catalog-policy-v0.1` satıcı durumu, kategori izni, zorunlu ürün alanları, marka yetkisi, kanonik eşleşme güveni, yasak içerik ve fiyat anomalisi sinyallerini gerçekten değerlendirir. Normal teklif `Otomatik yayında`, düzeltilebilir eksik `Satıcı aksiyonu`, yalnız kısıt/yetki gibi gerçek istisna `İstisna incelemesi` olur; yedi zorunlu girdiden biri eksik/geçersizse veya satıcı aktif değilse sonuç fail-closed kalır. Her sonuç reason code, kural sürümü ve örnek değerlendirme zamanı taşır. Yayın kararı ile `Stokta / Düşük stok / Stokta yok` ekseni ayrıdır.
- Teklif kimliği `offerId`, sahiplik ise değişmez `sellerId + ownershipType` ile belirlenir; görünen satıcı adı yetki vermez. Satıcı SKU benzersizliği global değil seller-scope içindedir. Aynı kanonik ürüne bağlı teklifler ortak içerik güncellemesini paylaşırken birbirinin fiyat/stok/SKU alanını değiştirmez.
- Müşteri arama, segment kartları, segment değişikliği ve CSV; satıcı şirket onboarding filtreleri, belge ayrıntısı, not, onay/red ve zorunlu red gerekçesi. Onboarding onayı şirket/KYC/sözleşme/banka içindir, ürün bazlı izin değildir.
- Hardcode `Düşük / Orta / Yüksek` satıcı riski kaldırıldı. `demo-onboarding-v0.1` kural seti, yalnız inceleme sırası öneren açıklanabilir puan/neden/tamlık/engel dökümü gösterir; otomatik onay, red veya dolandırıcılık tespiti iddiası taşımaz.
- Mağaza kapsamlı hakediş filtreleri, ayrıntı, güvenli akış simülasyonu ve CSV; dönemle ölçeklenen satış raporu ve CSV.
- Modül genel kullanılabilirlik simülasyonu, rol düzeni özeti/oluşturma, denetim arama/CSV, çalışma alanı ayarları, bildirimler ve yerel hızlı-oluştur taslakları.
- Klavyeyle kullanılabilen komut paleti, odak geri dönüşü, mobil bağlamsal menü, compact sipariş modalı, boş durumlar ve önizlemeyi sıfırlama.

Gerçek servis gerektiren görünür kontroller etkin bir sahte işlem yapmaz; devre dışı ve `Entegrasyonda` etiketiyle sunulur.

## Yerel geliştirme

```bash
cd admin-commerce-pro
npm ci
npm run dev
```

Vite'ın verdiği yerel adreste preview açılır. Üretimden veya uzak servislerden veri çekilmez.

## Tek dosyalık entegrasyon çıktısı

```bash
cd admin-commerce-pro
npm run build:integrated
```

Bu komut fontları, ürün görsellerini, ikonları, CSS'i ve JavaScript'i tek belgeye gömerek `frontend/admin-commerce-pro.html` üretir. Çıktı `noindex,nofollow,noarchive` etiketi taşır ve uygulamanın statik frontend sunucusundan `/admin-commerce-pro.html` yolunda açılabilir.

Capability kontrollü entegre artifact:

```bash
cd admin-commerce-pro
npm run build:live:integrated
```

Bu komut `frontend/admin-commerce-pro-live.html` üretir. Artifact `connect-src 'self'` CSP'si taşır ve yalnız NovaStore backend ile aynı origin'de çalışır. Admin login dönüş hedefi allowlist ile bu dosyaya yönlendirilebilir. Bu build deployment veya production cutover yapmaz.

## Deterministik artifact ve fingerprint sözleşmesi

Standalone üretici, nihai preview ve live HTML çıktılarını platformdan bağımsız LF byte'larıyla yazar. Artifact smoke kapıları CR byte kalmadığını ve aynı girdilerle arka arkaya iki üretimin birebir aynı SHA-256 değerini verdiğini doğrular.

Canonical kaynak fingerprint'i açık bir dosya türü allowlist'i kullanır: metin girdilerinde `CRLF` ve lone `CR` satır sonları hash öncesinde `LF` olur; PNG, WebP ve WOFF2 girdileri ise ham byte olarak kalır. Yalnız repository-relative POSIX yollar hash'e girer. Bu sözleşme Windows `core.autocrlf=true` checkout'larını destekler; mutlak makine yolu fingerprint'e eklenmez.

Preview ve live artifact'leri yalnız mevcut build scriptleriyle üretin; generated HTML'i elle düzenlemeyin:

```powershell
cd admin-commerce-pro
$artifactPaths = @('..\frontend\admin-commerce-pro.html', '..\frontend\admin-commerce-pro-live.html')
npm run build:integrated
npm run build:live:integrated
$firstBuild = Get-FileHash -LiteralPath $artifactPaths -Algorithm SHA256
```

Deterministik kontrol için aynı iki build komutunu ikinci kez çalıştırın; `Compare-Object` çıktı vermemelidir:

```powershell
npm run build:integrated
npm run build:live:integrated
$secondBuild = Get-FileHash -LiteralPath $artifactPaths -Algorithm SHA256
Compare-Object $firstBuild $secondBuild -Property Path, Hash
```

Bu üretim ve doğrulama akışı production/deploy, veritabanı, migration, gerçek ödeme, refund veya dış servis write işlemi çalıştırmaz.

## Güvenli doğrulama

Commerce Pro klasöründen tam build + model + artifact doğrulaması:

```bash
cd admin-commerce-pro
npm run verify
```

Repo kökünden bağımsız artifact kontrolleri:

```bash
node tests/adminCommerceProModelSmoke.mjs
node tests/adminCommerceProPreviewSmoke.js
node tests/adminCommerceProHttpSmoke.mjs
node tests/adminCommerceProSessionContractSmoke.js
node tests/adminCatalogMutationFoundationSmoke.js
node tests/adminLoginNextSmoke.js
node tests/adminCommerceProLiveSmoke.mjs
COMMERCE_PRO_PREVIEW_PATH=admin-commerce-pro/standalone/index.html node tests/adminCommerceProPreviewSmoke.js
```

Testler sayfalama/arama/mağaza kapsamı/ürün doğrulama/CSV güvenliği ve örnek veri ilişkilerine ek olarak gerçek politika kurallarını, eksik girdide fail-closed davranışı, otomatik yayın/istisna/satıcı aksiyonu ayrımını, yayın-stok eksenlerini, `offerId` kimliğini, seller-scope SKU'yu, kanonik içerik yayılımını, haricî teklif alanlarının değişmez sahiplik kimliğiyle korunmasını, açıklanabilir onboarding puanını, eksik belge fail-closed davranışını, eşikleri ve onay engellerini doğrular. Preview için kaynak parmak izi, `connect-src 'none'`, önizleme uyarısı ve sıfır ağ/ödeme çağrısı korunur. Entegre build için aynı-origin yol zorlaması, JWT ön kontrolü, 401/403 ayrımı, güncel DB admin rolü, bounded/PII-azaltılmış sipariş-iade-bildirim DTO'ları, fail-closed `novastore-platform` kapsamlı bounded ürün DTO'su, altı ayrı bounded katalog yapı sayfası, strict katalog mapper/filtreleri, bağımsız capability kapıları, kapalı mutation'ların adapter/UI yüzeyinden düşmesi, idempotency/expected-status gövdeleri, login allowlist'i, `connect-src 'self'` ve mock fallback yasağı test edilir. Katalog foundation smoke iki write capability'sinin default-off/DB öncesi fail-fast davranışını, `428`/`409` revision sözleşmesini, executor-owned row lock + CAS artışını, gerçek create audit anahtarını, append-only audit ve rollback sırasını, ürün hard-delete `410` sonucunu, current-admin guard sırasını ve read DTO revision alanlarını doğrular. Standalone üretici eski bundle'ı güncel kaynaklarla yeniden damgalamayı reddeder. Production DB, gerçek ödeme, refund, Cloudinary veya taşıyıcı testi çalıştırılmaz.

## Geçici mock önizlemesi

Dağıtım için ayrıca yetki verildiğinde bu dal, sır veya environment variable eklenmeden ayrı bir Vercel Preview veya eşdeğer static preview olarak yayınlanabilir:

- Build command: `cd admin-commerce-pro && npm ci && npm run build:integrated`
- Publish directory: `frontend`
- Preview route: `/admin-commerce-pro.html`

Preview production hedefi değildir; gerçek auth, veritabanı veya ödeme environment'ı bağlanmamalıdır. Geri alma; preview deployment'ını silmek ve gerekirse `frontend/admin.html` içindeki bağlantı ile önizleme artifact'ını kaldırmakla sınırlıdır.

## Entegrasyon yürütme planı

Tur sırası, tahminler, değişmez güvenlik kapıları ve route/capability özeti `docs/INTEGRATION-EXECUTION-PLAN.md` içinde tutulur. Mevcut tek satıcılı ürünleri `NOVASTORE_FIRST_PARTY` yapısına güvenli backfill edecek kanonik ürün/seller offer ayrımı, seller-scope/RBAC enforcement, sürümlü yayın politikası, admin override audit'i ve staging UAT ayrı plan/PR'lerle ilerlemelidir. Önizlemedeki eşikler production politikası değildir. Çok satıcılı hedef model için `docs/MULTI-VENDOR-PLAN.md`, bilgi mimarisi ve modül sınırları için `docs/ADMIN-IA-AND-MODULES.md` temel alınır.
